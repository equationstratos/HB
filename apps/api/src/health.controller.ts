import { API_LEVEL } from '@hb/shared';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './common/decorators';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('Santé')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    // apiLevel : les applis signalent un serveur trop ancien pour elles.
    return { status: 'ok', apiLevel: API_LEVEL, time: new Date().toISOString() };
  }
}
