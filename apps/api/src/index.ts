import app from './app';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
  console.log(`CareBuddy API server listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Shutting down CareBuddy API...');
  server.close(() => {
    console.log('CareBuddy API server terminated.');
  });
});
