import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MousePointerClick, TriangleAlert } from 'lucide-react';

import {
  sendBrowserCommand,
  sendBrowserInput,
  subscribeBrowserLive,
  type StreamedBrowserFrame,
  type StreamedBrowserStatus,
} from '../../api';
import {
  isAppOwnedKey,
  keyCodeFromDomKey,
  mapPointToFrame,
  modifiersFrom,
  mouseButtonFrom,
  wheelDeltas,
} from '../../utils/browserInput';
import { NEW_TAB_URL } from '../../utils/browserTabs';

/**
 * The picture of a real browser, and the hands that drive it.
 *
 * Why this exists instead of an `<iframe>`: a frame can never host a sign-in.
 * `auth.openai.com` answers `frame-ancestors 'self'`, `chatgpt.com` answers
 * `X-Frame-Options: SAMEORIGIN`, `accounts.google.com` answers `DENY`, and Chrome
 * partitions the third-party cookies a login would need. So the page runs in a
 * real Chromium on the server side (see `electron/browserHost.cjs`) and this
 * component is the window onto it: frames in, input out.
 *
 * It is deliberately NOT a controlled component. Frames arrive about twelve times
 * a second and large; putting them in React state would re-render the whole
 * browser chrome on every one. The frame goes straight into a canvas through a
 * ref, and only the low-frequency status becomes state.
 */

export interface StreamedBrowserSurfaceProps {
  /** The address this tab wants. The streamed browser navigates when it differs. */
  url: string;
  visible: boolean;
  /** Bumped by the tab strip to reload the page. */
  reloadKey: number;
  onUrl?: (url: string) => void;
  onTitle?: (title: string) => void;
  onStatus?: (status: StreamedBrowserStatus | null) => void;
}

export const StreamedBrowserSurface: React.FC<StreamedBrowserSurfaceProps> = ({
  url,
  visible,
  reloadKey,
  onUrl,
  onTitle,
  onStatus,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** The box the picture is displayed in: the size the real browser should be. */
  const boxRef = useRef<HTMLDivElement | null>(null);
  /** The size we last asked for, so a floor - or a stream that cannot comply -
   *  never turns into a command per status report. */
  const askedSizeRef = useRef({ width: 0, height: 0 });
  /** One reused Image: a new `src` cancels the decode in flight, so frames can
   *  never be drawn out of order. */
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<StreamedBrowserStatus | null>(null);
  const [focused, setFocused] = useState(false);

  /** The last address we asked for, so a page's own navigation is not undone. */
  const requestedRef = useRef('');
  const reloadSeenRef = useRef(reloadKey);

  // Callbacks are read through refs: they are rebuilt every render by the host,
  // and putting them in the stream effect's dependencies would tear the
  // connection down and build a new one on every keystroke.
  const onUrlRef = useRef(onUrl);
  onUrlRef.current = onUrl;
  const onTitleRef = useRef(onTitle);
  onTitleRef.current = onTitle;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const drawFrame = useCallback((frame: StreamedBrowserFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let image = imageRef.current;
    if (!image) {
      image = new Image();
      imageRef.current = image;
    }
    image.onload = () => {
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        canvas.width = frame.width;
        canvas.height = frame.height;
      }
      ctx.drawImage(image as HTMLImageElement, 0, 0, canvas.width, canvas.height);
    };
    image.src = `data:image/jpeg;base64,${frame.base64}`;
  }, []);

  // The stream: status and frames, over the transport the rest of the app uses.
  useEffect(() => {
    const unsubscribe = subscribeBrowserLive(event => {
      if (event.type === 'frame') {
        drawFrame(event.frame);
        return;
      }
      setStatus(event.status);
      onStatusRef.current?.(event.status);

      // A page navigates itself - a redirect, an OAuth callback, a clicked link.
      // The address bar has to follow the browser, not the other way round.
      const live = event.status.url;
      if (live && live !== requestedRef.current) {
        requestedRef.current = live;
        onUrlRef.current?.(live);
      }
      if (event.status.title) onTitleRef.current?.(event.status.title);
    });
    return unsubscribe;
  }, [drawFrame]);

  // Navigate the real browser when this tab wants somewhere else.
  useEffect(() => {
    if (!url || url === NEW_TAB_URL) return;
    if (requestedRef.current === url) return;
    requestedRef.current = url;
    void sendBrowserCommand({ type: 'navigate', url }).catch(() => undefined);
  }, [url]);

  /**
   * Put a browser that has just (re)started back on this tab's page.
   *
   * A fresh host opens on `about:blank`, and the effect above cannot help: the
   * tab's URL did not change, so nothing announces it. That left a restarted
   * browser showing a blank page while the panel still said Prism - which is how
   * a crash used to look like the feature breaking rather than restarting.
   */
  const wasReadyRef = useRef(false);
  useEffect(() => {
    const ready = status?.state === 'ready';
    const liveUrl = status?.url ?? '';
    if (ready && !wasReadyRef.current && url && url !== NEW_TAB_URL && liveUrl !== url) {
      requestedRef.current = url;
      void sendBrowserCommand({ type: 'navigate', url }).catch(() => undefined);
    }
    wasReadyRef.current = ready;
  }, [status?.state, status?.url, url]);

  // An explicit reload from the tab strip.
  useEffect(() => {
    if (reloadKey === reloadSeenRef.current) return;
    reloadSeenRef.current = reloadKey;
    void sendBrowserCommand({ type: 'reload' }).catch(() => undefined);
  }, [reloadKey]);

  /**
   * Ask the real browser to BE the size of the box showing it.
   *
   * This is the fix for "it looks so small": the panel used to display whatever
   * size the host happened to have, scaled down to fit, so a 1280-wide page
   * arrived as a thumbnail with text nobody can read. The server has accepted a
   * `resize` command since browser mode was written - and nothing ever sent one.
   * Asking for the box means the page is rendered at the size it is seen at.
   *
   * Device pixels, not CSS pixels, and that is the fix for "it looks blurry".
   * A canvas bitmap of `clientWidth` pixels is stretched to `clientWidth` CSS
   * pixels, which on a display at 125% or 150% scaling is 1.25 or 1.5 times as
   * many screen pixels - so every letter was resampled by the compositor on its
   * way to the screen, on top of the JPEG. Rendering the far end at the size the
   * screen will show it at is what makes text in a picture read as text.
   */
  const requestPanelSize = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    // Capped at 2: a 3x display would otherwise pull a 5000-pixel-wide page over
    // the wire to save a difference nobody can see.
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.round(box.clientWidth * dpr);
    const height = Math.round(box.clientHeight * dpr);
    if (width < 2 || height < 2) return;
    const asked = askedSizeRef.current;
    if (asked.width === width && asked.height === height) return;
    askedSizeRef.current = { width, height };
    void sendBrowserCommand({ type: 'resize', viewport: { width, height } }).catch(() => undefined);
  }, []);

  // On mount, and whenever the panel changes size - a drag, a maximize, a
  // different screen. Debounced on the trailing edge because a drag-resize fires
  // per pixel and each command resizes a real window.
  useEffect(() => {
    requestPanelSize();
    const box = boxRef.current;
    if (!box) return;
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', requestPanelSize);
      return () => window.removeEventListener('resize', requestPanelSize);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(requestPanelSize, 150);
    });
    observer.observe(box);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [requestPanelSize]);

  // The other half: a host that has just started - or restarted - does not know
  // this panel's size, and the box may not have changed to tell it. A hidden tab
  // measures zero, hence `visible` here as well.
  useEffect(() => {
    if (!visible || status?.state !== 'ready') return;
    requestPanelSize();
  }, [visible, status?.state, status?.viewport.width, status?.viewport.height, requestPanelSize]);

  /**
   * Panel pixels to page pixels.
   *
   * The canvas is scaled to fit, so its bounding box is the only honest source of
   * the current scale - asking React for it would give the layout from the last
   * render, not the one on screen.
   */
  const pointFrom = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return mapPointToFrame({ x: clientX, y: clientY }, rect, {
      width: canvas.width,
      height: canvas.height,
    });
  }, []);

  const sendMouse = useCallback(
    (action: 'move' | 'down' | 'up', event: React.MouseEvent<HTMLCanvasElement>) => {
      const point = pointFrom(event.clientX, event.clientY);
      if (!point) return;
      const button = mouseButtonFrom(event.button) ?? 'left';
      sendBrowserInput({
        kind: 'mouse',
        action,
        x: point.x,
        y: point.y,
        button,
        // `detail` is the click count, which is how a double-click becomes one.
        clickCount: Math.min(3, Math.max(1, event.detail || 1)),
        modifiers: modifiersFrom(event),
      });
    },
    [pointFrom],
  );

  // Registered natively and non-passively, because React's onWheel cannot
  // preventDefault and the page behind the panel would scroll instead.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = pointFrom(event.clientX, event.clientY);
      if (!point) return;
      sendBrowserInput({
        kind: 'wheel',
        x: point.x,
        y: point.y,
        ...wheelDeltas(event),
        modifiers: modifiersFrom(event),
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [pointFrom]);

  const sendKey = useCallback((action: 'down' | 'up', event: React.KeyboardEvent<HTMLCanvasElement>) => {
    // The panel's own shortcuts (Ctrl+T, Ctrl+W, Ctrl+L, Ctrl+R, F5) belong to the
    // tab strip: the user is talking to us, not to the page.
    if (isAppOwnedKey(event)) return;
    const keyCode = keyCodeFromDomKey(event.key);
    if (!keyCode) return; // a key we cannot name is never guessed at
    event.preventDefault();
    sendBrowserInput({ kind: 'key', action, keyCode, modifiers: modifiersFrom(event) });
  }, []);

  // Take focus when this tab becomes the visible one, so typing works without a
  // click - the same thing a real tab does.
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (canvas && status?.state === 'ready') canvas.focus();
  }, [visible, status?.state]);

  const ready = status?.state === 'ready';

  return (
    <div ref={boxRef} className="absolute inset-0 flex items-center justify-center bg-slate-950 overflow-hidden">
      <canvas
        ref={canvasRef}
        width={status?.viewport.width ?? 1280}
        height={status?.viewport.height ?? 800}
        tabIndex={0}
        onMouseDown={event => sendMouse('down', event)}
        onMouseUp={event => sendMouse('up', event)}
        onMouseMove={event => sendMouse('move', event)}
        onMouseEnter={event => sendMouse('move', event)}
        onContextMenu={event => {
          // A right-click is a real input for the page, not a menu for us.
          event.preventDefault();
          sendMouse('down', event);
          sendMouse('up', event);
        }}
        onKeyDown={event => sendKey('down', event)}
        onKeyUp={event => sendKey('up', event)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ maxWidth: '100%', maxHeight: '100%', visibility: visible ? 'visible' : 'hidden' }}
        className={`bg-white outline-none ${ready ? 'cursor-auto' : 'cursor-wait'}`}
      />

      {/* The stream's own progress, so a slow first frame is not mistaken for a
          blank page. */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-2 rounded-xl border border-slate-700 bg-slate-900/95 px-5 py-4">
            {status?.state === 'error' ? (
              <TriangleAlert className="w-5 h-5 text-rose-400 mx-auto" />
            ) : (
              <Loader2 className="w-5 h-5 text-emerald-400 mx-auto animate-spin" />
            )}
            <p className="text-sm font-semibold text-slate-100">
              {status?.state === 'error' ? 'The streamed browser stopped' : 'Starting a real browser...'}
            </p>
            <p className="text-[11px] text-slate-400">{status?.reason ?? 'Waiting for the server to describe the browser.'}</p>
            {status?.error && <p className="text-[11px] text-rose-300">{status.error}</p>}
          </div>
        </div>
      )}

      {/* A canvas cannot show a caret, so the only honest hint is a prompt. */}
      {ready && !focused && visible && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
          <span className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/95 px-3 py-1 text-[11px] text-slate-300">
            <MousePointerClick className="w-3.5 h-3.5 text-emerald-400" />
            Click the page to type into it. This is a real browser, so sign-in works here.
          </span>
        </div>
      )}
    </div>
  );
};

StreamedBrowserSurface.displayName = 'StreamedBrowserSurface';
