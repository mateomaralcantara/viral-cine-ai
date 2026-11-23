'use client';
import { useCallback, useEffect, useState } from 'react';

type SceneState = { label: string; titulo: string; total: number; fijadas: number; quitadas: number; verde: boolean; avance: string | null; avanceAlDia: boolean; montando: boolean };
type Estado = { scenes: SceneState[]; episodio: { verde: boolean; archivo: string | null; alDia: boolean; montando: boolean } };

/**
 * ESCENAS EN VERDE: cuando todas las tomas de una escena están fijadas (o quitadas por el autor),
 * la escena se monta sola (gratis) y se puede ver completa aquí. Con todas en verde, el episodio entero.
 */
export default function V7GreenPanel({ filmId, scene, onSelect }: { filmId: string; scene: string; onSelect: (s: string) => void }) {
  const endpoint = '/api/v7/films/' + encodeURIComponent(filmId) + '/scene-studio';
  const [estado, setEstado] = useState<Estado | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(endpoint + '?estado=1', { cache: 'no-store' }).catch(() => null);
    const d = r ? await r.json() as { ok: boolean; estado?: Estado } : null;
    if (d?.ok && d.estado) setEstado(d.estado);
  }, [endpoint]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);
  if (!estado) return null;

  const cur = estado.scenes.find((s) => s.label === scene);
  const greens = estado.scenes.filter((s) => s.verde).length;
  const ep = estado.episodio;
  return (
    <div className="mt-4 rounded-2xl border border-emerald-400/40 bg-emerald-500/[.06] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-black">Episodio: {greens}/{estado.scenes.length} escenas en verde</h3>
        <span className="text-xs text-slate-300">Verde = todas sus tomas aprobadas y FIJADAS: nadie las vuelve a tocar. Se montan solas, gratis.</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {estado.scenes.map((s) => (
          <button key={s.label} type="button" onClick={() => onSelect(s.label)} title={s.titulo}
            className={'rounded-xl border px-3 py-1 text-sm font-bold ' + (s.verde ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200' : 'border-white/15 text-slate-300') + (s.label === scene ? ' ring-2 ring-white/60' : '')}>
            {s.verde ? '✓ ' : ''}{s.label} <span className="font-normal opacity-80">{s.fijadas + s.quitadas}/{s.total}</span>
          </button>
        ))}
      </div>

      {cur && (cur.verde
        ? <div className="mt-4">
          <p className="text-sm font-bold text-emerald-300">ESCENA {cur.label} EN VERDE · {cur.titulo}</p>
          {cur.avance && cur.avanceAlDia
            ? <><video key={cur.avance} controls preload="metadata" className="mt-2 w-full rounded-xl border border-white/10 bg-black"
                src={endpoint + '?scene=' + cur.label + '&avance=1&v=' + encodeURIComponent(cur.avance)}/>
              <a className="mt-1 inline-block text-xs text-cyan-300 underline" href={endpoint + '?scene=' + cur.label + '&avance=1'} target="_blank" rel="noreferrer">Ver escena completa en otra pestaña</a></>
            : <p className="mt-2 text-sm text-amber-200">Montando la escena completa (gratis)… aparecerá aquí en un par de minutos.</p>}
        </div>
        : <p className="mt-3 text-sm text-slate-300">{cur.label}: {cur.fijadas + cur.quitadas} de {cur.total} tomas en verde. Cuando estén todas, la escena se monta sola y se ve aquí.</p>)}

      {ep.verde && <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-sm font-bold text-emerald-300">EPISODIO COMPLETO EN VERDE</p>
        {ep.archivo && ep.alDia && !ep.montando
          ? <><video key={ep.archivo} controls preload="metadata" className="mt-2 w-full rounded-xl border border-white/10 bg-black"
              src={endpoint + '?episodio=1&v=' + encodeURIComponent(ep.archivo)}/>
            <a className="mt-1 inline-block text-xs text-cyan-300 underline" href={endpoint + '?episodio=1'} target="_blank" rel="noreferrer">Ver episodio completo en otra pestaña</a></>
          : <p className="mt-2 text-sm text-amber-200">Montando el episodio completo con créditos y subtítulos (gratis)… puede tardar 10–20 min.</p>}
      </div>}
    </div>
  );
}
