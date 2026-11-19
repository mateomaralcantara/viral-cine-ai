/**
 * Genera una imagen con Gemini (Vertex o AI Studio) a partir de imágenes de
 * referencia + texto, y la guarda como JPG 1280×720 (lo que Veo espera).
 * Lo reemplazado se mueve a «archivo»; nunca se borra.
 */
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { googleClient, videoPlatform } from '@/lib/v7/production/scene-veo-engine';

const run = promisify(execFile);
const exists = (f: string) => access(f).then(() => true, () => false);
export const IMAGE_MODELS = process.env.V7_IMAGE_MODEL?.trim() ? [process.env.V7_IMAGE_MODEL.trim()] : ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];
export const IMAGE_USD = 0.04;

export type ImageRef = { inlineData: { mimeType: string; data: string } };

export async function imageRef(file: string): Promise<ImageRef> {
  const ext = path.extname(file).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return { inlineData: { mimeType, data: (await readFile(file)).toString('base64') } };
}

export async function archiveFile(file: string) {
  if (!(await exists(file))) return;
  const dir = path.join(path.dirname(file), 'archivo');
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  await rename(file, path.join(dir, path.basename(file, path.extname(file)) + '-' + stamp + path.extname(file)));
}

export class GeminiImageMaker {
  private modelIndex = 0;
  private ai = (() => {
    const platform = videoPlatform();
    return googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined);
  })();

  async make(refs: ImageRef[], prompt: string, out: string): Promise<string> {
    for (;;) {
      const model = IMAGE_MODELS[this.modelIndex];
      try {
        const res = await this.ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [...refs, { text: prompt }] }],
          config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '16:9' } }
        });
        const parts = res.candidates?.[0]?.content?.parts ?? [];
        const img = parts.find((p) => p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/'));
        if (!img?.inlineData?.data) {
          const why = res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason ?? 'sin imagen';
          const said = parts.map((p) => p.text).filter(Boolean).join(' ').slice(0, 200);
          throw new Error('Google no devolvió imagen (' + why + ')' + (said ? ': ' + said : '') + '. Reformula o prueba de nuevo (no se cobra imagen no creada).');
        }
        await mkdir(path.dirname(out), { recursive: true });
        const tmp = out + '.tmp' + (img.inlineData.mimeType?.includes('png') ? '.png' : '.jpg');
        await writeFile(tmp, Buffer.from(img.inlineData.data, 'base64'));
        await archiveFile(out);
        try {
          await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', tmp, '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', '-q:v', '2', out]);
        } finally { await rm(tmp, { force: true }); }
        return model;
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        if (/404|NOT_FOUND|not found|is not supported/i.test(msg) && this.modelIndex < IMAGE_MODELS.length - 1) { this.modelIndex++; continue; }
        throw new Error(msg.replace(/\s+/g, ' ').slice(0, 300));
      }
    }
  }
}
