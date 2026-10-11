import { GuardAvailability, GuardDocument, GuardProfile, Prisma, User } from '@prisma/client';
import { AdminGuardDto, GuardProfileDto } from '@hb/shared';
import { iso } from '../common/iso';
import { toUserDto } from '../users/user.mapper';

export type GuardProfileWithRelations = GuardProfile & {
  documents: GuardDocument[];
  availability: GuardAvailability[];
};

export const guardProfileInclude = {
  documents: { orderBy: { uploadedAt: 'desc' } },
  availability: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
} satisfies Prisma.GuardProfileInclude;

/** Profil renvoyé au garde lui-même : sa note moyenne reste réservée à l'équipe. */
export function toGuardProfileDto(p: GuardProfileWithRelations): GuardProfileDto {
  return {
    userId: p.userId,
    status: p.status,
    cnapsCardNumber: p.cnapsCardNumber,
    bio: p.bio,
    baseLat: p.baseLat,
    baseLng: p.baseLng,
    serviceRadiusKm: p.serviceRadiusKm,
    availableNow: p.availableNow,
    timezone: p.timezone,
    rejectionReason: p.rejectionReason,
    submittedAt: iso(p.submittedAt),
    approvedAt: iso(p.approvedAt),
    documents: p.documents.map((d) => ({
      id: d.id,
      type: d.type,
      originalName: d.originalName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    availability: p.availability.map(({ dayOfWeek, startMinute, endMinute }) => ({
      dayOfWeek,
      startMinute,
      endMinute,
    })),
  };
}

/** Vue admin : profil, compte et note moyenne. */
export function toAdminGuardDto(p: GuardProfileWithRelations & { user: User }): AdminGuardDto {
  return {
    ...toGuardProfileDto(p),
    user: toUserDto(p.user),
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
  };
}
