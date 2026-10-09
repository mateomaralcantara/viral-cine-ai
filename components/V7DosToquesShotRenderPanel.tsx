'use client';

import { useEffect, useState } from 'react';
import { Clapperboard, Film, KeyRound, LockKeyhole, RefreshCcw } from 'lucide-react';

type VideoStatus = {
  ok: boolean;
  maximumApprovedUsd: number;
  estimatedUsd: number;
  maxProviderSubmissions: number;
  automaticRetries: number;
  referenceReady: boolean;
  referenceSha256: string | null;
  promptSha256: string;
  providerMode: 'text-to-video';
  imageReferenceNotSentToGoogle: boolean;
  flagsEnabled: boolean;
  rateVerifiedInEnv: boolean;
  capVerifiedInEnv: boolean;
  credentialConfigured: boolean;
  adminTokenConfigured: boolean;
  recordStatus: string;
  providerOperationKnown: boolean;
  hasSubmittedOrReserved: boolean;
  videoReady: boolean;
  videoUrl: string | null;
  canSubmitAfterUserClick: boolean;
  error?: string | null;
};

export default function V7DosToquesShotRenderPanel({ filmId }: { filmId: string }) {
  const endpoint = '/api/v7/films/' + encodeURIComponent(filmId) + '/e01-p01-render';
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [checked, setChecked] = useState(false);
  const [familyConfirmed, setFamilyConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const response = await fetch(endpoint, { cache: 'no-store' });
    const result = await response.json() as VideoStatus;
    if (!response.ok || !result.ok) throw new Error(result.error || 'No se puede comprobar la toma');
    setStatus(result);
  }
  useEffect(() => {
    let active = true;
    void fetch(endpoint, { cache: 'no-store' }).then(async res => {
      const result = await res.json() as VideoStatus;
      if (!res.ok || !result.ok) throw new Error(result.error || 'Error consultando toma');
      if (active) setStatus(result);
    }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, [endpoint]);

  async function action(kind: 'submit' | 'resume') {
    if (!adminToken) { setMessage('Introduce primero el token administrativo local.'); return; }
    setBusy(true);
    setMessage('');
    try {
      const body = kind === 'submit' ? {
        action: 'submit',
        promptSha256: status?.promptSha256 || '',
        approvedEstimateUsd: status?.estimatedUsd,
        confirm: checked,
        compositionConfirmed: familyConfirmed ? 'gabriel-daniel-lucia-on-motorcycle-v2' : ''
      } : { action: 'resume' };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + adminToken },
        body: JSON.stringify(body),
        cache: 'no-store'
      });
      const data = await response.json() as { ok?: boolean; error?: string; status?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || 'La operación no pudo completarse');
      setMessage(data.status === 'review-required'
        ? 'Video candidato descargado. Revísalo antes de incorporarlo al montaje.'
        : data.status === 'processing'
          ? 'La misma operación sigue procesándose en Google. No crees otro intento.'
          : data.status === 'submitted'
            ? 'Solicitud única enviada. Guarda la sesión y utiliza Recuperar operación.'
            : 'Estado de la operación: ' + data.status);
      setChecked(false);
      setFamilyConfirmed(false);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const missing: string[] = [];
  if (status) {

    if (!status.rateVerifiedInEnv) missing.push('V7_VEO_USD_PER_SECOND=0.10 (tarifa oficial verificada)');
    if (!status.capVerifiedInEnv) missing.push('V7_CINEMA_MAX_USD=2 (máximo local)');
    if (!status.credentialConfigured) missing.push('GEMINI_API_KEY debe estar configurada en el servidor');
    if (!status.adminTokenConfigured) missing.push('V7_CINEMA_ADMIN_TOKEN (secreto de 24+ caracteres)');
    if (!status.flagsEnabled) missing.push('Activar solo V7_DOS_TOQUES_P01_PAID_ENABLED=true; mantener los demás pagos globales desactivados');
  }

  return (
    <section className="panel mt-6 rounded-3xl p-6 md:p-8">
      <div className="flex items-center gap-3">
        <Clapperboard className="h-6 w-6 text-violet-300" />
        <h2 className="text-xl font-black">Generar primera toma real · Veo Fast</h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        Una única generación de ocho segundos con Veo 3.1 Fast a 720p, destinada a
        E01-P01. Para incluir a Daniel y Lucía, utiliza <strong>texto-a-video</strong>:
        la imagen familiar sirve de guía editorial, pero Google no la recibirá.
        La continuidad facial tendrá que verificarse después. El resultado se almacena como <strong>candidato</strong>, no sustituye
        la previsualización ni se considera aprobado hasta revisar su calidad.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-xs text-slate-400">Límite autorizado</div>
          <div className="mt-1 text-xl font-black">US$2.00</div>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-xs text-slate-400">Precio previsto</div>
          <div className="mt-1 text-xl font-black">US$0.80</div>
        </div>
        <div className="rounded-xl border border-white/10 p-3">
          <div className="text-xs text-slate-400">Estado de la operación</div>
          <div className="mt-1 text-sm font-bold">{status?.recordStatus || 'Consultando...'}</div>
        </div>
      </div>

      {status?.videoReady && status.videoUrl ? (
        <div className="mt-5">
          <h3 className="text-base font-bold">Toma candidata disponible · inspección humana</h3>
          <video src={status.videoUrl} controls preload="metadata"
            className="mt-3 aspect-video w-full rounded-xl bg-black" />
          <p className="mt-2 text-xs text-amber-200">
            Revisa que el vehículo, el casco y el movimiento correspondan a E01-P01.
            Todavía falta recortar el bruto de 8 s a la duración editorial de V7.
          </p>
        </div>
      ) : null}

      {missing.length > 0 && !status?.hasSubmittedOrReserved ? (
        <div className="mt-5 rounded-xl border border-amber-400/20 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-200">
            <LockKeyhole className="h-4 w-4" /> Comprobaciones pendientes
          </h3>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-amber-100/80">
            {missing.map(value => <li key={value}>{value}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-white/10 p-4">
        <label className="flex items-center gap-2 text-sm font-bold" htmlFor="dos-toques-admin">
          <KeyRound className="h-4 w-4" /> Token administrativo (solo en memoria de la pestaña)
        </label>
        <input id="dos-toques-admin" type="password"
          className="mt-3 w-full rounded-lg border border-white/20 bg-slate-950 p-3 text-sm"
          autoComplete="off" value={adminToken} onChange={event => setAdminToken(event.target.value)}
          placeholder="No publiques este token ni la clave de Google" />
        {!status?.hasSubmittedOrReserved && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={familyConfirmed}
              onChange={event => setFamilyConfirmed(event.target.checked)} />
            <span>Confirmo la puesta en escena: aparecen Gabriel, Daniel y Lucía juntos,
              con cascos y edades correctas, llegando a la escuela. Esta generación
              es de texto a video; no se envía una imagen de referencia a Google,
              y los rostros deben comprobarse al recibir el clip.</span>
          </label>
        )}
        {!status?.hasSubmittedOrReserved && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={checked}
              onChange={event => setChecked(event.target.checked)} />
            <span>Confirmo la primera y única solicitud Veo E01-P01 de 8 segundos,
              con costo previsto de US$0.80 y límite total US$2.00;
              no autorizo reintentos ni otras tomas.</span>
          </label>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {!status?.hasSubmittedOrReserved ? (
            <button type="button" className="button-primary"
              disabled={busy || !checked || !familyConfirmed || !adminToken || !status?.canSubmitAfterUserClick}
              onClick={() => void action('submit')}>
              <Film className="h-4 w-4" />
              {busy ? 'Enviando una operación...' : 'Generar una sola toma — US$0.80 previsto'}
            </button>
          ) : status.providerOperationKnown && !status.videoReady ? (
            <button type="button" className="button-primary"
              disabled={busy || !adminToken}
              onClick={() => void action('resume')}>
              <RefreshCcw className="h-4 w-4" />
              {busy ? 'Consultando Google...' : 'Recuperar la misma operación'}
            </button>
          ) : (
            <span className="text-sm text-amber-200">
              {status.videoReady
                ? 'Video candidato recibido; no hay nuevos cargos previstos.'
                : 'Solicitud anterior reservada o incierta. Bloqueado cualquier reintento.'}
            </span>
          )}
          <button type="button" className="button-secondary"
            disabled={busy}
            onClick={() => void refresh().catch(error =>
              setMessage(error instanceof Error ? error.message : String(error)))}>
            <RefreshCcw className="h-4 w-4" /> Actualizar estado
          </button>
        </div>
      </div>
      {message && <p className="mt-4 text-sm text-amber-200" role="status">{message}</p>}
      <p className="mt-4 text-xs text-slate-400">
        Los controles garantizan que este flujo solo pueda enviar una solicitud desde el estudio
        local. Ante un error incierto, se conserva el registro y se requiere conciliación manual
        antes de cualquier nuevo gasto. Ninguna llamada se envía simplemente por abrir este panel.
      </p>
    </section>
  );
}
