'use client';

import { useEffect, useState } from 'react';
import { Camera, ShieldAlert, ShieldCheck } from 'lucide-react';

const cast = [
  {
    id: 'gabriel', name: 'Gabriel Santos', age: 39, voice: 'GABRIEL-ESDO-V1',
    traits: 'Piel canela, barba corta desigual, cicatriz junto a la ceja izquierda. Voz grave cálida, cansada y contenida.',
    direction: 'Retrato fotográfico realista, hombre dominicano de 39 años, piel canela, barba corta irregular y cicatriz discreta junto a la ceja izquierda, ojos cansados y nobles, camiseta oscura sencilla; luz de ventana suave, fondo neutro, fotografía frontal, sin logotipos.'
  },
  {
    id: 'daniel', name: 'Daniel Santos', age: 11, voice: 'DANIEL-ESDO-V1',
    traits: 'Niño dominicano de 11 años, ojos grandes oscuros, pelo rizado corto. Casco azul celeste como elemento de continuidad.',
    direction: 'Retrato fotográfico realista y respetuoso de niño dominicano ficticio de 11 años, ojos grandes oscuros, cabello rizado corto; expresión dulce y melancólica, camisa de tonos azules, luz suave, fondo neutro, frontal.'
  },
  {
    id: 'lucia', name: 'Lucía Santos', age: 7, voice: 'LUCIA-ESDO-V1',
    traits: 'Niña dominicana de 7 años, dos trenzas con lazos amarillos y mochila con estrellas.',
    direction: 'Retrato fotográfico realista y respetuoso de niña dominicana ficticia de 7 años, dos trenzas con lazos amarillos, expresión tierna, luz cálida suave, fondo neutro, frontal.'
  }
] as const;

export default function V7DosToquesCastingPanel({ filmId }: { filmId: string }) {
  const [available, setAvailable] = useState<Record<string, boolean>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const urlFor = (id: string) => '/api/v7/films/' + encodeURIComponent(filmId) +
    '/casting/' + encodeURIComponent(id);

  useEffect(() => {
    let active = true;
    void Promise.all(cast.map(async (person) => {
      try {
        const res = await fetch(urlFor(person.id), { method: 'HEAD', cache: 'no-store' });
        return [person.id, res.ok] as const;
      } catch {
        return [person.id, false] as const;
      }
    })).then((statuses) => {
      if (active) setAvailable(Object.fromEntries(statuses));
    });
    return () => { active = false; };
  }, [filmId]);

  async function upload(id: string) {
    const file = files[id];
    if (!file) return;
    setBusy(id);
    setError('');
    try {
      const payload = new FormData();
      payload.set('reference', file);
      const response = await fetch(urlFor(id), { method: 'POST', body: payload });
      const result = await response.json() as { ok: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo importar la referencia');
      setAvailable((old) => ({ ...old, [id]: true }));
      setFiles((old) => ({ ...old, [id]: null }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="mt-6 space-y-5">
      <header className="panel rounded-3xl p-6">
        <div className="flex items-center gap-3">
          <Camera className="h-6 w-6 text-violet-300" />
          <h2 className="text-2xl font-black">Casting visual · Familia Santos</h2>
        </div>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
          Importa una imagen original en PNG para cada personaje; se almacena como candidata
          sin sobrescribir ninguna imagen existente. La identidad no queda aprobada automáticamente.
          Hasta su revisión, la generación de video y los perfiles de voz permanecen bloqueados.
        </p>
        <p className="mt-3 flex items-center gap-2 text-xs text-amber-300">
          <ShieldAlert className="h-4 w-4" /> No usar recortes de un póster con rostros variables como referencias canónicas.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {cast.map((person) => {
          const ready = Boolean(available[person.id]);
          return (
            <article className="panel rounded-3xl p-5" key={person.id}>
              <p className="text-xs font-bold uppercase text-violet-300">Casting pendiente · {person.age} años</p>
              <h3 className="mt-2 text-xl font-black">{person.name}</h3>
              {ready
                ? <img src={urlFor(person.id)} alt={'Imagen candidata de ' + person.name}
                    className="mt-4 aspect-square w-full rounded-xl bg-black object-contain" />
                : <div className="mt-4 flex aspect-square items-center justify-center rounded-xl border border-dashed border-white/20 text-slate-500">
                    <Camera className="h-10 w-10" />
                  </div>}
              <p className="mt-3 text-sm leading-6 text-slate-300">{person.traits}</p>
              <p className="mt-3 text-xs font-bold text-emerald-300">Voz prevista: {person.voice}</p>
              <details className="mt-3 text-sm text-slate-300">
                <summary className="cursor-pointer text-violet-200">Ver prompt de retrato</summary>
                <p className="mt-2 text-xs leading-5">{person.direction}</p>
              </details>
              {ready ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-amber-200">
                  <ShieldCheck className="h-4 w-4" /> Referencia candidata importada; falta aprobar casting.
                </p>
              ) : (
                <div className="mt-4">
                  <input type="file" accept=".png,image/png" aria-label={'Importar retrato de ' + person.name}
                    className="w-full text-xs" onChange={(event) =>
                      setFiles((old) => ({ ...old, [person.id]: event.target.files?.[0] || null }))} />
                  <button className="button-primary mt-3" type="button"
                    disabled={!files[person.id] || Boolean(busy)} onClick={() => void upload(person.id)}>
                    {busy === person.id ? 'Guardando candidato…' : 'Importar referencia PNG'}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {error && <div className="panel rounded-2xl p-4 text-sm text-red-300" role="alert">{error}</div>}
      <section className="panel rounded-3xl p-5 text-sm leading-6 text-slate-400">
        Las voces de Gabriel, Daniel y Lucía ya tienen identificadores editoriales persistentes,
        pero aún no están sintetizadas, licenciadas ni aprobadas. La música emotiva se conserva
        como pista de fondo independiente; la bocina y el diálogo se mezclarán por separado.
      </section>
    </section>
  );
}
