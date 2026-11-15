import os from 'os';
import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { claimJobs, reclaimExpiredLeases, extendLease } from './jobQueue';
import { executeJob, scheduleJobsForUpcomingDoses } from './jobHandlers';
import { generateDosesForProfile } from './doseGenerator';
import { env } from '../config/env';

export class WorkerService {
  public readonly workerId: string;
  private isRunning: boolean = false;
  private pollTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconcilerInterval: NodeJS.Timeout | null = null;
  private currentJobIds: Set<string> = new Set();

  constructor(workerId?: string) {
    this.workerId = workerId || `worker-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  }

  /**
   * Start the background worker process
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[Worker ${this.workerId}] Starting CareBuddy background worker...`);

    // 1. Initial Heartbeat registration
    await this.beatHeart();

    // 2. Start periodic Heartbeat (every 10s by default)
    const hbInterval = env.WORKER_HEARTBEAT_INTERVAL_MS || 10000;
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.beatHeart();
      } catch (err: any) {
        console.error(`[Worker ${this.workerId}] Heartbeat failed:`, err.message);
      }
    }, hbInterval);

    // 3. Startup Catch-up & Reconciler
    await this.runReconciliation();

    // 4. Start periodic reconciler (every 60s)
    this.reconcilerInterval = setInterval(async () => {
      try {
        await this.runReconciliation();
      } catch (err: any) {
        console.error(`[Worker ${this.workerId}] Reconciler failed:`, err.message);
      }
    }, 60000);

    // 5. Start Job Poll Loop
    this.scheduleNextPoll(100);
  }

  /**
   * Write heartbeat row to database
   */
  public async beatHeart(): Promise<void> {
    await prisma.workerHeartbeat.upsert({
      where: { workerId: this.workerId },
      update: {
        lastHeartbeat: new Date(),
        status: 'HEALTHY'
      },
      create: {
        workerId: this.workerId,
        status: 'HEALTHY',
        lastHeartbeat: new Date(),
        startedAt: new Date()
      }
    });
  }

  /**
   * Reconciler:
   * 1. Reclaims expired leases from crashed workers
   * 2. Checks active profiles to ensure 48h horizon doses and jobs exist
   */
  public async runReconciliation(): Promise<void> {
    // 1. Reclaim crashed worker jobs
    const reclaimed = await reclaimExpiredLeases();
    if (reclaimed > 0) {
      console.log(`[Worker ${this.workerId}] Reclaimed ${reclaimed} expired job lease(s).`);
    }

    // 2. Reconcile doses for active profiles
    const profiles = await prisma.elderlyProfile.findMany({
      select: { id: true }
    });

    for (const p of profiles) {
      await generateDosesForProfile({ profileId: p.id, horizonHours: 48 });
      await scheduleJobsForUpcomingDoses(p.id);
    }
  }

  /**
   * Single poll cycle: claims batch using FOR UPDATE SKIP LOCKED and processes them
   */
  public async pollCycle(): Promise<number> {
    const batchSize = 5;
    const jobs = await claimJobs(this.workerId, batchSize);

    if (jobs.length === 0) {
      return 0;
    }

    // Process claimed jobs concurrently
    await Promise.all(
      jobs.map(async (job) => {
        this.currentJobIds.add(job.id);

        // Heartbeat extension timer for long jobs
        const extendTimer = setInterval(() => {
          extendLease(job.id, this.workerId, 60).catch(() => {});
        }, 20000);

        try {
          await executeJob(job);
        } finally {
          clearInterval(extendTimer);
          this.currentJobIds.delete(job.id);
        }
      })
    );

    return jobs.length;
  }

  /**
   * Schedule the next poll iteration
   */
  private scheduleNextPoll(delayMs?: number) {
    if (!this.isRunning) return;

    const delay = delayMs !== undefined ? delayMs : env.WORKER_POLL_INTERVAL_MS || 2000;

    this.pollTimeout = setTimeout(async () => {
      try {
        const processedCount = await this.pollCycle();
        // If we processed a full batch, poll immediately for remaining jobs
        const nextDelay = processedCount >= 5 ? 50 : undefined;
        this.scheduleNextPoll(nextDelay);
      } catch (err: any) {
        console.error(`[Worker ${this.workerId}] Poll cycle error:`, err.message);
        this.scheduleNextPoll();
      }
    }, delay);
  }

  /**
   * Stop the worker gracefully
   */
  public async stop(): Promise<void> {
    console.log(`[Worker ${this.workerId}] Shutting down gracefully...`);
    this.isRunning = false;

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconcilerInterval) {
      clearInterval(this.reconcilerInterval);
      this.reconcilerInterval = null;
    }

    // Update status in database
    try {
      await prisma.workerHeartbeat.update({
        where: { workerId: this.workerId },
        data: { status: 'STOPPED' }
      });
    } catch {
      // Ignore if database disconnected
    }

    console.log(`[Worker ${this.workerId}] Worker stopped.`);
  }
}
