'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CircleDollarSign,
  Clapperboard,
  LoaderCircle,
  ShieldAlert,
  ShieldCheck,
  Video
} from 'lucide-react';
import type { FilmProject } from '@/lib/domain/schemas';

type SystemLike = {
  mode?: 'demo' | 'real';
  paidGenerationEnabled?: boolean;
  safetyReason?: string;
  ffmpeg?: boolean;
  veo?: boolean;
  fal?: boolean;
};

type CheckRow = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

type ShotOnePreflight = {
  shotId: string;
  shotTitle: string;
  sceneOrder: number;
  shotOrder: number;
  durationSeconds: number;
  estimatedUsd: number;
  hardCapUsd: number;
  ready: boolean;
  safetyReady: boolean;
  providerReady: boolean;
  checks: CheckRow[];
  primaryProvider?: string;
  fallbackProvider?: string;
};

export default function PilotShotOnePanel({
  project,
  system,
  locked,
  onProjectChange
}: {
  project: FilmProject;
  system: SystemLike | null;
  locked: boolean;
  onProjectChange: (project: FilmProject) => void;
}) {
  const [preflight, setPreflight] = useState<ShotOnePreflight | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/projects/${project.id}/pilot-shot-one`,
        { cache: 'no-store' }
      );
      const data = await response.json() as {
        ok: boolean;
        error?: string;
        preflight?: ShotOnePreflight;
        armed?: boolean;
      };

      if (!response.ok || !data.ok || !data.preflight) {
        throw new Error(data.error || 'No se pudo ejecutar el preflight.');
      }

      setPreflight(data.preflight);
      setArmed(Boolean(data.armed));
      setError('');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Error desconocido'
      );
    }
  }, [project.id]);

  useEffect(() => {
    void refresh();
  }, [refresh, project.updatedAt, system?.paidGenerationEnabled]);

  async function arm() {
    setBusy('arm');
    setError('');

    try {
      const response = await fetch(
        `/api/projects/${project.id}/pilot-shot-one`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'arm' }),
          cache: 'no-store'
        }
      );
      const data = await response.json() as {
        ok: boolean;
        error?: string;
        project?: FilmProject;
        preflight?: ShotOnePreflight;
        armed?: boolean;
      };

      if (!response.ok || !data.ok || !data.project || !data.preflight) {
        throw new Error(data.error || 'No se pudo armar la Toma 1.');
      }

      setPreflight(data.preflight);
      setArmed(Boolean(data.armed));
      onProjectChange(data.project);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Error desconocido'
      );
    } finally {
      setBusy('');
    }
  }

  async function generateOnlyShotOne() {
    if (!preflight || !armed) return;

    const confirmed = window.confirm(
      `Generar SOLO la Toma 1 “${preflight.shotTitle}” con un tope preventivo de US$${preflight.hardCapUsd.toFixed(2)}?\n\nNo se generarán las otras 7 tomas.`
    );

    if (!confirmed) return;

    setBusy('generate');
    setError('');

    try {
      const response = await fetch(
        `/api/projects/${project.id}/produce`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'start' }),
          cache: 'no-store'
        }
      );
      const data = await response.json() as {
        ok: boolean;
        error?: string;
        project?: FilmProject;
      };

      if (!response.ok || !data.ok || !data.project) {
        throw new Error(data.error || 'No se pudo iniciar la Toma 1.');
      }

      onProjectChange(data.project);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Error desconocido'
      );
    } finally {
      setBusy('');
    }
  }

  if (!preflight && !error) {
    return (
      <section className="panel rounded-3xl p-5 md:p-6">
        <div className="flex items-center gap-3 text-slate-400">
          <LoaderCircle className="h-5 w-5 animate-spin" />
          Ejecutando preflight final de la Toma 1…
        </div>
      </section>
    );
  }

  return (
    <section className="panel rounded-3xl p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-500/10">
            <Clapperboard className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">
              PUNTO 4 · SINGLE SHOT GATE
            </div>
            <h2 className="mt-1 text-xl font-black">
              Toma 1 · La moneda
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Preflight final y autorización controlada. Solo E1/T1 puede entrar
              a producción; las otras siete tomas permanecen bloqueadas.
            </p>
          </div>
        </div>

        {preflight && (
          <div
            className={`w-fit rounded-2xl border px-4 py-3 text-sm font-black ${
              preflight.ready
                ? 'border-emerald-400/25 bg-emerald-500/[.08] text-emerald-300'
                : 'border-amber-400/25 bg-amber-500/[.08] text-amber-200'
            }`}
          >
            {preflight.ready ? 'PREFLIGHT LISTO' : 'PREFLIGHT BLOQUEADO'}
          </div>
        )}
      </div>

      {preflight && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Mini
              label="Duración"
              value={`${preflight.durationSeconds}s`}
            />
            <Mini
              label="Ruta"
              value={`${providerName(preflight.primaryProvider)} → ${providerName(preflight.fallbackProvider)}`}
            />
            <Mini
              label="Estimado"
              value={`US$${preflight.estimatedUsd.toFixed(2)}`}
            />
            <Mini
              label="Tope duro"
              value={`US$${preflight.hardCapUsd.toFixed(2)}`}
            />
          </div>

          <div className="mt-5 grid gap-2 lg:grid-cols-2">
            {preflight.checks.map((check) => (
              <div
                key={check.id}
                className={`flex items-start gap-3 rounded-2xl border p-3 ${
                  check.passed
                    ? 'border-emerald-400/15 bg-emerald-500/[.035]'
                    : 'border-amber-400/20 bg-amber-500/[.05]'
                }`}
              >
                {check.passed ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                )}
                <div>
                  <div className="text-xs font-black text-slate-200">
                    {check.label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    {check.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!system?.paidGenerationEnabled && (
            <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/[.06] p-4 text-sm leading-6 text-amber-100/80">
              <strong>OFFLINE SEGURO sigue activo.</strong>{' '}
              El preflight puede revisarse sin costo, pero ViralCine no permitirá
              generar video hasta que la producción pagada sea autorizada
              explícitamente.
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="button-secondary"
              disabled={busy !== ''}
              onClick={() => void refresh()}
            >
              <ShieldCheck className="h-4 w-4" />
              Revisar preflight
            </button>

            {!armed && (
              <button
                type="button"
                className="button-primary"
                disabled={!preflight.ready || locked || busy !== ''}
                onClick={arm}
              >
                {busy === 'arm'
                  ? <LoaderCircle className="h-4 w-4 animate-spin" />
                  : <CircleDollarSign className="h-4 w-4" />}
                Armar Toma 1 · máx US$ {preflight.hardCapUsd.toFixed(2)}
              </button>
            )}

            {armed && (
              <button
                type="button"
                className="button-primary"
                disabled={
                  !preflight.ready ||
                  !system?.paidGenerationEnabled ||
                  locked ||
                  busy !== ''
                }
                onClick={generateOnlyShotOne}
              >
                {busy === 'generate'
                  ? <LoaderCircle className="h-4 w-4 animate-spin" />
                  : <Video className="h-4 w-4" />}
                GENERAR SOLO TOMA 1
              </button>
            )}
          </div>

          {armed && (
            <div className="mt-4 text-xs font-bold text-emerald-300">
              Piloto armado: 1 escena · 1 toma · tope US$
              {preflight.hardCapUsd.toFixed(2)}.
            </div>
          )}
        </>
      )}

      {!preflight && error && (
        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-600">
        {label}
      </div>
      <div className="mt-2 text-sm font-black text-slate-200">
        {value}
      </div>
    </div>
  );
}

function providerName(provider?: string) {
  if (provider === 'veo') return 'Veo';
  if (provider === 'fal-video') return 'Fal';
  return provider || '—';
}
