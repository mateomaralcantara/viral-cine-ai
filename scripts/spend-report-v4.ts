import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getProject } from '@/lib/storage/project-store';
import { readSpendLedger } from '@/lib/engine/spend-ledger';
import { summarizeSpendLedger } from '@/lib/engine/spend-report-v4';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);

if (!projectId) {
  console.log('Uso: npm run spend:report -- <projectId>');
  process.exit(1);
}

const project = await getProject(projectId);
const ledger = await readSpendLedger(projectId);
const summary = summarizeSpendLedger(ledger);

console.log('\n==================================================');
console.log(' VIRALCINE 4.2 — REPORTE DE GASTO API');
console.log('==================================================');
console.log('Proyecto: ' + project.id + ' — ' + project.input.title);
console.log('Entradas brutas del ledger: ' + summary.rawEntries);
console.log('Operaciones únicas contabilizadas: ' + summary.uniqueOperations);

console.log('\nPOR PROVEEDOR / OPERACION');
for (const row of summary.rows) {
  console.log(
    '  ' + row.provider + ' / ' + row.operation +
    ' | ops=' + row.uniqueOperations +
    ' | ok=' + row.succeededOrReconciled +
    ' | no-charge=' + row.failedNoCharge +
    ' | unknown=' + row.failedUnknown +
    ' | pending=' + row.pending +
    ' | contabilizado=US$' + row.accountedUsd.toFixed(4)
  );
}

console.log('\nTOTALES');
console.log(
  '  actualUsd confirmado por el ledger: US$' +
  summary.confirmedActualUsd.toFixed(4)
);
console.log(
  '  exitos sin actualUsd, valorados con tarifa configurada: US$' +
  summary.estimatedSuccessfulUsd.toFixed(4)
);
console.log(
  '  fallos de cobro desconocido / en riesgo: US$' +
  summary.unknownRiskUsd.toFixed(4)
);
console.log(
  '  reservado/submitted aun no terminal: US$' +
  summary.pendingUsd.toFixed(4)
);
console.log(
  '  operaciones failed-no-charge: ' +
  summary.failedNoChargeOperations
);
console.log(
  '  GASTO CONTABILIZADO / MEJOR ESTIMACION: US$' +
  summary.accountedUsd.toFixed(4)
);

console.log('\nNOTA CONTABLE');
console.log(
  '  Los proveedores no siempre devuelven el importe facturado exacto. ' +
  'Cuando una operacion exitosa no tiene actualUsd, el reporte usa estimatedUsd ' +
  'del ledger. Por eso "GASTO CONTABILIZADO" es la mejor estimacion interna, ' +
  'no una factura bancaria.'
);

console.log('\nSEGURIDAD');
console.log('  SOLO LECTURA');
console.log('  APIs externas: NO');
console.log('  Gasto por ejecutar este reporte: US$0');
console.log('SPEND_REPORT_4_2=PASS');
