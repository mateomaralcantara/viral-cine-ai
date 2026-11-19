'use client';
import { useCallback, useEffect, useState } from 'react';
import { ensureLocalStudioSession } from '@/lib/v7/security/local-studio-client';

type Card = {
  key: string; numero: number; nombre: string; descripcion: string; notas: string;
  voz: { voiceId: string; nombre: string } | null; photos: string[];
  hasMaster: boolean; approved: boolean; masterVersion: string | null;
};
type Board = { serie: string; filmTitle: string; characters: Card[]; notImported: string[]; masterUsd: number; masterConfirmation: string };
type Voice = { voiceId: string; name: string; gender: string; preview: string };

export default function V7CharacterIdentityPanel({ filmId }: { filmId: string }) {
  const base = '/api/v7/films/' + encodeURIComponent(filmId) + '/characters';
  const [board, setBoard] = useState<Board | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { nombre: string; descripcion: string }>>({});
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const r = await fetch(base, { cache: 'no-store' });
    const d = await r.json() as { ok: boolean; board?: Board; error?: string };
    if (!d.ok || !d.board) throw new Error(d.error || 'No se pudieron leer los personajes.');
    setBoard(d.board);
  }, [base]);

  useEffect(() => {
    void refresh().catch((e) => setMessage(String(e instanceof Error ? e.message : e)));
    void fetch(base + '?voices=1', { cache: 'no-store' }).then((r) => r.json()).then((d: { ok: boolean; voices?: Voice[] }) => { if (d.ok) setVoices(d.voices ?? []); }).catch(() => undefined);
  }, [refresh, base]);

  async function post(body: Record<string, unknown>, label: string, done?: string) {
    setBusy(label); setMessage('');
    try {
      await ensureLocalStudioSession();
      const r = await fetch(base, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json() as { ok: boolean; error?: string };
      if (!d.ok) throw new Error(d.error || 'Operación rechazada');
      await refresh();
      if (done) setMessage(done);
      return true;
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusy(''); }
  }

  async function upload(key: string, files: FileList | null) {
    if (!files?.length) return;
    setBusy('upload-' + key); setMessage('');
    try {
      await ensureLocalStudioSession();
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('key', key); form.append('file', file);
        const r = await fetch(base + '/photo', { method: 'POST', credentials: 'same-origin', body: form });
        const d = await r.json() as { ok: boolean; error?: string };
        if (!d.ok) throw new Error(file.name + ': ' + (d.error || 'no se pudo subir'));
      }
      await refresh();
      setMessage('Fotos subidas. Ahora crea su retrato oficial.');
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  }

  const img = (key: string, file: string, v?: string | null) => `${base}/image?key=${encodeURIComponent(key)}&file=${encodeURIComponent(file)}${v ? '&v=' + v : ''}`;
  const draft = (c: Card) => drafts[c.key] ?? { nombre: c.nombre, descripcion: c.descripcion };
  const dirty = (c: Card) => { const d = drafts[c.key]; return !!d && (d.nombre !== c.nombre || d.descripcion !== c.descripcion); };

  return (
    <section className="panel mt-6 rounded-3xl p-6 md:p-8">
      <h2 className="text-2xl font-black">Personajes · Identidad</h2>
      <p className="mt-2 text-sm text-slate-300">
        Cada personaje tiene su propia identidad para toda la serie <b>{board?.serie}</b>: sube sus fotos, crea su retrato oficial,
        apruébalo y elige su voz. Todas las tomas y capítulos usarán esa misma cara y esa misma voz. Sin límite de personajes.
      </p>

      <div className="mt-5 rounded-2xl border border-cyan-400/30 bg-cyan-500/5 p-4">
        <h3 className="font-bold">+ Agregar personaje {board ? board.characters.length + 1 : ''}</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_2fr_auto]">
          <input className="rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white" placeholder="Nombre (ej. Martín Mateo)"
            value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} />
          <input className="rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white" placeholder="Descripción fija: edad, cara, pelo, piel, ropa habitual…"
            value={newDesc} onChange={(e) => setNewDesc(e.target.value)} maxLength={3000} />
          <button type="button" className="button-primary" disabled={!!busy || !newName.trim()}
            onClick={async () => { if (await post({ action: 'create', nombre: newName, descripcion: newDesc }, 'create', 'Personaje creado. Sube sus fotos.')) { setNewName(''); setNewDesc(''); } }}>
            Agregar
          </button>
        </div>
        {!!board?.notImported.length && (
          <button type="button" className="button-secondary mt-3" disabled={!!busy} onClick={() => void post({ action: 'import' }, 'import', 'Personajes del guion importados.')}>
            Importar del guion: {board.notImported.join(', ')}
          </button>
        )}
      </div>

      {message && <p className="mt-4 rounded-lg border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-100">{message}</p>}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {board?.characters.map((c) => (
          <article key={c.key} className="rounded-2xl border border-white/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-black">Personaje {c.numero} · {c.nombre}</h3>
              <span className={'text-xs font-bold ' + (c.approved ? 'text-emerald-300' : c.hasMaster ? 'text-amber-200' : 'text-slate-400')}>
                {c.approved ? 'IDENTIDAD APROBADA' : c.hasMaster ? 'RETRATO POR APROBAR' : 'SIN RETRATO'}
              </span>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr]">
              <div className="aspect-video overflow-hidden rounded-xl border border-white/10 bg-slate-900">
                {c.hasMaster
                  ? <img src={img(c.key, 'maestro', c.masterVersion)} alt={'Retrato oficial de ' + c.nombre} className="h-full w-full object-cover" />
                  : c.photos[0]
                    ? <img src={img(c.key, c.photos[0])} alt={'Foto de ' + c.nombre} className="h-full w-full object-cover opacity-70" />
                    : <div className="flex h-full items-center justify-center text-xs text-slate-500">Sin foto</div>}
              </div>
              <div className="space-y-2">
                <input className="w-full rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white" value={draft(c).nombre} maxLength={80}
                  onChange={(e) => setDrafts({ ...drafts, [c.key]: { ...draft(c), nombre: e.target.value } })} />
                <textarea className="w-full rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white" rows={4} maxLength={3000}
                  placeholder="Descripción fija (cómo es siempre este personaje)" value={draft(c).descripcion}
                  onChange={(e) => setDrafts({ ...drafts, [c.key]: { ...draft(c), descripcion: e.target.value } })} />
                <button type="button" className="button-secondary" disabled={!!busy || !dirty(c)}
                  onClick={() => void post({ action: 'update', key: c.key, ...draft(c) }, 'save-' + c.key, 'Guardado.')}>Guardar · gratis</button>
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xs text-slate-400">Fotos de referencia ({c.photos.length}/6) — se usan las 3 primeras</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.photos.map((p) => (
                  <div key={p} className="relative">
                    <img src={img(c.key, p)} alt="" className="h-16 w-16 rounded-lg border border-white/10 object-cover" />
                    <button type="button" title="Quitar (va a archivo)" disabled={!!busy}
                      className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs text-white"
                      onClick={() => void post({ action: 'remove-photo', key: c.key, name: p }, 'rm-' + p)}>×</button>
                  </div>
                ))}
                <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/30 text-2xl text-slate-400 hover:border-cyan-300">
                  {busy === 'upload-' + c.key ? '…' : '+'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" disabled={!!busy}
                    onChange={(e) => { void upload(c.key, e.target.files); e.target.value = ''; }} />
                </label>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] items-center">
              <select className="rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white" disabled={!!busy}
                value={c.voz?.voiceId ?? ''}
                onChange={(e) => {
                  const v = voices.find((x) => x.voiceId === e.target.value);
                  void post({ action: 'update', key: c.key, voz: v ? { voiceId: v.voiceId, nombre: v.name } : null }, 'voice-' + c.key, 'Voz asignada.');
                }}>
                <option value="">{voices.length ? '— Voz (ElevenLabs) —' : 'Sin voz (lista de ElevenLabs no disponible)'}</option>
                {c.voz && !voices.some((v) => v.voiceId === c.voz!.voiceId) && <option value={c.voz.voiceId}>{c.voz.nombre}</option>}
                {voices.map((v) => <option key={v.voiceId} value={v.voiceId}>{v.name}{v.gender ? ' · ' + v.gender : ''}</option>)}
              </select>
              {(() => { const p = voices.find((v) => v.voiceId === c.voz?.voiceId)?.preview; return p ? <audio controls src={p} className="h-8" /> : null; })()}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="button-secondary" disabled={!!busy || (!c.photos.length && !c.descripcion)}
                onClick={() => {
                  const ok = window.prompt(`Crear el retrato oficial de ${c.nombre} cuesta ~US$${board?.masterUsd.toFixed(2)}. Escribe ${board?.masterConfirmation} para confirmar:`);
                  if (ok) void post({ action: 'generate-master', key: c.key, confirmation: ok }, 'master-' + c.key, 'Retrato creado. Míralo y, si te gusta, apruébalo.');
                }}>
                {busy === 'master-' + c.key ? 'Creando retrato…' : c.hasMaster ? 'Crear otro retrato' : 'Crear retrato oficial'} · ~US${board?.masterUsd.toFixed(2)}
              </button>
              <button type="button" className="button-primary" disabled={!!busy || !c.hasMaster || c.approved}
                onClick={() => void post({ action: 'approve', key: c.key }, 'approve-' + c.key, c.nombre + ': identidad aprobada.')}>
                {c.approved ? 'Aprobado ✓' : 'Aprobar identidad'}
              </button>
            </div>
          </article>
        ))}
      </div>
      {board && !board.characters.length && <p className="mt-6 text-sm text-slate-400">Aún no hay personajes. Agrega el primero arriba o importa los del guion.</p>}
    </section>
  );
}
