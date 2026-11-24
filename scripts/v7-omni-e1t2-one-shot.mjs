import { readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import nextEnv from '@next/env';
import { GoogleGenAI } from '@google/genai';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const filmId = 'v7-film-01db01f78f6c0e5afee6';
const projectId = '3d6bb950-7472-4d0d-b489-186d55684704';
const filmDir = path.resolve('.data', 'v7', 'films', filmId);
const runDir = path.join(filmDir, 'omni-e1t2-first-paid-trial');
const prepared = path.join(runDir, 'entrada-4s.mp4');
const result = path.join(runDir, 'E1-T2-LIPSYNC-V7-candidato.mp4');
const marker = path.join(runDir, 'SOLICITUD-UNICA-REGISTRADA.json');
const task = process.argv[2];

function exec(command, args) {
  const p = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (p.error || p.status !== 0) throw new Error(`${command}: ${p.error?.message || (p.stderr || '').slice(-400)}`);
  return (p.stdout || '').trim();
}
function safeSource(root, relative) {
  if (typeof relative !== 'string' || !relative.trim() || path.isAbsolute(relative)) throw new Error('Referencia de medio invÃ¡lida');
  const file = path.resolve(root, relative);
  if (!file.toLowerCase().startsWith((path.resolve(root) + path.sep).toLowerCase())) throw new Error('Referencia fuera de V6');
  return file;
}
async function identity() {
  const planFile = path.join(filmDir, 'director-cut-4min.plan.json');
  const plan = JSON.parse(await readFile(planFile, 'utf8'));
  if (plan.filmId !== filmId || plan.legacyProjectId !== projectId) throw new Error('Plan V7 no coincide');
  const scene = plan.scenes.find(s => Number(s.order) === 1);
  const shot = scene?.shots?.find(s => Number(s.order) === 2);
  if (!shot?.videoAsset || !shot?.voiceAsset || !String(shot.spokenText || '').trim()) throw new Error('Faltan video, voz o texto de E1/T2');
  const sourceProject = path.join(process.env.V7_ORIGINAL_REPO || '', '.data', 'projects', projectId);
  const project = JSON.parse(await readFile(path.join(sourceProject, 'project.json'), 'utf8'));
  if (project.id !== projectId) throw new Error('Identidad V6 incorrecta');
  return { shot, video: safeSource(sourceProject, shot.videoAsset), voice: safeSource(sourceProject, shot.voiceAsset) };
}
async function prepare() {
  if (process.env.V7_GOOGLE_OMNI_EDIT_MODEL !== 'gemini-omni-1.1-flash') throw new Error('Modelo Omni V7 no configurado correctamente');
  if (process.env.V7_GOOGLE_OMNI_EDIT_ENABLED !== 'false') throw new Error('La bandera global V7 debe permanecer en false');
  if (!process.env.GEMINI_API_KEY?.trim()) throw new Error('Falta GEMINI_API_KEY');
  const { shot, video, voice } = await identity();
  const videoLen = Number(exec('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=nokey=1:noprint_wrappers=1',video]));
  const voiceLen = Number(exec('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=nokey=1:noprint_wrappers=1',voice]));
  if (!Number.isFinite(videoLen) || !Number.isFinite(voiceLen) || Math.min(videoLen,voiceLen) < 3) throw new Error('Video o voz insuficientes para una prueba de al menos 3 segundos');
  const seconds = Math.min(4,videoLen,voiceLen,Number(shot.durationSeconds) || 4);
  if (seconds < 3) throw new Error('DuraciÃ³n insuficiente');
  await mkdir(runDir, { recursive: true });
  try { await stat(marker); throw new Error('Esta prueba ya registrÃ³ una solicitud. No se permite reintentar.'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  try { await stat(prepared); } catch(e) { if(e.code !== 'ENOENT') throw e;
    exec('ffmpeg',['-hide_banner','-loglevel','error','-i',video,'-i',voice,'-map','0:v:0','-map','1:a:0','-t',String(seconds),'-vf','scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,format=yuv420p','-r','24','-c:v','libx264','-preset','veryfast','-crf','27','-c:a','aac','-b:a','96k','-af','apad','-movflags','+faststart','-n',prepared]);
  }
  const duration=Number(exec('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nokey=1:noprint_wrappers=1',prepared]));
  if (!Number.isFinite(duration) || duration > 4.2 || duration < 2.8) throw new Error('DuraciÃ³n de entrada inesperada');
  const size=(await stat(prepared)).size;
  if (size < 10000 || size > 7_000_000) throw new Error('TamaÃ±o del video inesperado');
  const level=spawnSync('ffmpeg',['-hide_banner','-nostats','-i',prepared,'-vn','-af','volumedetect','-f','null','NUL'],{encoding:'utf8',windowsHide:true});
  const peak=Number((level.stderr || '').match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/)?.[1] || '-999');
  if (peak < -45) throw new Error('La entrada no contiene una voz audible; no generar');
  console.log(`PREPARADO: ${prepared}`);
  console.log(`DURACION: ${duration.toFixed(2)} s; TAMAÃ‘O: ${(size/1048576).toFixed(2)} MiB; PICO_AUDIO: ${peak} dB`);
  console.log(`TEXTO DE LA TOMA: ${String(shot.spokenText).slice(0,200)}`);
  return { shot, duration };
}
async function send() {
  if (process.env.V7_ONE_SHOT_RUN !== 'SI') throw new Error('No autorizada la ejecuciÃ³n de este proceso');
  const { shot } = await prepare();
  const key=process.env.GEMINI_API_KEY.trim();
  const bytes=await readFile(prepared);
  const hash=createHash('sha256').update(bytes).digest('hex');
  const prompt = [
    'Edit the UPLOADED VIDEO, do not extend it. Single uninterrupted shot. Keep the same visible woman, face, clothing, background, lighting and camera.',
    'The woman is speaking in Spanish. Make her lips, jaw and mouth visibly articulate the exact words of this line in sync with the speech timing:',
    JSON.stringify(String(shot.spokenText).slice(0,500)),
    'Her mouth must actively move on spoken syllables and remain closed naturally in pauses. Natural facial microexpressions. Keep everything else the same.',
    'Do not introduce extra people, subtitles, or cuts. Do not add new dialogue. Preserve timing as closely as possible.'
  ].join(' ');
  const body={
    model:'gemini-omni-1.1-flash',
    input:[{type:'user_input',content:[{type:'video',mime_type:'video/mp4',data:bytes.toString('base64')},{type:'text',text:prompt}]}],
    response_format:{type:'video',resolution:'720p',aspect_ratio:'16:9',delivery:'uri'},
    background:false,stream:false,store:false
  };
  await writeFile(marker, JSON.stringify({state:'REQUEST_MAY_HAVE_BEEN_SENT',model:body.model,sha256:hash,createdAt:new Date().toISOString(),maxAttempts:1},null,2),{flag:'wx'});
  console.log('INICIANDO UNA SOLA SOLICITUD PAGADA. No habrÃ¡ reintentos.');
  let response,payload;
  try {
    response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
      method:'POST',headers:{'x-goog-api-key':key,'content-type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(20*60*1000)
    });
    payload=await response.json();
  } catch(e) { throw new Error('Solicitud con resultado incierto ('+(e.message || 'error de red')+'). No repetir: revisar facturaciÃ³n y registro.'); }
  if(!response.ok) throw new Error('Google respondiÃ³ HTTP '+response.status+'; no repetir automÃ¡ticamente.');
  if(payload.status!=='completed') throw new Error('Estado de interacciÃ³n: '+String(payload.status)+'; no reenviar solicitud.');
  const output=payload.output_video || payload.outputVideo;
  if(!output) throw new Error('Google no devolviÃ³ un video. Conservar el marcador y no repetir.');
  if(output.data) {
    await writeFile(result,Buffer.from(output.data,'base64'),{flag:'wx'});
  } else if(output.uri) {
    const id=String(output.uri).match(/files\/([a-zA-Z0-9_-]+)/)?.[1];
    if(!id) throw new Error('URI del video no reconocida: conservar marcador, no repetir.');
    const ai=new GoogleGenAI({apiKey:key});
    let active=false;
    for(let i=0;i<60;i++) {
      const file=await ai.files.get({name:'files/'+id});
      const state=String(typeof file.state==='object' ? file.state?.name : file.state).toUpperCase();
      if(state==='ACTIVE'){active=true;break;}
      if(state==='FAILED') throw new Error('El resultado se marcÃ³ FAILED. No repetir solicitud.');
      await new Promise(r=>setTimeout(r,5000));
    }
    if(!active) throw new Error('El resultado tarda en activarse; no repetir solicitud.');
    const part=result+'.part.mp4';
    await ai.files.download({file:output,downloadPath:part});
    await rename(part,result);
  } else throw new Error('Respuesta sin datos ni URI. No repetir solicitud.');
  const check=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','json',result],{encoding:'utf8',windowsHide:true});
  if(check.status!==0 || !check.stdout.includes('video')) throw new Error('Resultado descargado pero no pasÃ³ validaciÃ³n ffprobe. No repetir.');
  console.log('RESULTADO_CANDIDATO='+result);
  console.log('El master V6 y el bundle V7 permanecen intactos. RevisiÃ³n visual pendiente.');
}
try {
  if(task==='prepare') await prepare();
  else if(task==='send') await send();
  else throw new Error('Modo invÃ¡lido');
} catch(e){ console.error('BLOQUEADO/ERROR: '+(e instanceof Error?e.message:String(e)));process.exitCode=1; }