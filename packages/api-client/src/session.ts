import type { AuthTokens, LoginResponse, UserDto } from '@hb/shared';
import { createEndpoints, type ApiEndpoints } from './api';
import { ApiError } from './errors';
import { Http } from './http';

/** Stockage persistant du jeton de rafraîchissement (SecureStore sur mobile). */
export interface RefreshTokenStorage {
  get(): Promise<string | null>;
  set(token: string | null): Promise<void>;
}

/** Admin web : rien à stocker, le jeton vit dans un cookie httpOnly. */
export const cookieStorage: RefreshTokenStorage = {
  get: async () => null,
  set: async () => undefined,
};

export interface SessionState {
  user: UserDto | null;
  accessToken: string | null;
  /** Vrai tant que la restauration de session au démarrage n'est pas terminée. */
  restoring: boolean;
}

export interface ClientOptions {
  baseUrl: string;
  storage: RefreshTokenStorage;
  web?: boolean;
  fetchImpl?: typeof fetch;
}

type Listener = (state: SessionState) => void;

/**
 * Session côté application : jeton d'accès en mémoire, jeton de rafraîchissement en stockage
 * sécurisé, rafraîchissement automatique et transparent.
 */
export class ApiClient {
  readonly api: ApiEndpoints;
  private readonly http: Http;
  private state: SessionState = { user: null, accessToken: null, restoring: true };
  private readonly listeners = new Set<Listener>();

  constructor(private readonly options: ClientOptions) {
    this.http = new Http({
      baseUrl: options.baseUrl,
      web: options.web,
      fetchImpl: options.fetchImpl,
      getAccessToken: () => this.state.accessToken,
      refreshAccessToken: () => this.refresh(),
    });
    this.api = createEndpoints(this.http);
  }

  get baseUrl(): string {
    return this.http.baseUrl;
  }

  /** Origine du serveur (sans /api), pour Socket.IO. */
  get origin(): string {
    return this.http.baseUrl.replace(/\/api$/, '');
  }

  get snapshot(): SessionState {
    return this.state;
  }

  get accessToken(): string | null {
    return this.state.accessToken;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Au démarrage : reprend la session si un jeton de rafraîchissement est disponible.
   * Idempotent : plusieurs appels (mode strict de React) ne font qu'une restauration.
   */
  restore(): Promise<UserDto | null> {
    this.restoring ??= this.doRestore();
    return this.restoring;
  }

  private async doRestore(): Promise<UserDto | null> {
    try {
      const stored = await this.options.storage.get();
      if (!stored && !this.options.web) return null;
      await this.refresh();
      return this.state.user;
    } finally {
      this.setState({ restoring: false });
    }
  }

  /** Applique le résultat d'une connexion réussie. Renvoie la réponse telle quelle sinon. */
  async handleLogin(res: LoginResponse): Promise<LoginResponse> {
    if (res.status === 'OK') await this.applyTokens(res.user, res.tokens);
    return res;
  }

  async logout(): Promise<void> {
    const stored = await this.options.storage.get();
    try {
      await this.api.auth.logout(stored ?? undefined);
    } catch {
      /* déconnexion locale même si le serveur est injoignable */
    }
    await this.clear();
  }

  setUser(user: UserDto): void {
    this.setState({ user });
  }

  private refreshing: Promise<string | null> | null = null;
  private restoring: Promise<UserDto | null> | null = null;

  /** Un seul rafraîchissement à la fois, quel que soit le nombre d'appelants. */
  private refresh(): Promise<string | null> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<string | null> {
    const stored = await this.options.storage.get();
    if (!stored && !this.options.web) {
      await this.clear();
      return null;
    }
    try {
      const res = await this.api.auth.refresh(stored ?? undefined);
      await this.applyTokens(res.user, res.tokens);
      return res.tokens.accessToken;
    } catch (error) {
      // Erreur réseau : on garde la session pour réessayer plus tard.
      if (error instanceof ApiError && error.isNetwork) return null;
      await this.clear();
      return null;
    }
  }

  private async applyTokens(user: UserDto, tokens: AuthTokens): Promise<void> {
    if (tokens.refreshToken) await this.options.storage.set(tokens.refreshToken);
    this.setState({ user, accessToken: tokens.accessToken });
  }

  private async clear(): Promise<void> {
    await this.options.storage.set(null);
    this.setState({ user: null, accessToken: null });
  }

  private setState(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }
}
