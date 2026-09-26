import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getBrowserHostStatus,
  sendBrowserCommand,
  startBrowserHost,
  stopBrowserHost,
  type StreamedBrowserCommand,
  type StreamedBrowserStatus,
} from '../../api';

/**
 * The streamed browser's host, as the panel sees it.
 *
 * Polled rather than streamed on purpose: this is a handful of fields that change
 * when a *process* starts or stops, and the frames - the high-frequency part -
 * already have their own stream. A second live connection to carry a boolean
 * would be the expensive way to learn something that changes twice a session.
 *
 * Nothing here guesses. The server decides whether a host can run at all (a
 * checkout without `npm install` has no Electron, and says so in words), and a
 * 401 from the control endpoints is reported as "sign in", not as a failure.
 */
export interface StreamedBrowserHandle {
  status: StreamedBrowserStatus | null;
  /** A real browser is connected and drawing. */
  ready: boolean;
  /** The host process is alive (it may still be warming up). */
  running: boolean;
  starting: boolean;
  /** Why it is not ready, in plain language. */
  reason: string;
  /** A control failure the user can act on, e.g. needing to sign in. */
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  command: (command: StreamedBrowserCommand) => void;
  refresh: () => Promise<void>;
}

export const STREAM_POLL_MS = 4000;

export const useStreamedBrowser = (enabled: boolean): StreamedBrowserHandle => {
  const [status, setStatus] = useState<StreamedBrowserStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await getBrowserHostStatus();
      if (!aliveRef.current) return;
      setStatus(result.status);
      setRunning(result.running);
    } catch {
      // A poll that fails proves nothing about the host, so the last known state
      // is kept rather than flashing "not running" on one dropped request.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, STREAM_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh]);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await startBrowserHost();
      if (!aliveRef.current) return;
      setStatus(result.status);
      if (!result.ok) setError(result.reason);
    } catch (err: any) {
      const message = String(err?.message ?? '');
      if (!aliveRef.current) return;
      // 401/403 is an instruction, not a fault: the control endpoints drive a
      // browser that may be signed in, so they require a session.
      setError(
        /401|403|authenticat|session/i.test(message)
          ? 'Sign in to ZeroLeak first: the streamed browser drives a real, signed-in session.'
          : message || 'The streamed browser could not be started.',
      );
    } finally {
      if (aliveRef.current) setStarting(false);
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await stopBrowserHost();
      await refresh();
    } catch {
      /* the next poll will report the truth */
    }
  }, [refresh]);

  const command = useCallback((next: StreamedBrowserCommand) => {
    void sendBrowserCommand(next).catch(() => undefined);
  }, []);

  return {
    status,
    ready: status?.state === 'ready',
    running,
    starting,
    reason: status?.reason ?? (running ? 'Starting...' : 'No streamed browser is running.'),
    error,
    start,
    stop,
    command,
    refresh,
  };
};
