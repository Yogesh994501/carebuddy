import { Router, Request, Response } from 'express';
import { WorkerService } from '../services/workerService';

const router = Router();
const workerService = new WorkerService('vercel-cron-worker');

// GET /api/cron/worker - Triggered periodically by Vercel Cron
router.get('/worker', async (req: Request, res: Response) => {
  try {
    // Optional Vercel CRON_SECRET verification
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'UNAUTHORIZED_CRON' });
    }

    console.log('[Vercel Cron] Running background scheduler poll...');

    // 1. Beat worker heartbeat
    await workerService.beatHeart();

    // 2. Run reconciliation (reclaims leases, generates rolling 48h horizon doses)
    await workerService.runReconciliation();

    // 3. Process batches of queued jobs
    let totalProcessed = 0;
    for (let batch = 0; batch < 5; batch++) {
      const processed = await workerService.pollCycle();
      totalProcessed += processed;
      if (processed === 0) break;
    }

    return res.json({
      status: 'ok',
      message: 'Background scheduler cycle completed',
      jobsProcessed: totalProcessed,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('[Vercel Cron] Error during scheduler execution:', err);
    return res.status(500).json({
      error: 'CRON_EXECUTION_FAILED',
      message: err.message
    });
  }
});

export default router;
