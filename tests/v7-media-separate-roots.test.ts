import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { resolveLegacyV6AssetAbsolutePath } from '../lib/v7/storage/asset-resolver';

const legacyId = '3d6bb950-7472-4d0d-b489-186d55684704';

test('Cinema Core can resolve V6 assets from a separate read-only data root', () => {
  const source = path.resolve('test-fixtures', 'v6', '.data');
  const expected = path.join(source, 'projects', legacyId, 'exports', 'pelicula-final.mp4');
  assert.equal(resolveLegacyV6AssetAbsolutePath(legacyId, 'exports/pelicula-final.mp4', source), expected);
});

test('V6 path resolver rejects traversal and absolute paths', () => {
  const source = path.resolve('test-fixtures', 'v6', '.data');
  assert.throws(() => resolveLegacyV6AssetAbsolutePath(legacyId, '../../secret', source));
  assert.throws(() => resolveLegacyV6AssetAbsolutePath(legacyId, '../other-film.mp4', source));
  assert.throws(() => resolveLegacyV6AssetAbsolutePath(legacyId, path.resolve('secret.mp4'), source));
  assert.throws(() => resolveLegacyV6AssetAbsolutePath('not-a-uuid', 'exports/movie.mp4', source));
});
