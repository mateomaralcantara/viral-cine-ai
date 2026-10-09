#!/usr/bin/env node
/**
 * 15 DÍAS — four-minute closed narrative recut, local-only.
 *
 * Uses the V6 video (read only) plus the authentic screenshot of Libroseller.
 * New 90s are editorial re-use of V6 moving footage, NOT new AI-generated shots.
 * No external network calls, paid providers, remote writes, or V6 mutations.
 *
 * Run from a V7 worktree:
 *   node scripts/finalizar-15-dias-4min.mjs
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const FILM = 'v7-film-01db01f78f6c0e5afee6';
const LEGACY = '3d6bb950-7472-4d0d-b489-186d55684704';
const FRAMERATE = 25;
const V7DATA = path.resolve(process.env.VIRALCINE_DATA_DIR || '.data');
const V6DATA = path.resolve(process.env.VIRALCINE_V6_DATA_DIR ||
  'C:/Users/martin/Desktop/VSC/BestS/viral-cine-ai/.data');
const FILMROOT = path.join(V7DATA, 'v7', 'films', FILM);
const V6ROOT = path.join(V6DATA, 'projects', LEGACY);

function execute(binary, args, output = false) {
  const result = spawnSync(binary, args, {
    encoding: 'utf8', windowsHide: true,
    maxBuffer: 4 * 1024 * 1024, stdio: output ? 'inherit' : ['ignore', 'pipe', 'pipe']
  });
  if (result.error || result.status !== 0) {
    throw new Error(binary + ': ' +
      String(result.error?.message || result.stderr || 'código ' + result.status).slice(-1400));
  }
  return String(result.stdout || '').trim();
}

function sec(value) { return Number(value).toFixed(3); }

async function exists(file) {
  try { return (await fsp.stat(file)).isFile(); }
  catch { return false; }
}
function within(base, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) ||
      /^[A-Za-z]:/.test(relative)) return null;
  const full = path.resolve(base, relative);
  const diff = path.relative(base, full);
  return diff && diff !== '..' && !diff.startsWith('..' + path.sep) && !path.isAbsolute(diff)
    ? full : null;
}
function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function wrap(s, width = 64) {
  const words = s.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width && line) {
      lines.push(line); line = word;
    } else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}
function videoInfo(file) {
  const raw = execute('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=codec_type', '-of', 'json', file]);
  const parsed = JSON.parse(raw);
  return {
    duration: Number(parsed.format?.duration || 0),
    hasAudio: (parsed.streams || []).some((x) => x.codec_type === 'audio')
  };
}

const montage = [
  { kind: 'real', originalStart: 0, seconds: 30, title: 'La caída' },
  { kind: 'memory', sourceStart: 0.3, seconds: 7, title: 'EL HOGAR PERDIDO',
    words: 'Una puerta se cerró. Elena quedó lejos de sus hijos.' },
  { kind: 'memory', sourceStart: 16, seconds: 7, title: 'SOFÍA Y MATEO',
    words: 'La ausencia de sus hijos era más dolorosa que la falta de un techo.' },
  { kind: 'memory', sourceStart: 8, seconds: 6, title: 'UNA PROMESA',
    words: 'Elena decidió que aquella no sería la última página de su historia.' },

  { kind: 'real', originalStart: 30, seconds: 24, title: 'La primera página' },
  { kind: 'memory', sourceStart: 36, seconds: 7, title: 'EL CUADERNO',
    words: 'Comenzó a escribir cuando todavía no sabía cómo volver a empezar.' },
  { kind: 'memory', sourceStart: 45, seconds: 7, title: 'CADA NOCHE',
    words: 'Una página se convirtió en otra. Luego llegó un capítulo.' },
  { kind: 'memory', sourceStart: 51, seconds: 6, title: 'SU VOZ',
    words: 'Escribir era la manera de no rendirse.' },

  { kind: 'real', originalStart: 54, seconds: 24, title: 'Alguien se detuvo' },
  { kind: 'memory', sourceStart: 57, seconds: 7, title: 'LA RECOMENDACIÓN',
    words: 'Mariana descubrió el manuscrito de Elena y decidió ayudarla.' },
  { kind: 'website', seconds: 7, title: 'LIBROSELLER.COM',
    words: 'Mariana le recomendó Libroseller.com para publicar y vender su libro.' },
  { kind: 'memory', sourceStart: 70, seconds: 6, title: 'QUINCE DÍAS',
    words: 'Elena aceptó preparar el manuscrito para su publicación.' },

  { kind: 'real', originalStart: 78, seconds: 30, title: 'Quince días' },
  { kind: 'memory', sourceStart: 85, seconds: 7.5, title: 'EL LIBRO',
    words: 'Elena escribió, corrigió y dio forma definitiva a su historia.' },
  { kind: 'website', seconds: 7.5, title: 'PUBLICADO EN LIBROSELLER',
    words: 'Su libro llegó al catálogo de Libroseller.com: una nueva oportunidad.' },
  { kind: 'memory', sourceStart: 99, seconds: 7.5, title: 'LA PRIMERA VENTA',
    words: 'La primera venta ficticia de la historia le devolvió la esperanza.' },
  { kind: 'memory', sourceStart: 112, seconds: 7.5, title: 'MESES DESPUÉS',
    words: 'Siguió trabajando, vendiendo y ahorrando para reunir a su familia.' },

  { kind: 'real', originalStart: 108, seconds: 30, title: 'De verdad' },
  { kind: 'real', originalStart: 138, seconds: 12, title: 'Esta es nuestra casa' }
];

async function captionOverlay(file, title, words) {
  const lines = wrap(words);
  const text = lines.map((x, i) =>
    '<text x="58" y="' + (625 + i * 34) +
    '" fill="#fff8e9" font-family="Arial,Segoe UI,sans-serif" font-size="25">' +
    xmlEscape(x) + '</text>').join('');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">' +
    '<rect x="0" y="535" width="1280" height="185" fill="#071321" fill-opacity="0.80"/>' +
    '<rect x="0" y="535" width="9" height="185" fill="#efba6c"/>' +
    '<text x="58" y="580" fill="#efba6c" font-family="Arial,Segoe UI,sans-serif"' +
    ' font-size="31" font-weight="bold">' + xmlEscape(title) + '</text>' +
    text + '</svg>';
  await sharp(Buffer.from(svg)).png().toFile(file);
}

async function findMusic(project) {
  const candidates = [];
  if (project.musicAsset) candidates.push(project.musicAsset);
  for (const folder of ['audio', 'music', 'soundtracks']) {
    const dir = path.join(V6ROOT, folder);
    let names = [];
    try { names = await fsp.readdir(dir); } catch { continue; }
    for (const name of names) {
      if (/\.(mp3|wav|m4a|aac)$/i.test(name) &&
        /music|score|piano|cello|ambien|banda|soundtrack|fondo|tema/i.test(name)) {
        candidates.push(folder + '/' + name);
      }
    }
  }
  for (const item of candidates) {
    const f = within(V6ROOT, item);
    if (f && await exists(f)) {
      try { if (videoInfo(f).hasAudio) return f; } catch { /* next */ }
    }
  }
  return null;
}

async function main() {
  console.log('=== VIRALCINE V7: CIERRE NARRATIVO 4:00 ===');
  console.log('MODO=MONTAJE_LOCAL_SIN_GENERACIONES_PAGADAS');

  const bundle = JSON.parse(await fsp.readFile(path.join(FILMROOT, 'bundle.json'), 'utf8'));
  if (bundle.film?.id !== FILM || bundle.film?.legacyProjectId !== LEGACY)
    throw new Error('Bundle V7 no corresponde a 15 DÍAS');
  const project = JSON.parse(await fsp.readFile(path.join(V6ROOT, 'project.json'), 'utf8'));
  if (project.id !== LEGACY || project.input?.title?.trim().toUpperCase() !== '15 DÍAS')
    throw new Error('Proyecto V6 no corresponde a 15 DÍAS');

  const master = (within(V6ROOT, project.finalVideoAsset) ||
    path.join(V6ROOT, 'exports', 'pelicula-final.mp4'));
  if (!await exists(master)) throw new Error('Master V6 no encontrado: ' + master);
  const info = videoInfo(master);
  if (info.duration < 149.7 || !info.hasAudio)
    throw new Error('Master V6 incompleto o sin audio');
  const beforeHash = createHash('sha256').update(await fsp.readFile(master)).digest('hex');

  const packages = (await fsp.readdir(FILMROOT, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name.startsWith('produccion-libroseller-50s-'))
    .map((e) => e.name).sort().reverse();
  let webFile = null;
  for (const folder of packages) {
    const f = path.join(FILMROOT, folder, 'referencias', 'LIBROSELLER-WEB-PUBLICA.png');
    if (await exists(f)) { webFile = f; break; }
  }
  if (!webFile) throw new Error('Falta captura auténtica de Libroseller. No se inventará una pantalla.');

  const planned = montage.reduce((n, seg) => n + seg.seconds, 0);
  const reused = montage.filter((p) => p.kind !== 'real').reduce((n, p) => n + p.seconds, 0);
  if (planned !== 240 || reused !== 90)
    throw new Error('Timeline inválida. Duración prevista: ' + planned + ', montaje reutilizado: ' + reused);

  const music = await findMusic(project);
  const outputRoot = path.join(FILMROOT, 'cierre-4min-' + new Date().toISOString().replace(/[:.]/g, '-'));
  await fsp.mkdir(outputRoot, { recursive: false });
  const pieces = path.join(outputRoot, 'segmentos');
  await fsp.mkdir(pieces);

  console.log('MASTER_ORIGINAL=' + master);
  console.log('CAPTURA_LIBROSELLER=' + webFile);
  console.log('MUSICA_DE_FONDO=' + (music ? music : 'No encontrada; los montajes tendrán audio ambiente silencioso'));
  console.log('SALIDA=' + outputRoot);
  console.log('GENERACIONES_NUEVAS=0');
  console.log('V6_LECTURA_SOLAMENTE=SI');

  const concatLines = [];
  const timeline = [];
  let cursor = 0;

  for (let i = 0; i < montage.length; i++) {
    const seg = montage[i];
    const clip = path.join(pieces, String(i + 1).padStart(2, '0') + '.mp4');
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n'];
    if (seg.kind === 'real') {
      args.push('-ss', sec(seg.originalStart), '-i', master, '-t', sec(seg.seconds),
        '-map', '0:v:0', '-map', '0:a:0',
        '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,' +
          'pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,format=yuv420p',
        '-af', 'aresample=async=1:first_pts=0,apad');
    } else {
      const overlay = path.join(pieces, String(i + 1).padStart(2, '0') + '-caption.png');
      await captionOverlay(overlay, seg.title, seg.words);
      if (seg.kind === 'website') {
        args.push('-loop', '1', '-framerate', '25', '-i', webFile);
      } else {
        args.push('-ss', sec(seg.sourceStart), '-i', master);
      }
      args.push('-loop', '1', '-framerate', '25', '-i', overlay);
      if (music) args.push('-stream_loop', '-1', '-i', music);
      else args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');

      const base = seg.kind === 'website'
        ? "scale=1600:900:force_original_aspect_ratio=increase," +
          "zoompan=z='min(zoom+0.0003,1.08)':" +
          "x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1280x720:fps=25"
        : "scale=1600:900:force_original_aspect_ratio=increase," +
          "crop=1280:720:x='(iw-ow)/2+25*sin(n/70)':y='(ih-oh)/2+12*cos(n/80)'," +
          'eq=contrast=1.04:saturation=0.95';

      args.push('-t', sec(seg.seconds),
        '-filter_complex', '[0:v]' + base +
          '[bg];[bg][1:v]overlay=0:0:shortest=1,setsar=1,fps=25,format=yuv420p[video]',
        '-map', '[video]', '-map', '2:a:0',
        '-af', music
          ? 'volume=0.18,afade=t=in:st=0:d=0.25,afade=t=out:st=' +
              sec(Math.max(0, seg.seconds - 0.3)) + ':d=0.3'
          : 'anull');
    }
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-threads', '2',
      '-r', String(FRAMERATE), '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', clip);

    console.log('PROCESANDO=' + (i + 1) + '/' + montage.length + ' ' + seg.title);
    execute('ffmpeg', args);
    const clipInfo = videoInfo(clip);
    if (Math.abs(clipInfo.duration - seg.seconds) > 0.4 || !clipInfo.hasAudio)
      throw new Error('Segmento no válido: ' + seg.title + ' ' + clipInfo.duration);
    concatLines.push("file '" + clip.replace(/\\/g, '/').replace(/'/g, "'\\''") + "'");
    timeline.push({
      title: seg.title, type: seg.kind, start: cursor, duration: seg.seconds,
      end: cursor + seg.seconds, source: seg.kind === 'real'
        ? 'V6 original'
        : seg.kind === 'website' ? 'Captura real de Libroseller con movimiento de cámara'
          : 'Reedición audiovisual de metraje V6; no es video nuevo generado'
    });
    cursor += seg.seconds;
  }
  const list = path.join(outputRoot, 'concat.txt');
  await fsp.writeFile(list, concatLines.join('\n'), 'utf8');
  const video = path.join(outputRoot, '15-DIAS-LIBROSELLER-4MIN-CORTE-CERRADO.mp4');
  execute('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
    '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy',
    '-movflags', '+faststart', video]);
  const final = videoInfo(video);
  if (Math.abs(final.duration - 240) > 1 || !final.hasAudio)
    throw new Error('Exportación incompleta: ' + final.duration.toFixed(3));

  const hashAfter = createHash('sha256').update(await fsp.readFile(master)).digest('hex');
  if (hashAfter !== beforeHash) throw new Error('Alerta: hash master V6 cambió');
  const report = {
    title: '15 DÍAS — edición narrativa cerrada de 4 minutos',
    filmId: FILM, output: video, duration: final.duration,
    status: 'NARRATIVE_CUT_COMPLETE_NOT_NEW_FOOTAGE',
    originalV6Seconds: 150, repurposedV6AndWebsiteSeconds: 90,
    newlyGeneratedSeconds: 0, lipSyncStillPending: true,
    originalV6Untouched: true, externalPaidApiCalls: 0,
    note: 'Los 90 segundos adicionales son reencuadres y remontaje de video V6 y captura auténtica de Libroseller. No son escenas inéditas generadas por IA.',
    timeline
  };
  await fsp.writeFile(path.join(outputRoot, 'ENTREGA-4MIN.json'),
    JSON.stringify(report, null, 2), 'utf8');

  console.log('\n=== ENTREGA 15 DIAS: 4 MINUTOS ===');
  console.log('VIDEO_4MIN=' + video);
  console.log('DURACION_FINAL=' + final.duration.toFixed(3));
  console.log('MATERIAL_V6_REEDITADO=90s');
  console.log('FOTOGRAMAS_TARJETA=0');
  console.log('GENERACIONES_PAGADAS=0');
  console.log('V6_HASH_INTACTO=SI');
  console.log('LISTO_PARA_REVISAR=SI');
}
main().catch((error) => { console.error('ERROR_CIERRE=' + error.message); process.exitCode = 1; });
