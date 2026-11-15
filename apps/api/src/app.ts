import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { sessionMiddleware } from './middleware/auth';
import { csrfProtection } from './middleware/csrf';
import { sendError } from './utils/errors';

import authRoutes from './routes/auth';
import profileRoutes from './routes/profiles';
import careNetworkRoutes from './routes/careNetwork';
import invitationRoutes from './routes/invitations';
import medicationRoutes from './routes/medications';
import doseRoutes from './routes/doses';
import notificationRoutes from './routes/notifications';
import appointmentRoutes from './routes/appointments';
import noteRoutes from './routes/notes';
import activityRoutes from './routes/activity';
import eventRoutes from './routes/events';
import assistantRoutes from './routes/assistant';
import settingsRoutes from './routes/settings';
import demoRoutes from './routes/demo';
import cronRoutes from './routes/cron';

const app = express();

// Security headers with strict CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: env.WEB_ORIGIN !== '*' ? ["'self'", env.WEB_ORIGIN] : ["'self'", '*'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// Enable CORS
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    if (env.WEB_ORIGIN === '*' || origin === env.WEB_ORIGIN) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CareBuddy-Request, X-Requested-With');
    }
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

// Session resolution middleware (runs on all requests)
app.use(sessionMiddleware);

// CSRF defence
app.use(csrfProtection);

// Health check endpoints (public)
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'carebuddy-api',
    mode: env.NODE_ENV
  });
});

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const thirtySecondsAgo = new Date(Date.now() - 30_000);
    const latestHeartbeat = await prisma.workerHeartbeat.findFirst({
      where: {
        lastHeartbeat: { gte: thirtySecondsAgo },
        status: 'HEALTHY'
      },
      orderBy: { lastHeartbeat: 'desc' }
    });

    res.json({
      api: 'healthy',
      database: 'connected',
      worker: latestHeartbeat ? 'healthy' : 'offline',
      lastWorkerHeartbeat: latestHeartbeat?.lastHeartbeat || null,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(503).json({
      api: 'degraded',
      database: 'error',
      worker: 'unknown',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Mount modular API routes
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/profiles/:profileId', careNetworkRoutes);
app.use('/api/profiles/:profileId/medications', medicationRoutes);
app.use('/api/profiles/:profileId/doses', doseRoutes);
app.use('/api/profiles/:profileId/adherence', doseRoutes);
app.use('/api/profiles/:profileId/appointments', appointmentRoutes);
app.use('/api/profiles/:profileId/notes', noteRoutes);
app.use('/api/profiles/:profileId/activity', activityRoutes);
app.use('/api/profiles/:profileId/events', eventRoutes);
app.use('/api/profiles/:profileId/assistant', assistantRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/cron', cronRoutes);

// Catch-all 404 for unknown API routes
app.use('/api/*', (req: Request, res: Response) => {
  return sendError(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found.`);
});

// Serve frontend static build if present (e.g. single-service deployment)
const webDistPath = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// Global error handler (never leaks stack traces in responses - Section 11)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled API error:', err);
  }
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = statusCode === 500 && env.NODE_ENV === 'production'
    ? 'An unexpected internal error occurred.'
    : err.message || 'An unexpected error occurred.';

  return sendError(res, statusCode, code, message);
});

export default app;
