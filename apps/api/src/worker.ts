import { env } from './config/env';

console.log('Starting CareBuddy background worker process...');
console.log(`Poll interval: ${env.WORKER_POLL_INTERVAL_MS}ms, Heartbeat interval: ${env.WORKER_HEARTBEAT_INTERVAL_MS}ms`);

// Worker loops and job handlers will be implemented in Stage 4
console.log('Worker foundation initialized.');
