/**
 * DESPACHADOR: hace avanzar a la vez la cola de TODAS las escenas autorizadas
 * (sin tener que dejar abierta cada escena en el estudio).
 *
 *   npm run cola -- episodio1                  todas las escenas con cola pendiente
 *   npm run cola -- episodio1 --escenas E07,E08,E09,E10
 *
 * Cada 30 s: recoge los videos terminados (gratis) y envía la siguiente toma autorizada,
 * respetando el turno de Google (1 pedido por minuto). Solo envía lo que ya autorizaste
 * con la frase de escena completa: no autoriza nada nuevo. Se para solo al vaciar las colas.
 */
import nextEnv from '@next/env';
import { FILM_KEYS } from '../lib/v7/presets/film-registry';
import { readV7FilmBundle } from '../lib/v7/storage/film-store';
import { indexedScenes } from '../lib/v7/production/scene-approval-board';
import { resumeWholeScene, sceneStudioBoard } from '../lib/v7/production/scene-veo-engine';

(process.env as Record<string, string>).NODE_ENV ??= 'development';
nextEnv.loadEnvConfig(process.cwd(), true);
const args = process.argv.slice(2);
const key = args.find((a) => FILM_KEYS[a]) ?? '';
const filmId = FILM_KEYS[key];
const option = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
if (!filmId) { console.log('Uso: npm run cola -- episodio1 [--escenas E07,E08,E09,E10]'); process.exit(1); }
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const stamp = () => new Date().toLocaleTimeString('es');

async function main() {
  const { film } = await readV7FilmBundle(filmId);
  const wanted = (option('--escenas') ?? '').toUpperCase().split(',').map((x) => x.trim()).filter(Boolean);
  const labels = indexedScenes(film).map((s) => s.label).filter((l) => !wanted.length || wanted.includes(l));
  console.log(`DESPACHADOR · ${film.title}\nEscenas: ${labels.join(', ')} · turno de Google: 1 pedido por minuto (V7_VEO_SUBMITS_PER_MINUTE)`);
  const ACTIVE = new Set(['queued', 'reserved', 'submitted', 'processing', 'quota-rejected']);
  for (let round = 0; round < 600; round++) {
    let pending = 0;
    const line: string[] = [];
    for (const label of labels) {
      const before = await sceneStudioBoard(filmId, label).catch(() => null);
      if (!before || !before.shots.some((s) => ACTIVE.has(s.status))) continue;
      const r = await resumeWholeScene(filmId, label).catch((e: Error) => ({ dispatched: [{ shotId: label, status: 'error', error: e.message }], results: [] }));
      for (const d of r.dispatched ?? []) if (d.error) console.log(`  [${stamp()}] ${d.shotId}: ${d.error}`);
      const board = await sceneStudioBoard(filmId, label);
      const count = (st: string) => board.shots.filter((s) => s.status === st).length;
      const done = count('review-required');
      const active = board.shots.filter((s) => ACTIVE.has(s.status)).length;
      pending += active;
      line.push(`${label}: ${done}/${board.shots.length} listas${active ? `, ${active} en curso/cola` : ''}${count('failed-no-video') ? `, ${count('failed-no-video')} bloqueadas` : ''}`);
    }
    if (line.length) console.log(`[${stamp()}] ` + line.join(' · '));
    if (!pending) { console.log(`[${stamp()}] Colas vacías. Siguiente: revisa con npm run vigilar / escuchar y monta cada escena.`); break; }
    await sleep(30);
  }
}

try { await main(); } catch (e) { console.error('\nERROR: ' + (e instanceof Error ? e.message : String(e))); process.exit(1); }
