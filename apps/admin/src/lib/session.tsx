import type { SessionState } from '@hb/api-client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { client } from './client';

const SessionContext = createContext<SessionState>(client.snapshot);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(client.snapshot);

  useEffect(() => {
    const unsubscribe = client.subscribe(setState);
    void client.restore();
    return () => {
      unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
