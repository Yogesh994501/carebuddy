import app from './app';
import { env } from './config/env';
import { WorkerService } from './services/workerService';

let worker: WorkerService | null = null;

// Start embedded background worker if enabled (handles dose scheduling, reminders, reconciler)
if (env.RUN_EMBEDDED_WORKER) {
  worker = new WorkerService();
  worker.start().catch((err) => {
    console.error('Failed to start embedded background worker:', err);
  });
}

const server = app.listen(env.PORT, () => {
  console.log(`CareBuddy server listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  if (worker) {
    console.log(`Embedded background worker running with ID: ${worker.workerId}`);
  }
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received. Shutting down CareBuddy...`);
  if (worker) {
    try {
      await worker.stop();
    } catch (err: any) {
      console.error('Error stopping embedded worker:', err.message);
    }
  }
  server.close(() => {
    console.log('CareBuddy server terminated.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
