'use client';

import { useEffect, useState } from 'react';
import { Clapperboard, Headphones, Music2, RefreshCw, ShieldCheck } from 'lucide-react';

const cues = [
  ['00:00–00:50', 'La señal', 'Piano íntimo; ternura familiar'],
  ['00:50–01:45', 'El abandono', 'Armonía menor; ruptura'],
  ['01:45–02:50', 'La sentencia', 'Música contenida y silencio'],
  ['02:50–03:50', 'El motoconcho', 'Violoncelo; soledad y dignidad'],
  ['03:50–04:50', 'El amigo', 'Primera esperanza'],
  ['04:50–05:50', 'El asiento vacío', 'Piano nocturno, intimidad'],
  ['05:50–06:50', 'Libroseller', 'Renacimiento delicado'],
  ['06:50–07:50', 'Veinte días', 'El tema se expande'],
  ['07:50–09:00', 'La conferencia', 'Cuerdas bajo los diálogos'],
  ['09:00–10:00', 'Dos toques', 'Reencuentro; bocina aparte']
] as const;

export default function V7DosToquesMusicPanel({ filmId }: { filmId: string }) {
  const url = '/api/v7/films/' + encodeURIComponent(filmId) + '/soundtrack';
  const [ready, setReady] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    setReady(res.ok);
  }
  useEffect(() => { void refresh().catch(() => setReady(false)); }, [url]);

  async function importScore() {
    if (!file) { setMessage('Selecciona primero el archivo MP3 de diez minutos.'); return; }
    setBusy(true);
    setMessage('');
    try {
      const data = new FormData();
      data.set('file', file);
      const res = await fetch(url, { method: 'POST', body: data, cache: 'no-store' });
      const payload = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error || 'Error al importar el MP3');
      setFile(null);
      setMessage('Banda sonora importada. Composición aprobada; mezcla con voces y efectos pendiente.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-6 space-y-5">
      <div className="panel rounded-3xl p-5 md:p-7">
        <div className="flex items-center gap-3">
          <Headphones className="h-6 w-6 text-violet-300" />
          <h2 className="text-2xl font-black">Banda sonora · DOS TOQUES DE BOCINA</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Música instrumental original de 10:00 minutos: piano melancólico, cuerdas contenidas y
          evolución hacia un reencuentro esperanzador. La música no incorpora voces ni bocina:
          estos elementos se mezclarán como pistas independientes para conservar su claridad.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          <span>Composición musical aprobada · Sin llamadas pagadas · Mezcla final pendiente</span>
        </div>
        {ready ? (
          <>
            <audio src={url} controls preload="metadata" className="mt-5 w-full"
              aria-label="Banda sonora original de Dos Toques de Bocina" />
            <p className="mt-2 text-xs text-amber-200">Composición aprobada por el creador; todavía no mezclada con las voces.</p>
          </>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/20 p-4">
            <label htmlFor="film-score-file" className="block text-sm font-semibold">
              Importar la banda sonora original de diez minutos (MP3; máximo 20 MB)
            </label>
            <input id="film-score-file" type="file" accept=".mp3,audio/mpeg"
              className="mt-3 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button className="button-primary mt-4" type="button"
              disabled={!file || busy} onClick={() => void importScore()}>
              <Music2 className="h-4 w-4" />
              {busy ? 'Validando los 600 segundos…' : 'Importar banda sonora en V7'}
            </button>
            <p className="mt-2 text-xs text-slate-500">
              La importación se realiza solo en el estudio local; valida duración y no sobrescribe una pista previa.
            </p>
          </div>
        )}
        {message && <p className="mt-3 text-sm text-amber-200" role="status">{message}</p>}
        <button className="button-secondary mt-4" type="button"
          onClick={() => void refresh().catch(() => setMessage('No se pudo actualizar el estado.'))}>
          <RefreshCw className="h-4 w-4" /> Comprobar importación
        </button>
      </div>
      <section className="panel rounded-3xl p-5 md:p-7">
        <h3 className="flex items-center gap-2 text-xl font-bold">
          <Clapperboard className="h-5 w-5 text-violet-300" /> Mapa musical por escena
        </h3>
        <div className="mt-4 space-y-2">
          {cues.map(([time, title, mood], index) => (
            <div key={time} className="flex flex-wrap justify-between gap-2 rounded-xl border border-white/10 p-3">
              <div className="text-sm"><span className="text-violet-300">{index + 1}.</span> {title}</div>
              <div className="text-xs text-slate-400">{time} · {mood}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-400">
          El mezclador final deberá atenuar la música bajo diálogos aproximadamente entre −16 y −24 dB,
          con silencios breves durante la sentencia, el abrazo y los dos toques de bocina.
          Esta pantalla no supone que la película ni las voces estén producidas.
        </p>
      </section>
    </section>
  );
}
