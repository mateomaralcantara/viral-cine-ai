'use client';

import { useEffect, useState } from 'react';
import { Film, ShieldCheck } from 'lucide-react';

export default function V7ClosedCutPlayer({ filmId }: { filmId: string }) {
  const [exists, setExists] = useState<boolean | null>(null);
  const url = '/api/v7/films/' + encodeURIComponent(filmId) + '/closed-cut';

  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setExists(result.ok); })
      .catch(() => { if (!controller.signal.aborted) setExists(false); });
    return () => controller.abort();
  }, [url]);

  if (exists === null) return null;
  if (!exists) return (
    <section className="panel mt-6 rounded-3xl p-5 text-sm text-slate-400">
      El corte narrativo de cuatro minutos todavía no está disponible en este equipo.
      Su master original de V6 se conserva más abajo.
    </section>
  );

  return (
    <section className="panel mt-6 rounded-3xl p-5 md:p-7">
      <div className="flex flex-wrap items-center gap-3">
        <Film className="h-6 w-6 text-emerald-300" />
        <h2 className="text-2xl font-bold">15 DÍAS · Corte narrativo de 4 minutos</h2>
      </div>
      <p className="mt-3 text-sm text-slate-400">
        Edición de cuatro minutos con imágenes originales reeditadas y Libroseller.com.
        No se ha reemplazado el master de V6; este corte no contiene 90 segundos de actuaciones nuevas.
      </p>
      <video className="mt-5 aspect-video w-full rounded-2xl bg-black"
        controls preload="metadata" src={url} />
      <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
        <ShieldCheck className="h-4 w-4" /> Corte disponible en los datos locales de V7
      </div>
    </section>
  );
}
