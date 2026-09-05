import { rm, writeFile } from 'node:fs/promises';

export type FakeStage = 'voice' | 'video' | 'lip-sync' | 'music' | 'audit' | 'save';
export type FakeScenario =
  | 'success'
  | '429'
  | 'network-timeout'
  | 'accepted-then-timeout'
  | 'missing-file'
  | 'corrupt-file'
  | 'crash-after-save'
  | 'worker-restart';

export async function runFakeProviderStage<T>(
  stage: FakeStage,
  outputPath: string | undefined,
  work: () => Promise<T>
): Promise<T> {
  const scenario = fakeScenario();
  if (scenario === 'success' || !stageSelected(stage)) return work();

  if (scenario === '429') {
    throw new Error(`[fake-provider:${stage}] HTTP 429 rate limit simulado antes de aceptar el trabajo.`);
  }
  if (scenario === 'network-timeout') {
    await tinyDelay();
    throw new Error(`[fake-provider:${stage}] timeout de red simulado antes de confirmar aceptación.`);
  }

  const result = await work();

  if (scenario === 'accepted-then-timeout') {
    throw new Error(`[fake-provider:${stage}] trabajo aceptado y posiblemente cobrado; timeout simulado después de aceptación. Requiere reconciliación.`);
  }
  if (scenario === 'missing-file') {
    if (outputPath) await rm(outputPath, { force: true });
    return result;
  }
  if (scenario === 'corrupt-file') {
    if (outputPath) await writeFile(outputPath, Buffer.from('VIRALCINE_FAKE_CORRUPT_MEDIA'));
    return result;
  }
  if (scenario === 'crash-after-save') {
    throw new Error(`[fake-provider:${stage}] caída simulada después de guardar el resultado.`);
  }
  if (scenario === 'worker-restart') {
    throw new Error(`[fake-provider:${stage}] reinicio simulado del worker después de completar la etapa.`);
  }
  return result;
}

export function fakeScenario(): FakeScenario {
  const value = (process.env.FAKE_PROVIDER_SCENARIO || 'success').trim().toLowerCase();
  const allowed: FakeScenario[] = [
    'success', '429', 'network-timeout', 'accepted-then-timeout',
    'missing-file', 'corrupt-file', 'crash-after-save', 'worker-restart'
  ];
  return allowed.includes(value as FakeScenario) ? value as FakeScenario : 'success';
}

function stageSelected(stage: FakeStage) {
  const configured = (process.env.FAKE_PROVIDER_STAGE || '').trim().toLowerCase();
  return configured === '' || configured === stage;
}

async function tinyDelay() {
  await new Promise((resolve) => setTimeout(resolve, 120));
}
