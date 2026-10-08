import { V6_MIGRATION_POLICY } from '../lib/v7/legacy/runtime-bridge';

console.log('=== VIRALCINE 7 WORKER ===');
console.log('MODE=SAFE_FOUNDATION');
console.log('USER_FACING_PRODUCT=' + V6_MIGRATION_POLICY.userFacingProduct);
console.log('V6_UI_STATUS=' + V6_MIGRATION_POLICY.v6UiStatus);
console.log('PAID_EXECUTION=DISABLED_UNTIL_MODULE_HARDENING');
console.log('No se ejecutan proveedores ni generación desde este worker todavía.');
