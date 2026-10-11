-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');

-- CreateTable
CREATE TABLE "GuardBankAccount" (
    "guardId" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "ibanEncrypted" TEXT NOT NULL,
    "ibanPrefix" TEXT NOT NULL,
    "ibanLast4" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardBankAccount_pkey" PRIMARY KEY ("guardId")
);

-- CreateTable
CREATE TABLE "GuardEarning" (
    "id" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "billedMinutes" INTEGER NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardPayout" (
    "id" TEXT NOT NULL,
    "guardId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "holderName" TEXT NOT NULL,
    "ibanEncrypted" TEXT NOT NULL,
    "ibanPrefix" TEXT NOT NULL,
    "ibanLast4" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedById" TEXT,
    "bankReference" TEXT,
    "rejectionReason" TEXT,

    CONSTRAINT "GuardPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuardEarning_missionId_key" ON "GuardEarning"("missionId");

-- CreateIndex
CREATE INDEX "GuardEarning_guardId_endedAt_idx" ON "GuardEarning"("guardId", "endedAt");

-- CreateIndex
CREATE INDEX "GuardPayout_guardId_requestedAt_idx" ON "GuardPayout"("guardId", "requestedAt");

-- CreateIndex
CREATE INDEX "GuardPayout_status_requestedAt_idx" ON "GuardPayout"("status", "requestedAt");

-- AddForeignKey
ALTER TABLE "GuardBankAccount" ADD CONSTRAINT "GuardBankAccount_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "GuardProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardEarning" ADD CONSTRAINT "GuardEarning_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "GuardProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardEarning" ADD CONSTRAINT "GuardEarning_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardPayout" ADD CONSTRAINT "GuardPayout_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "GuardProfile"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une seule demande de virement en attente par garde, même en cas de requêtes simultanées
-- (filet de sécurité derrière le verrou pris par l'API). Index partiel : hors du schéma Prisma.
CREATE UNIQUE INDEX "GuardPayout_one_requested_per_guard" ON "GuardPayout"("guardId") WHERE "status" = 'REQUESTED';

-- Pas de montant négatif ; un virement porte toujours sur un montant.
ALTER TABLE "GuardEarning" ADD CONSTRAINT "GuardEarning_amount_check" CHECK ("amountCents" >= 0);
ALTER TABLE "GuardPayout" ADD CONSTRAINT "GuardPayout_amount_check" CHECK ("amountCents" > 0);
