/**
 * Simulation d'une protection complète, pour voir la carte admin s'animer :
 * réservation par Camille → acceptation par un garde → suivi en direct le long du trajet,
 * avec un écart volontaire au milieu → fin de mission et notation.
 *
 *   pnpm --filter @hb/api simulate              (la cliente répond « Tout va bien »)
 *   pnpm --filter @hb/api simulate --no-answer  (pas de réponse : escalade en SOS)
 *   pnpm --filter @hb/api simulate --keep       (laisse la mission en cours à la fin)
 *
 * Prérequis : API démarrée et base initialisée avec le seed.
 */
import { LoginResponse, MissionDto, OfferDto, pointAlong, polylineLengthMeters } from '@hb/shared';

const API = process.env.SIM_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}/api`;
const PASSWORD = process.env.SEED_PASSWORD ?? 'Demo-HB-2026!';
const args = new Set(process.argv.slice(2));
const TICK_MS = 1500;
const STEP_METERS = 40;
const DEVIATION_MS = 75_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`);

async function call<T>(
  path: string,
  token: string | null,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

async function login(email: string): Promise<string> {
  const res = await call<LoginResponse>('/auth/login', null, 'POST', { email, password: PASSWORD });
  if (res.status !== 'OK') throw new Error(`${email} : connexion incomplète (${res.status})`);
  return res.tokens.accessToken;
}

const ping = (lat: number, lng: number) => ({
  pings: [{ lat, lng, accuracy: 8, recordedAt: new Date().toISOString() }],
});

async function main() {
  log(`API : ${API}`);
  const client = await login('camille@hb.local');
  const guardEmails = [
    'karim@hb.local',
    'aicha@hb.local',
    'julien@hb.local',
    'thomas@hb.local',
    'sofia@hb.local',
  ];
  const guards = await Promise.all(
    guardEmails.map(async (email) => ({ email, token: await login(email) })),
  );

  // Les gardes se déclarent disponibles autour du départ.
  for (const g of guards) {
    await call('/guards/me/presence', g.token, 'POST', {
      available: true,
      lat: 48.857 + Math.random() * 0.004,
      lng: 2.345 + Math.random() * 0.006,
    });
  }

  const mission = await call<MissionDto>('/missions', client, 'POST', {
    type: 'ONE_OFF',
    notes: 'Simulation : retour de soirée',
    route: {
      mode: 'WALK',
      points: [
        { lat: 48.8584, lng: 2.347, address: 'Place du Châtelet' },
        { lat: 48.8565, lng: 2.3525, address: 'Hôtel de Ville' },
        { lat: 48.8532, lng: 2.3691, address: 'Place de la Bastille' },
      ],
    },
  });
  log(`Mission ${mission.id} réservée (mot de code : ${mission.codeWord}), recherche d'un garde…`);

  let guard: (typeof guards)[number] | null = null;
  for (let i = 0; i < 20 && !guard; i++) {
    for (const g of guards) {
      const offers = await call<OfferDto[]>('/offers', g.token);
      const offer = offers.find((o) => o.missionId === mission.id);
      if (offer) {
        await call(`/offers/${offer.id}/accept`, g.token, 'POST');
        guard = g;
        break;
      }
    }
    if (!guard) await sleep(1000);
  }
  if (!guard)
    throw new Error('Aucun garde n’a reçu la proposition (seed chargé ? gardes disponibles ?)');
  log(`${guard.email} accepte la mission.`);

  await call(`/missions/${mission.id}/status`, guard.token, 'POST', { status: 'GUARD_EN_ROUTE' });
  log('Garde en route vers la cliente.');
  const start = mission.route.waypoints[0]!;
  for (let i = 5; i >= 1; i--) {
    await call(
      `/missions/${mission.id}/locations`,
      guard.token,
      'POST',
      ping(start.lat + i * 0.0006, start.lng - i * 0.0004),
    );
    await call(`/missions/${mission.id}/locations`, client, 'POST', ping(start.lat, start.lng));
    await sleep(TICK_MS);
  }

  await call(`/missions/${mission.id}/status`, guard.token, 'POST', { status: 'IN_PROGRESS' });
  log('Protection en cours : le garde suit la cliente à distance.');
  await call(`/missions/${mission.id}/messages`, guard.token, 'POST', {
    body: 'Je suis derrière vous, tout va bien.',
  });

  const coords = mission.route.geometry.coordinates;
  const total = polylineLengthMeters(coords);
  let deviated = args.has('--no-deviation');
  for (let along = 0; along <= total; along += STEP_METERS) {
    const p = pointAlong(coords, along);
    if (!deviated && along > total * 0.45) {
      deviated = true;
      log('⚠️  La cliente quitte le trajet prévu (≈ 300 m au nord) pendant 75 s…');
      const until = Date.now() + DEVIATION_MS;
      while (Date.now() < until) {
        await call(
          `/missions/${mission.id}/locations`,
          client,
          'POST',
          ping(p.lat + 0.0028, p.lng),
        );
        await call(
          `/missions/${mission.id}/locations`,
          guard.token,
          'POST',
          ping(p.lat + 0.0025, p.lng - 0.0003),
        );
        await sleep(TICK_MS);
      }
      log('La cliente revient sur son trajet.');
      if (!args.has('--no-answer')) {
        const deviations = await call<{ id: string; status: string }[]>(
          `/missions/${mission.id}/deviations`,
          client,
        );
        for (const d of deviations.filter((x) => x.status === 'OPEN')) {
          await call(`/deviations/${d.id}/answer`, client, 'POST', { ok: true });
          log('La cliente répond « Tout va bien ».');
        }
      }
    }
    const behind = pointAlong(coords, Math.max(0, along - 45));
    await call(`/missions/${mission.id}/locations`, client, 'POST', ping(p.lat, p.lng));
    await call(
      `/missions/${mission.id}/locations`,
      guard.token,
      'POST',
      ping(behind.lat, behind.lng),
    );
    await sleep(TICK_MS);
  }

  if (args.has('--keep')) {
    log('Mission laissée en cours (--keep).');
    return;
  }
  await call(`/missions/${mission.id}/status`, client, 'POST', { status: 'COMPLETED' });
  await call(`/missions/${mission.id}/rating`, client, 'POST', {
    score: 5,
    comment: 'Simulation : très rassurant.',
  });
  log('Arrivée ! Protection terminée et garde noté 5/5.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
