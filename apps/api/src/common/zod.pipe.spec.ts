import { BadRequestException } from '@nestjs/common';
import { createMissionSchema } from '@hb/shared';
import { ZodPipe } from './zod.pipe';

describe('ZodPipe', () => {
  const pipe = new ZodPipe(createMissionSchema);

  it('renvoie les données validées', () => {
    const input = {
      type: 'ONE_OFF',
      route: {
        mode: 'WALK',
        points: [
          { lat: 48.85, lng: 2.34 },
          { lat: 48.86, lng: 2.35 },
        ],
      },
    };
    expect(pipe.transform(input)).toMatchObject(input);
  });

  it('détaille les champs invalides', () => {
    try {
      pipe.transform({ type: 'GRATUIT', route: { mode: 'WALK', points: [] } });
      fail('aurait dû lever une erreur');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as { errors: { path: string }[] };
      expect(body.errors.map((e) => e.path)).toEqual(
        expect.arrayContaining(['type', 'route.points']),
      );
    }
  });
});
