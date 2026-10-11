/**
 * Gains des gardes et virements : règle de rémunération et validation de l'IBAN,
 * partagées par l'API (calcul, contrôle) et l'appli garde (affichage, saisie).
 */

/** Rémunération horaire du garde par défaut (20 €/h). Réglable côté API : GUARD_HOURLY_RATE_CENTS. */
export const DEFAULT_GUARD_HOURLY_RATE_CENTS = 2000;
/** Durée minimale facturée par mission. Réglable côté API : GUARD_MIN_BILLED_MINUTES. */
export const DEFAULT_GUARD_MIN_BILLED_MINUTES = 30;
/** Montant minimal d'un virement (10 €). Réglable côté API : PAYOUT_MIN_CENTS. */
export const DEFAULT_PAYOUT_MIN_CENTS = 1000;
/**
 * Dépassement rémunéré au-delà du créneau réservé par la cliente. Réglable côté API :
 * GUARD_MAX_OVERTIME_MINUTES. Une mission oubliée « en cours » ne rapporte pas davantage.
 */
export const DEFAULT_GUARD_MAX_OVERTIME_MINUTES = 30;

export interface GuardEarningInput {
  /** Début du suivi (ou heure de départ prévue à défaut). */
  startedAt: Date;
  endedAt: Date;
  hourlyRateCents: number;
  minBilledMinutes: number;
  /** Plafond de la durée rémunérée : créneau réservé + dépassement admis. */
  maxBilledMinutes?: number;
}

/**
 * Gain d'un garde pour une mission : durée commencée = minute due, avec un minimum facturé
 * et un plafond (`capped` : la durée réelle dépassait le plafond). Montant arrondi au centime.
 */
export function guardEarning(input: GuardEarningInput): {
  billedMinutes: number;
  amountCents: number;
  capped: boolean;
} {
  const minutes = Math.ceil((input.endedAt.getTime() - input.startedAt.getTime()) / 60_000);
  const capped = input.maxBilledMinutes !== undefined && minutes > input.maxBilledMinutes;
  const worked = capped ? (input.maxBilledMinutes as number) : minutes;
  const billedMinutes = Math.max(input.minBilledMinutes, worked);
  return {
    billedMinutes,
    amountCents: Math.round((input.hourlyRateCents * billedMinutes) / 60),
    capped,
  };
}

/** Longueur de l'IBAN par pays (registre ISO 13616). */
// prettier-ignore
export const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27, BR: 29,
  BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28, EE: 20, EG: 29,
  ES: 24, FI: 18, FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HN: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20,
  LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19,
  MN: 20, MR: 27, MT: 31, MU: 30, NI: 28, NL: 18, NO: 15, OM: 23, PK: 24, PL: 28, PS: 29,
  PT: 25, QA: 29, RO: 24, RS: 22, RU: 33, SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24,
  SM: 27, SO: 23, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
  YE: 30,
};

/** IBAN saisi librement (« fr76 3000 6000… ») : sans espaces, en majuscules. */
export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** Reste de la division par 97 de l'IBAN réarrangé (lettres A = 10 … Z = 35). */
function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    const value = code >= 65 ? code - 55 : code - 48;
    remainder = (remainder * (value >= 10 ? 100 : 10) + value) % 97;
  }
  return remainder;
}

/** Vérifie le format, la longueur du pays et la clé de contrôle (ISO 13616, modulo 97). */
export function isValidIban(input: string): boolean {
  const iban = normalizeIban(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const expected = IBAN_LENGTHS[iban.slice(0, 2)];
  if (expected !== undefined && iban.length !== expected) return false;
  return ibanMod97(iban) === 1;
}

/** IBAN lisible, par groupes de 4 : « FR76 3000 6000 0112 3456 7890 189 ». */
export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})(?=.)/g, '$1 ');
}

/** IBAN masqué pour l'affichage : « FR76 •••• •••• 1234 ». */
export function maskIban(prefix: string, last4: string): string {
  return `${prefix} •••• •••• ${last4}`;
}
