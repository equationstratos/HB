import { Logger } from '@nestjs/common';

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export interface PushMessage {
  /** Jeton Expo (ExponentPushToken[…]). */
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Les alertes critiques sonnent même en mode discret. */
  priority?: 'default' | 'high';
  sound?: 'default' | null;
  channelId?: string;
}

export interface PushProvider {
  send(messages: PushMessage[]): Promise<void>;
}

export class ConsolePushProvider implements PushProvider {
  private readonly logger = new Logger('Push');

  async send(messages: PushMessage[]): Promise<void> {
    for (const m of messages) this.logger.log(`→ ${m.to.slice(0, 24)}… « ${m.title} » ${m.body}`);
  }
}

export class MemoryPushProvider implements PushProvider {
  readonly sent: PushMessage[] = [];

  async send(messages: PushMessage[]): Promise<void> {
    this.sent.push(...messages);
  }
}

export class ExpoPushProvider implements PushProvider {
  constructor(private readonly accessToken?: string) {}

  async send(messages: PushMessage[]): Promise<void> {
    // L'API Expo accepte 100 messages par requête.
    for (let i = 0; i < messages.length; i += 100) {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
      if (!res.ok) throw new Error(`Expo push ${res.status} : ${await res.text()}`);
    }
  }
}
