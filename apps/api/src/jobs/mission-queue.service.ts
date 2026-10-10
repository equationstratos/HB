import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

export const MISSIONS_QUEUE = 'missions';

export const JobName = {
  DISPATCH: 'dispatch',
  LATE_CHECK: 'late-check',
  ESCALATE_DEVIATION: 'escalate-deviation',
  SIGNAL_SWEEP: 'signal-sweep',
  PURGE_LOCATIONS: 'purge-locations',
} as const;

export interface DispatchJob {
  missionId: string;
  wave: number;
}
export interface LateCheckJob {
  missionId: string;
  routeVersion: number;
}
export interface EscalateJob {
  deviationId: string;
}

const dispatchId = (missionId: string, wave: number) => `dispatch_${missionId}_${wave}`;

/** Planification des tâches différées (BullMQ sur Redis). */
@Injectable()
export class MissionQueue implements OnModuleInit {
  constructor(@InjectQueue(MISSIONS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await this.queue.upsertJobScheduler(
      'signal-sweep',
      { every: 30_000 },
      { name: JobName.SIGNAL_SWEEP },
    );
    await this.queue.upsertJobScheduler(
      'purge-locations',
      { pattern: '17 3 * * *', tz: 'Europe/Paris' },
      { name: JobName.PURGE_LOCATIONS },
    );
  }

  async scheduleDispatch(missionId: string, wave: number, delayMs = 0): Promise<void> {
    await this.queue.add(JobName.DISPATCH, { missionId, wave } satisfies DispatchJob, {
      jobId: dispatchId(missionId, wave),
      delay: Math.max(0, delayMs),
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  /** Lance tout de suite une vague déjà planifiée (tous les gardes ont refusé). */
  async promoteDispatch(missionId: string, wave: number): Promise<void> {
    const job = await this.queue.getJob(dispatchId(missionId, wave));
    if (job && (await job.isDelayed())) await job.promote();
    else if (!job) await this.scheduleDispatch(missionId, wave);
  }

  async scheduleLateCheck(missionId: string, routeVersion: number, at: Date): Promise<void> {
    await this.queue.add(JobName.LATE_CHECK, { missionId, routeVersion } satisfies LateCheckJob, {
      jobId: `late_${missionId}_${routeVersion}`,
      delay: Math.max(0, at.getTime() - Date.now()),
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  async scheduleEscalation(deviationId: string, delayMs: number): Promise<void> {
    await this.queue.add(JobName.ESCALATE_DEVIATION, { deviationId } satisfies EscalateJob, {
      jobId: `escalate_${deviationId}`,
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }
}
