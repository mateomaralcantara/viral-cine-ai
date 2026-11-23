/**
 * Auditoría de créditos: solo lectura, no genera nada ni cobra.
 *
 *   npm run auditoria
 *
 * - ElevenLabs y Runway: saldo real consultado a su API.
 * - OpenAI y Gemini: valida la clave (el saldo solo se ve en su web).
 * - Google Vertex: gasto estimado según los registros locales de cada toma
 *   (el saldo exacto de créditos solo se ve en la consola de Google Cloud).
 * Nunca imprime claves.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import nextEnv from '@next/env';
import { v7DataRoot } from '../lib/v7/storage/film-store';

nextEnv.loadEnvConfig(process.cwd());

const env = (n: string) => process.env[n]?.trim() || '';
const money = (n: number) => 'US$' + n.toFixed(2);
const title = (t: string) => console.log('\n=== ' + t + ' ===');
const ok = (t: string) => console.log('  OK    ' + t);
const warn = (t: string) => console.log('  AVISO ' + t);
const bad = (t: string) => console.log('  FALLA ' + t);
const NOT_CHARGED = new Set(['failed-no-video', 'quota-rejected', 'reserved']);

async function getJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status + ' ' + text.slice(0, 160).replace(/\s+/g, ' '));
  return JSON.parse(text);
}
async function json<T>(file: string): Promise<T | null> {
  try { return JSON.parse(await readFile(file, 'utf8')) as T; } catch { return null; }
}
async function dirs(dir: string) {
  try { return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; }
}
async function files(dir: string, ext: string) {
  try { return (await readdir(dir)).filter((f) => f.endsWith(ext)); } catch { return []; }
}

// ---------- 1. Gasto local por película ----------
type Rec = { status?: string; estimatedUsd?: number; platform?: string; provider?: string };
type FilmSpend = { film: string; vertex: number; gemini: number; runway: number; videos: number; attempts: number; blocked: number; uncertain: number; voiceChars: number };

async function localSpend(): Promise<FilmSpend[]> {
  const root = path.join(v7DataRoot(), 'films');
  const out: FilmSpend[] = [];
  for (const film of await dirs(root)) {
    const s: FilmSpend = { film, vertex: 0, gemini: 0, runway: 0, videos: 0, attempts: 0, blocked: 0, uncertain: 0, voiceChars: 0 };
    const filmDir = path.join(root, film);
    for (const shot of (await dirs(filmDir)).filter((d) => /^e\d\d-p\d\d$/.test(d))) {
      const dir = path.join(filmDir, shot);
      const records: Rec[] = [];
      const active = await json<Rec>(path.join(dir, 'provider-operation.json'));
      if (active) records.push(active);
      for (const f of await files(path.join(dir, 'veo-attempts'), '.json')) {
        const r = await json<Rec>(path.join(dir, 'veo-attempts', f));
        if (r) records.push(r);
      }
      for (const r of records) {
        s.attempts++;
        if (r.status === 'failed-no-video') s.blocked++;
        if (r.status === 'failed-unknown') s.uncertain++;
        if (NOT_CHARGED.has(r.status ?? '')) continue;
        const usd = r.estimatedUsd ?? 0;
        if (r.platform === 'vertex') s.vertex += usd; else s.gemini += usd;
      }
      const runway = await json<{ estimatedUsd?: number; credits?: number }>(path.join(dir, 'runway-gen4-turbo-operation.json'));
      if (runway) s.runway += runway.estimatedUsd ?? (runway.credits ?? 0) / 100;
      if ((await files(dir, '.mp4')).length) s.videos++;
    }
    for (const f of (await files(path.join(filmDir, 'voces'), '.json')).filter((f) => f !== 'casting.json')) {
      const r = await json<{ characters?: number }>(path.join(filmDir, 'voces', f));
      s.voiceChars += r?.characters ?? 0;
    }
    out.push(s);
  }
  return out;
}

async function main() {
  console.log('AUDITORÍA DE CRÉDITOS — ' + new Date().toLocaleString('es'));
  console.log('Datos: ' + v7DataRoot());

  title('1. Gasto registrado por película (estimado local)');
  const spend = await localSpend();
  let vertex = 0, gemini = 0;
  for (const s of spend) {
    vertex += s.vertex; gemini += s.gemini;
    if (!s.attempts && !s.voiceChars) continue;
    console.log(`  ${s.film}`);
    console.log(`     tomas con video: ${s.videos} | intentos: ${s.attempts} | bloqueados por Google (gratis): ${s.blocked}`);
    console.log(`     Vertex: ${money(s.vertex)} | AI Studio: ${money(s.gemini)}` + (s.runway ? ` | Runway: ${money(s.runway)}` : '') +
      (s.voiceChars ? ` | voces: ${s.voiceChars} caracteres` : ''));
    if (s.uncertain) warn(`${s.uncertain} intento(s) con resultado incierto: contados como cobrados`);
  }
  if (!spend.length) warn('No hay películas en la carpeta de datos.');

  title('2. Google Cloud · Vertex AI (créditos)');
  const credit = Number(env('V7_GOOGLE_CREDIT_USD') || 300);
  ok(`Gastado en video (estimado): ${money(vertex)}`);
  ok(`Quedan aprox.: ${money(credit - vertex)} de ${money(credit)}  ->  unas ${Math.floor((credit - vertex) / 1.2)} tomas más de 8 s`);
  const rate = Number(env('V7_VEO_USD_PER_SECOND'));
  if (rate) console.log(`        (tarifa usada para estimar: ${money(rate)}/s; compárala con la consola y ajústala si difiere)`);
  console.log('  Saldo exacto: https://console.cloud.google.com/billing  ->  tu cuenta  ->  Créditos');
  if (env('GOOGLE_CLOUD_PROJECT')) console.log('  Proyecto: ' + env('GOOGLE_CLOUD_PROJECT'));
  if (gemini) console.log(`  Gastado antes en AI Studio (clave GEMINI): ${money(gemini)}`);

  title('3. ElevenLabs (voces)');
  if (!env('ELEVENLABS_API_KEY')) warn('No hay ELEVENLABS_API_KEY');
  else try {
    const s = await getJson('https://api.elevenlabs.io/v1/user/subscription', { 'xi-api-key': env('ELEVENLABS_API_KEY') });
    const left = s.character_limit - s.character_count;
    ok(`Plan ${s.tier}: usados ${s.character_count} de ${s.character_limit} caracteres  ->  quedan ${left}`);
    if (s.next_character_count_reset_unix) ok('Se renueva el ' + new Date(s.next_character_count_reset_unix * 1000).toLocaleDateString('es'));
    ok(`Alcanza para unos ${Math.floor(left / 1800)} tráileres como «Los convidados» (≈1.800 caracteres cada uno)`);
  } catch (e) {
    const m = (e as Error).message;
    if (/missing_permissions|user_read/.test(m)) warn('La clave no tiene permiso «User: Read»; el saldo se ve en https://elevenlabs.io/app/subscription');
    else bad('ElevenLabs: ' + m);
  }

  title('4. Runway');
  if (!env('RUNWAYML_API_SECRET')) warn('No hay RUNWAYML_API_SECRET');
  else try {
    const o = await getJson('https://api.dev.runwayml.com/v1/organization', {
      Authorization: 'Bearer ' + env('RUNWAYML_API_SECRET'), 'X-Runway-Version': '2024-11-06'
    });
    ok(`Saldo: ${o.creditBalance} créditos  ≈ ${money(o.creditBalance / 100)}  (unas ${Math.floor(o.creditBalance / 50)} tomas de 10 s con gen4_turbo)`);
  } catch (e) { bad('Runway: ' + (e as Error).message); }

  title('5. OpenAI');
  if (!env('OPENAI_API_KEY')) warn('No hay OPENAI_API_KEY');
  else try {
    await getJson('https://api.openai.com/v1/models', { Authorization: 'Bearer ' + env('OPENAI_API_KEY') });
    ok('Clave válida. El saldo solo se ve en: https://platform.openai.com/settings/organization/billing/overview');
  } catch (e) { bad('OpenAI: ' + (e as Error).message); }

  title('6. Gemini · AI Studio');
  if (!env('GEMINI_API_KEY')) warn('No hay GEMINI_API_KEY');
  else try {
    await getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { 'x-goog-api-key': env('GEMINI_API_KEY') });
    ok('Clave válida. Gasto y límites en: https://aistudio.google.com/usage');
  } catch (e) { bad('Gemini: ' + (e as Error).message); }

  console.log('\nFin de la auditoría (solo lectura, sin costo).');
}

await main();
