import { ApiError } from './errors';

export interface HttpOptions {
  /** URL de base de l'API, avec le préfixe /api (ex. http://192.168.1.20:3000/api). */
  baseUrl: string;
  /** Jeton d'accès courant. */
  getAccessToken: () => string | null;
  /** Rafraîchit la session et renvoie le nouveau jeton d'accès, ou null si la session est perdue. */
  refreshAccessToken: () => Promise<string | null>;
  /** Admin web : le jeton de rafraîchissement voyage dans un cookie httpOnly. */
  web?: boolean;
  fetchImpl?: typeof fetch;
}

export type Query = Record<string, string | number | boolean | string[] | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Pas de rafraîchissement automatique (routes d'authentification). */
  noRefresh?: boolean;
  raw?: boolean;
}

export class Http {
  private refreshing: Promise<string | null> | null = null;

  constructor(private readonly options: HttpOptions) {}

  get baseUrl(): string {
    return this.options.baseUrl.replace(/\/$/, '');
  }

  /** Change le serveur visé (réglage « Serveur » des applis de test). */
  setBaseUrl(url: string): void {
    this.options.baseUrl = url;
  }

  url(path: string, query?: Query): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
    const qs = params.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ''}`;
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    let res = await this.send(method, path, opts, this.options.getAccessToken());
    if (res.status === 401 && !opts.noRefresh) {
      const token = await this.refreshOnce();
      if (token) res = await this.send(method, path, opts, token);
    }
    if (opts.raw) {
      if (!res.ok) throw await this.toError(res);
      return res as unknown as T;
    }
    if (!res.ok) throw await this.toError(res);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Plusieurs requêtes en 401 simultanées ne déclenchent qu'un seul rafraîchissement. */
  private refreshOnce(): Promise<string | null> {
    this.refreshing ??= this.options.refreshAccessToken().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async send(
    method: string,
    path: string,
    opts: RequestOptions,
    token: string | null,
  ): Promise<Response> {
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (this.options.web) headers['X-Client'] = 'web';
    if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    const fetchImpl = this.options.fetchImpl ?? fetch;
    try {
      return await fetchImpl(this.url(path, opts.query), {
        method,
        headers,
        body:
          opts.body === undefined
            ? undefined
            : isForm
              ? (opts.body as FormData)
              : JSON.stringify(opts.body),
        credentials: this.options.web ? 'include' : undefined,
      });
    } catch (error) {
      throw new ApiError(0, 'Impossible de joindre le serveur. Vérifiez votre connexion.', error);
    }
  }

  private async toError(res: Response): Promise<ApiError> {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* corps vide ou non JSON */
    }
    const message = (body as { message?: unknown })?.message;
    const text = Array.isArray(message)
      ? message.join(', ')
      : typeof message === 'string'
        ? message
        : `Erreur ${res.status}`;
    return new ApiError(res.status, text, body);
  }
}
