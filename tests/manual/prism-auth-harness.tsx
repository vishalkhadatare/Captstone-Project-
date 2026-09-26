import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OpenAIPrismBrowserModal } from '../../src/components/OpenAIPrismBrowserModal.tsx';
import '../../src/index.css';

/**
 * Manual harness: mounts ONLY the Prism browser modal so the top-level OAuth
 * window flow can be exercised without signing into ZeroLeak.
 *
 * It starts with the modal CLOSED on purpose. That is the state that catches a
 * hook-order regression: hooks placed after the component's `if (!isOpen) return
 * null;` do not run while it is closed, so opening it changes the hook count and
 * React throws "Rendered more hooks than during the previous render". Opening
 * straight into `isOpen` would hide that entirely.
 */
const Harness = () => {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 14px',
          borderRadius: 10,
          border: '1px solid #334155',
          background: '#1e293b',
          color: '#e2e8f0',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Open the browser modal
      </button>
      <OpenAIPrismBrowserModal isOpen={open} onClose={() => setOpen(false)} />
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
