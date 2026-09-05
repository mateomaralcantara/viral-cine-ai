'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowLeft, Bot, Check, ChevronDown, Clapperboard, Clock3, Coins, Download,
  Film, Image as ImageIcon, ListVideo, LoaderCircle, Mic2, Music2, Play, Plus, RefreshCw,
  Save, Settings2, ShieldCheck, Sparkles, Trash2, Users, Video, WandSparkles, XCircle
} from 'lucide-react';
import type { FilmProject, FilmScene, ProjectInput } from '@/lib/domain/schemas';

type SystemStatus = {
  mode: 'demo' | 'real';
  ffmpeg: boolean;
  script: boolean;
  images: boolean;
  voice: boolean;
  omni: boolean;
  veo: boolean;
  fal: boolean;
  workerRequired: boolean;
  dataDirectory: string;
};

const initialInput: ProjectInput = {
  title: '',
  premise: '',
  durationMinutes: 10,
  genre: 'Documental cinematográfico',
  audience: 'Público general de habla hispana',
  visualStyle: 'Cinematográfico realista, elegante, contrastado y emocional',
  language: 'es',
  aspectRatio: '16:9',
  budgetUsd: 80,
  burnSubtitles: true,
  generateMusic: true
};

export default function StudioApp() {
  const [projects, setProjects] = useState<FilmProject[]>([]);
  const [project, setProject] = useState<FilmProject | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const refreshProjects = useCallback(async () => {
    const data = await api('/api/projects');
    setProjects(data.projects);
  }, []);

  const refreshProject = useCallback(async (id: string) => {
    const data = await api(`/api/projects/${id}`);
    setProject(data.project);
    setProjects((current) => current.map((item) => item.id === id ? data.project : item));
  }, []);

  useEffect(() => {
    Promise.all([refreshProjects(), api('/api/system').then((data) => setSystem(data.system))]).catch((reason) => setError(messageOf(reason)));
  }, [refreshProjects]);

  useEffect(() => {
    if (!project || !['planning', 'queued', 'producing', 'composing'].includes(project.status)) return;
    const timer = window.setInterval(() => refreshProject(project.id).catch(() => undefined), 3500);
    return () => window.clearInterval(timer);
  }, [project, refreshProject]);

  async function create(input: ProjectInput) {
    await action('create', async () => {
      const data = await api('/api/projects', { method: 'POST', body: JSON.stringify(input) });
      setProject(data.project);
      setCreating(false);
      await refreshProjects();
    });
  }

  async function plan() {
    if (!project) return;
    await action('plan', async () => {
      const data = await api(`/api/projects/${project.id}/plan`, { method: 'POST' });
      setProject(data.project);
      await refreshProjects();
    });
  }

  async function savePlan() {
    if (!project?.plan) return;
    await action('save', async () => {
      const data = await api(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ input: project.input, plan: project.plan })
      });
      setProject(data.project);
      await refreshProjects();
    });
  }

  async function produce(decision: 'retry' | 'approve' = 'retry') {
    if (!project) return;
    await action('produce', async () => {
      const data = await api(`/api/projects/${project.id}/produce`, { method: 'POST', body: JSON.stringify({ decision }) });
      setProject(data.project);
      await refreshProjects();
    });
  }

  async function removeProject() {
    if (!project) return;
    const confirmed = window.confirm(
      `¿Eliminar "${project.input.title}"?\n\nEl proyecto desaparecerá del panel y se moverá a una papelera recuperable con todas sus escenas y archivos.`
    );
    if (!confirmed) return;
    await action('delete', async () => {
      await api(`/api/projects/${project.id}`, { method: 'DELETE' });
      setProject(null);
      setCreating(false);
      await refreshProjects();
    });
  }

  async function action(name: string, work: () => Promise<void>) {
    setBusy(name);
    setError('');
    try { await work(); } catch (reason) { setError(messageOf(reason)); } finally { setBusy(''); }
  }

  return (
    <main className="min-h-screen">
      <Topbar system={system} onNew={() => { setCreating(true); setProject(null); }} />
      <div className="mx-auto grid max-w-[1680px] gap-5 px-4 pb-10 pt-5 lg:grid-cols-[290px_minmax(0,1fr)] lg:px-6">
        <ProjectRail projects={projects} selectedId={project?.id} onSelect={(id) => { setCreating(false); refreshProject(id).catch((reason) => setError(messageOf(reason))); }} />
        <section className="min-w-0">
          {error && <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          {creating || (!project && projects.length === 0) ? (
            <CreateProject onSubmit={create} busy={busy === 'create'} />
          ) : project ? (
            <ProjectStudio
              project={project}
              setProject={setProject}
              system={system}
              busy={busy}
              onPlan={plan}
              onSave={savePlan}
              onProduce={produce}
              onDelete={removeProject}
              onRefresh={() => refreshProject(project.id)}
            />
          ) : (
            <Welcome onCreate={() => setCreating(true)} />
          )}
        </section>
      </div>
    </main>
  );
}

function Topbar({ system, onNew }: { system: SystemStatus | null; onNew: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070914]/85 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-950/40"><Film className="h-5 w-5" /></div>
          <div><div className="font-black tracking-tight">ViralCine Studio <span className="text-violet-400">PRO</span></div><div className="text-xs text-slate-500">Productora audiovisual privada</div></div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <StatusDot ok={Boolean(system?.ffmpeg)} label="FFmpeg" />
          <StatusDot ok={Boolean(system?.script)} label="IA creativa" />
          <StatusDot ok={Boolean(system?.veo || system?.fal)} label="Video IA" />
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${system?.mode === 'real' ? 'bg-emerald-500/12 text-emerald-300' : 'bg-amber-500/12 text-amber-200'}`}>{system?.mode === 'real' ? 'MODO REAL' : 'MODO DEMO'}</span>
        </div>
        <button className="button-primary" onClick={onNew}><Plus className="h-4 w-4" /> Nueva película</button>
      </div>
    </header>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[.035] px-3 py-1.5 text-xs text-slate-300"><i className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-slate-600'}`} />{label}</span>;
}

function ProjectRail({ projects, selectedId, onSelect }: { projects: FilmProject[]; selectedId?: string; onSelect: (id: string) => void }) {
  return (
    <aside className="panel h-fit rounded-3xl p-3 lg:sticky lg:top-[84px]">
      <div className="flex items-center justify-between px-2 py-2"><span className="text-xs font-black uppercase tracking-[.18em] text-slate-500">Producciones</span><span className="rounded-full bg-white/5 px-2 py-1 text-xs text-slate-400">{projects.length}</span></div>
      <div className="mt-1 max-h-[calc(100vh-150px)] space-y-2 overflow-auto">
        {projects.map((item) => (
          <button key={item.id} onClick={() => onSelect(item.id)} className={`w-full rounded-2xl border p-3 text-left transition ${selectedId === item.id ? 'border-violet-400/45 bg-violet-500/10' : 'border-transparent bg-white/[.025] hover:border-white/10 hover:bg-white/[.045]'}`}>
            <div className="flex items-start gap-3"><div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-800"><Clapperboard className="h-4 w-4 text-violet-300" /></div><div className="min-w-0"><div className="truncate text-sm font-extrabold text-slate-100">{item.input.title}</div><div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500"><span>{item.input.durationMinutes} min</span><span>·</span><span>{statusLabel(item.status)}</span></div></div></div>
            {['queued', 'producing', 'composing'].includes(item.status) && <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${item.progress.percent}%` }} /></div>}
          </button>
        ))}
        {!projects.length && <div className="px-3 py-10 text-center text-sm text-slate-600">Todavía no hay películas.</div>}
      </div>
    </aside>
  );
}

function Welcome({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="panel grid min-h-[620px] place-items-center rounded-3xl p-8 text-center"><div className="max-w-xl"><div className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-gradient-to-br from-violet-500/25 to-blue-500/15"><WandSparkles className="h-9 w-9 text-violet-300" /></div><h1 className="mt-7 text-4xl font-black tracking-tight">Convierte una idea en una película.</h1><p className="mt-4 text-lg leading-8 text-slate-400">Guion, personajes, avatares, tomas de video real, narración, música, montaje y exportación en un solo flujo.</p><button className="button-primary mt-7" onClick={onCreate}><Sparkles className="h-4 w-4" /> Crear primera producción</button></div></div>
  );
}

function CreateProject({ onSubmit, busy }: { onSubmit: (input: ProjectInput) => Promise<void>; busy: boolean }) {
  const [input, setInput] = useState<ProjectInput>(initialInput);
  const valid = input.title.trim().length >= 3 && input.premise.trim().length >= 20;
  const set = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => setInput((current) => ({ ...current, [key]: value }));
  return (
    <div className="panel rounded-3xl p-5 md:p-8">
      <div className="max-w-3xl"><div className="text-sm font-bold text-violet-300">NUEVA PRODUCCIÓN</div><h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">Dale una premisa. El estudio construye el resto.</h1><p className="mt-3 text-slate-400">Produce audiovisuales de 5 a 120 minutos mediante escenas persistentes y reanudables.</p></div>
      <div className="mt-8 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-5">
          <Field label="Título de la película"><input className="field" value={input.title} onChange={(event) => set('title', event.target.value)} placeholder="Ej.: El hombre que aprendió a comenzar" /></Field>
          <Field label="Premisa, tema o prompt principal"><textarea className="field min-h-44 resize-y" value={input.premise} onChange={(event) => set('premise', event.target.value)} placeholder="Describe la historia, el mensaje, los hechos importantes, el tono y el resultado que deseas..." /></Field>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Género"><input className="field" value={input.genre} onChange={(event) => set('genre', event.target.value)} /></Field><Field label="Audiencia"><input className="field" value={input.audience} onChange={(event) => set('audience', event.target.value)} /></Field></div>
          <Field label="Dirección visual"><input className="field" value={input.visualStyle} onChange={(event) => set('visualStyle', event.target.value)} /></Field>
        </div>
        <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <h2 className="text-lg font-black">Parámetros de producción</h2>
          <div className="mt-5 space-y-5">
            <Field label={`Duración: ${input.durationMinutes} minutos`}><input className="w-full accent-violet-500" type="range" min="5" max="120" step="1" value={input.durationMinutes} onChange={(event) => set('durationMinutes', Number(event.target.value))} /><div className="mt-2 flex justify-between text-[11px] text-slate-600"><span>5 min</span><span>120 min</span></div></Field>
            <Field label={`Presupuesto máximo: US$${input.budgetUsd}`}><input className="w-full accent-violet-500" type="range" min="50" max="150" step="5" value={input.budgetUsd} onChange={(event) => set('budgetUsd', Number(event.target.value))} /></Field>
            <div className="grid grid-cols-2 gap-3"><Choice active={input.aspectRatio === '16:9'} onClick={() => set('aspectRatio', '16:9')} title="16:9" subtitle="YouTube / cine" /><Choice active={input.aspectRatio === '9:16'} onClick={() => set('aspectRatio', '9:16')} title="9:16" subtitle="Reels / TikTok" /></div>
            <Toggle checked={input.generateMusic} onChange={(value) => set('generateMusic', value)} label="Generar banda sonora" icon={<Music2 className="h-4 w-4" />} />
            <Toggle checked={input.burnSubtitles} onChange={(value) => set('burnSubtitles', value)} label="Subtítulos integrados" icon={<ListVideo className="h-4 w-4" />} />
            <div className="rounded-2xl border border-violet-400/15 bg-violet-500/[.06] p-4 text-sm leading-6 text-slate-400"><ShieldCheck className="mb-2 h-5 w-5 text-violet-300" />El presupuesto se calcula por segundos e intentos antes de producir. En modo real cada escena se compone con tomas de video, nunca con una galería estática.</div>
            {input.durationMinutes > 30 && <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[.07] p-4 text-sm leading-6 text-amber-200/80">Las películas largas pueden superar US$150. Revisa el estimado antes de iniciar la producción real.</div>}
            <button disabled={!valid || busy} onClick={() => onSubmit(input)} className="button-primary w-full py-4">{busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Clapperboard className="h-5 w-5" />} Crear proyecto</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectStudio(props: {
  project: FilmProject; setProject: React.Dispatch<React.SetStateAction<FilmProject | null>>; system: SystemStatus | null;
  busy: string; onPlan: () => void; onSave: () => void; onProduce: (decision?: 'retry' | 'approve') => void;
  onDelete: () => void; onRefresh: () => Promise<void>;
}) {
  const { project, setProject, system, busy, onPlan, onSave, onProduce, onDelete, onRefresh } = props;
  const [tab, setTab] = useState<'overview' | 'script' | 'production'>('overview');
  const locked = ['planning', 'queued', 'producing', 'composing'].includes(project.status);
  const duration = project.plan?.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) || project.input.durationMinutes * 60;
  const totalShots = project.plan?.scenes.reduce((sum, scene) => sum + scene.shots.length, 0) || 0;

  function updateScene(index: number, changes: Partial<FilmScene>) {
    setProject((current) => {
      if (!current?.plan) return current;
      const invalidatesShots = ['mode', 'durationSeconds', 'narration', 'dialogue', 'visualPrompt', 'camera']
        .some((key) => key in changes);
      const scenes = current.plan.scenes.map((scene, sceneIndex) => sceneIndex === index
        ? { ...scene, ...changes, ...(invalidatesShots ? { shots: [], status: 'pending' as const } : {}) }
        : scene);
      return { ...current, plan: { ...current.plan, scenes } };
    });
  }

  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden rounded-3xl">
        <div className="border-b border-white/10 bg-gradient-to-r from-violet-500/[.12] to-blue-500/[.04] p-5 md:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">{statusLabel(project.status)}</span><span className="text-xs text-slate-500">{project.input.genre}</span></div><h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">{project.input.title}</h1><p className="mt-3 max-w-4xl leading-7 text-slate-400">{project.plan?.logline || project.input.premise}</p></div>
            <div className="flex flex-wrap gap-2">
              <button className="button-secondary" onClick={onRefresh}><RefreshCw className="h-4 w-4" /> Actualizar</button>
              <button className="button-danger" onClick={onDelete} disabled={Boolean(busy) || locked} title={locked ? 'No se puede eliminar mientras está en producción' : 'Mover proyecto a la papelera'}>{busy === 'delete' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Eliminar</button>
              {!project.plan && <button className="button-primary" onClick={onPlan} disabled={Boolean(busy) || locked}>{busy === 'plan' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />} Crear guion completo</button>}
              {project.plan && !locked && <button className="button-secondary" onClick={onSave} disabled={Boolean(busy)}>{busy === 'save' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar cambios</button>}
              {project.plan && !locked && project.status === 'quality-review' && <button className="button-secondary" onClick={() => onProduce('approve')} disabled={Boolean(busy) || !system?.ffmpeg}><Check className="h-4 w-4" /> Usar esta toma y continuar sin cobrar</button>}
              {project.plan && !locked && project.status !== 'ready' && project.status !== 'quality-review' && <button className="button-primary" onClick={() => onProduce('retry')} disabled={Boolean(busy) || !system?.ffmpeg}>{busy === 'produce' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Iniciar producción</button>}
            </div>
          </div>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400 transition-all duration-700" style={{ width: `${project.progress.percent}%` }} /></div><div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500"><span>{project.progress.message}</span><span>{project.progress.percent}%</span></div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-white/10 sm:grid-cols-4 sm:divide-y-0"><MiniMetric icon={<Clock3 />} value={`${Math.round(duration / 60)} min`} label="Duración" /><MiniMetric icon={<ListVideo />} value={project.plan ? `${project.plan.scenes.length} / ${totalShots}` : '—'} label="Escenas / tomas" /><MiniMetric icon={<Users />} value={`${project.plan?.characters.length || '—'}`} label="Personajes" /><MiniMetric icon={<Coins />} value={project.budget ? `US$${project.budget.estimatedUsd}` : `US$${project.input.budgetUsd}`} label="Estimado" /></div>
      </section>

      <nav className="panel flex gap-1 overflow-auto rounded-2xl p-1.5"><Tab active={tab === 'overview'} onClick={() => setTab('overview')} icon={<Activity />} label="Dirección" /><Tab active={tab === 'script'} onClick={() => setTab('script')} icon={<Clapperboard />} label="Guion y escenas" /><Tab active={tab === 'production'} onClick={() => setTab('production')} icon={<Video />} label="Producción y exportación" /></nav>

      {tab === 'overview' && <Overview project={project} system={system} onPlan={onPlan} busy={busy} />}
      {tab === 'script' && <ScriptEditor project={project} locked={locked} updateScene={updateScene} />}
      {tab === 'production' && <Production project={project} system={system} />}
    </div>
  );
}

function Overview({ project, system, onPlan, busy }: { project: FilmProject; system: SystemStatus | null; onPlan: () => void; busy: string }) {
  if (!project.plan) return <div className="panel rounded-3xl p-8 text-center"><Bot className="mx-auto h-10 w-10 text-violet-300" /><h2 className="mt-4 text-2xl font-black">El proyecto está listo para dirección creativa</h2><p className="mx-auto mt-2 max-w-xl text-slate-400">Se crearán personajes, estructura de tres actos, narración, diálogos, prompts visuales, cámara, sonido y método de producción para cada escena.</p><button className="button-primary mt-6" onClick={onPlan}>{busy === 'plan' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generar película sobre papel</button></div>;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="panel rounded-3xl p-5 md:p-6"><div className="flex items-center gap-3"><Users className="h-5 w-5 text-violet-300" /><h2 className="text-xl font-black">Biblia de personajes</h2></div><div className="mt-5 grid gap-4 md:grid-cols-2">{project.plan.characters.map((character) => <article key={character.id} className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"><div className="aspect-[16/9] bg-gradient-to-br from-violet-950 to-slate-950">{character.referenceAsset ? <img className="h-full w-full object-cover" alt={character.name} src={assetUrl(project.id, character.referenceAsset)} /> : <div className="grid h-full place-items-center"><ImageIcon className="h-8 w-8 text-slate-700" /></div>}</div><div className="p-4"><div className="flex items-center justify-between"><h3 className="font-black">{character.name}</h3><span className="text-xs text-violet-300">{character.role}</span></div><p className="mt-2 text-sm leading-6 text-slate-400">{character.appearance}</p><div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Mic2 className="h-3.5 w-3.5" />{character.voiceInstructions}</div></div></article>)}</div></div>
      <aside className="space-y-5"><BudgetCard project={project} /><SystemCard system={system} /><div className="panel rounded-3xl p-5"><h3 className="font-black">Dirección creativa</h3><p className="mt-3 text-sm leading-6 text-slate-400">{project.plan.creativeDirection}</p><h4 className="mt-5 text-xs font-black uppercase tracking-widest text-slate-500">Música</h4><p className="mt-2 text-sm leading-6 text-slate-400">{project.plan.musicPrompt}</p></div></aside>
    </div>
  );
}

function BudgetCard({ project }: { project: FilmProject }) {
  if (!project.budget) return null;
  const entries = Object.entries(project.budget.breakdown);
  const names: Record<string, string> = { script: 'Guion IA', images: 'Imágenes', voice: 'Voces', video: 'Video IA', avatars: 'Avatares', music: 'Música', quality: 'Control de calidad' };
  return <div className="panel rounded-3xl p-5"><div className="flex items-center justify-between"><h3 className="font-black">Presupuesto preventivo</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${project.budget.withinBudget ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>{project.budget.withinBudget ? 'Dentro del límite' : 'Superado'}</span></div><div className="mt-4 space-y-2">{entries.map(([key, value]) => <div key={key} className="flex items-center justify-between text-sm"><span className="text-slate-500">{names[key]}</span><span className="font-bold text-slate-300">US${value.toFixed(2)}</span></div>)}</div><div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4"><span className="text-sm text-slate-400">Estimado</span><span className="text-2xl font-black">US${project.budget.estimatedUsd}</span></div><div className="mt-1 text-right text-xs text-slate-600">Límite: US${project.budget.targetUsd}</div></div>;
}

function SystemCard({ system }: { system: SystemStatus | null }) {
  const rows = [['Montaje FFmpeg', system?.ffmpeg], ['Guion, imagen y voz', system?.script], ['Control de calidad IA', system?.script], ['Gemini Omni / Veo', system?.omni || system?.veo], ['Video, avatar y música Fal', system?.fal]] as const;
  return <div className="panel rounded-3xl p-5"><div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-blue-300" /><h3 className="font-black">Motores disponibles</h3></div><div className="mt-4 space-y-3">{rows.map(([label, ok]) => <div key={label} className="flex items-center justify-between text-sm"><span className="text-slate-400">{label}</span>{ok ? <Check className="h-4 w-4 text-emerald-400" /> : <span className="text-xs text-slate-600">No configurado</span>}</div>)}</div></div>;
}

function ScriptEditor({ project, locked, updateScene }: { project: FilmProject; locked: boolean; updateScene: (index: number, changes: Partial<FilmScene>) => void }) {
  const [open, setOpen] = useState<number | null>(0);
  if (!project.plan) return <Empty label="Primero genera el guion completo." />;
  return <div className="space-y-3">{project.plan.scenes.map((scene, index) => {
    const readyShots = scene.shots.filter((shot) => shot.status === 'ready').length;
    return <article key={scene.id} className="panel rounded-2xl">
      <button className="flex w-full items-center gap-4 p-4 text-left" onClick={() => setOpen(open === index ? null : index)}>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-sm font-black text-violet-300">{scene.order}</span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-black">{scene.title}</h3><ModeBadge mode={scene.mode} /><span className="text-xs text-slate-600">Acto {scene.act}</span><span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-300">{readyShots}/{scene.shots.length} tomas</span>{scene.qualityScore !== undefined && <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${scene.status === 'review-required' ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>Calidad {scene.qualityScore}/10</span>}</div><p className="mt-1 truncate text-sm text-slate-500">{scene.summary}</p></div>
        <span className="text-xs text-slate-500">{scene.durationSeconds}s</span><ChevronDown className={`h-4 w-4 text-slate-500 transition ${open === index ? 'rotate-180' : ''}`} />
      </button>
      {open === index && <div className="grid gap-4 border-t border-white/10 p-4 lg:grid-cols-2">
        <Field label="Título"><input disabled={locked} className="field" value={scene.title} onChange={(event) => updateScene(index, { title: event.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Método"><select disabled={locked} className="field" value={scene.mode === 'animated-image' ? 'ai-video' : scene.mode} onChange={(event) => updateScene(index, { mode: event.target.value as FilmScene['mode'] })}><option value="ai-video">Video IA</option><option value="avatar">Avatar en video</option></select></Field><Field label="Segundos"><input disabled={locked} type="number" min="5" max="90" className="field" value={scene.durationSeconds} onChange={(event) => updateScene(index, { durationSeconds: Number(event.target.value) })} /></Field></div>
        <Field label="Narración"><textarea disabled={locked} className="field min-h-32" value={scene.narration} onChange={(event) => updateScene(index, { narration: event.target.value })} /></Field>
        <Field label="Diálogo"><textarea disabled={locked} className="field min-h-32" value={scene.dialogue} onChange={(event) => updateScene(index, { dialogue: event.target.value })} /></Field>
        <Field label="Prompt visual"><textarea disabled={locked} className="field min-h-40" value={scene.visualPrompt} onChange={(event) => updateScene(index, { visualPrompt: event.target.value })} /></Field>
        <div className="space-y-4"><Field label="Cámara"><input disabled={locked} className="field" value={scene.camera} onChange={(event) => updateScene(index, { camera: event.target.value })} /></Field><Field label="Diseño sonoro"><textarea disabled={locked} className="field min-h-24" value={scene.soundDesign} onChange={(event) => updateScene(index, { soundDesign: event.target.value })} /></Field></div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 lg:col-span-2"><div className="flex items-center justify-between"><div className="text-xs font-black uppercase tracking-wider text-cyan-300">Plan de tomas de video</div><span className="text-xs text-slate-500">4–8 segundos por toma</span></div>{scene.shots.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">{scene.shots.map((shot) => <div key={shot.id} className="rounded-xl border border-white/10 bg-white/[.025] p-3"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${shot.status === 'ready' ? 'bg-emerald-400' : shot.status === 'review-required' ? 'bg-orange-400' : shot.status === 'rendering' ? 'animate-pulse bg-amber-400' : 'bg-slate-700'}`} /><span className="min-w-0 flex-1 truncate text-sm font-bold">Toma {shot.order}: {shot.title}</span><span className="text-[10px] text-slate-500">{shot.durationSeconds}s</span></div><div className="mt-1 text-xs text-slate-600">{shot.mode === 'avatar-video' ? 'Avatar con lip-sync' : 'Video cinematográfico'}{shot.preflightScore !== undefined ? ` · Preflight ${shot.preflightScore}/10` : ''}{shot.qualityScore !== undefined ? ` · Calidad ${shot.qualityScore}/10` : ''}</div></div>)}</div> : <p className="mt-3 text-sm text-amber-200/70">Las tomas se recalcularán al guardar los cambios.</p>}</div>
      </div>}
    </article>;
  })}</div>;
}

function Production({ project, system }: { project: FilmProject; system: SystemStatus | null }) {
  const allShots = project.plan?.scenes.flatMap((scene) => scene.shots) || [];
  const readyShots = allShots.filter((shot) => shot.status === 'ready').length;
  const reviewScene = project.plan?.scenes.find((scene) => scene.status === 'review-required');
  const reviewShot = reviewScene?.shots.find((shot) => shot.status === 'review-required');
  const reviewAsset = reviewShot?.videoAsset || reviewScene?.videoAsset;
  const reviewScore = reviewShot?.qualityScore ?? reviewScene?.qualityScore ?? 0;
  const reviewIssues = reviewShot?.qualityIssues || reviewScene?.qualityIssues || [];
  return <div className="grid gap-5 xl:grid-cols-[1fr_360px]"><div className="space-y-5">
    {project.finalVideoAsset ? <div className="panel rounded-3xl p-5 md:p-6"><div className="flex items-center justify-between"><div><div className="text-sm font-bold text-emerald-300">PRODUCCIÓN TERMINADA</div><h2 className="mt-1 text-2xl font-black">Película final</h2></div><a className="button-primary" href={assetUrl(project.id, project.finalVideoAsset)} download><Download className="h-4 w-4" /> Descargar MP4</a></div><video className="mt-5 aspect-video w-full rounded-2xl bg-black" controls src={assetUrl(project.id, project.finalVideoAsset)} /></div>
      : reviewScene ? <div className="panel rounded-3xl border border-amber-400/25 p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-bold text-amber-300">APROBACIÓN REQUERIDA</div><h2 className="mt-1 text-2xl font-black">Escena {reviewScene.order}{reviewShot ? ` · Toma ${reviewShot.order}` : ''}: {reviewShot?.title || reviewScene.title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">La toma recibió {reviewScore}/10. El modo ahorro no hará otro intento automático. Si decides usarla, se guardará como checkpoint aprobado y avanzará sin generar ni cobrar nuevamente.</p></div><span className="rounded-full bg-red-500/10 px-3 py-1.5 text-sm font-black text-red-300">{reviewScore}/10</span></div>{reviewAsset && <video className="mt-5 aspect-video w-full rounded-2xl bg-black" controls src={assetUrl(project.id, reviewAsset)} />}{reviewIssues.length ? <div className="mt-5 rounded-2xl bg-amber-500/[.06] p-4"><div className="text-xs font-black uppercase tracking-wider text-amber-300">Correcciones solicitadas por el supervisor IA</div><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-100/70">{reviewIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : null}</div>
      : <div className="panel rounded-3xl p-8 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-blue-500/10"><Film className="h-7 w-7 text-blue-300" /></div><h2 className="mt-5 text-2xl font-black">{['queued', 'producing', 'composing'].includes(project.status) ? 'La productora está trabajando' : 'Aún no se ha producido la película'}</h2><p className="mx-auto mt-2 max-w-lg text-slate-400">{project.progress.message}</p><div className="mx-auto mt-6 max-w-xl"><div className="h-3 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${project.progress.percent}%` }} /></div><div className="mt-2 flex justify-between text-xs text-slate-600"><span>{readyShots} de {allShots.length} tomas terminadas</span><span>{project.progress.percent}%</span></div></div></div>}
    {project.plan && <div className="panel rounded-3xl p-5"><h3 className="font-black">Rollo de escenas y tomas</h3><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{project.plan.scenes.map((scene) => { const sceneReady = scene.shots.filter((shot) => shot.status === 'ready').length; return <div key={scene.id} className={`flex items-center gap-3 rounded-xl border bg-black/20 p-3 ${scene.status === 'review-required' ? 'border-amber-400/35' : 'border-white/10'}`}><span className={`h-2 w-2 rounded-full ${scene.status === 'ready' ? 'bg-emerald-400' : scene.status === 'rendering' ? 'animate-pulse bg-amber-400' : scene.status === 'review-required' ? 'animate-pulse bg-orange-400' : scene.status === 'failed' ? 'bg-red-400' : 'bg-slate-700'}`} /><span className="min-w-0 flex-1 truncate text-sm">{scene.order}. {scene.title}</span><span className="text-[10px] font-bold text-cyan-300">{sceneReady}/{scene.shots.length}</span><span className="text-[10px] text-slate-600">{scene.durationSeconds}s</span></div>; })}</div></div>}
  </div><aside className="space-y-5"><SystemCard system={system} /><div className="panel rounded-3xl p-5"><h3 className="font-black">Registro de producción</h3><div className="mt-4 max-h-[460px] space-y-3 overflow-auto pr-2">{project.productionLog.slice().reverse().map((entry, index) => <div key={`${entry}-${index}`} className="border-l border-white/10 pl-3 text-xs leading-5 text-slate-500">{entry}</div>)}</div></div></aside></div>;
}

function MiniMetric({ icon, value, label }: { icon: React.ReactElement; value: string; label: string }) { return <div className="flex items-center gap-3 p-4 md:p-5"><span className="text-violet-300 [&>svg]:h-5 [&>svg]:w-5">{icon}</span><div><div className="font-black">{value}</div><div className="text-xs text-slate-500">{label}</div></div></div>; }
function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactElement; label: string }) { return <button onClick={onClick} className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition [&>svg]:h-4 [&>svg]:w-4 ${active ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>{icon}{label}</button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
function Choice({ active, onClick, title, subtitle }: { active: boolean; onClick: () => void; title: string; subtitle: string }) { return <button type="button" onClick={onClick} className={`rounded-2xl border p-3 text-left ${active ? 'border-violet-400/60 bg-violet-500/10' : 'border-white/10 bg-white/[.025]'}`}><div className="font-black">{title}</div><div className="text-xs text-slate-500">{subtitle}</div></button>; }
function Toggle({ checked, onChange, label, icon }: { checked: boolean; onChange: (value: boolean) => void; label: string; icon: React.ReactElement }) { return <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.025] p-3 text-left"><span className="flex items-center gap-2 text-sm font-bold text-slate-300">{icon}{label}</span><span className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-violet-500' : 'bg-slate-700'}`}><i className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`} /></span></button>; }
function ModeBadge({ mode }: { mode: FilmScene['mode'] }) { const view = mode === 'avatar' ? ['Avatar en video', 'bg-pink-500/10 text-pink-300'] : mode === 'animated-image' ? ['Migrará a video', 'bg-amber-500/10 text-amber-300'] : ['Video IA', 'bg-blue-500/10 text-blue-300']; return <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${view[1]}`}>{view[0]}</span>; }
function Empty({ label }: { label: string }) { return <div className="panel rounded-3xl p-10 text-center text-slate-500">{label}</div>; }

function statusLabel(status: FilmProject['status']) { return ({ draft: 'Borrador', planning: 'Escribiendo', planned: 'Planificada', queued: 'En cola', producing: 'Produciendo', 'quality-review': 'Revisión de calidad', composing: 'Montando', ready: 'Terminada', failed: 'Con error', cancelled: 'Cancelada' } as const)[status]; }
function assetUrl(projectId: string, asset: string) { return `/api/projects/${projectId}/assets/${asset.split('/').map(encodeURIComponent).join('/')}`; }
async function api(url: string, init?: RequestInit) { const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' }); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || 'La operación no pudo completarse'); return data; }
function messageOf(reason: unknown) { return reason instanceof Error ? reason.message : 'Error desconocido'; }
