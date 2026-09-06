'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Film, LoaderCircle, Mic2, Save, ShieldCheck, Users, WandSparkles } from 'lucide-react';
import type { FilmProject } from '@/lib/domain/schemas';

type SpeakerSuggestion = {
  sceneId: string;
  sceneOrder: number;
  sceneTitle: string;
  shotId: string;
  shotOrder: number;
  shotTitle: string;
  spokenText: string;
  candidates: Array<{ id: string; name: string }>;
  suggestedSpeakerId?: string;
  suggestedSpeakerName?: string;
  confidence: number;
  reason: string;
  existingMedia: boolean;
};

type CastingState = {
  projectId: string;
  title: string;
  characters: Array<{
    id: string;
    name: string;
    role: string;
    voiceProvider: 'elevenlabs' | 'openai' | 'offline';
    voiceId?: string;
    voiceReady: boolean;
    voiceInstructions: string;
    voiceStability?: number;
    voiceSimilarity?: number;
    voiceStyle?: number;
    voiceSpeed?: number;
  }>;
  unresolved: SpeakerSuggestion[];
  totals: {
    spokenShots: number;
    resolvedShots: number;
    unresolvedShots: number;
    highConfidence: number;
    existingMediaUnresolved: number;
    voicesAssigned: number;
    voicesMissing: number;
  };
};

type VoiceProfile = {
  id: string;
  label: string;
  kind: 'narrator' | 'character' | 'support';
  role?: string;
  voiceProvider: 'elevenlabs' | 'openai' | 'offline';
  voiceId?: string;
  voiceReady: boolean;
  voiceInstructions: string;
  voiceModel?: string;
  voiceStability?: number;
  voiceSimilarity?: number;
  voiceStyle?: number;
  voiceSpeed?: number;
};

type VoiceCastingState = {
  projectId: string;
  title: string;
  profiles: VoiceProfile[];
  totals: {
    profiles: number;
    ready: number;
    missing: number;
    narratorReady: boolean;
    characterReady: number;
    characterTotal: number;
    supportReady: number;
    supportTotal: number;
  };
};

type ProjectListResponse = { projects: FilmProject[] };
type CastingResponse = {
  casting: CastingState;
  voiceCasting: VoiceCastingState;
  project?: FilmProject;
  applied?: number;
};

export default function CastingManager() {
  const [projects, setProjects] = useState<FilmProject[]>([]);
  const [projectId, setProjectId] = useState('');
  const [casting, setCasting] = useState<CastingState | null>(null);
  const [voiceCasting, setVoiceCasting] = useState<VoiceCastingState | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadProjects = useCallback(async () => {
    const data = await api<ProjectListResponse>('/api/projects');
    setProjects(data.projects);
    setProjectId((current) => current || data.projects[0]?.id || '');
  }, []);

  const loadCasting = useCallback(async (id: string) => {
    if (!id) {
      setCasting(null);
      setVoiceCasting(null);
      return;
    }
    const data = await api<CastingResponse>(`/api/projects/${id}/casting`);
    setCasting(data.casting);
    setVoiceCasting(data.voiceCasting);
  }, []);

  useEffect(() => {
    loadProjects().catch((reason) => setError(messageOf(reason)));
  }, [loadProjects]);

  useEffect(() => {
    loadCasting(projectId).catch((reason) => setError(messageOf(reason)));
  }, [projectId, loadCasting]);

  async function mutate(name: string, body: unknown, success: (response: CastingResponse) => string) {
    if (!projectId) return;
    setBusy(name);
    setError('');
    setNotice('');
    try {
      const data = await api<CastingResponse>(`/api/projects/${projectId}/casting`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      setCasting(data.casting);
      setVoiceCasting(data.voiceCasting);
      setNotice(success(data));
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy('');
    }
  }

  async function assign(shotId: string, speakerId: string) {
    if (!speakerId) return;
    await mutate(`speaker:${shotId}`, { action: 'assign-speaker', shotId, speakerId }, () => 'Hablante guardado. No se regeneró audio ni video.');
  }

  async function applySafe() {
    await mutate('apply-safe', { action: 'apply-safe', minimumConfidence: 0.92 }, (data) => `${data.applied || 0} asignaciones seguras aplicadas. La media existente quedó intacta.`);
  }

  async function saveVoice(profileId: string, voice: VoiceDraft) {
    try {
      const body = {
        action: 'set-voice-profile',
        profileId,
        provider: voice.provider,
        voiceId: voice.voiceId.trim() || undefined,
        stability: optionalNumber(voice.stability),
        similarity: optionalNumber(voice.similarity),
        style: optionalNumber(voice.style),
        speed: optionalNumber(voice.speed)
      };
      await mutate(`voice:${profileId}`, body, () => 'Perfil vocal guardado. No se llamó a ElevenLabs/OpenAI ni se generó audio.');
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  const selectedProject = projects.find((project) => project.id === projectId);
  const readiness = useMemo(() => {
    if (!casting) return 0;
    const speakerPart = casting.totals.spokenShots
      ? casting.totals.resolvedShots / casting.totals.spokenShots
      : 1;
    const voicePart = voiceCasting?.totals.profiles
      ? voiceCasting.totals.ready / voiceCasting.totals.profiles
      : 0;
    return Math.round(((speakerPart + voicePart) / 2) * 100);
  }, [casting, voiceCasting]);

  return (
    <main className="min-h-screen bg-[#070914] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070914]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 lg:px-6">
          <div className="flex items-center gap-3">
            <a href="/" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[.04] hover:bg-white/[.08]" aria-label="Volver al estudio"><ArrowLeft className="h-4 w-4" /></a>
            <div><div className="font-black">Casting & Speaker Lab <span className="text-violet-300">4.0</span></div><div className="text-xs text-slate-500">Reconciliación offline + voces persistentes</div></div>
          </div>
          <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-300"><ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />SIN GENERACIÓN PAGADA</div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 lg:px-6">
        {error && <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        {notice && <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-200"><CheckCircle2 className="mr-2 inline h-4 w-4" />{notice}</div>}

        <section className="rounded-3xl border border-white/10 bg-white/[.035] p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_260px] lg:items-end">
            <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[.15em] text-slate-500">Proyecto</span><select className="w-full rounded-xl border border-white/10 bg-[#0e1220] px-4 py-3 text-sm outline-none" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Selecciona un proyecto</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.input.title} — {project.id.slice(0, 8)}</option>)}</select></label>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-xs uppercase tracking-widest text-slate-500">Preparación casting</div><div className="mt-1 text-3xl font-black">{readiness}%</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-violet-500" style={{ width: `${readiness}%` }} /></div></div>
          </div>
          {selectedProject && <div className="mt-3 text-xs text-slate-500">Estado del proyecto: {selectedProject.status}. Los cambios de casting se bloquean automáticamente durante producción activa.</div>}
        </section>

        {casting && <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric label="Tomas habladas" value={casting.totals.spokenShots} />
            <Metric label="Resueltas" value={casting.totals.resolvedShots} />
            <Metric label="Ambiguas" value={casting.totals.unresolvedShots} />
            <Metric label="Auto-seguras" value={casting.totals.highConfidence} />
            <Metric label="Con media existente" value={casting.totals.existingMediaUnresolved} />
            <Metric label="Voces faltantes" value={voiceCasting?.totals.missing ?? casting.totals.voicesMissing} />
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[.035] p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><div className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-violet-300" /><h2 className="text-xl font-black">Reconciliador de hablantes</h2></div><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Las sugerencias usan diálogo estructurado, etiquetas por nombre y reparto de la toma. Solo el botón seguro aplica confianza ≥ 92%. Ninguna asignación borra media ni activa proveedores.</p></div>
              <button disabled={!casting.totals.highConfidence || busy === 'apply-safe'} onClick={applySafe} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40">{busy === 'apply-safe' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Aplicar {casting.totals.highConfidence} seguras</button>
            </div>

            <div className="mt-5 space-y-3">
              {casting.unresolved.map((item) => <SpeakerRow key={item.shotId} item={item} busy={busy === `speaker:${item.shotId}`} onAssign={assign} />)}
              {!casting.unresolved.length && <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[.07] p-6 text-center text-emerald-200"><CheckCircle2 className="mx-auto h-7 w-7" /><div className="mt-2 font-black">No quedan segmentos hablados ambiguos.</div></div>}
            </div>
          </section>

          {voiceCasting && <section className="rounded-3xl border border-white/10 bg-white/[.035] p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><div className="flex items-center gap-2"><Mic2 className="h-5 w-5 text-violet-300" /><h2 className="text-xl font-black">Voice Casting Manager</h2></div><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Un único registro persistente para Narrador, reparto principal y voces secundarias. Guardar aquí solo cambia metadata local: no prueba, compra ni sintetiza voces.</p></div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-slate-400"><span className="font-black text-slate-100">{voiceCasting.totals.ready}/{voiceCasting.totals.profiles}</span> perfiles listos · secundarios {voiceCasting.totals.supportReady}/{voiceCasting.totals.supportTotal}</div>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">{voiceCasting.profiles.map((profile) => <VoiceCard key={`${profile.id}:${profile.voiceId || ''}:${profile.voiceProvider}`} profile={profile} busy={busy === `voice:${profile.id}`} onSave={saveVoice} />)}</div>
          </section>}
        </>}

        {!projects.length && <section className="rounded-3xl border border-white/10 bg-white/[.035] p-10 text-center"><Film className="mx-auto h-8 w-8 text-slate-600" /><div className="mt-3 font-black">No hay proyectos disponibles.</div></section>}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="text-2xl font-black">{value}</div><div className="mt-1 text-xs text-slate-500">{label}</div></div>;
}

function SpeakerRow({ item, busy, onAssign }: { item: SpeakerSuggestion; busy: boolean; onAssign: (shotId: string, speakerId: string) => Promise<void> }) {
  const [speakerId, setSpeakerId] = useState(item.suggestedSpeakerId || '');
  useEffect(() => setSpeakerId(item.suggestedSpeakerId || ''), [item.suggestedSpeakerId]);
  return <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-wider text-violet-300">Escena {item.sceneOrder} · toma {item.shotOrder}</div><div className="mt-1 font-black">{item.sceneTitle} / {item.shotTitle}</div></div><div className="flex gap-2">{item.existingMedia && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-200">MEDIA PRESERVADA</span>}{item.suggestedSpeakerId && <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">{Math.round(item.confidence * 100)}% confianza</span>}</div></div>
    <blockquote className="mt-3 rounded-xl border border-white/5 bg-white/[.025] p-3 text-sm leading-6 text-slate-300">“{item.spokenText}”</blockquote>
    <div className="mt-2 text-xs leading-5 text-slate-500">{item.reason}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><select className="rounded-xl border border-white/10 bg-[#0e1220] px-3 py-2.5 text-sm outline-none" value={speakerId} onChange={(event) => setSpeakerId(event.target.value)}><option value="">Seleccionar hablante…</option>{item.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><button disabled={!speakerId || busy} onClick={() => onAssign(item.shotId, speakerId)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.06] px-4 py-2.5 text-sm font-black disabled:opacity-40">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Asignar</button></div>
  </article>;
}

type VoiceDraft = {
  provider: 'elevenlabs' | 'openai' | 'offline';
  voiceId: string;
  stability: string;
  similarity: string;
  style: string;
  speed: string;
};

function VoiceCard({ profile, busy, onSave }: { profile: VoiceProfile; busy: boolean; onSave: (id: string, voice: VoiceDraft) => Promise<void> }) {
  const [draft, setDraft] = useState<VoiceDraft>({
    provider: profile.voiceProvider,
    voiceId: profile.voiceId || '',
    stability: valueString(profile.voiceStability),
    similarity: valueString(profile.voiceSimilarity),
    style: valueString(profile.voiceStyle),
    speed: valueString(profile.voiceSpeed)
  });
  useEffect(() => {
    setDraft({
      provider: profile.voiceProvider,
      voiceId: profile.voiceId || '',
      stability: valueString(profile.voiceStability),
      similarity: valueString(profile.voiceSimilarity),
      style: valueString(profile.voiceStyle),
      speed: valueString(profile.voiceSpeed)
    });
  }, [profile]);
  const set = <K extends keyof VoiceDraft>(key: K, value: VoiceDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const kindLabel = profile.kind === 'narrator' ? 'Narrador' : profile.kind === 'support' ? 'Voz secundaria' : profile.role || 'Personaje';
  return <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
    <div className="flex items-start justify-between gap-3"><div><div className="font-black">{profile.label}</div><div className="text-xs text-violet-300">{kindLabel}</div></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${profile.voiceReady ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-200'}`}>{profile.voiceReady ? 'VOZ LISTA' : 'FALTA VOZ'}</span></div>
    <div className="mt-3 text-xs leading-5 text-slate-500">{profile.voiceInstructions}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-500">Proveedor<select className="mt-1 w-full rounded-xl border border-white/10 bg-[#0e1220] px-3 py-2.5 text-sm text-slate-100" value={draft.provider} onChange={(event) => set('provider', event.target.value as VoiceDraft['provider'])}><option value="elevenlabs">ElevenLabs</option><option value="openai">OpenAI</option><option value="offline">Offline</option></select></label><label className="text-xs text-slate-500">Voice ID<input className="mt-1 w-full rounded-xl border border-white/10 bg-[#0e1220] px-3 py-2.5 text-sm text-slate-100" value={draft.voiceId} onChange={(event) => set('voiceId', event.target.value)} placeholder={draft.provider === 'elevenlabs' ? 'ID persistente de ElevenLabs' : 'Opcional'} /></label></div>
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><SmallNumber label="Stability" value={draft.stability} onChange={(value) => set('stability', value)} placeholder="0–1" /><SmallNumber label="Similarity" value={draft.similarity} onChange={(value) => set('similarity', value)} placeholder="0–1" /><SmallNumber label="Style" value={draft.style} onChange={(value) => set('style', value)} placeholder="0–1" /><SmallNumber label="Speed" value={draft.speed} onChange={(value) => set('speed', value)} placeholder="0.7–1.2" /></div>
    <button disabled={busy} onClick={() => onSave(profile.id, draft)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black disabled:opacity-40">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar voz</button>
  </article>;
}

function SmallNumber({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="text-[11px] text-slate-500">{label}<input type="number" step="0.01" className="mt-1 w-full rounded-lg border border-white/10 bg-[#0e1220] px-2.5 py-2 text-sm text-slate-100" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data as T;
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Valor numérico inválido: ${value}`);
  return parsed;
}

function valueString(value?: number) {
  return value === undefined ? '' : String(value);
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : String(value);
}
