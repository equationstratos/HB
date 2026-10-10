/** Erreur renvoyée par l'API, avec le message en français prêt à afficher. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Détail par champ pour les erreurs de validation (400). */
  get fieldErrors(): { path: string; message: string }[] {
    const errors = (this.body as { errors?: unknown })?.errors;
    return Array.isArray(errors) ? (errors as { path: string; message: string }[]) : [];
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const first = error.fieldErrors[0];
    return first ? `${error.message} : ${first.message}` : error.message;
  }
  return error instanceof Error ? error.message : 'Une erreur est survenue';
}
