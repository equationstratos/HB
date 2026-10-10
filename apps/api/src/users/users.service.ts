import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EmergencyContactDto,
  EmergencyContactInput,
  UpdateProfileInput,
  UserDto,
} from '@hb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toUserDto } from './user.mapper';

const MAX_EMERGENCY_CONTACTS = 5;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: string): Promise<UserDto> {
    return toUserDto(await this.prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  }

  async update(userId: string, input: UpdateProfileInput): Promise<UserDto> {
    return toUserDto(await this.prisma.user.update({ where: { id: userId }, data: input }));
  }

  async setLocationConsent(userId: string, granted: boolean): Promise<UserDto> {
    return toUserDto(
      await this.prisma.user.update({
        where: { id: userId },
        data: { locationConsentAt: granted ? new Date() : null },
      }),
    );
  }

  async setPushToken(userId: string, token: string | null): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { pushToken: token } });
  }

  async listContacts(userId: string): Promise<EmergencyContactDto[]> {
    const rows = await this.prisma.emergencyContact.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(({ id, name, phone, relation }) => ({ id, name, phone, relation }));
  }

  async addContact(userId: string, input: EmergencyContactInput): Promise<EmergencyContactDto> {
    const count = await this.prisma.emergencyContact.count({ where: { userId } });
    if (count >= MAX_EMERGENCY_CONTACTS) {
      throw new BadRequestException(`${MAX_EMERGENCY_CONTACTS} contacts d'urgence maximum`);
    }
    const { id, name, phone, relation } = await this.prisma.emergencyContact.create({
      data: { userId, name: input.name, phone: input.phone, relation: input.relation ?? null },
    });
    return { id, name, phone, relation };
  }

  async removeContact(userId: string, contactId: string): Promise<void> {
    const { count } = await this.prisma.emergencyContact.deleteMany({
      where: { id: contactId, userId },
    });
    if (count === 0) throw new NotFoundException('Contact introuvable');
  }
}
