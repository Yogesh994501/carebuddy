import { WorkerService } from './services/workerService';

const worker = new WorkerService();

async function main() {
  await worker.start();

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}. Shutting down worker...`);
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal worker process error:', err);
  process.exit(1);
});
