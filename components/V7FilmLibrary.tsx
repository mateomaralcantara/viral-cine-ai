'use client';

import {
  Clapperboard,
  Download,
  Film,
  FolderOpen,
  Layers3,
  LoaderCircle,
  Play,
  RefreshCw,
  Video
} from 'lucide-react';
import { useMemo, useState } from 'react';

export type V7LibraryFilmSummary = {
  id: string;
  title: string;
  durationMinutes: number;
  genre: string;
  aspectRatio: string;
  language: string;
  budgetUsd: number;
  quality: string;
  legacyProjectId?: string;
  isMigrated: boolean;
  libraryStatus: 'development' | 'production' | 'finished';
  nextStage?: string | null;
  nextStageLabel?: string | null;
  scenes: number;
  shots: number;
  takes: number;
  videoAssets: number;
  hasMaster: boolean;
  masterMediaId?: string | null;
  progressPercent: number;
  updatedAt: string;
};

type Filter = 'all' | 'development' | 'production' | 'finished' | 'migrated';

export default function V7FilmLibrary({
  films,
  loading,
  onRefresh
}: {
  films: V7LibraryFilmSummary[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => ({
    all: films.length,
    development: films.filter((film) => film.libraryStatus === 'development').length,
    production: films.filter((film) => film.libraryStatus === 'production').length,
    finished: films.filter((film) => film.libraryStatus === 'finished').length,
    migrated: films.filter((film) => film.isMigrated).length
  }), [films]);

  const visible = useMemo(() => films.filter((film) => {
    if (filter === 'all') return true;
    if (filter === 'migrated') return film.isMigrated;
    return film.libraryStatus === filter;
  }), [films, filter]);

  return (
    <section className="panel mt-6 rounded-3xl p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Film className="h-5 w-5 text-violet-300" />
            <h2 className="text-2xl font-black">Mis películas y trabajos</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Películas V7 nativas y trabajos migrados de V6. Los videos legacy se reproducen sin duplicarlos.
          </p>
        </div>
        <button className="button-secondary" onClick={onRefresh} disabled={loading}>
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="Todos" count={counts.all} />
        <FilterButton active={filter === 'development'} onClick={() => setFilter('development')} label="En desarrollo" count={counts.development} />
        <FilterButton active={filter === 'production'} onClick={() => setFilter('production')} label="En producción" count={counts.production} />
        <FilterButton active={filter === 'finished'} onClick={() => setFilter('finished')} label="Terminadas" count={counts.finished} />
        <FilterButton active={filter === 'migrated'} onClick={() => setFilter('migrated')} label="Migradas V6" count={counts.migrated} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {!loading && visible.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">
            No hay trabajos en esta categoría.
          </div>
        )}

        {visible.map((film) => (
          <article key={film.id} className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-lg font-black">{film.title}</h3>
                  {film.isMigrated && (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-black text-amber-300">
                      MIGRADA V6
                    </span>
                  )}
                  <StatusBadge status={film.libraryStatus} />
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {film.durationMinutes} min · {film.genre} · {film.aspectRatio} · {String(film.quality).toUpperCase()}
                </div>
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>{film.scenes} escenas</div>
                <div>{film.shots} shots · {film.takes} takes</div>
              </div>
            </div>

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                style={{ width: film.libraryStatus === 'finished' ? '100%' : film.progressPercent + '%' }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-slate-600">
              <span>{film.nextStageLabel ? 'Siguiente: ' + film.nextStageLabel : statusText(film.libraryStatus)}</span>
              <span>{film.libraryStatus === 'finished' ? 100 : film.progressPercent}%</span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {film.hasMaster && (
                <>
                  <a
                    className="button-primary"
                    href={'/v7/films/' + encodeURIComponent(film.id) + '?tab=master'}
                  >
                    <Play className="h-4 w-4" /> Ver película
                  </a>
                  <a
                    className="button-secondary"
                    href={'/api/v7/films/' + encodeURIComponent(film.id) + '/media/master?download=1'}
                  >
                    <Download className="h-4 w-4" /> Descargar MP4
                  </a>
                </>
              )}
              <a
                className="button-secondary"
                href={'/v7/films/' + encodeURIComponent(film.id) + '?tab=scenes'}
              >
                <Layers3 className="h-4 w-4" /> Ver escenas
              </a>
              <a
                className="button-secondary"
                href={'/v7/films/' + encodeURIComponent(film.id) + '?tab=takes'}
              >
                <Video className="h-4 w-4" /> Ver tomas
              </a>
              <a
                className="button-secondary"
                href={'/v7/films/' + encodeURIComponent(film.id)}
              >
                <FolderOpen className="h-4 w-4" /> Abrir proyecto
              </a>
            </div>

            {!film.hasMaster && film.videoAssets > 0 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-cyan-300">
                <Clapperboard className="h-3.5 w-3.5" />
                {film.videoAssets} videos de trabajo disponibles dentro del proyecto.
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-3 py-2 text-xs font-black transition ' +
        (active
          ? 'border-violet-400/50 bg-violet-500/15 text-violet-200'
          : 'border-white/10 bg-white/[.025] text-slate-400 hover:border-white/20')
      }
    >
      {label} <span className="ml-1 opacity-70">{count}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: V7LibraryFilmSummary['libraryStatus'] }) {
  const styles = status === 'finished'
    ? 'bg-emerald-500/10 text-emerald-300'
    : status === 'production'
      ? 'bg-cyan-500/10 text-cyan-300'
      : 'bg-violet-500/10 text-violet-300';
  return (
    <span className={'rounded-full px-2.5 py-1 text-[10px] font-black ' + styles}>
      {status === 'finished' ? 'TERMINADA' : status === 'production' ? 'EN PRODUCCIÓN' : 'EN DESARROLLO'}
    </span>
  );
}

function statusText(status: V7LibraryFilmSummary['libraryStatus']) {
  if (status === 'finished') return 'Película terminada';
  if (status === 'production') return 'Producción activa';
  return 'Desarrollo';
}
