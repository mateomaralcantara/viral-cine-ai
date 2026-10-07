import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { getRunwayTaskDetailsFromEnvironment } from '@/lib/providers/runway-router-v6';

loadProjectLocalEnvOverride();

const [taskId] = process.argv.slice(2);
if (!taskId) {
  console.error('Uso: npm run safe:runway:task -- <taskId>');
  process.exit(1);
}

const task = await getRunwayTaskDetailsFromEnvironment(taskId);

console.log('\n==================================================');
console.log(' VIRALCINE 6 SAFE — RUNWAY TASK DIAGNOSTIC');
console.log('==================================================');
console.log('Task ID: ' + task.id);
console.log('Status: ' + task.status);
console.log('Failure code: ' + (task.failureCode || 'NONE'));
console.log('Failure: ' + (task.failure || 'NONE'));
console.log('Created at: ' + (task.createdAt || 'UNKNOWN'));
console.log('Output count: ' + task.output.length);
console.log('');
console.log('READ_ONLY=YES');
console.log('GENERATION=NO');
console.log('NEW_SPEND=US$0');

const code = task.failureCode || '';

if (code.startsWith('SAFETY.INPUT.') || code === 'INPUT_PREPROCESSING.SAFETY.TEXT') {
  console.log('RETRY_RECOMMENDATION=NO');
  console.log('BILLING_NOTE=Runway docs indicate safety-input moderated generations are not refunded.');
} else if (code === 'ASSET.INVALID') {
  console.log('RETRY_RECOMMENDATION=NO_UNTIL_INPUT_FIXED');
} else if (
  code.startsWith('INTERNAL.BAD_OUTPUT') ||
  code === 'INPUT_PREPROCESSING.INTERNAL' ||
  code === 'THIRD_PARTY.UNAVAILABLE' ||
  code === 'INTERNAL' ||
  !code
) {
  console.log('RETRY_RECOMMENDATION=DIAGNOSE_FIRST_NO_AUTORETRY');
} else {
  console.log('RETRY_RECOMMENDATION=DIAGNOSE_FIRST_NO_AUTORETRY');
}
