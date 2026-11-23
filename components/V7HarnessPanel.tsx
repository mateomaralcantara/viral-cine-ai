'use client';
import { useCallback, useEffect, useState } from 'react';
import { ensureLocalStudioSession } from '@/lib/v7/security/local-studio-client';

type Issue = { nivel: 'bloquea' | 'riesgo' | 'aviso'; tipo: string; detalle: string; arreglo: string };
type ShotPre = { label: string; nota: number; semaforo: 'verde' | 'amarillo' | 'rojo'; problemas: Issue[]; promptSugerido: string };
type Preflight = { sceneLabel: string; nota: number; listaParaGenerar: boolean; bloqueadas: string[]; tomas: ShotPre[]; fijadas: string[] };
type Job = { kind: 'continuidad' | 'autocorreccion'; running: boolean; startedAt: string; log: string; budgetUsd?: number } | null;

const dot = { verde: 'bg-emerald-400', amarillo: 'bg-amber-300', rojo: 'bg-red-400' } as const;
const levelColor = { bloquea: 'text-red-300', riesgo: 'text-amber-200', aviso: 'text-slate-300' } as const;

/**
 * Los tres harness antes y durante la generación de una escena:
 * 1) Análisis inicial de perfección (gratis), 2) Fotos de continuidad, 3) Autocorrección en vivo con puerta de calidad.
 */
export default function V7HarnessPanel({ filmId, scene, onChanged }: { filmId: string; scene: string; onChanged: () => void }) {
  const endpoint = '/api/v7/films/' + encodeURIComponent(filmId) + '/scene-studio';
  const [pre, setPre] = useState<Preflight | null>(null);
  const [job, setJob] = useState<Job>(null);
  const [budget, setBudget] = useState('5');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const loadJob = useCallback(async () => {
    const r = await fetch(endpoint + '?scene=' + scene + '&job=1', { cache: 'no-store' });
    const d = await r.json() as { ok: boolean; job?: Job };
    if (d.ok) setJob(d.job ?? null);
  }, [endpoint, scene]);

  useEffect(() => { setPre(null); setMsg(''); void loadJob(); }, [loadJob]);
  useEffect(() => {
    if (!job?.running) return;
    const t = setInterval(() => { void loadJob().then(onChanged); }, 5000);
    return () => clearInterval(t);
  }, [job?.running, loadJob, onChanged]);

  async function analyze() {
    setBusy('pre'); setMsg('');
    try {
      const r = await fetch(endpoint + '?scene=' + scene + '&preflight=1', { cache: 'no-store' });
      const d = await r.json() as { ok: boolean; preflight?: Preflight; error?: string };
      if (!d.ok || !d.preflight) throw new Error(d.error || 'No se pudo analizar');
      setPre(d.preflight);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
  }

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label); setMsg('');
    try {
      await ensureLocalStudioSession();
      const r = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scene, ...body }) });
      const d = await r.json() as { ok: boolean; error?: string; result?: { applied?: string[] } };
      if (!d.ok) throw new Error(d.error || 'Operación rechazada');
      return d;
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); return null; } finally { setBusy(''); }
  }

  const running = job?.running === true;
  return (
    <div className="mt-5 rounded-2xl border border-cyan-400/40 bg-cyan-500/[.05] p-4">
      <h3 className="text-lg font-black">Harness de la escena {scene}</h3>
      <p className="mt-1 text-xs text-slate-300">Orden recomendado: 1 → 2 → generar la escena → 3. Ninguna toma con errores entra en la película.</p>
      {msg && <p className="mt-2 text-sm text-red-300" role="alert">{msg}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="button-secondary" disabled={!!busy} onClick={() => void analyze()}>
          {busy === 'pre' ? 'Analizando…' : '1 · Análisis inicial de perfección · gratis'}</button>
        <button type="button" className="button-secondary" disabled={!!busy || running}
          onClick={() => void post({ action: 'harness', kind: 'continuidad' }, 'cont').then((d) => d && loadJob())}>
          2 · Fotos de continuidad · ~US$0.04 c/u</button>
        <span className="flex items-center gap-2">
          <button type="button" className="button-primary" disabled={!!busy || running}
            onClick={() => void post({ action: 'harness', kind: 'autocorreccion', budgetUsd: Number(budget) }, 'auto').then((d) => d && loadJob())}>
            3 · Autocorrección en vivo</button>
          <label className="text-xs text-slate-300">tope US$
            <input className="ml-1 w-16 rounded border border-white/20 bg-slate-950 p-1 text-white" value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal"/>
          </label>
        </span>
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
          onClick={() => void post({ action: 'preflight-apply' }, 'apply').then((d) => { if (d) { setMsg(''); onChanged(); void analyze(); } })}>
          Aplicar los arreglos sugeridos · gratis</button>}
      </div>}

      {job && <div className="mt-4 rounded-xl border border-white/10 p-3">
        <p className="text-sm"><b>{job.kind === 'continuidad' ? 'Fotos de continuidad' : `Autocorrección en vivo (tope US$${job.budgetUsd ?? 0})`}</b>
          {' · '}{running ? <span className="text-amber-200">trabajando…</span> : <span className="text-emerald-300">terminado</span>}</p>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{job.log || '(sin salida todavía)'}</pre>
      </div>}
    </div>
  );
}
