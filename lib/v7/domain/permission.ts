import { z } from 'zod';
import { EntityIdSchema, TimestampSchema } from './common';

export const FilmRoleSchema = z.enum(['owner', 'producer', 'director', 'editor', 'reviewer', 'viewer']);
export const FilmPermissionSchema = z.enum([
  'film.read',
  'film.write',
  'production.plan',
  'production.execute',
  'take.approve',
  'timeline.edit',
  'master.approve',
  'budget.authorize',
  'rights.manage'
]);

export const PermissionGrantSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  principalId: EntityIdSchema,
  role: FilmRoleSchema,
  permissions: z.array(FilmPermissionSchema).min(1),
  createdAt: TimestampSchema
});

export type FilmRole = z.infer<typeof FilmRoleSchema>;
export type FilmPermission = z.infer<typeof FilmPermissionSchema>;
export type PermissionGrant = z.infer<typeof PermissionGrantSchema>;
