/**
 * Foto de referencia del protagonista: misma cara en todas las tomas.
 *
 *   PASO 1 · retrato maestro desde la portada (portada.jpg en la carpeta de la película)
 *     npm run referencia -- convidados --maestro              ver plan y costo (gratis)
 *     npm run referencia -- convidados --maestro --generar    crear el retrato (~US$0.04)
 *
 *   PASO 2 · primer fotograma de cada toma con ese mismo Martin
 *     npm run referencia -- convidados                        tomas a preparar (las que el revisor marcó por la cara)
 *     npm run referencia -- convidados --generar              crear los fotogramas (~US$0.04 cada uno)
 *         --tomas E01-P01,E04-P03    elegir tomas a mano
 *         --todas                    todas las tomas donde aparece Martin
 *         --personaje martin         protagonista (por defecto: martin)
 *
 * Deja <toma>\E0X-P0Y-referencia.jpg y guarda una versión nueva del texto de la toma
 * (el corregido por el revisor si existe). Luego en el estudio: «Rehacer esta toma».
 * No genera video ni gasta en Veo. Nunca borra: lo reemplazado va a la carpeta archivo.
 */
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import nextEnv from '@next/env';
import { CONVIDADOS_ID } from '../lib/v7/presets/los-convidados-al-agape';
import { PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { googleClient, latestPromptRevision, savePromptRevision, shotReferencePath, videoPlatform } from '../lib/v7/production/scene-veo-engine';
import { fileSha256, originalShotVideo } from '../lib/v7/production/shot-current-video';
import { IMAGE_USD_ESTIMATE, keyframePrompt, masterPortraitPrompt, needsIdentityFix, sanitizePrompt, shotShows, type IdentityReport } from '../lib/v7/production/character-reference';

const run = promisify(execFile);
nextEnv.loadEnvConfig(process.cwd());
const FILMS: Record<string, string> = { convidados: CONVIDADOS_ID, primera: PRIMERA_PAGINA_ID };
const args = process.argv.slice(2);
const key = args.find((a) => FILMS[a]) ?? '';
const filmId = FILMS[key];
const flag = (f: string) => args.includes(f);
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!filmId) { console.log('Uso: npm run referencia -- ' + Object.keys(FILMS).join('|') + ' [--maestro] [--generar] [--tomas E01-P01,E04-P03] [--todas]'); process.exit(1); }

const exists = (f: string) => access(f).then(() => true, () => false);
const root = v7FilmRoot(filmId);
const generate = flag('--generar');
const who = (option('--personaje') ?? 'martin').toLowerCase();
const MODELS = process.env.V7_IMAGE_MODEL?.trim() ? [process.env.V7_IMAGE_MODEL.trim()] : ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];
const peopleDir = path.join(root, 'personajes');
const masterFile = path.join(peopleDir, `${who}-maestro.jpg`);
const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14);

async function archive(file: string) {
  if (!(await exists(file))) return;
  const dir = path.join(path.dirname(file), 'archivo');
  await mkdir(dir, { recursive: true });
  await rename(file, path.join(dir, path.basename(file, '.jpg') + '-' + stamp() + '.jpg'));
}
async function imagePart(file: string) {
  return { inlineData: { mimeType: file.endsWith('.png') ? 'image/png' : 'image/jpeg', data: (await readFile(file)).toString('base64') } };
}
/** Pide una imagen a Gemini y la guarda como JPG 1280×720 (lo que Veo espera). */
let modelIndex = 0;
async function makeImage(ai: ReturnType<typeof googleClient>, refs: Array<Awaited<ReturnType<typeof imagePart>>>, prompt: string, out: string) {
  for (;;) {
    const model = MODELS[modelIndex];
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [...refs, { text: prompt }] }],
        config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '16:9' } }
      });
      const parts = res.candidates?.[0]?.content?.parts ?? [];
      const img = parts.find((p) => p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/'));
      if (!img?.inlineData?.data) {
        const why = res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason ?? 'sin imagen';
        throw new Error('Google no devolvió imagen (' + why + '). Prueba otra vez o cambia el texto de la toma.');
      }
      const tmp = out + '.tmp.' + (img.inlineData.mimeType?.includes('png') ? 'png' : 'jpg');
      await writeFile(tmp, Buffer.from(img.inlineData.data, 'base64'));
      await archive(out);
      await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', tmp, '-vf', 'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720', '-q:v', '2', out]);
      await rm(tmp, { force: true });
      return model;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/404|NOT_FOUND|not found|is not supported/i.test(msg) && modelIndex < MODELS.length - 1) { modelIndex++; continue; }
      throw new Error(msg.replace(/\s+/g, ' ').slice(0, 240));
    }
  }
}

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const hero = film.characters.find((c) => c.id.endsWith('-character-' + who));
  if (!hero) throw new Error('No encuentro el personaje «' + who + '» en el guion.');
  let cover: string | null = null;
  for (const f of ['portada.jpg', 'portada.jpeg', 'portada.png']) if (await exists(path.join(root, f))) { cover = path.join(root, f); break; }
  const platform = videoPlatform();
  const client = () => googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined);

  // ---------- PASO 1: retrato maestro ----------
  if (flag('--maestro')) {
    if (!cover) throw new Error('Copia la portada como portada.jpg en: ' + root);
    console.log(`Retrato maestro de ${hero.name} desde ${path.basename(cover)} · costo ~US$${IMAGE_USD_ESTIMATE.toFixed(2)}`);
    if (!generate) { console.log('No se generó nada. Para crearlo: npm run referencia -- ' + key + ' --maestro --generar'); return; }
    await mkdir(peopleDir, { recursive: true });
    const model = await makeImage(client(), [await imagePart(cover)], masterPortraitPrompt(hero.name, hero.appearance), masterFile);
    console.log(`LISTO (${model}): ${masterFile}`);
    console.log('Míralo. Si no se parece, repite el comando (el anterior se guarda en «archivo»).');
    console.log('Si te gusta, siguiente: npm run referencia -- ' + key + ' --generar');
    return;
  }

  // ---------- PASO 2: primer fotograma por toma ----------
  if (!(await exists(masterFile))) throw new Error(`Falta el retrato maestro. Primero: npm run referencia -- ${key} --maestro --generar`);
  const wanted = option('--tomas')?.toUpperCase().split(',').map((s) => s.trim()).filter(Boolean);
  type Job = { label: string; prompt: string; why: string };
  const jobs: Job[] = [];
  for (const scene of indexedScenes(film)) for (const { shot, label } of scene.shots) {
    const dir = path.join(root, label.toLowerCase());
    const revision = await latestPromptRevision(filmId, label).catch(() => null);
    const current = revision?.promptText ?? shot.visualPrompt;
    if (!shotShows(hero.name, current) && !shot.characterIds.includes(hero.id) && !wanted?.includes(label)) continue;
    let report: (IdentityReport & { promptSugerido?: string }) | null = null;
    const video = await originalShotVideo(dir, label);
    if (video) {
      const sha = await fileSha256(video);
      try { report = JSON.parse(await readFile(path.join(dir, 'calidad', `${label}-${sha.slice(0, 12)}.json`), 'utf8')); } catch { report = null; }
    }
    const pick = wanted ? wanted.includes(label) : flag('--todas') || needsIdentityFix(report);
    if (!pick) continue;
    const prompt = sanitizePrompt(report?.promptSugerido?.trim() || current);
    jobs.push({ label, prompt, why: wanted ? 'elegida a mano' : flag('--todas') ? 'aparece ' + hero.name : `el revisor dio cara ${report?.identidad ?? '?'}/10` });
  }
  if (!jobs.length) {
    console.log('No hay tomas que preparar. Usa --tomas E01-P01,E04-P03 o --todas, o revisa antes: npm run calidad -- ' + key + ' --revisar');
    return;
  }
  console.log(`Fotogramas con el mismo ${hero.name}: ${jobs.length} tomas · costo ~US$${(jobs.length * IMAGE_USD_ESTIMATE).toFixed(2)}`);
  for (const j of jobs) console.log(`  ${j.label}  (${j.why})`);
  if (!generate) { console.log('\nNo se generó nada. Para crearlos: npm run referencia -- ' + key + ' --generar' + (wanted ? ' --tomas ' + wanted.join(',') : flag('--todas') ? ' --todas' : '')); return; }

  const ai = client();
  const master = await imagePart(masterFile);
  const coverPart = cover ? await imagePart(cover) : null;
  const done: string[] = [];
  for (const j of jobs) {
    process.stdout.write(`  ${j.label}... `);
    try {
      const out = shotReferencePath(filmId, j.label);
      await makeImage(ai, [master, ...(coverPart ? [coverPart] : [])], keyframePrompt(hero.name, j.prompt), out);
      await savePromptRevision(filmId, j.label, j.prompt);
      done.push(j.label);
      console.log('OK');
    } catch (e) { console.log('ERROR: ' + (e as Error).message); }
  }
  console.log(`\nListas ${done.length} de ${jobs.length}. Revisa cada foto en la carpeta de la toma (E0X-P0Y-referencia.jpg).`);
  console.log('Si una foto no te gusta, bórrala o repítela con --tomas ESA-TOMA; sin foto, la toma vuelve a ser solo texto.');
  console.log('\nEn el estudio, en cada toma: verás «con foto». Abre «Rehacer esta toma», escribe la frase y genera.');
  console.log('Costo en Veo: el mismo de siempre (~US$1.20 por toma).');
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
