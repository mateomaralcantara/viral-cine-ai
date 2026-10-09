'use client';

import { useEffect, useState } from 'react';
import { Copy, FileCheck2, LockKeyhole, RefreshCcw } from 'lucide-react';
import V7DosToquesShotRenderPanel from '@/components/V7DosToquesShotRenderPanel';

type Preflight = {
  ok: boolean; shotId: string; providerSeconds: number; filmShotSeconds: number; trimRequired: boolean;
  referenceReady: boolean; verifiedRateConfigured: boolean;
  filmBudgetUsd: number; localBudgetCapUsd: number; scopedApprovalUsd: number;
  approvedProviderCalls: number; approvedAutomaticRetries: number; creatorApprovalRecorded: boolean;
  estimatedVideoUsd: number | null; readyForPaidSubmission: false;
  paidSystemEnabled: boolean; blockers: string[]; error?: string;
};

const firstShotPrompt = [
  'Cinematic single-take 8-second 16:9 720p live-action drama, golden dawn in a modest Dominican neighborhood.',
  'Gabriel Santos (39) arrives slowly at the school on an old dark-blue motorcycle with patched seat.',
  'Daniel Santos (11) is clearly visible sitting behind Gabriel, wearing a protective helmet and holding on safely.',
  'Lucía Santos (7) is also clearly visible, with two braids and a light-blue protective helmet,',
  'safely positioned as in the approved staged reference frame.',
  'All three people remain identical and visible for the whole wide tracking shot.',
  'Bike moving at walking pace on a controlled street, then gentle braking.',
  'Realistic physics, softly moving nearby cars, birds and natural street ambience.',
  'Restrained emotional piano should be mixed afterward as an independent track.',
  'No dialogue, no unsafe unhelmeted riding, no name cards, no titles, no text overlays,',
  'no slideshow, no generated captions, no identity swaps, no anatomy distortions.'
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
        Apertura de la película: Gabriel llega lentamente en su motocicleta azul con
        <strong> Daniel y Lucía visibles desde el inicio</strong>. Los tres llevan cascos
        adecuados. La cámara acompaña el vehículo hacia la escuela y muestra la llegada
        sin tarjetas de nombres ni fotografías estáticas. **No se generará video desde esta pantalla:** primero validamos
        la referencia y el presupuesto, sin duplicar ni gastar operaciones.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 p-3">
          <p className="text-xs text-slate-400">Duración proveedor</p>
          <p className="mt-1 text-lg font-bold">8 segundos</p>
          <p className="mt-1 text-xs text-slate-400">Montaje V7: {state ? state.filmShotSeconds.toFixed(2) + ' s' : 'consultando...'}</p>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <p className="text-xs text-slate-400">Referencia inicial</p>
          <p className="mt-1 text-sm font-bold">{state?.referenceReady ? 'Guía editorial importada' : 'Opcional'}</p>
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

      {state?.referenceReady && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-bold">Revisa el fotograma familiar V2 que recibirá Veo</p>
          <img src={endpoint + '/reference'} alt="Fotograma inicial familiar E01-P01: verificar a Gabriel, Daniel y Lucía juntos con cascos"
            className="aspect-video w-full rounded-xl border border-white/10 object-contain bg-black" />
          <p className="mt-2 text-xs text-amber-200">
            La presencia de las tres personas y sus identidades requiere confirmación humana.
            Un PNG técnicamente válido no garantiza que el contenido sea correcto.
            Por la limitación de Veo, esta imagen no será enviada al modelo.
          </p>
        </div>
      )}

      {!state?.referenceReady && (
        <div className="mt-5 rounded-2xl border border-dashed border-white/20 p-4">
          <h3 className="text-sm font-bold">Fotograma inicial familiar 16:9 — Gabriel, Daniel y Lucía</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Importa un fotograma PNG nuevo de al menos 1280×720 donde se vean
            Gabriel, Daniel y Lucía juntos, con cascos y posiciones físicamente
            coherentes. La referencia anterior de Gabriel solo es incompatible.
            Se guardará separada, sin sobrescribir el fotograma antiguo.
            Este PNG es **solo guía editorial**: la generación con menores se hará
            como texto-a-video, sin subirlo a Google.
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
          El video de proveedor de 8 s debe recortarse a la duración real del guion V7,
          aproximadamente 7,17 s, para no descuadrar los 10 minutos.
          El creador autorizó hasta US$2.00 para una sola generación de E01-P01 a 720p,
          sin reintentos automáticos. El costo previsto según Google es US$0.80.
          Ninguna llamada pagada ha sido enviada. Antes de ejecutarla verifica el
          guion, las identidades previstas, las credenciales y el límite local.
          La imagen familiar es opcional: Google recibirá solo el prompt de texto.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-emerald-300">
          <span>Autorización de esta toma:</span>
          <strong>{state?.scopedApprovalUsd != null ? 'US$ ' + state.scopedApprovalUsd.toFixed(2) : 'consultando...'}</strong>
          <span>· 1 intento · 0 reintentos · Ningún pago realizado</span>
        </div>
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
      <V7DosToquesShotRenderPanel filmId={filmId} />
      {message && <p className="mt-4 text-sm text-amber-200" role="status">{message}</p>}
    </section>
  );
}
