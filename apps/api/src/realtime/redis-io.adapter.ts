import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { ServerOptions } from 'socket.io';
import { AppConfig } from '../config/app-config.service';

/** Adaptateur Socket.IO adossé à Redis : plusieurs instances de l'API partagent les salles. */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(
    app: INestApplicationContext,
    private readonly config: AppConfig,
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    const pub = new Redis(this.config.get('REDIS_URL'), { lazyConnect: true });
    const sub = pub.duplicate();
    try {
      await Promise.all([pub.connect(), sub.connect()]);
      this.adapterConstructor = createAdapter(pub, sub);
    } catch (error) {
      Logger.warn(
        `Redis indisponible pour Socket.IO, mode mono-instance (${String(error)})`,
        'Realtime',
      );
      pub.disconnect();
      sub.disconnect();
    }
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
