import { User } from '@prisma/client';
import { UserDto } from '@hb/shared';
import { iso } from '../common/iso';

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
    phoneVerified: !!user.phoneVerifiedAt,
    mfaEnabled: !!user.totpEnabledAt,
    locationConsentAt: iso(user.locationConsentAt),
    createdAt: user.createdAt.toISOString(),
  };
}
