import { JobType, JobStatus, ScheduledJob } from '@prisma/client';
import { prisma } from '../db/prisma';

export interface EnqueueJobOptions {
  profileId?: string;
  type: JobType;
  runAt: Date;
  idempotencyKey: string;
  payload?: any;
  maxAttempts?: number;
}

/**
 * Enqueue a background job with strict idempotency
 */
export async function enqueueJob(options: EnqueueJobOptions): Promise<ScheduledJob> {
  const { profileId, type, runAt, idempotencyKey, payload, maxAttempts = 5 } = options;

  return prisma.scheduledJob.upsert({
    where: { idempotencyKey },
    update: {
      // If already queued and scheduled runAt changed, update runAt and payload
      runAt,
      payload: payload ?? undefined
    },
    create: {
      profileId,
      type,
      runAt,
      idempotencyKey,
      payload: payload ?? undefined,
      maxAttempts,
      status: 'QUEUED'
    }
  });
}

/**
 * Atomically claim QUEUED jobs using raw PostgreSQL FOR UPDATE SKIP LOCKED
 * Prevents multiple worker instances from double-processing the same jobs.
 */
export async function claimJobs(workerId: string, batchSize: number = 5): Promise<ScheduledJob[]> {
  try {
    const jobs = await prisma.$queryRaw<ScheduledJob[]>`
      UPDATE "ScheduledJob"
      SET 
        status = 'RUNNING'::"JobStatus",
        "lockedBy" = ${workerId},
        "lockedUntil" = NOW() + INTERVAL '60 seconds',
        "attempts" = "attempts" + 1,
        "updatedAt" = NOW()
      WHERE id IN (
        SELECT id
        FROM "ScheduledJob"
        WHERE status = 'QUEUED'::"JobStatus"
          AND "runAt" <= NOW()
        ORDER BY "runAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    `;

    return jobs;
  } catch (err: any) {
    console.error('Error claiming jobs with SKIP LOCKED:', err.message);
    return [];
  }
}

/**
 * Complete a successfully processed job
 */
export async function completeJob(jobId: string): Promise<void> {
  await prisma.scheduledJob.update({
    where: { id: jobId },
    data: {
      status: 'SUCCEEDED',
      lockedBy: null,
      lockedUntil: null
    }
  });
}

/**
 * Expire a job that is stale and no longer applicable (without late-firing)
 */
export async function expireJob(jobId: string, reason: string): Promise<void> {
  await prisma.scheduledJob.update({
    where: { id: jobId },
    data: {
      status: 'EXPIRED',
      lastError: reason,
      lockedBy: null,
      lockedUntil: null
    }
  });
}

/**
 * Fail a job: re-queue with exponential backoff or move to DEAD if max attempts exceeded
 */
export async function failJob(job: ScheduledJob, error: Error | string): Promise<void> {
  const rawMessage = typeof error === 'string' ? error : error.message;
  // Sanitize non-ASCII characters to avoid PostgreSQL WIN1252 encoding crashes
  const errorMessage = rawMessage.replace(/[^\x00-\x7F]/g, '->');

  if (job.attempts >= job.maxAttempts) {
    // Dead letter queue
    await prisma.scheduledJob.update({
      where: { id: job.id },
      data: {
        status: 'DEAD',
        lastError: `Max attempts (${job.maxAttempts}) reached. Last error: ${errorMessage}`,
        lockedBy: null,
        lockedUntil: null
      }
    });
  } else {
    // Exponential backoff: 5s, 10s, 20s, 40s...
    const backoffSeconds = Math.min(3600, Math.pow(2, job.attempts) * 5);
    const nextRunAt = new Date(Date.now() + backoffSeconds * 1000);

    await prisma.scheduledJob.update({
      where: { id: job.id },
      data: {
        status: 'QUEUED',
        runAt: nextRunAt,
        lastError: errorMessage,
        lockedBy: null,
        lockedUntil: null
      }
    });
  }
}

/**
 * Extend lease on a running job (heartbeat during long-running tasks)
 */
export async function extendLease(jobId: string, workerId: string, seconds: number = 60): Promise<boolean> {
  const result = await prisma.$executeRaw`
    UPDATE "ScheduledJob"
    SET "lockedUntil" = NOW() + (${seconds} || ' seconds')::INTERVAL,
        "updatedAt" = NOW()
    WHERE id = ${jobId} AND "lockedBy" = ${workerId} AND status = 'RUNNING'::"JobStatus";
  `;
  return result > 0;
}

/**
 * Reclaim abandoned jobs from crashed workers where lockedUntil has passed
 */
export async function reclaimExpiredLeases(): Promise<number> {
  // 1. Move expired jobs that have reached max attempts to DEAD
  await prisma.$executeRaw`
    UPDATE "ScheduledJob"
    SET status = 'DEAD'::"JobStatus",
        "lastError" = 'Worker lease expired after maximum attempts.',
        "lockedBy" = NULL,
        "lockedUntil" = NULL,
        "updatedAt" = NOW()
    WHERE status = 'RUNNING'::"JobStatus"
      AND "lockedUntil" < NOW()
      AND "attempts" >= "maxAttempts";
  `;

  // 2. Re-queue remaining expired jobs
  const requeuedCount = await prisma.$executeRaw`
    UPDATE "ScheduledJob"
    SET status = 'QUEUED'::"JobStatus",
        "lastError" = 'Worker lease expired. Automatically re-queued for execution.',
        "lockedBy" = NULL,
        "lockedUntil" = NULL,
        "updatedAt" = NOW()
    WHERE status = 'RUNNING'::"JobStatus"
      AND "lockedUntil" < NOW()
      AND "attempts" < "maxAttempts";
  `;

  return requeuedCount;
}
