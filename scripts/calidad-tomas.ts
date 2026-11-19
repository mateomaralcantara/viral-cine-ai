/**
 * Control de calidad con IA: Gemini mira cada toma y dice si aprobar, revisar o rehacer.
 *
 *   npm run calidad -- convidados                 lista lo que revisaría y el costo (gratis)
 *   npm run calidad -- convidados --revisar       revisa las tomas (céntimos, créditos de Google)
 *       --escena E03      solo esa escena
 *       --toma E02-P04    solo esa toma
 *       --repetir         vuelve a revisar aunque el video ya tenga informe
 *
 * Informe por toma: <toma>\calidad\<toma>-<huella>.json (ligado al video exacto).
 * Informe general:  <película>\calidad\informe-<fecha>.md
 * No aprueba, no rehace ni gasta en video: solo informa.
 */
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { CONVIDADOS_ID } from '../lib/v7/presets/los-convidados-al-agape';
import { PRIMERA_PAGINA_ID } from '../lib/v7/presets/la-primera-pagina';
import { readV7FilmBundle, v7FilmRoot } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { googleClient, latestPromptRevision, videoPlatform } from '../lib/v7/production/scene-veo-engine';
import { speakerKey } from '../lib/v7/production/film-voice-mix';
import { buildReviewPrompt, type ShotReview } from '../lib/v7/qa/shot-vision-review';
import { VisionReviewer } from '../lib/v7/qa/shot-vision-runner';

nextEnv.loadEnvConfig(process.cwd());
const FILMS: Record<string, string> = FILM_KEYS;
const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith('--') && !/^E\d\d/i.test(a)) ?? '';
const filmId = FILMS[key];
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1]?.toUpperCase() : undefined; };
const flag = (f: string) => args.includes(f);
if (!filmId) { console.log('Uso: npm run calidad -- ' + Object.keys(FILMS).join('|') + ' [--revisar] [--escena E03] [--toma E02-P04] [--repetir]'); process.exit(1); }

const exists = (f: string) => access(f).then(() => true, () => false);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const root = v7FilmRoot(filmId);
const EST_PER_SHOT = 0.006;

type Saved = ShotReview & { label: string; model: string; videoSha256: string; inputTokens: number; outputTokens: number; costUsd: number; reviewedAt: string };

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const coverPath = ['portada.jpg', 'portada.jpeg', 'portada.png'].map((f) => path.join(root, f));
  let cover: string | null = null;
  for (const c of coverPath) if (await exists(c)) { cover = c; break; }
  const onlyScene = option('--escena');
  const onlyShot = option('--toma');

  type Job = { label: string; video: string; bytes: Buffer; hash: string; reportFile: string; input: Parameters<typeof buildReviewPrompt>[0] };
  const jobs: Job[] = [];
  const cached: Saved[] = [];
  for (const scene of indexedScenes(film)) {
    if (onlyScene && scene.label !== onlyScene) continue;
    for (const { shot, label } of scene.shots) {
      if (onlyShot && label !== onlyShot) continue;
      const dir = path.join(root, label.toLowerCase());
      let video: string | null = null;
      for (const f of [label + '-runway-gen4-turbo.mp4', label + '-veo-candidato.mp4']) if (await exists(path.join(dir, f))) { video = path.join(dir, f); break; }
      if (!video) continue;
      const bytes = await readFile(video);
      const hash = sha(bytes);
      const reportFile = path.join(dir, 'calidad', `${label}-${hash.slice(0, 12)}.json`);
      if (!flag('--repetir') && await exists(reportFile)) { cached.push(JSON.parse(await readFile(reportFile, 'utf8'))); continue; }
      const revision = await latestPromptRevision(filmId, label).catch(() => null);
      const characters = film.characters.filter((c) => shot.characterIds.includes(c.id) && c.appearance && !/sin imagen/i.test(c.appearance))
        .map((c) => ({ name: c.name, appearance: c.appearance }));
      jobs.push({ label, video, bytes, hash, reportFile, input: {
        label, title: shot.title, prompt: revision?.promptText ?? shot.visualPrompt, spokenText: shot.spokenText ?? '', onCamera: shot.metadata?.onCameraDialogue === true,
        speaker: speakerKey(film.id, shot.speakerId), characters, hasCover: !!cover
      } });
    }
  }

  console.log(`Película: ${film.title}`);
  console.log(`Tomas por revisar: ${jobs.length}${cached.length ? ` (ya revisadas: ${cached.length})` : ''}. Costo estimado: ~US$${(jobs.length * EST_PER_SHOT).toFixed(2)}${cover ? ' · con portada como referencia' : ' · sin portada (copia portada.jpg en la carpeta de la película para comparar caras)'}`);
  if (jobs.length && !flag('--revisar')) {
    console.log('No se revisó nada. Para revisar: npm run calidad -- ' + key + ' --revisar');
    if (!cached.length) return;
  }

  const platform = videoPlatform();
  const ai = googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined);
  const reviewer = new VisionReviewer(ai, cover ? { mimeType: cover.endsWith('.png') ? 'image/png' : 'image/jpeg', data: (await readFile(cover)).toString('base64') } : null);
  const results: Saved[] = [...cached];
  if (flag('--revisar')) for (const job of jobs) {
    process.stdout.write(`  ${job.label}... `);
    let saved: Saved;
    try {
      const { hasCover: _c, ...input } = job.input;
      const review = await reviewer.review(job.bytes, input);
      saved = { ...review, label: job.label, videoSha256: job.hash, reviewedAt: new Date().toISOString() };
    } catch (e) { console.log('ERROR: ' + (e as Error).message); continue; }
    await mkdir(path.dirname(job.reportFile), { recursive: true });
    await writeFile(job.reportFile, JSON.stringify(saved, null, 2) + '\n');
    results.push(saved);
    console.log(`${saved.veredicto.toUpperCase()}  ${saved.puntuacion}/10  (${saved.model})`);
  }

  if (!results.length) return;
  results.sort((a, b) => a.label.localeCompare(b.label));
  const icon = { aprobar: 'OK     ', revisar: 'REVISAR', rehacer: 'REHACER' } as const;
  console.log('\n=== INFORME DE CALIDAD ===');
  for (const r of results) {
    console.log(`  ${icon[r.veredicto]} ${r.label}  ${r.puntuacion}/10  guion ${r.coincideConGuion}/10  cara ${r.identidad ?? '-'}/10  ${r.motivo}`);
    for (const p of r.problemas.filter((p) => p.gravedad !== 'leve')) console.log(`           - [${p.gravedad}] ${p.tipo}: ${p.descripcion}${p.segundo != null ? ` (seg. ${p.segundo})` : ''}`);
  }
  const count = (v: ShotReview['veredicto']) => results.filter((r) => r.veredicto === v).length;
  const avg = results.reduce((n, r) => n + r.puntuacion, 0) / results.length;
  const cost = results.reduce((n, r) => n + r.costUsd, 0);
  console.log(`\n  Media ${avg.toFixed(1)}/10 · aprobar ${count('aprobar')} · revisar ${count('revisar')} · rehacer ${count('rehacer')} · costo de revisión ~US$${cost.toFixed(3)}`);

  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const md = [`# Informe de calidad — ${film.title}`, '', `Fecha: ${new Date().toLocaleString('es')} · Media ${avg.toFixed(1)}/10 · aprobar ${count('aprobar')} · revisar ${count('revisar')} · rehacer ${count('rehacer')}`, '',
    '| Toma | Veredicto | Nota | Guion | Cara | Motivo |', '|---|---|---|---|---|---|',
    ...results.map((r) => `| ${r.label} | ${r.veredicto} | ${r.puntuacion} | ${r.coincideConGuion} | ${r.identidad ?? '-'} | ${r.motivo.replace(/\|/g, '/')} |`), '',
    ...results.filter((r) => r.veredicto === 'rehacer').flatMap((r) => [`## ${r.label} — rehacer`, '', ...r.problemas.map((p) => `- **${p.gravedad}** · ${p.tipo}: ${p.descripcion}`), '',
      'Texto sugerido (pégalo en el estudio, Guardar versión, y autoriza el rehacer):', '', '> ' + (r.promptSugerido || '(sin sugerencia)'), ''])].join('\n');
  const reportDir = path.join(root, 'calidad');
  await mkdir(reportDir, { recursive: true });
  const mdFile = path.join(reportDir, `informe-${stamp}.md`);
  await writeFile(mdFile, md, 'utf8');
  console.log('  Informe con los textos sugeridos: ' + mdFile);
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
