/**
 * Normalise un numéro saisi à la française (06 12 34 56 78) au format E.164 (+33612345678).
 * Les numéros déjà internationaux sont seulement nettoyés.
 */
export function normalizePhone(input: string, defaultCountryCode = '33'): string {
  let s = input.replace(/[\s.\-()]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+') && s.startsWith('0')) s = `+${defaultCountryCode}${s.slice(1)}`;
  return s;
}

/** Masque un numéro pour l'affichage : +33 6 •• •• •• 78. */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 4)} •• •• •• ${phone.slice(-2)}`;
}

export interface ZonedDayMinutes {
  /** 1 = lundi … 7 = dimanche. */
  isoDay: number;
  /** Minutes écoulées depuis minuit, heure locale. */
  minutes: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Jour de la semaine et heure locale d'un instant dans un fuseau donné. */
export function zonedDayMinutes(date: Date, timeZone: string): ZonedDayMinutes {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    isoDay: WEEKDAYS[get('weekday')] ?? 1,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export interface WeeklySlot {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

/**
 * Vrai si l'intervalle [start, end] tient entièrement dans l'un des créneaux hebdomadaires.
 * Un intervalle qui passe minuit n'est couvert que si deux créneaux consécutifs le couvrent.
 */
export function isCoveredByWeeklySlots(
  start: Date,
  end: Date,
  slots: readonly WeeklySlot[],
  timeZone: string,
): boolean {
  const a = zonedDayMinutes(start, timeZone);
  const b = zonedDayMinutes(end, timeZone);
  const covers = (day: number, from: number, to: number) =>
    slots.some((s) => s.dayOfWeek === day && s.startMinute <= from && s.endMinute >= to);

  if (a.isoDay === b.isoDay && b.minutes >= a.minutes) {
    return covers(a.isoDay, a.minutes, b.minutes);
  }
  // Passage de minuit.
  return covers(a.isoDay, a.minutes, 1440) && covers(b.isoDay, 0, b.minutes);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0).replace('.', ',')} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

export function formatPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',').replace(',00', '')} €`;
}
