import type { FilmPermission, PermissionGrant } from '@/lib/v7/domain/permission';

export function hasPermission(
  grants: readonly PermissionGrant[],
  filmId: string,
  principalId: string,
  permission: FilmPermission
) {
  return grants.some((grant) =>
    grant.filmId === filmId &&
    grant.principalId === principalId &&
    (grant.role === 'owner' || grant.permissions.includes(permission))
  );
}

export function assertPermission(
  grants: readonly PermissionGrant[],
  filmId: string,
  principalId: string,
  permission: FilmPermission
) {
  if (!hasPermission(grants, filmId, principalId, permission)) {
    throw new Error('V7_PERMISSION_DENIED: ' + permission);
  }
}
