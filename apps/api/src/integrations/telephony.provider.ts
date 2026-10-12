import { Logger } from '@nestjs/common';

export const TELEPHONY_PROVIDER = Symbol('TELEPHONY_PROVIDER');

export interface BridgeCallParams {
  /** Personne qui demande l'appel : la plateforme l'appelle en premier. */
  caller: string;
  /** Personne à joindre : reliée ensuite, avec le numéro de la plateforme affiché. */
  callee: string;
  reference: string;
}

export interface BridgeCallResult {
  providerCallId: string | null;
  status: string;
}

/**
 * Appel masqué : aucune des deux personnes ne voit le vrai numéro de l'autre.
 */
export interface TelephonyProvider {
  readonly name: string;
  /** Vrai si aucun appel ne part réellement (développement, tests). */
  readonly simulated?: boolean;
  bridgeCall(params: BridgeCallParams): Promise<BridgeCallResult>;
}

export class ConsoleTelephonyProvider implements TelephonyProvider {
  readonly name = 'console';
  readonly simulated = true;
  private readonly logger = new Logger('Téléphonie');

  async bridgeCall({ caller, callee, reference }: BridgeCallParams): Promise<BridgeCallResult> {
    this.logger.log(`Appel masqué ${reference} : ${caller} ⇄ ${callee}`);
    return { providerCallId: null, status: 'simulated' };
  }
}

export class MemoryTelephonyProvider implements TelephonyProvider {
  readonly name = 'memory';
  /** Les tests le passent à faux pour simuler une vraie téléphonie. */
  simulated = true;
  readonly calls: BridgeCallParams[] = [];

  async bridgeCall(params: BridgeCallParams): Promise<BridgeCallResult> {
    this.calls.push(params);
    return { providerCallId: `mem-${this.calls.length}`, status: 'queued' };
  }
}

/**
 * Twilio Programmable Voice en « click-to-call » : Twilio appelle la personne qui demande
 * l'appel, puis compose le numéro de l'autre avec le numéro de la plateforme comme appelant.
 */
export class TwilioTelephonyProvider implements TelephonyProvider {
  readonly name = 'twilio';

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly platformNumber: string,
  ) {}

  async bridgeCall({ caller, callee }: BridgeCallParams): Promise<BridgeCallResult> {
    const twiml =
      `<Response><Say language="fr-FR">Mise en relation sécurisée, veuillez patienter.</Say>` +
      `<Dial callerId="${this.platformNumber}" timeLimit="1800"><Number>${callee}</Number></Dial></Response>`;
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: caller, From: this.platformNumber, Twiml: twiml }),
      },
    );
    if (!res.ok) throw new Error(`Twilio Voice ${res.status} : ${await res.text()}`);
    const json = (await res.json()) as { sid?: string; status?: string };
    return { providerCallId: json.sid ?? null, status: json.status ?? 'queued' };
  }
}
