'use client';
import { useCallback, useEffect, useState } from 'react';
import { ensureLocalStudioSession } from '@/lib/v7/security/local-studio-client';

type Issue = { nivel: 'bloquea' | 'riesgo' | 'aviso'; tipo: string; detalle: string; arreglo: string };
type ShotPre = { label: string; nota: number; semaforo: 'verde' | 'amarillo' | 'rojo'; problemas: Issue[]; promptSugerido: string };
type Preflight = { sceneLabel: string; nota: number; listaParaGenerar: boolean; bloqueadas: string[]; tomas: ShotPre[]; fijadas: string[] };
type JobKind = 'continuidad' | 'autocorreccion' | 'musica' | 'montar' | 'voces' | 'rehacer' | 'decorado' | 'decorado-aprobar';
type Job = { kind: JobKind; running: boolean; startedAt: string; log: string; budgetUsd?: number } | null;
type SetInfo = { key: string; nombre: string; aprobado: boolean; existe: boolean } | null;
type Avance = { name: string; updatedAt: string } | null;

const JOB_NAMES: Record<JobKind, string> = {
  continuidad: 'Fotos de continuidad', autocorreccion: 'Autocorrección en vivo', musica: 'Música de la escena', montar: 'Montar el avance',
  voces: 'Voces en off', rehacer: 'Rehacer tomas', decorado: 'Plano maestro del salón', 'decorado-aprobar': 'Aprobar el salón'
};
const dot = { verde: 'bg-emerald-400', amarillo: 'bg-amber-300', rojo: 'bg-red-400' } as const;
const levelColor = { bloquea: 'text-red-300', riesgo: 'text-amber-200', aviso: 'text-slate-300' } as const;

/**
 * Todo el flujo de una escena en el estudio, sin consola.
 *  part="antes":   1 Análisis inicial · 2 Fotos de continuidad · plano maestro del salón
 *  part="despues": 4 Autocorrección · 5 Música, montar y VER el MP4 · 6 Aprobar la escena · voces en off
 * (el paso 3, «Generar escena completa», está entre los dos recuadros).
 */
export default function V7HarnessPanel({ filmId, scene, onChanged, part }: { filmId: string; scene: string; onChanged: () => void; part: 'antes' | 'despues' }) {
  const endpoint = '/api/v7/films/' + encodeURIComponent(filmId) + '/scene-studio';
  const [pre, setPre] = useState<Preflight | null>(null);
  const [job, setJob] = useState<Job>(null);
  const [setInfo, setSetInfo] = useState<SetInfo>(null);
  const [avance, setAvance] = useState<Avance>(null);
  const [budget, setBudget] = useState('5');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');

  const get = useCallback(async <T,>(query: string, field: string): Promise<T | null> => {
    const r = await fetch(endpoint + '?scene=' + scene + '&' + query, { cache: 'no-store' });
    const d = await r.json() as Record<string, unknown>;
    return d.ok ? (d[field] as T) ?? null : null;
  }, [endpoint, scene]);
  const loadJob = useCallback(async () => setJob(await get<Job>('job=1', 'job')), [get]);
  const loadMedia = useCallback(async () => {
    setSetInfo(await get<SetInfo>('decorado=info', 'decorado'));
    setAvance(await get<Avance>('avance=info', 'avance'));
  }, [get]);

  useEffect(() => { setPre(null); setMsg(''); setNote(''); void loadJob(); void loadMedia(); }, [loadJob, loadMedia]);
  const running = job?.running === true;
  useEffect(() => {
    if (!running) { void loadMedia(); return; }
    const t = setInterval(() => { void loadJob().then(onChanged); }, 5000);
    return () => clearInterval(t);
  }, [running, loadJob, loadMedia, onChanged]);

  async function analyze() {
    setBusy('pre'); setMsg('');
    try {
      const p = await get<Preflight>('preflight=1', 'preflight');
      if (!p) throw new Error('No se pudo analizar');
      setPre(p);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
  }

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label); setMsg(''); setNote('');
    try {
      await ensureLocalStudioSession();
      const r = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scene, ...body }) });
      const d = await r.json() as { ok: boolean; error?: string; result?: { applied?: string[]; fijadas?: string[]; sinVideo?: string[] } };
      if (!d.ok) throw new Error(d.error || 'Operación rechazada');
      return d;
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); return null; } finally { setBusy(''); }
  }
  async function uploadPhotos(files: File[]) {
    setBusy('fotos'); setMsg(''); setNote('Subiendo ' + files.length + ' foto(s)…');
    try {
      await ensureLocalStudioSession();
      const fd = new FormData(); fd.set('scene', scene);
      for (const f of files) fd.append('fotos', f);
      const r = await fetch(endpoint + '/fotos', { method: 'POST', credentials: 'same-origin', body: fd });
      const d = await r.json() as { ok: boolean; error?: string; results?: Array<{ name: string; shotId: string | null; ok: boolean; error?: string }> };
      if (!d.ok) throw new Error(d.error || 'No se pudieron subir');
      const ok = (d.results ?? []).filter((x) => x.ok);
      const bad = (d.results ?? []).filter((x) => !x.ok);
      setNote(`${ok.length} foto(s) colocadas: ${ok.map((x) => `${x.name} → ${x.shotId}`).join(' · ')}${bad.length ? ` · sin colocar: ${bad.map((x) => `${x.name} (${x.error})`).join(' · ')}` : ''}`);
      onChanged();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); setNote(''); } finally { setBusy(''); }
  }

  async function start(kind: JobKind, extra: Record<string, unknown> = {}) {
    const d = await post({ action: 'harness', kind, ...extra }, kind);
    if (d) { setNote(`${JOB_NAMES[kind]}: en marcha. Mira el registro de abajo (se actualiza cada 5 s).`); await loadJob(); }
  }

  const jobBox = job && (
    <div className="mt-4 rounded-xl border border-white/10 p-3">
      <p className="text-sm"><b>{JOB_NAMES[job.kind] ?? job.kind}{job.budgetUsd ? ` (tope US$${job.budgetUsd})` : ''}</b>
        {' · '}{running ? <span className="text-amber-200">trabajando…</span> : <span className="text-emerald-300">terminado</span>}</p>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{job.log || '(sin salida todavía)'}</pre>
    </div>
  );
  const messages = <>
    {msg && <p className="mt-2 rounded-lg border border-red-400/50 bg-red-500/10 p-2 text-sm text-red-200" role="alert">No se pudo: {msg}</p>}
    {note && !msg && <p className="mt-2 text-sm text-emerald-300" role="status">{note}</p>}
  </>;

  if (part === 'antes') return (
    <div className="mt-5 rounded-2xl border border-cyan-400/40 bg-cyan-500/[.05] p-4">
      <h3 className="text-lg font-black">Preparar la escena {scene} · antes de gastar</h3>
      <p className="mt-1 text-xs text-slate-300">1 → 2 → «Generar escena completa» (abajo) → 4 → 5 → 6. Ninguna toma con errores entra en la película.</p>
      {messages}

      {setInfo && <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-3">
        {setInfo.existe
          ? <a href={endpoint + '?scene=' + scene + '&decorado=1'} target="_blank" rel="noreferrer"><img alt={'Plano maestro: ' + setInfo.nombre} className="h-20 rounded-lg border border-white/20" src={endpoint + '?scene=' + scene + '&decorado=1&v=' + (job?.startedAt ?? '')}/></a>
          : <div className="flex h-20 w-36 items-center justify-center rounded-lg border border-dashed border-white/20 text-xs text-slate-400">sin plano maestro</div>}
        <div className="text-sm"><b>Decorado: {setInfo.nombre}</b><br/>
          {setInfo.aprobado ? <span className="text-emerald-300">APROBADO · todas las fotos de continuidad lo usan</span> : <span className="text-amber-200">{setInfo.existe ? 'sin aprobar: míralo y apruébalo' : 'créalo antes de las fotos de continuidad'}</span>}</div>
        <button type="button" className="button-secondary" disabled={!!busy || running} onClick={() => void start('decorado')}>{setInfo.existe ? 'Crear otro · ~US$0.04' : 'Crear plano maestro · ~US$0.04'}</button>
        {setInfo.existe && !setInfo.aprobado && <button type="button" className="button-primary" disabled={!!busy || running} onClick={() => void start('decorado-aprobar')}>Aprobar este salón</button>}
      </div>}

      <div className="mt-3 rounded-xl border border-white/10 p-3">
        <p className="text-sm"><b>Tus fotos de la escena</b> · Veo parte de ellas (no inventa la imagen). Si el nombre lleva «P03» va a esa toma; las demás se reparten en orden por las tomas sin foto tuya. Gratis.</p>
        <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple disabled={!!busy} className="mt-2 text-sm"
          onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) void uploadPhotos(files); }}/>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="button-secondary" disabled={!!busy} onClick={() => void analyze()}>
          {busy === 'pre' ? 'Analizando…' : '1 · Análisis inicial de perfección · gratis'}</button>
        <button type="button" className="button-secondary" disabled={!!busy || running} onClick={() => void start('continuidad')}>
          2 · Fotos de continuidad · ~US$0.04 c/u</button>
      </div>

      {pre && <div className="mt-4">
        <p className="text-sm">
          Nota de la escena: <b>{pre.nota}/10</b> · {pre.listaParaGenerar
            ? <span className="text-emerald-300">lista para generar</span>
            : <span className="text-red-300">NO generar aún: {pre.bloqueadas.join(', ')}</span>}
          {pre.fijadas.length > 0 && <span className="text-slate-400"> · fijadas (no se analizan): {pre.fijadas.length}</span>}
        </p>
        <ul className="mt-2 space-y-2">
          {pre.tomas.map((t) => (
            <li key={t.label} className="rounded-xl border border-white/10 p-2 text-sm">
              <div className="flex items-center gap-2"><span className={'inline-block h-3 w-3 rounded-full ' + dot[t.semaforo]}/><b>{t.label}</b><span className="text-slate-400">{t.nota}/10</span></div>
              {t.problemas.map((p, i) => <p key={i} className={'mt-1 text-xs ' + levelColor[p.nivel]}>{p.nivel.toUpperCase()} · {p.tipo}: {p.detalle} → {p.arreglo}</p>)}
            </li>
          ))}
        </ul>
        {pre.tomas.some((t) => t.promptSugerido) && <button type="button" className="button-secondary mt-3" disabled={!!busy}
          onClick={() => void post({ action: 'preflight-apply' }, 'apply').then((d) => { if (d) { onChanged(); void analyze(); } })}>
          Aplicar los arreglos sugeridos · gratis</button>}
      </div>}
      {jobBox}
    </div>
  );

  return (
    <div className="mt-5 rounded-2xl border border-emerald-400/40 bg-emerald-500/[.05] p-4">
      <h3 className="text-lg font-black">Corregir, ver y aprobar la escena {scene}</h3>
      {messages}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="button-primary" disabled={!!busy || running} onClick={() => void start('autocorreccion', { budgetUsd: Number(budget) })}>
          4 · Autocorrección en vivo</button>
        <label className="text-xs text-slate-300">tope US$
          <input className="ml-1 w-16 rounded border border-white/20 bg-slate-950 p-1 text-white" value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal"/></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="button-secondary" disabled={!!busy || running} onClick={() => void start('musica')}>5a · Música de la escena · céntimos</button>
        <button type="button" className="button-secondary" disabled={!!busy || running} onClick={() => void start('montar')}>5b · Montar el avance · gratis</button>
        <button type="button" className="button-secondary" disabled={!!busy || running} onClick={() => void start('voces')}>Voces en off (todo el episodio)</button>
      </div>

      {avance
        ? <div className="mt-4">
          <p className="text-xs text-slate-400">Avance: {avance.name} · {new Date(avance.updatedAt).toLocaleString('es')}</p>
          <video key={avance.name} controls preload="metadata" className="mt-2 w-full rounded-xl border border-white/10 bg-black"
            src={endpoint + '?scene=' + scene + '&avance=1&v=' + encodeURIComponent(avance.name)}/>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <a className="text-cyan-300 underline" href={endpoint + '?scene=' + scene + '&avance=1'} target="_blank" rel="noreferrer">Abrir el MP4 en otra pestaña</a>
            <a className="text-cyan-300 underline" href={endpoint + '?scene=' + scene + '&avance=1&descargar=1'}>Descargar al PC</a>
          </div>
        </div>
        : <p className="mt-3 text-sm text-slate-400">Aún no hay avance de {scene}: pulsa «5b · Montar el avance».</p>}

      <div className="mt-4 rounded-xl border border-emerald-400/30 p-3">
        <p className="text-sm">¿Te gusta como queda? Al aprobarla se fijan todas sus tomas: ningún agente las vuelve a tocar (las quitadas siguen fuera).</p>
        <button type="button" className="button-primary mt-2" disabled={!!busy}
          onClick={() => void post({ action: 'approve-scene' }, 'approve').then((d) => { if (d) { const r = d.result as { fijadas?: string[]; sinVideo?: string[] } | undefined; setNote(`${scene}: ${r?.fijadas?.length ?? 0} tomas aprobadas y fijadas.` + (r?.sinVideo?.length ? ` Sin video todavía (no se pueden aprobar): ${r.sinVideo.join(', ')}.` : ' ESCENA COMPLETA APROBADA: se monta sola y aparece arriba para verla.')); onChanged(); } })}>
          6 · Aprobar escena completa {scene}</button>
      </div>
      {jobBox}
    </div>
  );
}
