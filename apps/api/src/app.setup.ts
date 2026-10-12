import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/exceptions.filter';
import { AppConfig } from './config/app-config.service';

/** Configuration HTTP commune à l'application et aux tests e2e. */
export function setupApp(app: INestApplication): void {
  const config = app.get(AppConfig);
  const express = app as NestExpressApplication;

  if (config.get('TRUST_PROXY')) express.set('trust proxy', 1);
  express.disable('x-powered-by');

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: config
      .get('CORS_ORIGINS')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  });
  app.enableShutdownHooks();

  if (!config.isProduction) {
    const doc = new DocumentBuilder()
      .setTitle('API HB — Accompagnement furtif')
      .setDescription(
        'Réservation de trajets surveillés, attribution des gardes, suivi GPS, alertes et administration.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }
}
