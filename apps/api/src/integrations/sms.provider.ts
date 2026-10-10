import { Logger } from '@nestjs/common';

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsProvider {
  send(to: string, body: string): Promise<void>;
}

/** Développement : les SMS (dont les codes OTP) s'affichent dans la console de l'API. */
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SMS');

  async send(to: string, body: string): Promise<void> {
    this.logger.log(`→ ${to} : ${body}`);
  }
}

/** Tests : les SMS sont conservés en mémoire pour être relus. */
export class MemorySmsProvider implements SmsProvider {
  readonly sent: { to: string; body: string }[] = [];

  async send(to: string, body: string): Promise<void> {
    this.sent.push({ to, body });
  }

  lastTo(to: string): string | undefined {
    return [...this.sent].reverse().find((m) => m.to === to)?.body;
  }
}

export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(to: string, body: string): Promise<void> {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: this.from, Body: body }),
      },
    );
    if (!res.ok) throw new Error(`Twilio SMS ${res.status} : ${await res.text()}`);
  }
}
