let ctx: AudioContext | null = null;

/** Signal sonore d'alerte (Web Audio, aucun fichier à charger). */
export function playAlarm(kind: 'sos' | 'warning' = 'sos'): void {
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    const beeps = kind === 'sos' ? [0, 0.25, 0.5] : [0];
    for (const offset of beeps) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = kind === 'sos' ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.15, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    }
  } catch {
    /* audio indisponible (navigateur sans interaction préalable) */
  }
}
