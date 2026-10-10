import { ApiBody } from '@nestjs/swagger';
import { z, ZodType } from 'zod';

/** Documente un corps de requête Swagger à partir d'un schéma zod. */
export function ApiZodBody(schema: ZodType): MethodDecorator {
  const jsonSchema = z.toJSONSchema(schema, {
    io: 'input',
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return ApiBody({ schema: jsonSchema });
}
