/**
 * Toast — notifikasi singkat non-blokir untuk onboarding.
 *
 * - Varian status: info | success | warning.
 * - Otomatis hilang setelah durasi; bisa ditutup manual.
 * - Aksesibilitas: role="status" + aria-live="polite".
 * - BUKAN pengganti dialog konfirmasi untuk operasi penting.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type ToastKind = 'info' | 'success' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastApi {
  showToast: (message: string, kind?: ToastKind, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const KIND_STYLE: Record<ToastKind, { bg: string; border: string; dot: string }> = {
  info: { bg: 'var(--ez-hue-blue-bg)', border: 'var(--ez-hue-blue-border)', dot: 'var(--ez-color-primary)' },
  success: { bg: 'var(--ez-hue-green-bg)', border: 'var(--ez-hue-green-border)', dot: 'var(--ez-color-success, #16a34a)' },
  warning: { bg: 'var(--ez-hue-amber-bg)', border: 'var(--ez-hue-amber-border)', dot: 'var(--ez-color-warning, #d97706)' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'info', durationMs = 4200) => {
      const id = idRef.current++;
      setItems((prev) => [...prev.slice(-2), { id, message, kind }]); // maks 3 tampil
      const t = setTimeout(() => dismiss(id), Math.max(1500, durationMs));
      timers.current.set(id, t);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9998,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'center',
          pointerEvents: 'none',
          width: 'min(420px, calc(100vw - 32px))',
        }}
      >
        {items.map((it) => {
          const ks = KIND_STYLE[it.kind];
          return (
            <div
              key={it.id}
              role="status"
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                background: ks.bg,
                border: `1px solid ${ks.border}`,
                borderRadius: 12,
                padding: '10px 12px',
                boxShadow: '0 8px 24px rgba(2, 6, 23, 0.16)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--ezrab-text, #111827)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 9999, background: ks.dot, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{it.message}</span>
              <button
                onClick={() => dismiss(it.id)}
                aria-label="Tutup notifikasi"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--ez-color-text-muted)', padding: 4 }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus dipakai di dalam <ToastProvider>');
  return ctx;
}
