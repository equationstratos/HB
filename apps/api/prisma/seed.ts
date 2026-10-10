/**
 * Données de démonstration : 1 admin, 7 gardes (5 validés, 2 en attente), 2 clientes,
 * 3 formules, un historique de missions notées et une protection programmée.
 *
 *   pnpm --filter @hb/api seed
 *
 * Réservé au développement : refuse de tourner en production ou sur une base non vide.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createCipheriv, randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import {
  CODE_WORDS,
  DEFAULT_TOLERANCE_METERS,
  expectedArrival,
  slotEnd,
  straightLineRoute,
} from '@hb/shared';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? 'Demo-HB-2026!';
/** Secret TOTP de démonstration de l'admin (à ajouter dans une appli d'authentification). */
const ADMIN_TOTP_SECRET = process.env.SEED_ADMIN_TOTP_SECRET ?? 'KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD';

function encrypt(plain: string): string {
  const key = Buffer.from(process.env.DATA_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY manquante (voir apps/api/.env)');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

const hash = (p: string) =>
  argon2.hash(p, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

interface GuardSeed {
  firstName: string;
  lastName: string;
  base: [number, number];
  bio: string;
  approved: boolean;
}

const GUARDS: GuardSeed[] = [
  {
    firstName: 'Karim',
    lastName: 'Benali',
    base: [48.8566, 2.3522],
    bio: 'Ancien sous-officier, 8 ans de protection rapprochée.',
    approved: true,
  },
  {
    firstName: 'Julien',
    lastName: 'Moreau',
    base: [48.8738, 2.295],
    bio: 'Agent de sécurité diplômé, secouriste SST.',
    approved: true,
  },
  {
    firstName: 'Aïcha',
    lastName: 'Diallo',
    base: [48.8462, 2.373],
    bio: 'Spécialiste accompagnement de nuit.',
    approved: true,
  },
  {
    firstName: 'Thomas',
    lastName: 'Lefèvre',
    base: [48.882, 2.343],
    bio: 'Ancien gendarme mobile.',
    approved: true,
  },
  {
    firstName: 'Sofia',
    lastName: 'Ricci',
    base: [48.835, 2.32],
    bio: 'Formée à la gestion de conflits.',
    approved: true,
  },
  {
    firstName: 'Mehdi',
    lastName: 'Haddad',
    base: [48.86, 2.38],
    bio: 'Candidature en cours.',
    approved: false,
  },
  {
    firstName: 'Lucas',
    lastName: 'Bernard',
    base: [48.87, 2.36],
    bio: 'Candidature en cours.',
    approved: false,
  },
];

let phoneCounter = 10;
const phone = () => `+3361234${String(phoneCounter++).padStart(4, '0')}`;

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Le seed de démonstration est interdit en production.');
  if ((await prisma.user.count()) > 0) {
    console.log(
      'La base contient déjà des utilisateurs : seed ignoré (pnpm --filter @hb/api db:reset pour repartir de zéro).',
    );
    return;
  }

  const passwordHash = await hash(PASSWORD);
  const now = new Date();
  const uploadDir = resolve(process.env.UPLOAD_DIR ?? './uploads');

  // --- Formules
  const [essentiel] = await Promise.all([
    prisma.plan.create({
      data: {
        code: 'essentiel',
        name: 'Essentiel',
        description: '4 protections par mois',
        missionsPerMonth: 4,
        priceCents: 3900,
      },
    }),
    prisma.plan.create({
      data: {
        code: 'serenite',
        name: 'Sérénité',
        description: '12 protections par mois',
        missionsPerMonth: 12,
        priceCents: 9900,
      },
    }),
    prisma.plan.create({
      data: {
        code: 'liberte',
        name: 'Liberté',
        description: '30 protections par mois',
        missionsPerMonth: 30,
        priceCents: 19900,
      },
    }),
  ]);

  // --- Admin (2FA active)
  await prisma.user.create({
    data: {
      email: 'admin@hb.local',
      phone: phone(),
      firstName: 'Alice',
      lastName: 'Admin',
      role: 'ADMIN',
      passwordHash,
      phoneVerifiedAt: now,
      totpSecret: encrypt(ADMIN_TOTP_SECRET),
      totpEnabledAt: now,
    },
  });

  // --- Gardes
  const guards = [];
  for (const g of GUARDS) {
    const email = `${g.firstName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@hb.local`;
    const user = await prisma.user.create({
      data: {
        email,
        phone: phone(),
        firstName: g.firstName,
        lastName: g.lastName,
        role: 'GUARD',
        passwordHash,
        phoneVerifiedAt: now,
        locationConsentAt: now,
        guardProfile: {
          create: {
            status: g.approved ? 'APPROVED' : 'PENDING',
            cnapsCardNumber: `CAR-075-2030-01-01-2025${String(phoneCounter).padStart(7, '0')}`,
            bio: g.bio,
            baseLat: g.base[0],
            baseLng: g.base[1],
            serviceRadiusKm: 12,
            availableNow: g.approved,
            lastLat: g.approved ? g.base[0] : null,
            lastLng: g.approved ? g.base[1] : null,
            lastLocationAt: g.approved ? now : null,
            submittedAt: now,
            approvedAt: g.approved ? now : null,
            reviewedAt: g.approved ? now : null,
            // Tous les jours de 7 h à minuit.
            availability: {
              create: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
                dayOfWeek: d,
                startMinute: 7 * 60,
                endMinute: 1440,
              })),
            },
          },
        },
      },
    });
    // Pièces justificatives factices (PDF minimal).
    for (const type of ['ID_CARD', 'CNAPS_CARD'] as const) {
      const key = `guards/${user.id}/${type.toLowerCase()}.pdf`;
      await mkdir(join(uploadDir, 'guards', user.id), { recursive: true });
      await writeFile(
        join(uploadDir, key),
        `%PDF-1.4\n% Document de démonstration ${type} — ${g.firstName} ${g.lastName}\n`,
      );
      await prisma.guardDocument.create({
        data: {
          guardId: user.id,
          type,
          storageKey: key,
          originalName: `${type.toLowerCase()}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 64,
        },
      });
    }
    guards.push(user);
  }

  // --- Clientes
  const camille = await prisma.user.create({
    data: {
      email: 'camille@hb.local',
      phone: phone(),
      firstName: 'Camille',
      lastName: 'Durand',
      role: 'CLIENT',
      passwordHash,
      phoneVerifiedAt: now,
      locationConsentAt: now,
      emergencyContacts: { create: { name: 'Hélène Durand', phone: phone(), relation: 'Sœur' } },
    },
  });
  const sarah = await prisma.user.create({
    data: {
      email: 'sarah@hb.local',
      phone: phone(),
      firstName: 'Sarah',
      lastName: 'Lambert',
      role: 'CLIENT',
      passwordHash,
      phoneVerifiedAt: now,
      locationConsentAt: now,
    },
  });
  await prisma.subscription.create({
    data: {
      clientId: camille.id,
      planId: essentiel.id,
      currentPeriodStart: new Date(now.getTime() - 5 * 86_400_000),
      currentPeriodEnd: new Date(now.getTime() + 25 * 86_400_000),
      missionsUsed: 1,
    },
  });

  // --- Historique : missions terminées et notées
  const trips: {
    client: typeof camille;
    guard: (typeof guards)[number];
    daysAgo: number;
    points: [number, number][];
    score: number;
    comment: string;
  }[] = [
    {
      client: camille,
      guard: guards[0]!,
      daysAgo: 2,
      points: [
        [48.8584, 2.347],
        [48.8532, 2.3691],
      ],
      score: 5,
      comment: 'Très discret et rassurant.',
    },
    {
      client: sarah,
      guard: guards[2]!,
      daysAgo: 4,
      points: [
        [48.8443, 2.3744],
        [48.8506, 2.392],
      ],
      score: 5,
      comment: 'Parfait, merci !',
    },
    {
      client: camille,
      guard: guards[1]!,
      daysAgo: 9,
      points: [
        [48.8738, 2.295],
        [48.8656, 2.3212],
      ],
      score: 4,
      comment: 'Bien, un peu en retard au départ.',
    },
  ];
  for (const trip of trips) {
    const departureAt = new Date(now.getTime() - trip.daysAgo * 86_400_000);
    const route = straightLineRoute(
      trip.points.map(([lat, lng]) => ({ lat, lng })),
      'WALK',
    );
    const mission = await prisma.mission.create({
      data: {
        clientId: trip.client.id,
        guardId: trip.guard.id,
        status: 'COMPLETED',
        type: 'ONE_OFF',
        departureAt,
        slotEndAt: slotEnd(departureAt, route.durationSeconds),
        codeWord: CODE_WORDS[trip.daysAgo % CODE_WORDS.length]!,
        assignedAt: departureAt,
        enRouteAt: departureAt,
        startedAt: departureAt,
        completedAt: new Date(departureAt.getTime() + route.durationSeconds * 1000),
        route: {
          create: {
            mode: 'WALK',
            waypoints: trip.points.map(([lat, lng]) => ({
              lat,
              lng,
              address: null,
            })) as unknown as Prisma.InputJsonValue,
            geometry: route.geometry as unknown as Prisma.InputJsonValue,
            distanceMeters: route.distanceMeters,
            durationSeconds: route.durationSeconds,
            approximate: true,
            provider: route.provider,
            toleranceMeters: DEFAULT_TOLERANCE_METERS.WALK,
            expectedArrivalAt: expectedArrival(departureAt, route.durationSeconds),
          },
        },
      },
    });
    await prisma.rating.create({
      data: {
        missionId: mission.id,
        clientId: trip.client.id,
        guardId: trip.guard.id,
        score: trip.score,
        comment: trip.comment,
      },
    });
  }
  // Moyennes des notes.
  for (const g of guards) {
    const agg = await prisma.rating.aggregate({
      where: { guardId: g.id },
      _sum: { score: true },
      _count: true,
    });
    if (agg._count > 0) {
      await prisma.guardProfile.update({
        where: { userId: g.id },
        data: {
          ratingSum: agg._sum.score ?? 0,
          ratingCount: agg._count,
          ratingAvg: Math.round(((agg._sum.score ?? 0) / agg._count) * 100) / 100,
        },
      });
    }
  }

  // --- Protection programmée demain soir, déjà attribuée
  const tomorrow = new Date(now.getTime() + 86_400_000);
  tomorrow.setUTCHours(20, 30, 0, 0);
  const upcoming = straightLineRoute(
    [
      { lat: 48.8698, lng: 2.3075 },
      { lat: 48.879, lng: 2.327 },
    ],
    'WALK',
  );
  await prisma.mission.create({
    data: {
      clientId: camille.id,
      guardId: guards[1]!.id,
      status: 'ASSIGNED',
      type: 'SUBSCRIPTION',
      departureAt: tomorrow,
      slotEndAt: slotEnd(tomorrow, upcoming.durationSeconds),
      codeWord: 'Mimosa',
      notes: 'Sortie du restaurant, rue de Ponthieu.',
      assignedAt: now,
      route: {
        create: {
          mode: 'WALK',
          waypoints: [
            { lat: 48.8698, lng: 2.3075, address: 'Rue de Ponthieu, Paris 8e' },
            { lat: 48.879, lng: 2.327, address: 'Place de Clichy, Paris 9e' },
          ] as unknown as Prisma.InputJsonValue,
          geometry: upcoming.geometry as unknown as Prisma.InputJsonValue,
          distanceMeters: upcoming.distanceMeters,
          durationSeconds: upcoming.durationSeconds,
          approximate: true,
          provider: upcoming.provider,
          toleranceMeters: DEFAULT_TOLERANCE_METERS.WALK,
          expectedArrivalAt: expectedArrival(tomorrow, upcoming.durationSeconds),
        },
      },
    },
  });

  await prisma.auditLog.create({
    data: { actorRole: 'SYSTEM', action: 'seed.completed', metadata: { users: 10 } },
  });

  console.log(`
Données de démonstration créées. Mot de passe commun : ${PASSWORD}

  Admin    admin@hb.local     (2FA : secret TOTP ${ADMIN_TOTP_SECRET})
  Clientes camille@hb.local, sarah@hb.local
  Gardes   karim@hb.local, julien@hb.local, aicha@hb.local, thomas@hb.local, sofia@hb.local
  En attente de validation : mehdi@hb.local, lucas@hb.local
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
