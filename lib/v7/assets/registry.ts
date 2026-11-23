import { AssetSchema, type Asset } from '@/lib/v7/domain/asset';
export type AssetRegistry = ReadonlyArray<Asset>;
export function appendAsset(registry: AssetRegistry, candidate: Asset): AssetRegistry {
  const parsed = AssetSchema.parse(candidate);
  if (registry.some((asset) => asset.id === parsed.id)) throw new Error('Asset Registry es append-only: ' + parsed.id);
  return Object.freeze([...registry, parsed]);
}
export function assetsForShot(registry: AssetRegistry, shotId: string) {
  return registry.filter((asset) => asset.shotId === shotId);
}
export function approvedAssets(registry: AssetRegistry) {
  return registry.filter((asset) => asset.approved);
}
