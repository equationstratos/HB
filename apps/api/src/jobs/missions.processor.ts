import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MatchingService } from '../matching/matching.service';
import { DeviationsService } from '../tracking/deviations.service';
import { TrackingService } from '../tracking/tracking.service';
import {
  DispatchJob,
  EscalateJob,
  JobName,
  LateCheckJob,
  MISSIONS_QUEUE,
} from './mission-queue.service';

/** Exécution des tâches différées : vagues d'offres, retards, escalades, purge RGPD. */
@Processor(MISSIONS_QUEUE, { concurrency: 5 })
export class MissionsProcessor extends WorkerHost {
  private readonly logger = new Logger(MissionsProcessor.name);

  constructor(
    private readonly matching: MatchingService,
    private readonly deviations: DeviationsService,
    private readonly tracking: TrackingService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JobName.DISPATCH: {
        const { missionId, wave } = job.data as DispatchJob;
        return this.matching.dispatchWave(missionId, wave);
      }
      case JobName.LATE_CHECK: {
        const { missionId, routeVersion } = job.data as LateCheckJob;
        return this.deviations.lateCheck(missionId, routeVersion);
      }
      case JobName.ESCALATE_DEVIATION:
        return this.deviations.escalate((job.data as EscalateJob).deviationId);
      case JobName.SIGNAL_SWEEP:
        return this.deviations.signalSweep();
      case JobName.PURGE_LOCATIONS: {
        const count = await this.tracking.purgeOld();
        this.logger.log(`Purge RGPD : ${count} positions supprimées`);
        return;
      }
      default:
        this.logger.warn(`Tâche inconnue : ${job.name}`);
    }
  }
}
