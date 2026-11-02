'use client';

import { useCallback, useEffect, useState } from 'react';

type Photo = {
  id: string;
  approved: boolean;
  ready: boolean;
  sha256: string | null;
  url: string | null;
};

type Data = {
  ok: boolean;
  configured: boolean;
  approvedCount: number;
  images: Photo[];
  error?: string;
};

type ShotStatus = {
  label: string;
  hasVideo: boolean;
};

const IDS = Array.from(
  { length: 7 },
  (_, i) => `E02-P${String(i + 1).padStart(2, '0')}`
);

const ENDPOINT =
  '/api/v7/films/film-dos-toques-de-bocina-v7/scene02-gallery';

export default function V7E02CloudImageGallery({
  sceneShots,
}: {
  sceneShots: ShotStatus[];
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(ENDPOINT, {
        cache: 'no-store',
        credentials: 'same-origin',
      });

      const data = await response.json() as Data;

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error || 'No se pudo consultar Supabase.'
        );
      }

      setPhotos(data.images);
      setCount(data.approvedCount);
      setConfigured(data.configured);
      setError('');

      if (!data.configured) {
        setError(
          'El servidor local no tiene activa su conexion con Supabase.'
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : String(reason)
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mt-5 rounded-2xl border border-violet-400/30 bg-violet-500/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-white">
            Fotografias originales - Escena 02
          </h3>

          <p className="mt-1 text-sm text-slate-400">
            Referencias ya guardadas en Supabase.
            No necesitas volver a subirlas.
          </p>
        </div>

        <button
          type="button"
          className="button-secondary"
          onClick={() => void refresh()}
        >
          Actualizar fotografias
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
        <strong className="text-emerald-300">
          {loading
            ? 'Consultando Supabase...'
            : `${count} de 7 fotografias aprobadas`}
        </strong>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-amber-300">
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {IDS.map(id => {
          const photo = photos.find(item => item.id === id);
          const shot = sceneShots.find(item => item.label === id);
          const ready = configured && photo?.ready === true;

          return (
            <article
              key={id}
              className="overflow-hidden rounded-xl border border-white/10 bg-slate-950"
            >
              <div className="flex aspect-video items-center justify-center overflow-hidden bg-slate-900">
                {ready && photo?.url ? (
                  <img
                    src={photo.url}
                    alt={`Referencia aprobada ${id}`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={event => {
                      event.currentTarget.style.opacity = '0.2';
                      event.currentTarget.title =
                        'No fue posible cargar la imagen privada.';
                    }}
                  />
                ) : (
                  <span className="p-3 text-center text-xs text-slate-400">
                    Referencia pendiente de lectura
                  </span>
                )}
              </div>

              <div className="space-y-2 p-3">
                <strong className="text-base text-white">
                  {id}
                </strong>

                <p className={
                  'text-xs ' +
                  (ready ? 'text-emerald-300' : 'text-amber-300')
                }>
                  {ready
                    ? 'Fotografia guardada y aprobada'
                    : 'Fotografia aun no verificada'}
                </p>

                <p className={
                  'text-xs ' +
                  (shot?.hasVideo
                    ? 'text-emerald-300'
                    : 'text-slate-400')
                }>
                  {shot?.hasVideo
                    ? 'MP4 disponible'
                    : 'MP4 pendiente de produccion'}
                </p>

                {photo?.sha256 && (
                  <p className="text-[10px] text-slate-500">
                    SHA: {photo.sha256.slice(0, 12)}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}