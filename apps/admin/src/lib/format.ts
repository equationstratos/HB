import type { MissionStatus } from '@hb/shared';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const time = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short', timeZone: 'Europe/Paris' });
const relative = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : '—';
export const fmtTime = (iso: string | null | undefined) => (iso ? time.format(new Date(iso)) : '—');

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relative.format(seconds, 'second');
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86_400), 'day');
}

export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | undefined;

export const missionTone: Record<MissionStatus, Tone> = {
  REQUESTED: undefined,
  SEARCHING: 'info',
  ASSIGNED: 'primary',
  GUARD_EN_ROUTE: 'primary',
  IN_PROGRESS: 'success',
  COMPLETED: undefined,
  CANCELLED: undefined,
  UNASSIGNED: 'danger',
};

export function fullName(p: { firstName: string; lastName: string } | null | undefined): string {
  return p ? `${p.firstName} ${p.lastName}` : '—';
}
