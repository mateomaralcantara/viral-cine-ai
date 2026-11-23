/**
 * Único puente permitido desde ViralCine 7 hacia módulos maduros heredados de V6.
 *
 * V7 no debe importar directamente productores específicos V6.
 * Los módulos reutilizados aquí se sustituyen progresivamente por implementaciones V7 endurecidas.
 */
export {
  safetyStatus as legacySafetyStatus,
  assertProductionCanQueue as legacyAssertProductionCanQueue,
  assertPaidGenerationAllowed as legacyAssertPaidGenerationAllowed
} from '@/lib/engine/production-safety';

export {
  readSpendLedger as legacyReadSpendLedger,
  assertSpendRetrySafe as legacyAssertSpendRetrySafe,
  reservedMovieSpend as legacyReservedMovieSpend
} from '@/lib/engine/spend-ledger';

export {
  reusableSceneAssets as legacyReusableSceneAssets,
  reusableShotAssets as legacyReusableShotAssets
} from '@/lib/engine/scene-checkpoints';

export {
  buildMasterExportPlan as legacyBuildMasterExportPlan
} from '@/lib/engine/master-export-v4';

export const V6_MIGRATION_POLICY = Object.freeze({
  userFacingProduct: 'v7',
  v6UiStatus: 'legacy-only',
  v6NewFeatureDevelopment: false,
  reuseV6Safety: true,
  reuseV6SpendLedger: true,
  reuseV6Checkpoints: true,
  reuseV6MasterPlanning: true,
  reuseV6SpecificSceneProducers: false,
  strategy: 'replace-module-by-module-in-v7'
});
