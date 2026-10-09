'use client';

import { useEffect, useState } from 'react';
import { Copy, FileCheck2, LockKeyhole, RefreshCcw } from 'lucide-react';

type Preflight = {
  ok: boolean; shotId: string; durationSeconds: number;
  referenceReady: boolean; verifiedRateConfigured: boolean;
  filmBudgetUsd: number; localBudgetCapUsd: number;
  estimatedVideoUsd: number | null; readyForPaidSubmission: false;
  paidSystemEnabled: boolean; blockers: string[]; error?: string;
};

const firstShotPrompt = [
  'Single continuous cinematic realistic 8-second establishing shot, 16:9.',
  'Early morning outside a fictional neighborhood school in the Dominican Republic.',
  'A worn dark-blue commuter motorcycle with a black-tape patched seat gently',
  'enters the frame and comes to a full stop along the curb.',
  'An adult Dominican father (39) in a faded blue work shirt and a matte black',
  'protective helmet rides the motorcycle; keep his face turned away from camera.',
  'One small light-blue child helmet hangs on the RIGHT side of the handlebar.',
  'Warm golden dawn, believable Caribbean urban street textures,',
  'slow stable 35mm lateral tracking, physically realistic wheels and braking.',
  'No speaking, no facial animation, no children visible, no invented logos,',
  'no subtitles, no hard cuts, no camera teleportation.'
].join(' ');

export default function V7DosToquesFirstShotPanel({ filmId }: { filmId: string }) {
  const endpoint = '/api/v7/films/' + encodeURIComponent(filmId) + '/e01-p01-preflight';
  const [state, setState] = useState<Preflight | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const response = await fetch(endpoint, { cache: 'no-store' });
    const result = await response.json() as Preflight;
    if (!response.ok || !result.ok) throw new Error(result.error || 'No hay datos de E01-P01');
    setState(result);
  }
  useEffect(() => {
    let alive = true;
    void fetch(endpoint, { cache: 'no-store' })
      .then(async res => {
        const result = await res.json() as Preflight;
        if (!res.ok || !result.ok) throw new Error(result.error || 'No se pudo leer el preflight');
        if (alive) setState(result);
      })
      .catch(cause => { if (alive) setMessage(cause instanceof Error ? cause.message : String(cause)); });
    return () => { alive = false; };
  }, [endpoint]);

  async function uploadReference() {
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      const payload = new FormData();
      payload.set('reference', file);
      const response = await fetch(endpoint, { method: 'POST', body: payload });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || 'Error al importar referencia');
      setFile(null);
      setMessage('Fotograma importado sin costo. Requiere revisión humana antes de cualquier render.');
      await refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel mt-6 rounded-3xl p-6 md:p-8">
      <header className="flex items-center gap-3">
        <FileCheck2 className="h-6 w-6 text-violet-300" />
        <h2 className="text-xl font-black">Siguiente paso · Primera toma real E01-P01 (8 s)</h2>
      </header>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        Apertura de la película: Gabriel estaciona su motocicleta azul junto a la escuela al amanecer.
        El encuadre muestra a un conductor adulto de espaldas; los niños aparecen a partir de
        los planos posteriores. **No se generará video desde esta pantalla:** primero validamos
        la referencia y el presupuesto, sin duplicar ni gastar operaciones.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 p-3">
          <p className="text-xs text-slate-400">Duración</p>
          <p className="mt-1 text-lg font-bold">8 segundos</p>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <p className="text-xs text-slate-400">Referencia inicial</p>
          <p className="mt-1 text-sm font-bold">{state?.referenceReady ? 'Importada, QA pendiente' : 'Pendiente'}</p>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <p className="text-xs text-slate-400">Costo de proveedor</p>
          <p className="mt-1 text-sm font-bold">
            {state?.estimatedVideoUsd == null ? 'Sin cotizar' : 'US$ ' + state.estimatedVideoUsd.toFixed(2)}
          </p>
        </div>
      </div>
      <details className="mt-5 rounded-xl border border-white/10 p-4">
        <summary className="cursor-pointer font-bold text-violet-200">
          Prompt cinematográfico de la primera toma
        </summary>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{firstShotPrompt}</p>
        <button type="button" className="button-secondary mt-3"
          onClick={() => void navigator.clipboard.writeText(firstShotPrompt).then(
            () => setMessage('Prompt copiado.'),
            () => setMessage('No se pudo copiar automáticamente; selecciona el texto.')
          )}>
          <Copy className="h-4 w-4" /> Copiar prompt
        </button>
      </details>

      {!state?.referenceReady && (
        <div className="mt-5 rounded-2xl border border-dashed border-white/20 p-4">
          <h3 className="text-sm font-bold">Fotograma inicial 16:9 para esta toma</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Importa una imagen propia PNG de al menos 1280×720 con el motor azul,
            el casco infantil en el manubrio derecho y el conductor adulto de espaldas.
            No reutilices el póster general ni inventes personas o logotipos.
          </p>
          <input type="file" accept=".png,image/png" className="mt-3 block w-full text-xs"
            aria-label="Referencia inicial 16:9 E01-P01"
            onChange={e => setFile(e.target.files?.[0] || null)} />
          <button type="button" className="button-primary mt-3"
            disabled={!file || busy} onClick={() => void uploadReference()}>
            {busy ? 'Verificando imagen…' : 'Importar referencia sin pagar'}
          </button>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-white/10 p-4">
        <h3 className="flex items-center gap-2 text-sm font-black">
          <LockKeyhole className="h-4 w-4 text-amber-300" />
          Controles para iniciar una generación real
        </h3>
        <p className="mt-2 text-xs text-slate-400">
          El presupuesto de esta película continúa sin autorización para generación de video.
          Un precio estimado no es una autorización de pago.
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm text-amber-200">
          {(state?.blockers || ['Cargando comprobaciones de presupuesto y referencia…'])
            .map(blocker => <li key={blocker}>{blocker}</li>)}
        </ul>
        <button type="button" className="button-secondary mt-4"
          onClick={() => void refresh().catch(error =>
            setMessage(error instanceof Error ? error.message : String(error)))}>
          <RefreshCcw className="h-4 w-4" /> Comprobar estado
        </button>
      </div>
      {message && <p className="mt-4 text-sm text-amber-200" role="status">{message}</p>}
    </section>
  );
}
