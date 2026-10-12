import { TriangleAlert, CircleCheck, Info, Siren, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => undefined);

const ICONS = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: Siren };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-4), { ...t, id }]);
    // Les alertes critiques restent affichées plus longtemps.
    setTimeout(
      () => setToasts((list) => list.filter((x) => x.id !== id)),
      t.tone === 'danger' ? 20_000 : 6_000,
    );
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div key={t.id} className={`toast ${t.tone}`}>
              <Icon size={18} />
              <div className="stack tight" style={{ flex: 1 }}>
                <strong>{t.title}</strong>
                {t.body && <span className="muted small">{t.body}</span>}
              </div>
              <button
                className="icon-btn"
                aria-label="Fermer"
                onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
