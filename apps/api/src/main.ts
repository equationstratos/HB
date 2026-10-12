import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { AppConfig } from './config/app-config.service';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  setupApp(app);

  const config = app.get(AppConfig);
  const adapter = new RedisIoAdapter(app, config);
  await adapter.connect();
  app.useWebSocketAdapter(adapter);

  const port = config.get('PORT');
  await app.listen(port, '0.0.0.0');
  Logger.log(`API prête sur http://localhost:${port}/api — documentation : /docs`, 'Bootstrap');
}

void bootstrap();
