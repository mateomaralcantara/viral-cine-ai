'use client';

import { useEffect, useState } from 'react';
import { Clapperboard, Film, LoaderCircle, ShieldCheck, Volume2 } from 'lucide-react';
import V7DosToquesFirstShotPanel from '@/components/V7DosToquesFirstShotPanel';

const shots = [
  { id: 'E01-P01', start: '00:00', end: '00:08', seconds: 8, text: 'Llegada a la escuela y presentación de la familia.' },
  { id: 'E01-P02', start: '00:08', end: '00:15', seconds: 7, text: 'Gabriel y Daniel: gestos de confianza cotidiana.' },
  { id: 'E01-P03', start: '00:15', end: '00:22', seconds: 7, text: 'Lucía entrega un dibujo a su padre.' },
  { id: 'E01-P04', start: '00:22', end: '00:29', seconds: 7, text: 'Gabriel promete que nunca olvidará a sus hijos.' },
  { id: 'E01-P05', start: '00:29', end: '00:36', seconds: 7, text: 'Daniel se burla cariñosamente del motor.' },
  { id: 'E01-P06', start: '00:36', end: '00:43', seconds: 7, text: 'Los niños se despiden y miran hacia atrás.' },
  { id: 'E01-P07', start: '00:43', end: '00:50', seconds: 7, text: 'Dos pitidos de bocina: el motivo familiar.' }
] as const;

const voiceCasting = [
  { name: 'GABRIEL', code: 'GABRIEL-ESDO-V1', line: 'No existe un día que yo pudiera olvidarme de ustedes.', time: '00:22–00:29' },
  { name: 'LUCÍA', code: 'LUCIA-ESDO-V1', line: 'Para que no te olvides de nosotros en el trabajo.', time: '00:15–00:22' },
  { name: 'DANIEL', code: 'DANIEL-ESDO-V1', line: 'Papi, ese motor suena como una lata.', time: '00:29–00:36' }
] as const;

export default function V7DosToquesScene01Panel({ filmId }: { filmId: string }) {
  const endpoint = '/api/v7/films/' + encodeURIComponent(filmId) + '/scene01-previs';
  const [exists, setExists] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const response = await fetch(endpoint, { method: 'HEAD', cache: 'no-store' });
    setExists(response.ok);
  }
  useEffect(() => {
    let active = true;
    void fetch(endpoint, { method: 'HEAD', cache: 'no-store' })
      .then(response => { if (active) setExists(response.ok); })
      .catch(() => { if (active) setExists(false); });
    return () => { active = false; };
  }, [endpoint]);

  async function upload() {
    if (!file) {
      setMessage('Selecciona el archivo MP4 de la previsualización E01.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const data = new FormData();
      data.set('file', file);
      const response = await fetch(endpoint, { method: 'POST', body: data });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'No se pudo importar el piloto.');
      }
      setMessage('Previsualización importada: no es un master de video aprobado ni un render Veo.');
      setFile(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-5">
      <header className="panel rounded-3xl p-6 md:p-8">
        <div className="flex items-center gap-3">
          <Clapperboard className="h-6 w-6 text-violet-300" />
          <h2 className="text-2xl font-black">E01 · La señal — primera prueba de 50 segundos</h2>
        </div>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
          Piloto de montaje con los retratos aprobados de Gabriel, Daniel y Lucía, un fragmento
          de la banda sonora original y dos bocinazos sintéticos provisionales.
          Las imágenes reciben movimiento editorial; NO son actuaciones ni clips generados
          por Veo. La meta es comprobar el ritmo antes de autorizar una toma pagada.
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-emerald-300">
          <ShieldCheck className="h-4 w-4" />
          Previsualización sin créditos de generación · «15 DÍAS» permanece intacta
        </div>
        {exists ? (
          <div className="mt-5">
            <video src={endpoint} controls preload="metadata"
              className="aspect-video w-full rounded-2xl bg-black" />
            <p className="mt-2 text-xs text-amber-200">
              Audio: música aprobada y bocina temporal. Sin grabaciones de diálogo.
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/20 p-5">
            <p className="text-sm font-bold">Importar el video de previsualización E01</p>
            <p className="mt-2 text-xs text-slate-400">
              Selecciona DOS_TOQUES_DE_BOCINA_E01_LA_SENAL_PREVIS_50S.mp4
              después de guardarlo desde la conversación. Duración obligatoria: 50 s;
              video H.264 + audio AAC, máximo 35 MB. No sustituye tomas existentes.
            </p>
            <input aria-label="Video MP4 de previsualización" className="mt-4 block w-full text-sm"
              type="file" accept=".mp4,video/mp4"
              onChange={event => setFile(event.target.files?.[0] || null)} />
            <button type="button" className="button-primary mt-4"
              disabled={!file || busy}
              onClick={() => void upload()}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
              {busy ? 'Verificando video…' : 'Importar previsualización E01'}
            </button>
          </div>
        )}
        {message && <p className="mt-3 text-sm text-amber-200" role="status">{message}</p>}
      </header>

      <V7DosToquesFirstShotPanel filmId={filmId} />

      <div className="panel rounded-3xl p-6">
        <h3 className="text-xl font-bold">Plan de siete tomas</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {shots.map(shot => (
            <div key={shot.id} className="rounded-2xl border border-white/10 p-4">
              <div className="text-xs font-bold text-violet-300">
                {shot.id} · {shot.start}–{shot.end} · {shot.seconds} s
              </div>
              <p className="mt-2 text-sm text-slate-300">{shot.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Cada tiempo corresponde al montaje de previsualización, no a la duración
          facturada de un futuro render con proveedor.
        </p>
      </div>

      <div className="panel rounded-3xl p-6">
        <h3 className="flex items-center gap-2 text-xl font-bold">
          <Volume2 className="h-5 w-5 text-violet-300" /> Pruebas de voz pendientes
        </h3>
        <p className="mt-2 text-sm text-slate-400">
          Código fijo por personaje, español dominicano natural. Aquí hay libreto
          para audición, pero aún no se ha grabado ni validado ningún archivo de voz.
        </p>
        <div className="mt-4 space-y-3">
          {voiceCasting.map(voice => (
            <div key={voice.code} className="rounded-xl border border-white/10 p-4">
              <div className="text-sm font-bold">{voice.name} · {voice.code}</div>
              <div className="mt-1 text-xs text-slate-400">{voice.time}</div>
              <blockquote className="mt-2 text-sm italic text-slate-300">{voice.line}</blockquote>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
