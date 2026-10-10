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
  const [renderStatus, setRenderStatus] = useState<{ok:boolean;shotId:string;recordStatus:string;flagsEnabled:boolean;canSubmitAfterUserClick:boolean;estimatedUsd:number;maxProviderSubmissions:number;promptSha256:string;providerOperationKnown:boolean;hasSubmittedOrReserved:boolean;videoReady:boolean;videoUrl:string|null;error?:string}|null>(null);
  const [renderError, setRenderError] = useState('');
  const [finalToken, setFinalToken] = useState('');
  const [finalApproval, setFinalApproval] = useState(false);
  const [paidBusy, setPaidBusy] = useState(false);
  const [approval, setApproval] = useState<{ok:boolean; artisticApproved:boolean; approval?:{approvedAt:string; artisticChecks?:{identityWardrobe:string;voiceSound:string;motionContinuity:string}}}|null>(null);
  const [approvalError, setApprovalError] = useState('');
  const approvalEndpoint = '/api/v7/films/' + encodeURIComponent(filmId) + '/e01-p02-approval';
  async function refreshApproval() {
    const response = await fetch(approvalEndpoint,{cache:'no-store'});
    const data = await response.json();
    if(!response.ok || !data.ok) throw new Error(data.error || 'No se pudo leer la aprobación artística P02');
    setApproval(data); setApprovalError('');
  }
  async function approveP02() {
    if(!finalToken) {setApprovalError('Introduce token administrativo para confirmar.');return;}
    setPaidBusy(true);setApprovalError('');
    try {
      const response = await fetch(approvalEndpoint,{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+finalToken},
        body:JSON.stringify({action:'approve-artistic',confirmWatched:true,confirmArtistic:true,
          notes:'Ninguna',checks:{identityWardrobe:'pass',voiceSound:'pass',motionContinuity:'pass'}})
      });
      const data = await response.json();
      if(!response.ok || !data.ok) throw new Error(data.error || 'No se pudo aprobar P02');
      await refreshApproval();setMessage('E01-P02 aprobada artísticamente. Cero llamadas pagadas.');
    } catch(e) {setApprovalError(e instanceof Error ? e.message : String(e));}
    finally{setPaidBusy(false);}
  }
  async function submitP02() {
    if (!finalApproval || !finalToken || !renderStatus?.canSubmitAfterUserClick) {
      setRenderError('Faltan la confirmación final, el token o las validaciones del servidor.');
      return;
    }
    setPaidBusy(true); setRenderError('');
    try {
      const response = await fetch('/api/v7/films/' + encodeURIComponent(filmId) + '/e01-p02-render', {
        method: 'POST',
        headers: {'Content-Type':'application/json', Authorization:'Bearer ' + finalToken},
        body: JSON.stringify({
          action:'submit', confirm:true,
          compositionConfirmed:'p02-three-helmeted-riders-same-order-safe-stop',
          promptSha256: renderStatus.promptSha256,
          approvedEstimateUsd:0.8
        })
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || 'No se pudo enviar P02');
      setFinalApproval(false); setFinalToken('');
      setMessage('Operación enviada una sola vez. Usa Recuperar operación para consultar el resultado.');
      await refreshRender();
    } catch(e) { setRenderError(e instanceof Error ? e.message : String(e)); }
    finally {setPaidBusy(false);}
  }
  async function resumeP02() {
    if (!finalToken) {setRenderError('Introduce el token administrativo para recuperar la operación.'); return;}
    setPaidBusy(true); setRenderError('');
    try {
      const response = await fetch('/api/v7/films/' + encodeURIComponent(filmId) + '/e01-p02-render', {
        method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+finalToken},
        body:JSON.stringify({action:'resume'})
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || 'Recuperación fallida');
      setMessage('Estado de recuperación: ' + body.status);
      await refreshRender();
    } catch(e) {setRenderError(e instanceof Error ? e.message : String(e));}
    finally {setPaidBusy(false);}
  }
  async function refreshRender() {
    try {
      const response = await fetch('/api/v7/films/' + encodeURIComponent(filmId) + '/e01-p02-render', { cache:'no-store' });
      const result = await response.json();
      if (!response.ok || !result.ok || result.shotId !== 'E01-P02') throw new Error(result.error || 'Estado P02 no disponible');
      setRenderStatus(result); setRenderError('');
    } catch (error) { setRenderError(error instanceof Error ? error.message : String(error)); }
  }

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
  useEffect(() => { void refreshRender(); void refreshApproval().catch(error =>
    setApprovalError(error instanceof Error ? error.message : String(error))); }, [filmId]);
  const canPrepare = state?.p01ArtisticApproved && !state.p02ContinuityFrameReady;
  return (
    <section className="panel rounded-3xl p-6 md:p-8">
      <div className="flex items-center gap-3">
        <Clapperboard className="h-6 w-6 text-violet-300" />
        <h2 className="text-xl font-black">Siguiente toma · E01-P02 — Se detienen</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        La moto azul desacelera y se detiene ante la escuela. Daniel permanece delante
        de Gabriel y Lucía detrás, con sus cascos. Gabriel apoya el pie, estabiliza
        el vehículo y apaga el motor. Nadie desciende hasta E01-P03.
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
          <div className="mt-1 font-bold">{approval?.artisticApproved ? 'Aprobada para montaje' : renderStatus?.videoReady ? 'Generada · En revisión' : 'Pendiente'}</div>
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
      <div className="mt-5 rounded-2xl border border-white/10 p-4">
        <h3 className="font-bold">Producción real E01-P02 · Estado del backend</h3>
        <p className="mt-2 text-sm text-slate-300">Una toma de 8 segundos. La preparación no autoriza cargos.</p>
        <p className="mt-2 text-sm">Estado: {renderStatus?.recordStatus ?? 'No comprobado'}</p>
        <p className="mt-1 text-sm">Estimación técnica: {renderStatus?.estimatedUsd != null ? 'US$' + renderStatus.estimatedUsd.toFixed(2) : 'Pendiente'}</p>
        <p className="mt-1 text-sm text-amber-200">Nuevas solicitudes: bloqueadas tras el envío registrado.</p>
        {renderStatus?.videoReady && renderStatus.videoUrl &&
          <video src={renderStatus.videoUrl} controls preload="metadata" className="mt-3 w-full rounded-xl" />}
        <button type="button" className="button-secondary mt-3" onClick={() => void refreshRender()}>
          <RefreshCcw className="h-4 w-4" /> Comprobar backend P02
        </button>
        <div className="mt-4 rounded-xl border border-emerald-400/30 p-4">
          <p className="font-bold">{approval?.artisticApproved ? 'E01-P02 · APROBADA ARTÍSTICAMENTE' : 'E01-P02 · Aprobación artística'}</p>
          <p className="mt-2 text-xs text-slate-300">{approval?.artisticApproved ? 'Identidad/vestuario: PASS · Voz/sonido: PASS · Movimiento/continuidad: PASS · Lista para montaje.' : 'El MP4 se encuentra pendiente de aprobación artística; no requiere nueva generación.'}</p>
          {!approval?.artisticApproved && renderStatus?.videoReady && <button type="button" className="button-primary mt-3" disabled={paidBusy || !finalToken}
            onClick={() => void approveP02()}>Aprobar artísticamente E01-P02 · Sin costo</button>}
          <button type="button" className="button-secondary mt-3" onClick={() => void refreshApproval().catch(e => setApprovalError(String(e)))}>
            Actualizar aprobación P02
          </button>
          {approvalError && <p role="status" className="mt-2 text-xs text-amber-200">{approvalError}</p>}
        </div>
        <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <p className="text-sm font-bold">Operación Veo E01-P02 — registro y recuperación</p>
          <p className="text-xs text-amber-200">8 segundos a 720p · límite US$0.80 · una solicitud · cero reintentos. Una generación texto-a-video puede presentar diferencias de continuidad respecto de P01.</p>
          <input type="password" autoComplete="off" aria-label="Token administrativo de E01-P02"
            placeholder="Token administrativo del servidor" value={finalToken}
            onChange={event => setFinalToken(event.target.value)}
            className="w-full rounded-lg border border-white/20 bg-slate-950 p-3 text-sm" />
          {!renderStatus?.hasSubmittedOrReserved && (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={finalApproval} onChange={event => setFinalApproval(event.target.checked)} />
                Confirmo UNA generación E01-P02 de hasta US$0.80, sin reintentos.
              </label>
              <button type="button" className="button-primary" onClick={() => void submitP02()}
                disabled={paidBusy || !finalApproval || !finalToken || !renderStatus?.canSubmitAfterUserClick}>
                Generar E01-P02 · Confirmación final US$0.80
              </button>
            </>
          )}
          {renderStatus?.hasSubmittedOrReserved && (
            <button type="button" className="button-secondary" onClick={() => void resumeP02()}
              disabled={paidBusy || !finalToken}>
              Recuperar MISMA operación · No generar nuevamente
            </button>
          )}
        </div>
        {renderError && <p className="mt-2 text-sm text-amber-200" role="status">{renderError}</p>}
        {renderStatus?.canSubmitAfterUserClick &&
          <p className="mt-2 text-sm text-red-300">Alerta: autorización inesperada. No realizar ninguna generación.</p>}
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
        <strong>{approval?.artisticApproved ? 'Verificaciones técnicas de montaje pendientes:' : 'Control de calidad pendiente:'}</strong> continuidad del motor, uniforme y colegio,
        cascos de ambos niños, tres personajes sin duplicados y corte exacto al guion V7.
        La aprobación artística de P01 no certifica automáticamente estas condiciones.
      </div>
      {message && <p className="mt-3 text-sm text-amber-200" role="status">{message}</p>}
    </section>
  );
}
