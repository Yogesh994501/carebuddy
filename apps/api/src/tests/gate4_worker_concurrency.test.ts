import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../db/prisma';
import { claimJobs, completeJob, failJob, reclaimExpiredLeases, enqueueJob } from '../services/jobQueue';

describe('Gate 4: Background Worker Concurrency and Crash Recovery', () => {
  beforeAll(async () => {
    // Clear any test jobs from previous runs
    await prisma.scheduledJob.deleteMany({
      where: { idempotencyKey: { startsWith: 'gate4-test-' } }
    });
  });

  afterAll(async () => {
    await prisma.scheduledJob.deleteMany({
      where: { idempotencyKey: { startsWith: 'gate4-test-' } }
    });
    await prisma.$disconnect();
  });

  it('claims jobs concurrently across multiple worker instances using FOR UPDATE SKIP LOCKED with zero duplicates', async () => {
    const totalJobs = 30;
    const now = new Date(Date.now() - 10000);

    // 1. Enqueue 30 test jobs
    for (let i = 0; i < totalJobs; i++) {
      await enqueueJob({
        type: 'GENERATE_DOSES',
        runAt: now,
        idempotencyKey: `gate4-test-concurrent-${i}-${Date.now()}`,
        payload: { testIndex: i }
      });
    }

    const workerIds = ['worker-instance-1', 'worker-instance-2', 'worker-instance-3'];
    const claimedJobIdsByWorker: Record<string, string[]> = {
      'worker-instance-1': [],
      'worker-instance-2': [],
      'worker-instance-3': []
    };

    // 2. Concurrently claim jobs in parallel bursts across the 3 workers
    const claimPromises = workerIds.map(async (wid) => {
      let claimsCount = 0;
      // Loop up to 10 rounds per worker
      for (let round = 0; round < 10; round++) {
        const batch = await claimJobs(wid, 5);
        if (batch.length === 0) break;
        claimedJobIdsByWorker[wid].push(...batch.map((j) => j.id));
        claimsCount += batch.length;
      }
      return claimsCount;
    });

    await Promise.all(claimPromises);

    // 3. Aggregate all claimed job IDs
    const allClaimedIds = [
      ...claimedJobIdsByWorker['worker-instance-1'],
      ...claimedJobIdsByWorker['worker-instance-2'],
      ...claimedJobIdsByWorker['worker-instance-3']
    ];

    expect(allClaimedIds.length).toBe(totalJobs);

    // 4. Mathematical uniqueness proof: zero duplicate claims
    const uniqueIds = new Set(allClaimedIds);
    expect(uniqueIds.size).toBe(totalJobs);

    // Check intersection between workers is empty
    const w1 = new Set(claimedJobIdsByWorker['worker-instance-1']);
    const w2 = new Set(claimedJobIdsByWorker['worker-instance-2']);
    const w3 = new Set(claimedJobIdsByWorker['worker-instance-3']);

    for (const id of w1) {
      expect(w2.has(id)).toBe(false);
      expect(w3.has(id)).toBe(false);
    }
    for (const id of w2) {
      expect(w3.has(id)).toBe(false);
    }

    // Cleanup claimed jobs
    for (const id of allClaimedIds) {
      await completeJob(id);
    }
  });

  it('recovers from worker crash mid-job: expired lease is reclaimed and processed by another worker', async () => {
    // 1. Create a job locked by a crashed worker with an expired lease
    const crashedJobKey = `gate4-test-crash-${Date.now()}`;
    const job = await prisma.scheduledJob.create({
      data: {
        type: 'DOSE_UPCOMING',
        idempotencyKey: crashedJobKey,
        runAt: new Date(Date.now() - 30000),
        status: 'RUNNING',
        lockedBy: 'crashed-worker-99',
        lockedUntil: new Date(Date.now() - 5000), // Expired 5 seconds ago
        attempts: 1,
        maxAttempts: 5
      }
    });

    // 2. Run recovery sweeper
    const reclaimedCount = await reclaimExpiredLeases();
    expect(reclaimedCount).toBeGreaterThanOrEqual(1);

    // 3. Verify job was re-queued and lock released
    const reclaimedJob = await prisma.scheduledJob.findUnique({
      where: { id: job.id }
    });
    expect(reclaimedJob?.status).toBe('QUEUED');
    expect(reclaimedJob?.lockedBy).toBeNull();
    expect(reclaimedJob?.lockedUntil).toBeNull();
    expect(reclaimedJob?.lastError).toContain('lease expired');

    // 4. Second worker instance claims the recovered job
    const healthyWorkerId = 'healthy-worker-42';
    const claimedBatch = await claimJobs(healthyWorkerId, 1);

    expect(claimedBatch.length).toBe(1);
    expect(claimedBatch[0].id).toBe(job.id);
    expect(claimedBatch[0].status).toBe('RUNNING');
    expect(claimedBatch[0].lockedBy).toBe(healthyWorkerId);
    expect(claimedBatch[0].attempts).toBe(2); // Incremented attempt count

    // 5. Healthy worker successfully completes the job
    await completeJob(job.id);

    const completedJob = await prisma.scheduledJob.findUnique({
      where: { id: job.id }
    });
    expect(completedJob?.status).toBe('SUCCEEDED');
    expect(completedJob?.lockedBy).toBeNull();
  });

  it('moves job to DEAD (dead-letter queue) when maximum attempts are exceeded', async () => {
    const dlqKey = `gate4-test-dlq-${Date.now()}`;
    const job = await prisma.scheduledJob.create({
      data: {
        type: 'DOSE_MISSED_CHECK',
        idempotencyKey: dlqKey,
        runAt: new Date(Date.now() - 1000),
        status: 'RUNNING',
        lockedBy: 'worker-dlq-test',
        attempts: 5,
        maxAttempts: 5
      }
    });

    // Worker reports failure after 5th attempt
    await failJob(job, new Error('Fatal unrecoverable processing error'));

    const deadJob = await prisma.scheduledJob.findUnique({
      where: { id: job.id }
    });

    expect(deadJob?.status).toBe('DEAD');
    expect(deadJob?.lastError).toContain('Max attempts (5) reached');
    expect(deadJob?.lockedBy).toBeNull();

    // Verify DEAD jobs are not claimed by workers
    const claimed = await claimJobs('another-worker', 10);
    expect(claimed.some((j) => j.id === job.id)).toBe(false);
  });
});
