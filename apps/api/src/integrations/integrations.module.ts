import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';
import {
  ConsolePushProvider,
  ExpoPushProvider,
  MemoryPushProvider,
  PUSH_PROVIDER,
  PushProvider,
} from './push.provider';
import {
  OrsRoutingProvider,
  OsrmRoutingProvider,
  ROUTING_PROVIDER,
  RoutingProvider,
  StraightLineRoutingProvider,
} from './routing.provider';
import {
  ConsoleSmsProvider,
  MemorySmsProvider,
  SMS_PROVIDER,
  SmsProvider,
  TwilioSmsProvider,
} from './sms.provider';
import { FILE_STORAGE, FileStorage, LocalDiskStorage, S3Storage } from './storage.provider';
import {
  ConsoleTelephonyProvider,
  MemoryTelephonyProvider,
  TELEPHONY_PROVIDER,
  TelephonyProvider,
  TwilioTelephonyProvider,
} from './telephony.provider';

function required(config: AppConfig, ...keys: Parameters<AppConfig['get']>[0][]): string[] {
  return keys.map((k) => {
    const v = config.get(k);
    if (!v) throw new Error(`Variable d'environnement manquante : ${k}`);
    return String(v);
  });
}

/**
 * Services externes derrière des adaptateurs. En développement, tout fonctionne sans aucun
 * compte grâce aux implémentations « console ».
 */
@Global()
@Module({
  providers: [
    {
      provide: SMS_PROVIDER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): SmsProvider => {
        switch (config.get('SMS_PROVIDER')) {
          case 'twilio': {
            const [sid, token, from] = required(
              config,
              'TWILIO_ACCOUNT_SID',
              'TWILIO_AUTH_TOKEN',
              'TWILIO_FROM_NUMBER',
            );
            return new TwilioSmsProvider(sid!, token!, from!);
          }
          case 'memory':
            return new MemorySmsProvider();
          default:
            return new ConsoleSmsProvider();
        }
      },
    },
    {
      provide: TELEPHONY_PROVIDER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): TelephonyProvider => {
        switch (config.get('TELEPHONY_PROVIDER')) {
          case 'twilio': {
            const [sid, token, from] = required(
              config,
              'TWILIO_ACCOUNT_SID',
              'TWILIO_AUTH_TOKEN',
              'TWILIO_FROM_NUMBER',
            );
            return new TwilioTelephonyProvider(sid!, token!, from!);
          }
          case 'memory':
            return new MemoryTelephonyProvider();
          default:
            return new ConsoleTelephonyProvider();
        }
      },
    },
    {
      provide: PUSH_PROVIDER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): PushProvider => {
        switch (config.get('PUSH_PROVIDER')) {
          case 'expo':
            return new ExpoPushProvider(config.get('EXPO_ACCESS_TOKEN'));
          case 'memory':
            return new MemoryPushProvider();
          default:
            return new ConsolePushProvider();
        }
      },
    },
    {
      provide: FILE_STORAGE,
      inject: [AppConfig],
      useFactory: (config: AppConfig): FileStorage => {
        if (config.get('STORAGE_PROVIDER') === 's3') {
          const [bucket, region] = required(config, 'S3_BUCKET', 'S3_REGION');
          return new S3Storage({
            bucket: bucket!,
            region: region!,
            endpoint: config.get('S3_ENDPOINT'),
            accessKeyId: config.get('S3_ACCESS_KEY_ID'),
            secretAccessKey: config.get('S3_SECRET_ACCESS_KEY'),
          });
        }
        return new LocalDiskStorage(config.get('UPLOAD_DIR'));
      },
    },
    {
      provide: ROUTING_PROVIDER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): RoutingProvider => {
        switch (config.get('ROUTING_PROVIDER')) {
          case 'osrm':
            return new OsrmRoutingProvider(config.get('OSRM_URL'));
          case 'ors': {
            const [key] = required(config, 'ORS_API_KEY');
            return new OrsRoutingProvider(key!);
          }
          default:
            return new StraightLineRoutingProvider();
        }
      },
    },
  ],
  exports: [SMS_PROVIDER, TELEPHONY_PROVIDER, PUSH_PROVIDER, FILE_STORAGE, ROUTING_PROVIDER],
})
export class IntegrationsModule {}
