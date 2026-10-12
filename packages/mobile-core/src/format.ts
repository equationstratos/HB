const dateTime = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : '—';
export const fmtTime = (iso: string | null | undefined) => (iso ? time.format(new Date(iso)) : '—');

/** « dans 12 min », « il y a 3 min ». */
export function fmtRelative(iso: string, now = Date.now()): string {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (Math.abs(minutes) < 1) return 'maintenant';
  if (Math.abs(minutes) < 60) return minutes > 0 ? `dans ${minutes} min` : `il y a ${-minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours > 0 ? `dans ${hours} h` : `il y a ${-hours} h`;
}
