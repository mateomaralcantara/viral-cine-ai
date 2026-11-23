import { migrateV6CatalogToV7 } from '../lib/v7/migration/migrate-v6-catalog';

const result = await migrateV6CatalogToV7();

console.log('=== VIRALCINE V6 -> V7 CATALOG MIGRATION ===');
console.log('MIGRATED=' + result.migrated.length);
console.log('SKIPPED=' + result.skipped.length);
console.log('FAILED=' + result.failed.length);

for (const row of result.migrated) {
  console.log('MIGRATED', row.projectId, '->', row.filmId, row.title);
}
for (const row of result.skipped) {
  console.log('SKIPPED', row.projectId, row.reason);
}
for (const row of result.failed) {
  console.error('FAILED', row.projectId, row.error);
}

if (result.failed.length) process.exitCode = 1;
