/**
 * Agente reparador: mejora GRATIS (FFmpeg, en tu PC) las tomas que el revisor marcó
 * como «revisar» o «rehacer», y el revisor comprueba si de verdad mejoraron.
 *
 *   npm run reparar -- convidados                plan de reparación de cada toma (gratis, no toca nada)
 *   npm run reparar -- convidados --reparar      repara y verifica con el revisor (céntimos por verificación)
 *       --sin-ia        repara sin verificar con IA (100 % gratis; tú decides viéndolas)
 *       --toma E05-P04  solo esa toma
 *       --intentos 2    intentos por toma (por defecto 2: suave y luego más fuerte)
 *       --repetir       vuelve a reparar aunque ya exista una reparación
 *
 * Nunca toca el video original. La reparación aceptada se guarda como E0X-P0Y-reparada.mp4
 * y el montaje (npm run montar) la usa en lugar del original.
 * Lo que no se arregla gratis (cara de Martin, caminar) queda listado para regenerar.
 */
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { CONVIDADOS_ID } from '../lib/v7/presets/los-convidados-al-agape';
import { PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { googleClient, latestPromptRevision, videoPlatform } from '../lib/v7/production/scene-veo-engine';
import { speakerKey } from '../lib/v7/production/film-voice-mix';
import { fileSha256, originalShotVideo, repairedVideoPath, repairRecordPath } from '../lib/v7/production/shot-current-video';
import { acceptRepair, planRepair, repairAudioFilter, repairVideoFilter, type RepairPlan } from '../lib/v7/qa/shot-repair-planner';
import { VisionReviewer } from '../lib/v7/qa/shot-vision-runner';
import type { ShotReview } from '../lib/v7/qa/shot-vision-review';

const run = promisify(execFile);
nextEnv.loadEnvConfig(process.cwd());
const FILMS: Record<string, string> = FILM_KEYS;
const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith('--') && !/^E\d\d/i.test(a) && !/^\d+$/.test(a)) ?? '';
const filmId = FILMS[key];
const flag = (f: string) => args.includes(f);
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!filmId) { console.log('Uso: npm run reparar -- ' + Object.keys(FILMS).join('|') + ' [--reparar] [--sin-ia] [--toma E05-P04] [--intentos 2]'); process.exit(1); }
const exists = (f: string) => access(f).then(() => true, () => false);
const root = v7FilmRoot(filmId);
const execute = flag('--reparar');
const useAi = !flag('--sin-ia');
const attempts = Math.max(1, Math.min(3, Number(option('--intentos') ?? 2) || 2));
const onlyShot = option('--toma')?.toUpperCase();

async function probe(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(stdout.trim());
}
async function hasAudio(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]);
  return stdout.trim().length > 0;
}
async function render(src: string, plan: RepairPlan, out: string) {
  const audio = await hasAudio(src);
  const list = ['-nostdin', '-v', 'error', '-y', '-i', src];
  if (!audio) list.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  list.push('-filter_complex', `[0:v]${repairVideoFilter(plan)}[v];[${audio ? '0' : '1'}:a]${repairAudioFilter(plan)}[a]`,
    '-map', '[v]', '-map', '[a]', '-shortest', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-ar', '48000', '-ac', '2', out);
  await run('ffmpeg', list, { maxBuffer: 1 << 24 });
}

type Report = ShotReview & { videoSha256: string };
async function reportFor(dir: string, label: string, sha: string): Promise<Report | null> {
  const qa = path.join(dir, 'calidad');
  const file = path.join(qa, `${label}-${sha.slice(0, 12)}.json`);
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  let reviewer: VisionReviewer | null = null;
  if (execute && useAi) {
    let cover: string | null = null;
    for (const f of ['portada.jpg', 'portada.jpeg', 'portada.png']) if (await exists(path.join(root, f))) { cover = path.join(root, f); break; }
    const platform = videoPlatform();
    reviewer = new VisionReviewer(googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined),
      cover ? { mimeType: cover.endsWith('.png') ? 'image/png' : 'image/jpeg', data: (await readFile(cover)).toString('base64') } : null);
  }
  const fixed: string[] = [], notBetter: string[] = [], regenerate: Array<{ label: string; why: string; prompt: string }> = [], noReport: string[] = [];
  let cost = 0;
  console.log(`AGENTE REPARADOR — ${film.title}${execute ? (useAi ? ' (repara y verifica con IA)' : ' (repara sin verificar, 100 % gratis)') : ' (solo plan, no toca nada)'}\n`);

  for (const scene of indexedScenes(film)) for (const { shot, label } of scene.shots) {
    if (onlyShot && label !== onlyShot) continue;
    const dir = path.join(root, label.toLowerCase());
    const original = await originalShotVideo(dir, label);
    if (!original) continue;
    const sha = await fileSha256(original);
    const before = await reportFor(dir, label, sha);
    if (!before) { noReport.push(label); continue; }
    if (before.veredicto === 'aprobar') continue;
    if (!flag('--repetir') && await exists(repairRecordPath(dir, label))) {
      const rec = JSON.parse(await readFile(repairRecordPath(dir, label), 'utf8')) as { originalSha256: string };
      if (rec.originalSha256 === sha && await exists(repairedVideoPath(dir, label))) { console.log(`  ${label}: ya reparada (usa --repetir para rehacerla)`); fixed.push(label); continue; }
    }
    const duration = await probe(original);
    const onCamera = shot.metadata?.onCameraDialogue === true;
    const firstPlan = planRepair(before, duration, 1, { onCamera });
    console.log(`  ${label}  ${before.veredicto.toUpperCase()} ${before.puntuacion}/10`);
    for (const a of firstPlan.actions) console.log(`     · ${a}`);
    for (const u of firstPlan.unfixable) console.log(`     ✗ No se arregla gratis: ${u}`);
    if (firstPlan.unfixable.length) regenerate.push({ label, why: firstPlan.unfixable.join('; '), prompt: before.promptSugerido });
    const onlyCosmetic = firstPlan.actions.length === 1;
    if (!execute || (onlyCosmetic && firstPlan.unfixable.length)) continue;

    const work = path.join(dir, 'reparacion');
    await mkdir(work, { recursive: true });
    const revision = await latestPromptRevision(filmId, label).catch(() => null);
    const characters = film.characters.filter((c) => shot.characterIds.includes(c.id) && c.appearance && !/sin imagen/i.test(c.appearance)).map((c) => ({ name: c.name, appearance: c.appearance }));
    let accepted = false;
    for (let n = 1; n <= attempts && !accepted; n++) {
      const plan = planRepair(before, duration, n, { onCamera });
      const out = path.join(work, `${label}-intento-${n}.mp4`);
      try { await render(original, plan, out); } catch (e) { console.log(`     intento ${n}: FFmpeg falló: ${String((e as Error).message).slice(0, 160)}`); continue; }
      let after: ShotReview | null = null;
      if (reviewer) {
        try {
          const r = await reviewer.review(await readFile(out), { label, title: shot.title, prompt: revision?.promptText ?? shot.visualPrompt,
            spokenText: shot.spokenText ?? '', onCamera: shot.metadata?.onCameraDialogue === true, speaker: speakerKey(film.id, shot.speakerId), characters });
          cost += r.costUsd; after = r;
          await writeFile(path.join(work, `${label}-intento-${n}-calidad.json`), JSON.stringify(r, null, 2) + '\n');
        } catch (e) { console.log(`     intento ${n}: el revisor falló: ${(e as Error).message}`); continue; }
      }
      const ok = after ? acceptRepair(before, after) : true;
      console.log(`     intento ${n}: ${after ? `${after.puntuacion}/10 (${after.veredicto})` : 'sin verificar'} -> ${ok ? 'ACEPTADA' : 'no mejora lo suficiente'}`);
      if (!ok) continue;
      accepted = true;
      await copyFile(out, repairedVideoPath(dir, label));
      await writeFile(repairRecordPath(dir, label), JSON.stringify({ label, originalSha256: sha, attempt: n, plan, before: { puntuacion: before.puntuacion, veredicto: before.veredicto },
        after: after ? { puntuacion: after.puntuacion, veredicto: after.veredicto, motivo: after.motivo } : null, verifiedByAi: !!after, createdAt: new Date().toISOString() }, null, 2) + '\n');
      fixed.push(label);
    }
    if (!accepted) notBetter.push(label);
  }

  console.log('\n=== RESUMEN ===');
  if (execute) {
    console.log(`  Reparadas (el montaje ya las usa): ${fixed.join(', ') || 'ninguna'}`);
    console.log(`  Sin mejora suficiente (se queda el original): ${notBetter.join(', ') || 'ninguna'}`);
    if (reviewer) console.log(`  Costo de verificación: ~US$${cost.toFixed(3)} · reparaciones: US$0 (FFmpeg local)`);
  }
  if (regenerate.length) {
    console.log('  Necesitan regenerar con Veo (pago) para quedar perfectas:');
    for (const r of regenerate) console.log(`     ${r.label}: ${r.why}`);
  }
  if (noReport.length) console.log(`  Sin informe del revisor (ejecuta antes npm run calidad -- ${key} --revisar): ${noReport.join(', ')}`);
  if (!execute) console.log(`\nPara aplicar: npm run reparar -- ${key} --reparar   (o --sin-ia para 100 % gratis)`);
  else console.log(`\nSiguiente: npm run montar -- ${key}`);
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
