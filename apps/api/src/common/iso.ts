/** Convertit une date facultative en chaîne ISO. */
export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
