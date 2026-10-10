'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clapperboard, Copy, LockKeyhole, RefreshCcw } from 'lucide-react';
import plan from '@/films/dos-toques-de-bocina/E01-P02-SE-DETIENEN-V1.json';

type ContinuityStatus = {
  ok: boolean;
  p01ArtisticApproved: boolean;
  p02ContinuityFrameReady: boolean;
  referenceUrl: string | null;
  canonicalStartSeconds: number;
  canonicalDurationSeconds: number;
  providerClipIfLaterAuthorizedSeconds: number;
  paidCallsAuthorized: number;
  additionalSpendUsd: number;
  warnings: string[];
  error?: string;
};

export default function V7DosToquesShot02Panel({ filmId }: { filmId: string }) {
  const endpoint = '/api/v7/films/' + encodeURIComponent(filmId) + '/e01-p02-continuity';
  const [state, setState] = useState<ContinuityStatus | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const response = await fetch(endpoint, { cache: 'no-store' });
    const result = await response.json() as ContinuityStatus;
    if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo comprobar P02');
    setState(result);
  }
  useEffect(() => {
    let active = true;
    void fetch(endpoint, { cache: 'no-store' })
      .then(async response => {
        const result = await response.json() as ContinuityStatus;
        if (!response.ok || !result.ok) throw new Error(result.error || 'Error de preparación');
        if (active) setState(result);
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [endpoint]);

  async function prepare() {
    if (!token) { setMessage('Introduce el token administrativo del servidor local.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'prepare-continuity' })
      });
      const result = await response.json() as ContinuityStatus;
      if (!response.ok || !result.ok) throw new Error(result.error || 'Preparación fallida');
      setState(result);
      setMessage('Fotograma extraído del video aprobado. No se envió ninguna solicitud a Google.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }
  const canPrepare = state?.p01ArtisticApproved && !state.p02ContinuityFrameReady;
  return (
    <section className="panel rounded-3xl p-6 md:p-8">
      <div className="flex items-center gap-3">
        <Clapperboard className="h-6 w-6 text-violet-300" />
        <h2 className="text-xl font-black">Siguiente toma · E01-P02 — Se detienen</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        El motor azul ya está completamente detenido. Gabriel apaga el motor y sonríe a
        Daniel y Lucía, que se encuentran junto a la acera en posición segura.
        Una toma lateral continua con la misma escuela y la luz cálida de E01-P01.
        No hay diálogos ni nombres en pantalla.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-xs text-slate-400">Toma original E01-P01</div>
          <div className="mt-1 font-bold">
            {state?.p01ArtisticApproved ? 'Aprobada artísticamente' : 'Verificando aprobación'}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-xs text-slate-400">Duración del montaje V7</div>
          <div className="mt-1 font-bold">
            {state ? state.canonicalDurationSeconds.toFixed(2) + ' segundos' : 'Verificando…'}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-xs text-slate-400">Generación de P02</div>
          <div className="mt-1 font-bold text-amber-200">Bloqueada · US$0 autorizado</div>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 p-4">
        <h3 className="text-sm font-bold">
          <LockKeyhole className="mr-2 inline h-4 w-4 text-violet-200" />
          Fotograma para continuidad, sin gasto
        </h3>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          Este proceso extrae el fotograma del segundo 7.0 del MP4 que aprobaste.
          Verifica primero su casco, la posición de ambos niños y la geometría de la moto.
          No lo envía a Veo ni altera el video original.
        </p>
        {state?.p02ContinuityFrameReady && state.referenceUrl ? (
          <div className="mt-4">
            <img src={state.referenceUrl} alt="Fotograma real de continuidad E01-P01 para planificar E01-P02"
              className="aspect-video w-full rounded-xl bg-black object-contain" />
            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Referencia técnica disponible para revisión
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input type="password" aria-label="Token administrativo de producción"
              placeholder="Token administrativo local (no compartir)"
              autoComplete="off" className="w-full rounded-lg border border-white/20 bg-slate-950 p-3 text-sm"
              value={token} onChange={e => setToken(e.target.value)} />
            <button type="button" className="button-primary"
              disabled={!canPrepare || !token || busy} onClick={() => void prepare()}>
              {busy ? 'Extrayendo el fotograma…' : 'Preparar continuidad · Sin costo'}
            </button>
            {!state?.p01ArtisticApproved && (
              <p className="text-xs text-amber-200">Primero debes tener E01-P01 aprobada artísticamente.</p>
            )}
          </div>
        )}
        <button type="button" className="button-secondary mt-3"
          disabled={busy}
          onClick={() => void refresh().catch(error =>
            setMessage(error instanceof Error ? error.message : String(error)))}>
          <RefreshCcw className="h-4 w-4" /> Actualizar estado
        </button>
      </div>
      <details className="mt-5 rounded-xl border border-white/10 p-4">
        <summary className="cursor-pointer font-bold">Prompt cinematográfico de E01-P02 (preproducción)</summary>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
          {plan.promptEnglish}
        </p>
        <button type="button" className="button-secondary mt-3"
          onClick={() => void navigator.clipboard.writeText(plan.promptEnglish)
            .then(() => setMessage('Prompt copiado; todavía no autoriza ninguna generación.'))
            .catch(() => setMessage('No se pudo copiar el prompt.'))}>
          <Copy className="h-4 w-4" /> Copiar prompt
        </button>
      </details>
      <div className="mt-4 rounded-xl border border-amber-400/20 p-4 text-xs text-amber-200">
        <strong>Control de calidad pendiente:</strong> continuidad del motor, uniforme y colegio,
        cascos de ambos niños, tres personajes sin duplicados y corte exacto al guion V7.
        La aprobación artística de P01 no certifica automáticamente estas condiciones.
      </div>
      {message && <p className="mt-3 text-sm text-amber-200" role="status">{message}</p>}
    </section>
  );
}
