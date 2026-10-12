import { describe, expect, it } from 'vitest';
import { MissionStatus, Role } from '../enums';
import { allowedNextStatuses, canTransition } from '../mission-state';

describe('machine d’états des missions', () => {
  it('suit le parcours normal', () => {
    expect(canTransition(MissionStatus.REQUESTED, MissionStatus.SEARCHING, 'SYSTEM')).toBe(true);
    expect(canTransition(MissionStatus.SEARCHING, MissionStatus.ASSIGNED, Role.GUARD)).toBe(true);
    expect(canTransition(MissionStatus.ASSIGNED, MissionStatus.GUARD_EN_ROUTE, Role.GUARD)).toBe(
      true,
    );
    expect(canTransition(MissionStatus.GUARD_EN_ROUTE, MissionStatus.IN_PROGRESS, Role.GUARD)).toBe(
      true,
    );
    expect(canTransition(MissionStatus.IN_PROGRESS, MissionStatus.COMPLETED, Role.CLIENT)).toBe(
      true,
    );
  });

  it('refuse les sauts d’étape et les mauvais acteurs', () => {
    expect(canTransition(MissionStatus.ASSIGNED, MissionStatus.COMPLETED, Role.GUARD)).toBe(false);
    expect(canTransition(MissionStatus.ASSIGNED, MissionStatus.GUARD_EN_ROUTE, Role.CLIENT)).toBe(
      false,
    );
    expect(canTransition(MissionStatus.SEARCHING, MissionStatus.UNASSIGNED, Role.ADMIN)).toBe(
      false,
    );
  });

  it('réserve l’annulation d’une protection en cours à l’admin', () => {
    expect(canTransition(MissionStatus.IN_PROGRESS, MissionStatus.CANCELLED, Role.CLIENT)).toBe(
      false,
    );
    expect(canTransition(MissionStatus.IN_PROGRESS, MissionStatus.CANCELLED, Role.ADMIN)).toBe(
      true,
    );
  });

  it('liste les statuts suivants possibles', () => {
    expect(allowedNextStatuses(MissionStatus.ASSIGNED, Role.CLIENT)).toEqual([
      MissionStatus.CANCELLED,
    ]);
    expect(allowedNextStatuses(MissionStatus.COMPLETED, Role.ADMIN)).toEqual([]);
  });
});
