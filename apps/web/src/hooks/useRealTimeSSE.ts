import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface SSEEvent {
  type: 'DOSE_UPDATED' | 'APPOINTMENT_UPDATED' | 'NOTE_ADDED' | 'NOTIFICATION' | 'CARE_NETWORK_UPDATED';
  profileId: string;
  entityId: string;
}

export function useRealTimeSSE(profileId?: string) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  const invalidateProfileQueries = useCallback(
    (type?: string) => {
      if (!profileId) return;

      // Invalidate relevant query keys based on event type
      if (!type || type === 'DOSE_UPDATED') {
        queryClient.invalidateQueries({ queryKey: ['doses', profileId] });
        queryClient.invalidateQueries({ queryKey: ['adherence', profileId] });
        queryClient.invalidateQueries({ queryKey: ['activity', profileId] });
      }
      if (!type || type === 'APPOINTMENT_UPDATED') {
        queryClient.invalidateQueries({ queryKey: ['appointments', profileId] });
        queryClient.invalidateQueries({ queryKey: ['activity', profileId] });
      }
      if (!type || type === 'NOTE_ADDED') {
        queryClient.invalidateQueries({ queryKey: ['notes', profileId] });
        queryClient.invalidateQueries({ queryKey: ['activity', profileId] });
      }
      if (!type || type === 'NOTIFICATION') {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
      if (!type || type === 'CARE_NETWORK_UPDATED') {
        queryClient.invalidateQueries({ queryKey: ['careNetwork', profileId] });
        queryClient.invalidateQueries({ queryKey: ['profile', profileId] });
        queryClient.invalidateQueries({ queryKey: ['activity', profileId] });
      }
    },
    [profileId, queryClient]
  );

  const connect = useCallback(() => {
    if (!profileId || typeof window === 'undefined') return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const sseUrl = `/api/profiles/${profileId}/events`;
    const es = new EventSource(sseUrl, { withCredentials: true });
    eventSourceRef.current = es;

    es.addEventListener('connected', () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      // Refetch on reconnect (Section 2 & 6)
      invalidateProfileQueries();
    });

    es.addEventListener('message', (event) => {
      try {
        const payload: SSEEvent = JSON.parse(event.data);
        setLastEvent(payload);

        // Invalidate queries so client fetches fresh authorized data via REST API
        // Events carry ONLY { type, profileId, entityId }, never health data
        invalidateProfileQueries(payload.type);
      } catch (err) {
        console.error('Failed to parse SSE payload:', err);
      }
    });

    es.onerror = () => {
      setIsConnected(false);
      es.close();

      // Exponential backoff reconnect: 1s, 2s, 4s, 8s, max 15s
      const delay = Math.min(15000, 1000 * Math.pow(2, reconnectAttemptsRef.current));
      reconnectAttemptsRef.current += 1;

      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [profileId, invalidateProfileQueries]);

  useEffect(() => {
    connect();

    // 30s polling fallback if disconnected (Section 2)
    const fallbackPollInterval = setInterval(() => {
      if (!isConnected) {
        invalidateProfileQueries();
      }
    }, 30000);

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      clearInterval(fallbackPollInterval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
    };
  }, [connect, isConnected, invalidateProfileQueries]);

  return { isConnected, lastEvent, refetchAll: invalidateProfileQueries };
}
