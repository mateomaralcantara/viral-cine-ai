'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Film,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck
} from 'lucide-react';

type Stage = {
  id: string;
  label: string;
  status: 'pending' | 'ready' | 'in-progress' | 'blocked' | 'approved';
  notes: string[];
};

type Bundle = {
  film: {
    id: string;
    title: string;
    premise: string;
    durationMinutes: number;
    genre: string;
    aspectRatio: string;
    language: string;
    budgetUsd: number;
    legacyProjectId?: string;
    metadata: Record<string, unknown>;
  };
  workflow?: { stages: Stage[] };
  creationInput?: { quality?: string };
  assets: unknown[];
  voiceProfiles: unknown[];
};

export default function V7FilmWorkspace({ filmId }: { filmId: string }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/v7/films/' + encodeURIComponent(filmId), { cache: 'no-store' });
        const body = await response.json() as { ok?: boolean; bundle?: Bundle; error?: string };
        if (!response.ok || !body.ok || !body.bundle) throw new Error(body.error || 'No se pudo abrir la película.');
        setBundle(body.bundle);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    })();
  }, [filmId]);

  if (error) {
    return <main className="mx-auto max-w-4xl p-8"><div className="panel rounded-3xl p-6 text-red-300">{error}</div></main>;
  }
  if (!bundle) {
    return <main className="flex min-h-screen items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-violet-300" /></main>;
  }

  const stages = bundle.workflow?.stages || [];
  const next = stages.find((stage) => stage.status === 'ready' || stage.status === 'in-progress');

  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-4 py-6 md:px-8">
      <header className="panel rounded-3xl p-6 md:p-8">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Películas V7
        </a>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 text-violet-300">
              <Film className="h-5 w-5" />
              <span className="text-xs font-black uppercase tracking-[.22em]">ViralCine 7</span>
            </div>
            <h1 className="mt-2 text-3xl font-black md:text-5xl">{bundle.film.title}</h1>
            <p className="mt-3 max-w-4xl leading-7 text-slate-400">{bundle.film.premise}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[.08] px-4 py-3 text-sm font-bold text-emerald-300">
            <ShieldCheck className="mr-2 inline h-4 w-4" />
            PRODUCCIÓN AÚN BLOQUEADA
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <Pill>{bundle.film.durationMinutes} min</Pill>
          <Pill>{bundle.film.genre}</Pill>
          <Pill>{bundle.film.aspectRatio}</Pill>
          <Pill>{bundle.film.language === 'es' ? 'Español' : bundle.film.language}</Pill>
          <Pill>{'US$' + bundle.film.budgetUsd.toFixed(2)}</Pill>
          <Pill>{String(bundle.creationInput?.quality || bundle.film.metadata.qualityPreset || 'cine').toUpperCase()}</Pill>
          {bundle.film.legacyProjectId && <Pill>MIGRADA DESDE V6</Pill>}
        </div>
      </header>

      {next && (
        <section className="mt-6 rounded-3xl border border-violet-400/20 bg-violet-500/[.07] p-5">
          <div className="text-xs font-black uppercase tracking-wider text-violet-300">Siguiente área</div>
          <div className="mt-1 text-2xl font-black">{next.label}</div>
          <p className="mt-2 text-sm text-slate-400">
            Esta área será endurecida individualmente antes de habilitar la siguiente.
          </p>
        </section>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stages.map((stage, index) => (
          <div key={stage.id} className="panel rounded-3xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/[.04] text-sm font-black text-slate-300">
                {index + 1}
              </div>
              <StageIcon status={stage.status} />
            </div>
            <div className="mt-4 text-lg font-black">{stage.label}</div>
            <div className="mt-2 text-xs font-black uppercase tracking-wider text-slate-500">
              {stage.status}
            </div>
            {stage.notes.length > 0 && (
              <div className="mt-3 text-xs leading-5 text-slate-500">{stage.notes.join(' · ')}</div>
            )}
          </div>
        ))}
      </section>

      <section className="panel mt-6 rounded-3xl p-5 md:p-6">
        <div className="flex items-center gap-3">
          <LockKeyhole className="h-5 w-5 text-amber-300" />
          <h2 className="text-xl font-black">Regla V7</h2>
        </div>
        <p className="mt-3 leading-7 text-slate-400">
          Ninguna fase de generación pagada debe abrirse hasta que las áreas anteriores tengan preflight, persistencia,
          recuperación, QA y aprobación. El objetivo es resolver los errores en el módulo, no durante la película.
        </p>
      </section>
    </main>
  );
}

function StageIcon({ status }: { status: Stage['status'] }) {
  if (status === 'approved') return <CheckCircle2 className="h-5 w-5 text-emerald-300" />;
  if (status === 'ready' || status === 'in-progress') return <CircleDot className="h-5 w-5 text-violet-300" />;
  return <LockKeyhole className="h-5 w-5 text-slate-600" />;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 font-bold text-slate-400">{children}</span>;
}
