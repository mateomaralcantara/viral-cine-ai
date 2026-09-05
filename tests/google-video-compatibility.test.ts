import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('usa el SDK 2.x y la salida moderna de Gemini Interactions', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { dependencies: Record<string, string> };
  const omniSource = await readFile('lib/providers/google-omni.ts', 'utf8');

  assert.match(packageJson.dependencies['@google/genai'], /^\^?2\./);
  assert.match(omniSource, /interaction\.output_video/);
  assert.doesNotMatch(omniSource, /interaction\.outputs/);
});

test('no envía generateAudio a Veo porque Veo 3.1 lo activa de forma nativa', async () => {
  const veoSource = await readFile('lib/providers/veo.ts', 'utf8');
  assert.doesNotMatch(veoSource, /generateAudio\s*:/);
});
