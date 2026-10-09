'use client';

import { useEffect, useState } from 'react';
import { Film, Layers3, RefreshCw, ShieldCheck } from 'lucide-react';

type FeatureScene = {
  id: string; title: string; seconds: number;
  shots: Array<{ id: string; seconds: number; providerSeconds: number }>;
};
type FeatureAct = {
  number: number; title: string; dramaticPurpose: string; seconds: number;
  scenes: FeatureScene[];
};
type FeaturePlan = {
  level: 2; targetMinutes: number; targetSeconds: number;
  totalScenes: number; totalShots: number; providerVideoSecondsEstimate: number;
  totalEstimatedVideoCostUsd: number | null;
  audioSecondsRequired: number; status: string; acts: FeatureAct[];
  gates: string[]; excludes: string[];
};
type PlanResponse = {
  ok: boolean;
  currentFilm: { title: string; existingSceneCount: number; currentDurationMinutes: number };
  plan: FeaturePlan;
  error?: string;
};

const LENGTHS = [4, 15, 30, 60, 90] as const;

export default function V7FeatureFilmPlanner({ filmId }: { filmId: string }) {
  const [minutes, setMinutes] = useState<(typeof LENGTHS)[number]>(15);
  const [data, setData] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const url = '/api/v7/films/' + encodeURIComponent(filmId) +
          '/feature-plan?minutes=' + minutes;
        const result = await fetch(url, { cache: 'no-store', signal: controller.signal });
        const response = await result.json() as PlanResponse;
        if (!result.ok || !response.ok) throw new Error(response.error || 'Error de planificación');
        if (!controller.signal.aborted) setData(response);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [filmId, minutes]);

  const plan = data?.plan;

  return (
    <section className="mt-6 space-y-5">
      <header className="panel rounded-3xl p-6 md:p-8">
        <div className="flex items-center gap-3">
          <Layers3 className="h-6 w-6 text-violet-300" />
          <h2 className="text-2xl font-black">Nivel 2 · Producción de larga duración</h2>
        </div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
          Construimos una película desde actos y escenas, no desde ejecuciones manuales sueltas.
          Este es el plan estructural; cada guion, personaje y toma todavía deberá desarrollarse
          y aprobarse antes de usar modelos de video.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {LENGTHS.map((value) => (
            <button key={value} type="button"
              onClick={() => setMinutes(value)}
              aria-pressed={minutes === value}
              className={minutes === value
                ? 'rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white'
                : 'rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-300 hover:bg-white/10'}>
              {value} min
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-emerald-300">
          <ShieldCheck className="h-4 w-4" /> Sin generación pagada · No modifica «15 DÍAS»
        </div>
        {loading && <p className="mt-3 flex items-center gap-2 text-sm text-slate-300">
          <RefreshCw className="h-4 w-4 animate-spin" /> Recalculando estructura…
        </p>}
        {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
      </header>

      {plan && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric title="Duración objetivo" value={plan.targetMinutes + ' minutos'} />
            <Metric title="Escenas por escribir" value={String(plan.totalScenes)} />
            <Metric title="Tomas a producir" value={String(plan.totalShots)} />
            <Metric title="Video teórico de proveedor" value={Math.ceil(plan.providerVideoSecondsEstimate / 60) + ' min'} />
          </div>
          <section className="panel rounded-3xl p-6">
            <div className="flex items-center gap-2">
              <Film className="h-5 w-5 text-violet-300" />
              <h3 className="text-xl font-bold">Estructura de tres actos</h3>
            </div>
            <div className="mt-4 space-y-4">
              {plan.acts.map((act) => (
                <div key={act.number} className="rounded-2xl border border-white/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-violet-300">
                        Acto {act.number}
                      </div>
                      <div className="mt-1 text-lg font-bold">{act.title}</div>
                      <p className="mt-1 text-sm text-slate-400">{act.dramaticPurpose}</p>
                    </div>
                    <span className="text-sm text-slate-300">
                      {(act.seconds / 60).toFixed(1)} min · {act.scenes.length} escenas
                    </span>
                  </div>
                  <details className="mt-3 text-sm text-slate-300">
                    <summary className="cursor-pointer text-violet-200">Ver escenas y tomas planificadas</summary>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {act.scenes.map((scene) => (
                        <div key={scene.id} className="rounded-lg bg-slate-950/40 px-3 py-2">
                          <span className="font-semibold">{scene.id}</span>
                          <span className="ml-2 text-slate-400">
                            {scene.seconds}s · {scene.shots.length} tomas
                          </span>
                          <p className="mt-1 text-xs text-amber-200">Guion y continuidad pendientes</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </section>
          <section className="panel rounded-3xl p-6">
            <h3 className="text-xl font-bold">Presupuesto y autorizaciones</h3>
            <p className="mt-2 text-sm text-slate-300">
              Estimación de video:
              {' '}{plan.totalEstimatedVideoCostUsd === null
                ? 'sin cotizar; verifica la tarifa del modelo en tu cuenta.'
                : 'US$ ' + plan.totalEstimatedVideoCostUsd.toFixed(2) + ' (solo video, tarifa configurada).'}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              No incluye audio, imágenes, edición, reintentos ni impuestos.
              El cálculo no reserva dinero ni garantiza un tope del proveedor.
            </p>
            <h4 className="mt-5 text-sm font-bold">Antes de autorizar producción:</h4>
            <ul className="mt-2 list-inside list-disc space-y-2 text-sm text-slate-300">
              {plan.gates.map((gate) => <li key={gate}>{gate}</li>)}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="panel rounded-2xl p-4">
      <p className="text-xs text-slate-400">{title}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}
