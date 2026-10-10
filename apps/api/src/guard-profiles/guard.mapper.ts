import { GuardAvailability, GuardDocument, GuardProfile, Prisma } from '@prisma/client';
import { GuardProfileDto } from '@hb/shared';
import { iso } from '../common/iso';

export type GuardProfileWithRelations = GuardProfile & {
  documents: GuardDocument[];
  availability: GuardAvailability[];
};

export const guardProfileInclude = {
  documents: { orderBy: { uploadedAt: 'desc' } },
  availability: { orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
} satisfies Prisma.GuardProfileInclude;

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
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
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
