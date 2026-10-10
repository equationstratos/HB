import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GuardDocumentType, Prisma } from '@prisma/client';
import {
  AdminGuardDto,
  AvailabilityInput,
  GuardApplicationInput,
  GuardListQuery,
  GuardProfileDto,
  MAX_DOCUMENT_BYTES,
  Paginated,
  PresenceInput,
  RatingDto,
} from '@hb/shared';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser, RequestMeta } from '../common/auth-user';
import { FILE_STORAGE, FileStorage } from '../integrations/storage.provider';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { TokenService } from '../auth/token.service';
import { toUserDto } from '../users/user.mapper';
import { guardProfileInclude, toGuardProfileDto } from './guard.mapper';

export interface UploadedDocument {
  buffer: Buffer;
  originalname: string;
  size: number;
}

/** Détection du type réel d'un fichier par ses premiers octets (on ne croit pas l'extension). */
export function sniffMime(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF')
    return { mime: 'application/pdf', ext: 'pdf' };
  if (buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])))
    return { mime: 'image/png', ext: 'png' };
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return { mime: 'image/jpeg', ext: 'jpg' };
  return null;
}

@Injectable()
export class GuardProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly tokens: TokenService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async getMine(userId: string): Promise<GuardProfileDto> {
    return toGuardProfileDto(await this.loadProfile(userId));
  }

  async updateProfile(userId: string, input: GuardApplicationInput): Promise<GuardProfileDto> {
    await this.loadProfile(userId);
    const updated = await this.prisma.guardProfile.update({
      where: { userId },
      data: {
        cnapsCardNumber: input.cnapsCardNumber,
        bio: input.bio ?? null,
        baseLat: input.baseLat,
        baseLng: input.baseLng,
        serviceRadiusKm: input.serviceRadiusKm,
      },
      include: guardProfileInclude,
    });
    return toGuardProfileDto(updated);
  }

  /** Envoie la candidature à l'admin. Pièce d'identité et carte CNAPS obligatoires. */
  async submit(user: AuthUser, meta: RequestMeta): Promise<GuardProfileDto> {
    const profile = await this.loadProfile(user.id);
    if (profile.status !== 'DRAFT' && profile.status !== 'REJECTED') {
      throw new ConflictException('Votre candidature a déjà été envoyée');
    }
    const account = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const missing: string[] = [];
    if (!account.phoneVerifiedAt) missing.push('numéro de téléphone vérifié');
    if (!profile.cnapsCardNumber) missing.push('numéro de carte professionnelle CNAPS');
    if (profile.baseLat === null || profile.baseLng === null) missing.push("zone d'intervention");
    const types = new Set(profile.documents.map((d) => d.type));
    if (!types.has('ID_CARD')) missing.push("pièce d'identité");
    if (!types.has('CNAPS_CARD')) missing.push('carte professionnelle CNAPS');
    if (missing.length > 0) {
      throw new BadRequestException({
        message: `Candidature incomplète : ${missing.join(', ')}`,
        missing,
      });
    }

    const updated = await this.prisma.guardProfile.update({
      where: { userId: user.id },
      data: { status: 'PENDING', submittedAt: new Date(), rejectionReason: null },
      include: guardProfileInclude,
    });
    await this.audit.log({
      actor: user,
      action: 'guard.application_submitted',
      entityType: 'GuardProfile',
      entityId: user.id,
      meta,
    });
    this.realtime.toAdmins('guard:application', { userId: user.id });
    return toGuardProfileDto(updated);
  }

  async uploadDocument(
    user: AuthUser,
    type: GuardDocumentType,
    file: UploadedDocument | undefined,
    meta: RequestMeta,
  ): Promise<GuardProfileDto> {
    if (!file) throw new BadRequestException('Fichier manquant');
    if (file.size > MAX_DOCUMENT_BYTES)
      throw new BadRequestException('Fichier trop volumineux (10 Mo maximum)');
    const sniffed = sniffMime(file.buffer);
    if (!sniffed) throw new BadRequestException('Format accepté : PDF, JPEG ou PNG');
    const profile = await this.loadProfile(user.id);
    if (profile.status === 'SUSPENDED') throw new ForbiddenException('Compte garde suspendu');

    const storageKey = `guards/${user.id}/${randomUUID()}.${sniffed.ext}`;
    await this.storage.put(storageKey, file.buffer, sniffed.mime);
    const doc = await this.prisma.guardDocument.create({
      data: {
        guardId: user.id,
        type,
        storageKey,
        originalName: file.originalname.slice(0, 200),
        mimeType: sniffed.mime,
        sizeBytes: file.size,
      },
    });
    await this.audit.log({
      actor: user,
      action: 'guard.document_uploaded',
      entityType: 'GuardDocument',
      entityId: doc.id,
      metadata: { type },
      meta,
    });
    return this.getMine(user.id);
  }

  async deleteDocument(user: AuthUser, documentId: string, meta: RequestMeta): Promise<void> {
    const profile = await this.loadProfile(user.id);
    if (profile.status === 'PENDING' || profile.status === 'APPROVED') {
      throw new ConflictException(
        'Les documents ne peuvent plus être supprimés une fois la candidature envoyée',
      );
    }
    const doc = profile.documents.find((d) => d.id === documentId);
    if (!doc) throw new NotFoundException('Document introuvable');
    await this.prisma.guardDocument.delete({ where: { id: doc.id } });
    await this.storage.delete(doc.storageKey);
    await this.audit.log({
      actor: user,
      action: 'guard.document_deleted',
      entityType: 'GuardDocument',
      entityId: doc.id,
      meta,
    });
  }

  async setAvailability(userId: string, input: AvailabilityInput): Promise<GuardProfileDto> {
    await this.loadProfile(userId);
    await this.prisma.$transaction([
      this.prisma.guardAvailability.deleteMany({ where: { guardId: userId } }),
      this.prisma.guardAvailability.createMany({
        data: input.slots.map((s) => ({ guardId: userId, ...s })),
      }),
      this.prisma.guardProfile.update({ where: { userId }, data: { timezone: input.timezone } }),
    ]);
    return this.getMine(userId);
  }

  /** « Disponible maintenant » : seuls les gardes validés reçoivent des missions immédiates. */
  async setPresence(user: AuthUser, input: PresenceInput): Promise<GuardProfileDto> {
    const profile = await this.loadProfile(user.id);
    if (input.available && profile.status !== 'APPROVED') {
      throw new ForbiddenException(
        "Votre compte doit être validé par l'équipe avant de recevoir des missions",
      );
    }
    const hasPosition = input.lat !== undefined && input.lng !== undefined;
    const updated = await this.prisma.guardProfile.update({
      where: { userId: user.id },
      data: {
        availableNow: input.available,
        ...(hasPosition
          ? { lastLat: input.lat, lastLng: input.lng, lastLocationAt: new Date() }
          : {}),
      },
      include: guardProfileInclude,
    });
    await this.audit.log({
      actor: user,
      action: input.available ? 'guard.available' : 'guard.unavailable',
      entityType: 'GuardProfile',
      entityId: user.id,
    });
    return toGuardProfileDto(updated);
  }

  async myRatings(userId: string): Promise<RatingDto[]> {
    const ratings = await this.prisma.rating.findMany({
      where: { guardId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { mission: { select: { client: { select: { firstName: true } } } } },
    });
    return ratings.map((r) => ({
      id: r.id,
      missionId: r.missionId,
      score: r.score,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      clientFirstName: r.mission.client.firstName,
    }));
  }

  // ---------------------------------------------------------------- Admin

  async list(query: GuardListQuery): Promise<Paginated<AdminGuardDto>> {
    const where: Prisma.GuardProfileWhereInput = {
      status: query.status ? { in: query.status } : undefined,
      user: query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' } },
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.guardProfile.count({ where }),
      this.prisma.guardProfile.findMany({
        where,
        include: { ...guardProfileInclude, user: true },
        orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: rows.map((r) => ({ ...toGuardProfileDto(r), user: toUserDto(r.user) })),
    };
  }

  async adminGet(userId: string): Promise<AdminGuardDto> {
    const profile = await this.prisma.guardProfile.findUnique({
      where: { userId },
      include: { ...guardProfileInclude, user: true },
    });
    if (!profile) throw new NotFoundException('Garde introuvable');
    return { ...toGuardProfileDto(profile), user: toUserDto(profile.user) };
  }

  async approve(admin: AuthUser, userId: string, meta: RequestMeta): Promise<AdminGuardDto> {
    const profile = await this.loadProfile(userId);
    if (
      profile.status !== 'PENDING' &&
      profile.status !== 'REJECTED' &&
      profile.status !== 'SUSPENDED'
    ) {
      throw new ConflictException('Seule une candidature en attente peut être validée');
    }
    const now = new Date();
    await this.prisma.guardProfile.update({
      where: { userId },
      data: {
        status: 'APPROVED',
        approvedAt: now,
        reviewedAt: now,
        reviewedById: admin.id,
        rejectionReason: null,
      },
    });
    await this.audit.log({
      actor: admin,
      action: 'guard.approved',
      entityType: 'GuardProfile',
      entityId: userId,
      meta,
    });
    await this.notifications.toUsers([userId], {
      title: 'Candidature validée',
      body: 'Bienvenue ! Activez votre disponibilité pour recevoir vos premières missions.',
    });
    return this.adminGet(userId);
  }

  async reject(
    admin: AuthUser,
    userId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<AdminGuardDto> {
    const profile = await this.loadProfile(userId);
    if (profile.status !== 'PENDING')
      throw new ConflictException('Seule une candidature en attente peut être refusée');
    await this.prisma.guardProfile.update({
      where: { userId },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: admin.id,
        rejectionReason: reason,
        availableNow: false,
      },
    });
    await this.audit.log({
      actor: admin,
      action: 'guard.rejected',
      entityType: 'GuardProfile',
      entityId: userId,
      metadata: { reason },
      meta,
    });
    await this.notifications.toUsers([userId], {
      title: 'Candidature à compléter',
      body: `Votre candidature n'a pas été retenue : ${reason}`,
    });
    return this.adminGet(userId);
  }

  async suspend(
    admin: AuthUser,
    userId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<AdminGuardDto> {
    await this.loadProfile(userId);
    await this.prisma.guardProfile.update({
      where: { userId },
      data: {
        status: 'SUSPENDED',
        availableNow: false,
        rejectionReason: reason,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
    await this.prisma.missionOffer.updateMany({
      where: { guardId: userId, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    await this.audit.log({
      actor: admin,
      action: 'guard.suspended',
      entityType: 'GuardProfile',
      entityId: userId,
      metadata: { reason },
      meta,
    });
    return this.adminGet(userId);
  }

  /** Téléchargement d'une pièce justificative par un admin : toujours tracé. */
  async downloadDocument(
    admin: AuthUser,
    documentId: string,
    meta: RequestMeta,
  ): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
    const doc = await this.prisma.guardDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document introuvable');
    const data = await this.storage.get(doc.storageKey);
    await this.audit.log({
      actor: admin,
      action: 'guard.document_viewed',
      entityType: 'GuardDocument',
      entityId: doc.id,
      metadata: { guardId: doc.guardId, type: doc.type },
      meta,
    });
    return { data, mimeType: doc.mimeType, fileName: doc.originalName };
  }

  private async loadProfile(userId: string) {
    const profile = await this.prisma.guardProfile.findUnique({
      where: { userId },
      include: guardProfileInclude,
    });
    if (!profile) throw new NotFoundException('Profil garde introuvable');
    return profile;
  }

  /** Utilisé par l'admin lors d'une suspension de compte. */
  async revokeSessions(userId: string): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
  }
}
