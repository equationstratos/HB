import { ApiClient, type SessionState } from '@hb/api-client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiUrl } from './config';
import { secureTokenStorage } from './storage';

let instance: ApiClient | null = null;

/** Client unique de l'application (aussi utilisé par la tâche GPS en arrière-plan). */
export function getClient(): ApiClient {
  instance ??= new ApiClient({ baseUrl: apiUrl(), storage: secureTokenStorage });
  return instance;
}

const SessionContext = createContext<SessionState>({
  user: null,
  accessToken: null,
  restoring: true,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = getClient();
  const [state, setState] = useState<SessionState>(client.snapshot);

  useEffect(() => {
    const unsubscribe = client.subscribe(setState);
    // L'adresse du serveur choisie dans l'appli doit être appliquée avant de reprendre la session.
    void import('./server')
      .then(({ applyStoredServerUrl }) => applyStoredServerUrl())
      .finally(() => void client.restore());
    return () => {
      unsubscribe();
    };
  }, [client]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
export const useApi = () => getClient().api;
