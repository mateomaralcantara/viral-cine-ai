'use client';
import { useCallback, useEffect, useState } from 'react';
import { ensureLocalStudioSession } from '@/lib/v7/security/local-studio-client';
import V7HarnessPanel from '@/components/V7HarnessPanel';
import V7GreenPanel from '@/components/V7GreenPanel';

type StudioShot = {
  shotId: string; title: string; camera: string; editSeconds: number; providerSeconds: number;
  spokenText: string; status: string; operationKnown: boolean; error: string | null;
  promptText: string; revisionId: string | null; revisionUsed: boolean;
  mode: 'text-to-video' | 'image-to-video'; estimatedUsd: number | null;
  authorization: string | null; redoAuthorization: string | null; videoReady: boolean;
  locked?: boolean; removed?: boolean; hasReference?: boolean; authorPhoto?: boolean; stillShot?: boolean; gate?: { pass: boolean; reasons: string[] } | null;
};
type StudioBoard = {
  sceneLabel: string; sceneLabels?: string[]; platform?: 'gemini' | 'vertex'; platformProblem?: string | null; frozen?: boolean; title: string; legacy: boolean; model: string; providerEnabled: boolean;
  tariffConfigured: boolean; ratePerSecondUsd: number | null; capUsd: number;
  exposureUsd: number; remainingUsd: number; shots: StudioShot[];
  pendingShots: string[]; sceneTotalUsd: number; sceneAuthorization: string | null;
};


export default function V7SceneStudioPanel({ filmId }: { filmId: string }) {
  const endpoint = '/api/v7/films/' + encodeURIComponent(filmId) + '/scene-studio';
  const [scene, setScene] = useState('');
  const [board, setBoard] = useState<StudioBoard | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [auth, setAuth] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [sceneAuth, setSceneAuth] = useState('');
  const [summary, setSummary] = useState('');

  const refresh = useCallback(async () => {
    const response = await fetch(endpoint + (scene ? '?scene=' + scene : ''), { cache: 'no-store' });
    const data = await response.json() as { ok: boolean; board?: StudioBoard; error?: string };
    if (!data.ok || !data.board) throw new Error(data.error || 'Estudio no disponible');
    setBoard(data.board);
    if (!scene) setScene(data.board.sceneLabel);
  }, [endpoint, scene]);

  useEffect(() => {
    setDrafts({}); setAuth({}); setMessage(''); setSceneAuth(''); setSummary('');
    void refresh().catch((e) => setMessage(String(e instanceof Error ? e.message : e)));
  }, [refresh]);

  // Mientras haya tomas en proceso, EN COLA o rechazadas por cuota, la página sigue trabajando sola
  // (cada 30 s recupera las terminadas y envía las que esperan en cola).
  const waiting = board?.shots.some((s) => ['submitted', 'processing', 'queued', 'quota-rejected'].includes(s.status)) ?? false;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      void fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume-scene', scene }) })
        .then(async (r) => { reportResume(await r.json()); await refresh(); }).catch(() => undefined);
    }, 30000);
    return () => clearInterval(timer);
  }, [waiting, endpoint, scene, refresh]);

  /** Muestra los errores de recuperación en vez de ignorarlos (si no, una toma podría quedar «submitted» sin aviso). */
  function reportResume(data: unknown) {
    type Item = { shotId: string; status: string; error?: string };
    const r = (data as { result?: { results?: Item[]; dispatched?: Item[] } } | null)?.result;
    const failed = [...(r?.results ?? []), ...(r?.dispatched ?? [])].filter((x) => x.error || x.status === 'error' || x.status === 'stopped');
    if (failed.length) setMessage('No se pudo continuar: ' + failed.map((x) => x.shotId + ': ' + (x.error || x.status)).join(' · '));
  }

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

  const [photoStamp, setPhotoStamp] = useState<Record<string, number>>({});
  async function uploadShotPhoto(shotId: string, file: File) {
    setBusy(shotId); setMessage('');
    try {
      await ensureLocalStudioSession();
      const fd = new FormData(); fd.set('scene', scene); fd.set('shotId', shotId); fd.append('fotos', file);
      const r = await fetch(endpoint + '/fotos', { method: 'POST', credentials: 'same-origin', body: fd });
      const d = await r.json() as { ok: boolean; error?: string; results?: Array<{ ok: boolean; error?: string }> };
      if (!d.ok || !d.results?.[0]?.ok) throw new Error(d.error || d.results?.[0]?.error || 'No se pudo subir la foto');
      setPhotoStamp((p) => ({ ...p, [shotId]: Date.now() }));
      setSummary(shotId + ': tu foto es la foto de partida. Veo partirá de ella.');
      await refresh();
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
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
        {(board?.sceneLabels ?? []).map((s) => (
          <button key={s} type="button" onClick={() => setScene(s)}
            className={s === scene ? 'button-primary' : 'button-secondary'}>{s}</button>
        ))}
      </div>

      {board && !board.legacy && scene && <V7GreenPanel filmId={filmId} scene={scene} onSelect={setScene}/>}

      {board && <div className="mt-4 grid gap-3 sm:grid-cols-4 text-sm">
        <div className="rounded-xl border border-white/10 p-3"><div className="text-slate-400">Escena</div><b>{board.sceneLabel} · {board.title}</b></div>
        <div className="rounded-xl border border-white/10 p-3"><div className="text-slate-400">Modelo · {board.platform === 'vertex' ? 'Vertex AI' : 'AI Studio'}</div><b>{board.model}</b></div>
        <div className="rounded-xl border border-white/10 p-3"><div className="text-slate-400">Gasto / tope</div>
          <b>US${board.exposureUsd.toFixed(2)} / US${board.capUsd.toFixed(2)}</b></div>
        <div className="rounded-xl border border-white/10 p-3"><div className="text-slate-400">Tarifa</div>
          <b>{board.ratePerSecondUsd === null ? 'sin verificar' : 'US$' + board.ratePerSecondUsd + '/s'}</b></div>
      </div>}

      {board?.platformProblem && <p className="mt-3 text-sm text-red-300">{board.platformProblem}</p>}
      {board?.frozen && <p className="mt-3 text-sm text-amber-200">Película congelada (V7_FROZEN_FILMS): no se genera nada nuevo.</p>}
      {board && !board.providerEnabled && <p className="mt-3 text-sm text-amber-200">
        Veo está apagado (V7_VEO_SCENES_ENABLED=false). Puedes preparar y guardar prompts sin costo.</p>}
      {board && !board.tariffConfigured && <p className="mt-2 text-sm text-amber-200">
        Falta V7_VEO_USD_PER_SECOND (tarifa verificada en la página de precios de Google).</p>}
      {board && board.capUsd <= 0 && <p className="mt-2 text-sm text-amber-200">
        Falta V7_SCENE_MAX_USD (tope fijo por escena).</p>}
      {board?.legacy && <p className="mt-2 text-sm text-amber-200">Esta escena usa su panel propio.</p>}
      {message && <p className="mt-3 text-sm text-red-300" role="alert">{message}</p>}
      {summary && <p className="mt-3 text-sm text-emerald-300" role="status">{summary}</p>}

      {board && !board.legacy && scene && <V7HarnessPanel part="antes" filmId={filmId} scene={scene} onChanged={() => void refresh().catch(() => undefined)}/>}

      {board && !board.legacy && <div className="mt-5 rounded-2xl border border-violet-400/40 bg-violet-500/[.06] p-4">
        <h3 className="text-lg font-black">3 · Generar la escena completa con Veo</h3>
        {board.sceneAuthorization ? <>
          <p className="mt-1 text-sm text-slate-300">
            Envía las {board.pendingShots.length} tomas pendientes con su prompt actual (las que no tengan versión se guardan tal cual).
            Total: <b>US${board.sceneTotalUsd.toFixed(2)}</b>. Se detiene ante el primer error; nunca reintenta solo.
          </p>
          <p className="mt-2 text-xs text-amber-200">Escribe exactamente: <b>{board.sceneAuthorization}</b></p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="min-w-[280px] flex-1 rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white"
              value={sceneAuth} placeholder="Escribe aquí la frase amarilla de arriba" onChange={(e) => setSceneAuth(e.target.value)}/>
            <button type="button" className="button-primary"
              disabled={!!busy || !board.providerEnabled || !board.tariffConfigured || board.capUsd <= 0 || sceneAuth.trim() !== board.sceneAuthorization}
              onClick={() => void post({ action: 'submit-scene', scene, authorization: sceneAuth }, 'scene').then((d) => {
                const r = (d as { result?: { submitted?: number; queued?: number; results?: Array<{ shotId: string; status: string; error?: string }> } } | null)?.result;
                if (r) setSummary('Enviadas ' + r.submitted + ' tomas' + (r.queued ? '; ' + r.queued + ' en cola, se envían solas al terminar las anteriores' : '') + '. ' + (r.results?.filter((x) => x.status !== 'submitted').map((x) => x.shotId + ': ' + (x.error || x.status)).join(' · ') || '') +
                  ' La AUTOCORRECCIÓN arranca sola (tope US$5): revisa, corrige, reintenta los bloqueos y fija lo que pasa la puerta.');
                // Los agentes de autocorrección arrancan solos con la escena (si no estaban ya en marcha).
                if (r) void post({ action: 'harness', kind: 'autocorreccion', scene, budgetUsd: 5 }, 'auto').catch(() => undefined);
              })}>
              {busy === 'scene' ? 'Enviando escena…' : 'Generar escena completa con Veo'}</button>
          </div>
        </> : <p className="mt-1 text-sm text-slate-300">No quedan tomas pendientes. {waiting ? 'Recuperando videos y enviando la cola cada 30 s…' : ''}</p>}
        <button type="button" className="button-secondary mt-3" disabled={!!busy}
          onClick={() => void post({ action: 'resume-scene', scene }, 'resume-scene').then((d) => reportResume(d))}>Recuperar todas · gratis</button>
      </div>}

      {board && !board.legacy && scene && <V7HarnessPanel part="despues" filmId={filmId} scene={scene} onChanged={() => void refresh().catch(() => undefined)}/>}

      <div className="mt-5 space-y-4">
        {board?.shots.map((shot) => {
          const draft = drafts[shot.shotId] ?? shot.promptText;
          const dirty = draft.trim() !== shot.promptText.trim() || !shot.revisionId;
          const canSubmit = Boolean(board.providerEnabled && board.tariffConfigured && board.capUsd > 0 &&
            shot.revisionId && !dirty && !shot.revisionUsed && shot.authorization &&
            (auth[shot.shotId] || '').trim() === shot.authorization &&
            (shot.status === 'not-started' || shot.status === 'failed-no-video' || shot.status === 'quota-rejected'));
          return (
            <div key={shot.shotId} className="rounded-2xl border border-white/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{shot.shotId} · {shot.title}</b>
                <span className="flex flex-wrap items-center gap-2">
                  {shot.removed && <span className="rounded bg-slate-500/30 px-2 text-xs font-bold text-slate-200">QUITADA DEL MONTAJE</span>}
                  {shot.locked && <span className="rounded bg-emerald-500/20 px-2 text-xs font-bold text-emerald-300">FIJADA</span>}
                  {!shot.locked && shot.gate && <span className={'rounded px-2 text-xs font-bold ' + (shot.gate.pass ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300')}>{shot.gate.pass ? 'PASA LA PUERTA' : 'NO PASA LA PUERTA'}</span>}
                  <span className={'text-xs font-bold uppercase ' + statusColor(shot.status)}>{shot.status}</span>
                </span>
              </div>
              {!shot.locked && shot.gate && !shot.gate.pass && <ul className="mt-1 list-disc pl-5 text-xs text-red-300">{shot.gate.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
              <p className="mt-1 text-xs text-slate-400">
                {shot.camera} · corte {Number(shot.editSeconds.toFixed(1))}s · Veo {shot.providerSeconds}s · {shot.mode === 'image-to-video' ? 'parte de la foto de continuidad' : 'solo texto (sin foto)'}
                {shot.estimatedUsd !== null && ' · ~US$' + shot.estimatedUsd.toFixed(2)}
              </p>
              {shot.spokenText && <p className="mt-1 text-xs text-slate-300">Voz posterior: «{shot.spokenText}»</p>}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {shot.hasReference
                  ? <a href={endpoint + '/fotos?shot=' + shot.shotId} target="_blank" rel="noreferrer" title="Foto de partida">
                      <img alt={'Foto de partida ' + shot.shotId} className="h-16 rounded-lg border border-white/20" src={endpoint + '/fotos?shot=' + shot.shotId + '&v=' + (photoStamp[shot.shotId] ?? 0)}/></a>
                  : <span className="flex h-16 w-28 items-center justify-center rounded-lg border border-dashed border-white/20 text-[10px] text-slate-500">sin foto</span>}
                <span className="text-xs text-slate-400">{shot.stillShot ? 'PLANO FIJO CON TU FOTO (sin Veo)' : shot.authorPhoto ? 'FOTO TUYA (manda: no se sustituye)' : shot.hasReference ? 'foto de continuidad' : 'Veo inventará la imagen'}</span>
                {shot.authorPhoto && !shot.stillShot && <button type="button" className="rounded-lg border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200" disabled={!!busy}
                  title="Para imágenes que Veo no acepta o cuando tu foto ya es el plano que quieres"
                  onClick={() => void post({ action: 'plano-fijo', shotId: shot.shotId }, shot.shotId).then((d) => { if (d) setSummary(shot.shotId + ': plano fijo con tu foto creado (gratis) y FIJADO. Entra así en la película.'); })}>
                  Usar mi foto como plano fijo · gratis, sin Veo</button>}
                {shot.stillShot && <button type="button" className="rounded-lg border border-white/20 px-2 py-1 text-xs" disabled={!!busy}
                  onClick={() => void post({ action: 'quitar-plano-fijo', shotId: shot.shotId }, shot.shotId)}>Quitar plano fijo</button>}
                {!shot.locked && <label className="cursor-pointer rounded-lg border border-white/20 px-2 py-1 text-xs hover:border-white/40">
                  {shot.authorPhoto ? 'Cambiar mi foto' : 'Subir mi foto'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={!!busy}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadShotPhoto(shot.shotId, f); }}/>
                </label>}
              </div>
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
              {shot.videoReady && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400">Decisión del autor:</span>
                {!shot.locked
                  ? <button type="button" className="button-secondary" disabled={!!busy} onClick={() => void post({ action: 'shot-author', what: 'fijar', shotId: shot.shotId }, shot.shotId)}>Aprobar esta toma</button>
                  : <button type="button" className="button-secondary" disabled={!!busy} onClick={() => void post({ action: 'shot-author', what: 'soltar', shotId: shot.shotId }, shot.shotId)}>Soltar (permitir cambios)</button>}
                {!shot.removed
                  ? <button type="button" className="button-secondary" disabled={!!busy} onClick={() => void post({ action: 'shot-author', what: 'quitar', shotId: shot.shotId }, shot.shotId)}>Quitar del montaje</button>
                  : <button type="button" className="button-secondary" disabled={!!busy} onClick={() => void post({ action: 'shot-author', what: 'devolver', shotId: shot.shotId }, shot.shotId)}>Devolver al montaje</button>}
                {shot.estimatedUsd !== null && <button type="button" className="button-secondary" disabled={!!busy || !board.providerEnabled}
                  onClick={() => { if (window.confirm(`¿Rehacer ${shot.shotId} con una foto de continuidad nueva? Cuesta ~US$${(shot.estimatedUsd! + 0.04).toFixed(2)}. El video actual se archiva.`)) void post({ action: 'harness', kind: 'rehacer', scene, shots: [shot.shotId], budgetUsd: Math.ceil(shot.estimatedUsd! * 100 + 1) / 100 }, shot.shotId).then((d) => { if (d) setSummary(`${shot.shotId}: se está rehaciendo. Mira el registro en «Corregir, ver y aprobar»; cuando termine pulsa «4 · Autocorrección».`); }); }}>
                  Rehacer con foto nueva · ~US${(shot.estimatedUsd + 0.04).toFixed(2)}</button>}
              </div>}
              {shot.error && <p className="mt-2 text-xs text-red-300">{shot.error}</p>}
              {shot.status === 'review-required' && shot.redoAuthorization && (
                <details className="mt-3 rounded-xl border border-white/10 p-3">
                  <summary className="cursor-pointer text-sm font-bold">Rehacer esta toma (el video actual se archiva, no se borra)</summary>
                  <ol className="mt-2 list-decimal pl-5 text-xs text-slate-300">
                    <li>Cambia el texto de arriba y pulsa «Guardar versión».</li>
                    <li>Escribe exactamente: <b className="text-amber-200">{shot.redoAuthorization}</b></li>
                  </ol>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input className="min-w-[260px] flex-1 rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white"
                      value={auth[shot.shotId] || ''} placeholder="Escribe aquí la frase amarilla de arriba"
                      onChange={(e) => setAuth((a) => ({ ...a, [shot.shotId]: e.target.value }))}/>
                    <button type="button" className="button-primary"
                      disabled={!!busy || !board.providerEnabled || !board.tariffConfigured || dirty || shot.revisionUsed ||
                        (auth[shot.shotId] || '').trim() !== shot.redoAuthorization}
                      onClick={() => void post({ action: 'submit', redo: true, shotId: shot.shotId, revisionId: shot.revisionId, authorization: auth[shot.shotId] }, shot.shotId)}>
                      {busy === shot.shotId ? 'Enviando…' : 'Rehacer con texto nuevo'}</button>
                  </div>
                  {(dirty || shot.revisionUsed) && <p className="mt-1 text-xs text-slate-400">Primero guarda una versión nueva del texto.</p>}
                </details>
              )}
              {(shot.status === 'not-started' || shot.status === 'failed-no-video' || shot.status === 'quota-rejected') && shot.authorization && (
                <div className="mt-3 rounded-xl border border-amber-400/30 p-3">
                  <p className="text-xs text-amber-200">Para generar escribe exactamente: <b>{shot.authorization}</b></p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input className="min-w-[260px] flex-1 rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white"
                      value={auth[shot.shotId] || ''} placeholder="Escribe aquí la frase amarilla de arriba"
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
