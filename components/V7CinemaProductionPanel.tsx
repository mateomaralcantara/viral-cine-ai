'use client';

import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw, ShieldCheck } from 'lucide-react';

type ProductionShot = {
  id: string; title: string; seconds: number; providerSeconds: number;
  source: 'WEB' | 'V6'; referenceReady: boolean; referenceSha256: string | null;
  referenceUrl: string; videoUrl: string | null; videoModelAllowed: boolean;
  estimatedUsd: number | null; status: string; operationKnown: boolean; error: string | null;
};
type Board = {
  filmTitle: string; model: string; paidEnabled: boolean; tariffConfigured: boolean;
  maxSpendUsd: number; exposureUsd: number; remainingUsd: number; shots: ProductionShot[];
};

export default function V7CinemaProductionPanel({ filmId }: { filmId: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const endpoint = '/api/v7/films/' + encodeURIComponent(filmId) + '/cinema';

  const refresh = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store' });
    const data = await response.json() as { ok?: boolean; board?: Board; error?: string };
    if (!response.ok || !data.ok || !data.board) throw new Error(data.error || 'Cinema Core no disponible');
    setBoard(data.board);
  }, [endpoint]);

  useEffect(() => { void refresh().catch((error) => setMessage(String(error))); }, [refresh]);

  async function action(shot: ProductionShot, verb: 'submit' | 'resume') {
    setMessage('');
    if (!adminToken.trim()) { setMessage('Es necesario el token de producción V7.'); return; }
    if (verb === 'submit') {
      if (!verified[shot.id] || !shot.referenceSha256 || shot.estimatedUsd === null) {
        setMessage('Verifica la identidad en la imagen y la tarifa antes de generar.');
        return;
      }
      const approved = window.confirm(
        'Autorizar UNA generación Veo de ' + shot.providerSeconds +
        's, estimada en US$' + shot.estimatedUsd.toFixed(2) +
        '. El proveedor NO garantiza un tope duro. ¿Continuar?'
      );
      if (!approved) return;
    }
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken.trim() },
        body: JSON.stringify({
          action: verb, shotId: shot.id, referenceSha256: shot.referenceSha256,
          approvedEstimateUsd: shot.estimatedUsd, confirm: verb === 'submit'
        })
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || 'Solicitud rechazada');
      setMessage(verb === 'submit'
        ? 'Solicitud registrada. Consulta su estado sin generar de nuevo.'
        : 'Consulta finalizada. Revisa el estado actual.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-5">
      <header className="panel rounded-3xl p-6">
        <h2 className="text-2xl font-black">Cinema Core · Producción Libroseller</h2>
        <p className="mt-2 text-sm text-slate-400">
          Veo produce video real con referencias; las pantallas de Libroseller se graban de forma auténtica.
          V6 queda intacto. La sincronización labial se posterga y cada resultado requiere aprobación humana.
        </p>
        {board && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-300">
            <span>Modelo: {board.model}</span>
            <span>Tope local configurado: US$ {board.maxSpendUsd.toFixed(2)}</span>
            <span>Exposición registrada: US$ {board.exposureUsd.toFixed(2)}</span>
            <span>Disponible local: US$ {board.remainingUsd.toFixed(2)}</span>
          </div>
        )}
        {board && (!board.paidEnabled || !board.tariffConfigured || board.maxSpendUsd <= 0) &&
          <p className="mt-3 text-sm text-amber-300">
            Generación pagada DESHABILITADA. Debes configurar los permisos y verificar la tarifa en .env.local.
          </p>}
        <label className="mt-4 block text-sm text-slate-300" htmlFor="v7-cinema-token">
          Token administrativo de producción (solo memoria de esta pestaña)
        </label>
        <input id="v7-cinema-token" type="password" value={adminToken}
          onChange={(event) => setAdminToken(event.target.value)} autoComplete="off"
          className="mt-2 w-full max-w-md rounded-xl border border-white/20 bg-slate-950 p-3 text-white" />
        <button type="button" className="button-secondary mt-3"
          onClick={() => void refresh().catch((error) => setMessage(String(error)))}>
          <RefreshCw className="h-4 w-4" /> Actualizar estado
        </button>
        {message && <p role="status" className="mt-3 text-sm text-amber-200">{message}</p>}
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {board?.shots.map((shot) => (
          <article key={shot.id} className="panel rounded-3xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-violet-300">{shot.id}</p>
                <h3 className="mt-1 text-lg font-bold">{shot.title}</h3>
              </div>
              <div className="text-xs text-slate-400">
                <div>{shot.seconds}s / proveedor {shot.providerSeconds}s</div>
                <div>Estado: {shot.status}</div>
              </div>
            </div>
            {shot.referenceReady
              ? <img src={shot.referenceUrl} alt={'Referencia ' + shot.id}
                  className="mt-4 aspect-video w-full rounded-xl bg-black object-contain" />
              : <p className="mt-3 text-amber-300">Falta la imagen de referencia. Generación bloqueada.</p>}
            {shot.videoUrl && <video className="mt-4 aspect-video w-full rounded-xl bg-black"
              controls preload="metadata" src={shot.videoUrl} />}
            {!shot.videoModelAllowed && <p className="mt-3 text-sm text-amber-300">
              Toma WEB: capturar la interfaz auténtica; generación de pantallas con Veo bloqueada.
            </p>}
            {shot.error && <p className="mt-3 text-xs text-amber-300">{shot.error}</p>}
            {shot.videoModelAllowed && shot.status === 'not-started' && shot.referenceReady && (
              <label className="mt-3 flex items-start gap-2 text-xs text-slate-300">
                <input type="checkbox" className="mt-1" checked={Boolean(verified[shot.id])}
                  onChange={(event) => setVerified((prev) => ({ ...prev, [shot.id]: event.target.checked }))} />
                Confirmo que la referencia muestra los personajes correctos y está autorizada para este proyecto.
              </label>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {shot.status === 'not-started' && shot.videoModelAllowed && (
                <button type="button" className="button-primary"
                  disabled={busy || !board.paidEnabled || !board.tariffConfigured ||
                    !verified[shot.id] || !shot.referenceReady ||
                    shot.estimatedUsd === null || board.remainingUsd < shot.estimatedUsd}
                  onClick={() => void action(shot, 'submit')}>
                  <Play className="h-4 w-4" /> Generar una vez · {shot.estimatedUsd === null
                    ? 'sin tarifa' : 'US$ ' + shot.estimatedUsd.toFixed(2) + ' estimados'}
                </button>
              )}
              {shot.operationKnown && shot.status !== 'review-required' && (
                <button type="button" className="button-secondary" disabled={busy}
                  onClick={() => void action(shot, 'resume')}>
                  <RefreshCw className="h-4 w-4" /> Recuperar misma tarea
                </button>
              )}
              {shot.status === 'review-required' && (
                <span className="flex items-center gap-2 text-xs text-amber-300">
                  <ShieldCheck className="h-4 w-4" /> Video candidato. Falta revisión humana.
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
