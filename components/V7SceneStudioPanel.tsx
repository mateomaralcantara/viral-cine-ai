'use client';
import { useCallback, useEffect, useState } from 'react';
import { ensureLocalStudioSession } from '@/lib/v7/security/local-studio-client';

type StudioShot = {
  shotId: string; title: string; camera: string; editSeconds: number; providerSeconds: number;
  spokenText: string; status: string; operationKnown: boolean; error: string | null;
  promptText: string; revisionId: string | null; revisionUsed: boolean;
  mode: 'text-to-video' | 'image-to-video'; estimatedUsd: number | null;
  authorization: string | null; videoReady: boolean;
};
type StudioBoard = {
  sceneLabel: string; title: string; legacy: boolean; model: string; providerEnabled: boolean;
  tariffConfigured: boolean; ratePerSecondUsd: number | null; capUsd: number;
  exposureUsd: number; remainingUsd: number; shots: StudioShot[];
};

const SCENES = ['E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10'];

export default function V7SceneStudioPanel({ filmId }: { filmId: string }) {
  const endpoint = '/api/v7/films/' + encodeURIComponent(filmId) + '/scene-studio';
  const [scene, setScene] = useState('E03');
  const [board, setBoard] = useState<StudioBoard | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [auth, setAuth] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const response = await fetch(endpoint + '?scene=' + scene, { cache: 'no-store' });
    const data = await response.json() as { ok: boolean; board?: StudioBoard; error?: string };
    if (!data.ok || !data.board) throw new Error(data.error || 'Estudio no disponible');
    setBoard(data.board);
  }, [endpoint, scene]);

  useEffect(() => {
    setDrafts({}); setAuth({}); setMessage('');
    void refresh().catch((e) => setMessage(String(e instanceof Error ? e.message : e)));
  }, [refresh]);

  async function post(body: Record<string, unknown>, label: string) {
    setBusy(label); setMessage('');
    try {
      await ensureLocalStudioSession();
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await response.json() as { ok: boolean; error?: string; result?: { status?: string; videoReady?: boolean; error?: string } };
      if (!data.ok) throw new Error(data.error || 'Operación rechazada');
      await refresh();
      return data;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      return null;
    } finally { setBusy(''); }
  }

  const statusColor = (s: string) => s === 'review-required' ? 'text-emerald-300'
    : s.startsWith('failed') ? 'text-red-300' : s === 'not-started' ? 'text-slate-400' : 'text-amber-200';

  return (
    <section className="panel mt-6 rounded-3xl p-6 md:p-8">
      <h2 className="text-2xl font-black">Estudio de escena · Veo</h2>
      <p className="mt-2 text-sm text-slate-300">
        Un solo motor para todas las escenas. Guardar prompt y recuperar son gratis; solo «Generar» cobra,
        con la frase exacta de autorización y un tope fijo por escena que no sube solo.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {SCENES.map((s) => (
          <button key={s} type="button" onClick={() => setScene(s)}
            className={s === scene ? 'button-primary' : 'button-secondary'}>{s}</button>
        ))}
      </div>

      {board && <div className="mt-4 grid gap-3 sm:grid-cols-4 text-sm">
        <div className="rounded-xl border border-white/10 p-3"><div className="text-slate-400">Escena</div><b>{board.sceneLabel} · {board.title}</b></div>
        <div className="rounded-xl border border-white/10 p-3"><div className="text-slate-400">Modelo</div><b>{board.model}</b></div>
        <div className="rounded-xl border border-white/10 p-3"><div className="text-slate-400">Gasto / tope</div>
          <b>US${board.exposureUsd.toFixed(2)} / US${board.capUsd.toFixed(2)}</b></div>
        <div className="rounded-xl border border-white/10 p-3"><div className="text-slate-400">Tarifa</div>
          <b>{board.ratePerSecondUsd === null ? 'sin verificar' : 'US$' + board.ratePerSecondUsd + '/s'}</b></div>
      </div>}

      {board && !board.providerEnabled && <p className="mt-3 text-sm text-amber-200">
        Veo está apagado (V7_VEO_SCENES_ENABLED=false). Puedes preparar y guardar prompts sin costo.</p>}
      {board && !board.tariffConfigured && <p className="mt-2 text-sm text-amber-200">
        Falta V7_VEO_USD_PER_SECOND (tarifa verificada en la página de precios de Google).</p>}
      {board && board.capUsd <= 0 && <p className="mt-2 text-sm text-amber-200">
        Falta V7_SCENE_MAX_USD (tope fijo por escena).</p>}
      {board?.legacy && <p className="mt-2 text-sm text-amber-200">Esta escena usa su panel propio.</p>}
      {message && <p className="mt-3 text-sm text-red-300" role="alert">{message}</p>}

      <div className="mt-5 space-y-4">
        {board?.shots.map((shot) => {
          const draft = drafts[shot.shotId] ?? shot.promptText;
          const dirty = draft.trim() !== shot.promptText.trim() || !shot.revisionId;
          const canSubmit = Boolean(board.providerEnabled && board.tariffConfigured && board.capUsd > 0 &&
            shot.revisionId && !dirty && !shot.revisionUsed && shot.authorization &&
            (auth[shot.shotId] || '').trim() === shot.authorization &&
            (shot.status === 'not-started' || shot.status === 'failed-no-video'));
          return (
            <div key={shot.shotId} className="rounded-2xl border border-white/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{shot.shotId} · {shot.title}</b>
                <span className={'text-xs font-bold uppercase ' + statusColor(shot.status)}>{shot.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {shot.camera} · corte {shot.editSeconds}s · Veo {shot.providerSeconds}s · {shot.mode === 'image-to-video' ? 'parte de la foto de la toma' : 'solo texto (sin foto)'}
                {shot.estimatedUsd !== null && ' · ~US$' + shot.estimatedUsd.toFixed(2)}
              </p>
              {shot.spokenText && <p className="mt-1 text-xs text-slate-300">Voz posterior: «{shot.spokenText}»</p>}
              <textarea className="mt-3 w-full rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white" rows={4}
                value={draft} onChange={(e) => setDrafts((d) => ({ ...d, [shot.shotId]: e.target.value }))}/>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className="button-secondary" disabled={!!busy || !dirty}
                  onClick={() => void post({ action: 'save-prompt', shotId: shot.shotId, promptText: draft }, shot.shotId)}>
                  Guardar versión · gratis</button>
                <button type="button" className="button-secondary" disabled={!!busy || !shot.operationKnown || shot.videoReady}
                  onClick={() => void post({ action: 'resume', shotId: shot.shotId }, shot.shotId)}>
                  Recuperar misma tarea · gratis</button>
                {shot.videoReady && <a className="button-secondary" target="_blank" rel="noreferrer"
                  href={'/api/v7/films/' + encodeURIComponent(filmId) + '/scene-production/video?shotId=' + encodeURIComponent(shot.shotId)}>Ver MP4</a>}
                <span className="text-xs text-slate-400">{shot.revisionId ? 'Versión ' + shot.revisionId.slice(0, 18) : 'Sin versión guardada'}</span>
              </div>
              {shot.error && <p className="mt-2 text-xs text-red-300">{shot.error}</p>}
              {(shot.status === 'not-started' || shot.status === 'failed-no-video') && shot.authorization && (
                <div className="mt-3 rounded-xl border border-amber-400/30 p-3">
                  <p className="text-xs text-amber-200">Para generar escribe exactamente: <b>{shot.authorization}</b></p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input className="min-w-[260px] flex-1 rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white"
                      value={auth[shot.shotId] || ''} placeholder={shot.authorization}
                      onChange={(e) => setAuth((a) => ({ ...a, [shot.shotId]: e.target.value }))}/>
                    <button type="button" className="button-primary" disabled={!!busy || !canSubmit}
                      onClick={() => void post({ action: 'submit', shotId: shot.shotId, revisionId: shot.revisionId, authorization: auth[shot.shotId] }, shot.shotId)}>
                      {busy === shot.shotId ? 'Enviando…' : 'Generar con Veo'}</button>
                  </div>
                  {dirty && <p className="mt-1 text-xs text-slate-400">Guarda primero la versión del prompt.</p>}
                  {shot.revisionUsed && <p className="mt-1 text-xs text-slate-400">Esta versión ya se usó: guarda una corregida.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-slate-400">
        Cuando un video está listo, apruébalo y monta la escena en la pestaña «Escenas», como en E02.
      </p>
    </section>
  );
}
