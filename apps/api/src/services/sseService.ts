import { Response } from 'express';

export type SSEEventType =
  | 'DOSE_UPDATED'
  | 'APPOINTMENT_UPDATED'
  | 'NOTE_ADDED'
  | 'NOTIFICATION'
  | 'CARE_NETWORK_UPDATED';

export interface SSEEventPayload {
  type: SSEEventType;
  profileId: string;
  entityId: string;
}

interface SSEClient {
  id: string;
  userId: string;
  profileId: string;
  res: Response;
  heartbeatTimer: NodeJS.Timeout;
}

class SSEService {
  private clients: Map<string, SSEClient> = new Map();

  /**
   * Register a new SSE client connection
   */
  public addClient(userId: string, profileId: string, res: Response): string {
    const clientId = `${userId}-${profileId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering
    res.flushHeaders?.();

    // 15-second heartbeat comment
    const heartbeatTimer = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        this.removeClient(clientId);
      }
    }, 15000);

    const client: SSEClient = {
      id: clientId,
      userId,
      profileId,
      res,
      heartbeatTimer
    };

    this.clients.set(clientId, client);

    // Initial connection event (no health data)
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', profileId, clientId })}\n\n`);

    return clientId;
  }

  /**
   * Remove client and clear heartbeat timer
   */
  public removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      clearInterval(client.heartbeatTimer);
      try {
        client.res.end();
      } catch {}
      this.clients.delete(clientId);
    }
  }

  /**
   * Broadcast an event to all connected clients listening on a profile
   * CRITICAL SECURITY INVARIANT (Section 2 & 9):
   * Events carry ONLY { type, profileId, entityId }, NEVER health data!
   */
  public broadcastEvent(event: SSEEventPayload): void {
    const payload = JSON.stringify({
      type: event.type,
      profileId: event.profileId,
      entityId: event.entityId
    });

    const sseMessage = `event: message\ndata: ${payload}\n\n`;

    for (const [clientId, client] of this.clients.entries()) {
      if (client.profileId === event.profileId) {
        try {
          client.res.write(sseMessage);
        } catch {
          this.removeClient(clientId);
        }
      }
    }
  }

  /**
   * Close all active SSE connections for a revoked user on a profile (Section 3)
   */
  public closeConnectionsForUser(userId: string, profileId?: string): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.userId === userId && (!profileId || client.profileId === profileId)) {
        this.removeClient(clientId);
      }
    }
  }

  public getConnectedClientsCount(profileId?: string): number {
    if (!profileId) return this.clients.size;
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.profileId === profileId) count++;
    }
    return count;
  }
}

export const sseService = new SSEService();
