'use client';

import { useEffect, useMemo, useState } from 'react';
import V7CinemaProductionPanel from '@/components/V7CinemaProductionPanel';
import V7FeatureFilmPlanner from '@/components/V7FeatureFilmPlanner';
import V7ClosedCutPlayer from '@/components/V7ClosedCutPlayer';
import V7DosToquesMusicPanel from '@/components/V7DosToquesMusicPanel';
import V7DosToquesCastingPanel from '@/components/V7DosToquesCastingPanel';
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Clapperboard,
  Download,
  Film,
  Layers3,
  LoaderCircle,
  LockKeyhole,
  Music2,
  Play,
  ShieldCheck,
  Video
} from 'lucide-react';

type Stage = {
  id: string;
  label: string;
  status: 'pending' | 'ready' | 'in-progress' | 'blocked' | 'approved';
  notes: string[];
};

type Take = {
  id: string;
  version: number;
  status: string;
  provider?: string;
  providerModel?: string;
  videoAssetId?: string;
  qualityScore?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
};

type Shot = {
  id: string;
  order: number;
  title: string;
  durationSeconds: number;
  strategy: string;
  selectedTakeId?: string;
  takes: Take[];
};

type Scene = {
  id: string;
  order: number;
  title: string;
  summary: string;
  durationSeconds: number;
  shots: Shot[];
  metadata?: Record<string, unknown>;
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
    acts: Array<{
      id: string;
      order: number;
      title: string;
      sequences: Array<{
        id: string;
        order: number;
        title: string;
        scenes: Scene[];
      }>;
    }>;
  };
  workflow?: { stages: Stage[] };
  creationInput?: { quality?: string };
  assets: Array<{
    id: string;
    type: string;
    storagePath: string;
    approved: boolean;
    source?: string;
    shotId?: string;
    takeId?: string;
    provider?: string;
  }>;
  voiceProfiles: unknown[];
};

type Tab = 'overview' | 'scenes' | 'takes' | 'production' | 'feature' | 'music' | 'casting' | 'master';

export default function V7FilmWorkspace({ filmId }: { filmId: string }) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [previewMediaId, setPreviewMediaId] = useState<string | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested === 'scenes' || requested === 'takes' || requested === 'production' || requested === 'feature' || requested === 'music' || requested === 'casting' || requested === 'master' || requested === 'overview') {
      setTab(requested);
    }
  }, []);

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

  const scenes = useMemo(() => bundle
    ? bundle.film.acts.flatMap((act) => act.sequences.flatMap((sequence) => sequence.scenes))
    : [], [bundle]);

  const shots = useMemo(() => scenes.flatMap((scene) =>
    scene.shots.map((shot) => ({ ...shot, sceneTitle: scene.title, sceneOrder: scene.order }))
  ), [scenes]);

  const takes = useMemo(() => shots.flatMap((shot) =>
    shot.takes.map((take) => ({
      ...take,
      shotTitle: shot.title,
      shotOrder: shot.order,
      sceneTitle: shot.sceneTitle,
      sceneOrder: shot.sceneOrder,
      selected: shot.selectedTakeId === take.id
    }))
  ), [shots]);

  if (error) {
    return <main className="mx-auto max-w-4xl p-8"><div className="panel rounded-3xl p-6 text-red-300">{error}</div></main>;
  }
  if (!bundle) {
    return <main className="flex min-h-screen items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-violet-300" /></main>;
  }

  const stages = bundle.workflow?.stages || [];
  const next = stages.find((stage) => stage.status === 'ready' || stage.status === 'in-progress');
  const hasApprovedV7Master = bundle.assets.some((asset) => asset.type === 'master' && asset.approved && asset.source !== 'legacy-v6');
  const hasMaster = bundle.assets.some((asset) => asset.type === 'master' && asset.approved) ||
    typeof bundle.film.metadata.originalFinalVideoAsset === 'string';
  const masterUrl = '/api/v7/films/' + encodeURIComponent(filmId) + '/media/master';
  const hasLibrosellerPackage = filmId === 'v7-film-01db01f78f6c0e5afee6';
  const hasDosToquesProject = filmId === 'film-dos-toques-de-bocina-v7';

  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-4 py-6 md:px-8">
      <header className="panel rounded-3xl p-6 md:p-8">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Mis películas
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
          <div className={
            'rounded-2xl border px-4 py-3 text-sm font-bold ' +
            (hasMaster
              ? 'border-emerald-400/20 bg-emerald-500/[.08] text-emerald-300'
              : 'border-amber-400/20 bg-amber-500/[.08] text-amber-300')
          }>
            {hasMaster ? <CheckCircle2 className="mr-2 inline h-4 w-4" /> : <ShieldCheck className="mr-2 inline h-4 w-4" />}
            {hasApprovedV7Master ? 'PELÍCULA V7 APROBADA' : hasMaster ? 'MASTER ORIGINAL V6' : 'PRODUCCIÓN PROTEGIDA'}
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
          <Pill>{scenes.length} escenas</Pill>
          <Pill>{shots.length} shots</Pill>
          <Pill>{takes.length} takes</Pill>
        </div>
      </header>

      <nav className="panel mt-6 flex flex-wrap gap-2 rounded-2xl p-2">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={<Film className="h-4 w-4" />}>Resumen</TabButton>
        <TabButton active={tab === 'scenes'} onClick={() => setTab('scenes')} icon={<Layers3 className="h-4 w-4" />}>Escenas</TabButton>
        <TabButton active={tab === 'takes'} onClick={() => setTab('takes')} icon={<Video className="h-4 w-4" />}>Tomas</TabButton>
        <TabButton active={tab === 'production'} onClick={() => setTab('production')} icon={<Clapperboard className="h-4 w-4" />}>Producción</TabButton>
        <TabButton active={tab === 'feature'} onClick={() => setTab('feature')} icon={<Layers3 className="h-4 w-4" />}>Nivel 2 · Largometrajes</TabButton>
        {hasDosToquesProject && (
          <TabButton active={tab === 'casting'} onClick={() => setTab('casting')} icon={<ShieldCheck className="h-4 w-4" />}>Casting visual</TabButton>
        )}
        {hasDosToquesProject && (
          <TabButton active={tab === 'music'} onClick={() => setTab('music')} icon={<Music2 className="h-4 w-4" />}>Música emotiva</TabButton>
        )}
        <TabButton active={tab === 'master'} onClick={() => setTab('master')} icon={<Play className="h-4 w-4" />}>Película final</TabButton>
      </nav>

      {tab === 'overview' && (
        <>
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
                <div className="mt-2 text-xs font-black uppercase tracking-wider text-slate-500">{stage.status}</div>
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
        </>
      )}

      {tab === 'production' && (hasLibrosellerPackage
        ? <V7CinemaProductionPanel filmId={filmId} />
        : <section className="panel mt-6 rounded-3xl p-6">
            <h2 className="text-2xl font-bold">Producción de película nueva</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Este proyecto es independiente de 15 DÍAS. Primero desarrolla y aprueba su guion,
              personajes y referencias. El ejecutor de siete tomas de Libroseller pertenece
              exclusivamente a la película anterior y no se reutilizará en esta.
            </p>
            <p className="mt-3 text-sm text-amber-300">
              Generación pagada aún no configurada para este nuevo proyecto. No se ha creado video.
            </p>
            <a href={'/v7/films/' + encodeURIComponent(filmId) + '?tab=feature'}
              className="button-secondary mt-4">Ver planificación de 10 minutos</a>
          </section>)}

      {tab === 'feature' && <V7FeatureFilmPlanner filmId={filmId} />}

      {tab === 'music' && hasDosToquesProject && <V7DosToquesMusicPanel filmId={filmId} />}

      {tab === 'casting' && hasDosToquesProject && <V7DosToquesCastingPanel filmId={filmId} />}

      {tab === 'master' && <V7ClosedCutPlayer filmId={filmId} />}

      {tab === 'master' && (
        <section id="master" className="panel mt-6 rounded-3xl p-5 md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-emerald-300">{hasApprovedV7Master ? 'Master final V7' : 'Master original / legado'}</div>
              <h2 className="mt-1 text-2xl font-black">{bundle.film.title}</h2>
            </div>
            {hasMaster && (
              <a className="button-secondary" href={masterUrl + '?download=1'}>
                <Download className="h-4 w-4" /> Descargar MP4
              </a>
            )}
          </div>

          {hasMaster ? (
            <div className="mt-5 overflow-hidden rounded-3xl border border-white/10 bg-black">
              <video className="aspect-video w-full bg-black" controls preload="metadata" src={masterUrl}>
                Tu navegador no puede reproducir este video.
              </video>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-500">
              Esta película todavía no tiene un master final registrado.
            </div>
          )}
        </section>
      )}

      {tab === 'scenes' && (
        <section className="mt-6 space-y-4">
          {scenes.length === 0 && <Empty message="Todavía no hay escenas planificadas." />}
          {scenes.map((scene) => (
            <article key={scene.id} className="panel rounded-3xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-violet-300">Escena {scene.order}</div>
                  <h2 className="mt-1 text-xl font-black">{scene.title}</h2>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">{scene.summary}</p>
                </div>
                <div className="rounded-xl bg-white/[.04] px-3 py-2 text-xs text-slate-400">
                  {scene.durationSeconds}s · {scene.shots.length} shots
                </div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {scene.shots.map((shot) => (
                  <div key={shot.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-black text-slate-500">TOMA {shot.order}</div>
                    <div className="mt-1 font-bold">{shot.title}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      {shot.durationSeconds}s · {shot.takes.length} take(s)
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === 'takes' && (
        <section className="mt-6">
          {previewMediaId && (
            <div className="panel mb-5 rounded-3xl p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-black">Vista previa de toma</h2>
                <button className="text-sm font-bold text-slate-400 hover:text-white" onClick={() => setPreviewMediaId(null)}>
                  Cerrar
                </button>
              </div>
              <video
                className="aspect-video w-full rounded-2xl bg-black"
                controls
                autoPlay
                preload="metadata"
                src={'/api/v7/films/' + encodeURIComponent(filmId) + '/media/' + encodeURIComponent(previewMediaId)}
              />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {takes.length === 0 && <Empty message="Todavía no hay takes generados o migrados." />}
            {takes.map((take) => (
              <article key={take.id} className="panel rounded-3xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-violet-300">
                      Escena {take.sceneOrder} · Toma {take.shotOrder} · Take v{take.version}
                    </div>
                    <h3 className="mt-1 font-black">{take.sceneTitle} · {take.shotTitle}</h3>
                  </div>
                  {take.selected && (
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-300">
                      SELECCIONADO
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div>Estado: <span className="text-slate-300">{take.status}</span></div>
                  <div>Proveedor: <span className="text-slate-300">{take.provider || '—'}</span></div>
                  <div>Modelo: <span className="text-slate-300">{take.providerModel || '—'}</span></div>
                  <div>QA: <span className="text-slate-300">{take.qualityScore ?? '—'}</span></div>
                </div>
                {take.videoAssetId && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button className="button-primary" onClick={() => setPreviewMediaId(take.videoAssetId || null)}>
                      <Play className="h-4 w-4" /> Ver video
                    </button>
                    <a
                      className="button-secondary"
                      href={'/api/v7/films/' + encodeURIComponent(filmId) + '/media/' + encodeURIComponent(take.videoAssetId) + '?download=1'}
                    >
                      <Download className="h-4 w-4" /> Descargar
                    </a>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ' +
        (active ? 'bg-violet-500/15 text-violet-200' : 'text-slate-400 hover:bg-white/[.04] hover:text-white')
      }
    >
      {icon}{children}
    </button>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="col-span-full panel rounded-3xl p-8 text-center text-sm text-slate-500">
      <Clapperboard className="mx-auto mb-3 h-7 w-7 text-slate-600" />
      {message}
    </div>
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
