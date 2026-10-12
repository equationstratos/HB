import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

/** Valide et transforme une entrée avec un schéma zod partagé (@hb/shared). */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new BadRequestException({
        message: 'Données invalides',
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
