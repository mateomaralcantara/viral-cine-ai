'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Database,
  Film,
  GitBranch,
  Layers3,
  Mic2,
  ShieldCheck,
  Sparkles,
  Workflow
} from 'lucide-react';

type Summary = {
  filmId: string;
  legacyProjectId?: string;
  title: string;
  durationMinutes: number;
  acts: number;
  sequences: number;
  scenes: number;
  shots: number;
  takes: number;
  selectedTakes: number;
  characters: number;
  voiceProfiles: number;
  assets: number;
  budgetUsd: number;
  externalApis: boolean;
  estimatedApiCostUsd: number;
};

const modules = [
  ['Master Director', 'Planificación jerárquica y DAG de producción'],
  ['Memory Core', 'Narrative Graph · Visual Graph · Audio Graph'],
  ['Continuity Brain', 'Personajes · locaciones · vestuario · props · estado'],
  ['Voice Vault', 'Voice DNA versionado, derechos y muestras aprobadas'],
  ['Asset Registry', 'Provenance inmutable por asset/take/job/proveedor'],
  ['Job Orchestrator', 'Dependencias, idempotencia y estados seguros'],
  ['Provider Gateway', 'Contratos genéricos y health scoring'],
  ['QA Jerárquico', 'Take → Shot → Scene → Sequence → Act → Film'],
  ['Timeline Engine', 'Tracks multipista + modelo OTIO-compatible'],
  ['Versioning', 'Cuts y assets append-only sin sobrescribir masters']
] as const;

export default function V7FeatureFilmOS() {
  const [projectId, setProjectId] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'preview' | 'materialize' | ''>('');

  const completeness = useMemo(() => summary
    ? Math.round(summary.selectedTakes / Math.max(1, summary.shots) * 100)
    : 0, [summary]);

  async function request(action: 'preview' | 'materialize') {
    const id = projectId.trim();
    if (!id) {
      setMessage('Escribe el Project ID de ViralCine 6.');
      return;
    }
    setBusy(action);
    setMessage('');
    try {
      const response = await fetch(
        '/api/v7/projects/' + encodeURIComponent(id) + '/preview',
        action === 'preview'
          ? { method: 'GET', cache: 'no-store' }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'materialize-local' })
            }
      );
      const body = await response.json() as {
        ok?: boolean;
        summary?: Summary;
        error?: string;
        storage?: string;
      };
      if (!response.ok || !body.ok || !body.summary) {
        throw new Error(body.error || 'No se pudo preparar V7.');
      }
      setSummary(body.summary);
      setMessage(
        action === 'materialize'
          ? 'V7 materializado localmente en ' + (body.storage || '.data/v7')
          : 'Preview V6 → V7 completado en memoria. No se modificó el proyecto V6.'
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-6 md:px-8">
      <header className="panel rounded-3xl p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <a href="/" className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> ViralCine 6
            </a>
            <div className="flex items-center gap-3 text-violet-300">
              <BrainCircuit className="h-6 w-6" />
              <span className="text-xs font-black uppercase tracking-[.24em]">Feature Film OS</span>
            </div>
            <h1 className="mt-3 text-3xl font-black md:text-5xl">ViralCine 7</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-400">
              Arquitectura paralela para cortos y largometrajes: Film → Act → Sequence → Scene → Shot → Take,
              continuidad persistente, Voice DNA, jobs, QA jerárquico, timeline y versionado.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[.08] px-4 py-3 text-sm font-bold text-emerald-300">
            <ShieldCheck className="mr-2 inline h-4 w-4" />
            SAFE ARCHITECTURE · US$0
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-6">
          <div className="panel rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3">
              <GitBranch className="h-5 w-5 text-cyan-300" />
              <h2 className="text-xl font-black">Compatibilidad ViralCine 6 → 7</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              El preview es read-only. Materializar crea metadata V7 bajo .data/v7 sin alterar project.json ni assets V6.
            </p>
            <div className="mt-5 flex flex-col gap-3 md:flex-row">
              <input
                className="field"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                placeholder="Project ID V6"
              />
              <button className="button-secondary whitespace-nowrap" disabled={Boolean(busy)} onClick={() => request('preview')}>
                <Sparkles className="h-4 w-4" />
                {busy === 'preview' ? 'Analizando…' : 'Preview V7'}
              </button>
              <button className="button-primary whitespace-nowrap" disabled={Boolean(busy)} onClick={() => request('materialize')}>
                <Database className="h-4 w-4" />
                {busy === 'materialize' ? 'Guardando…' : 'Materializar local'}
              </button>
            </div>
            {message && <div className="mt-4 rounded-2xl bg-white/[.04] p-4 text-sm text-slate-300">{message}</div>}
          </div>

          {summary && (
            <div className="panel rounded-3xl p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-emerald-300">Film V7</div>
                  <h2 className="mt-1 text-2xl font-black">{summary.title}</h2>
                </div>
                <span className="rounded-full bg-violet-500/10 px-3 py-1.5 text-sm font-black text-violet-300">
                  {summary.durationMinutes} min
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Actos" value={summary.acts} />
                <Metric label="Secuencias" value={summary.sequences} />
                <Metric label="Escenas" value={summary.scenes} />
                <Metric label="Shots" value={summary.shots} />
                <Metric label="Takes" value={summary.takes} />
                <Metric label="Personajes" value={summary.characters} />
                <Metric label="Voice DNA" value={summary.voiceProfiles} />
                <Metric label="Assets" value={summary.assets} />
              </div>
              <div className="mt-5">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Shots con Take seleccionado</span>
                  <span>{summary.selectedTakes}/{summary.shots} · {completeness}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: completeness + '%' }} />
                </div>
              </div>
            </div>
          )}

          <div className="panel rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3">
              <Workflow className="h-5 w-5 text-violet-300" />
              <h2 className="text-xl font-black">Jerarquía de producción</h2>
            </div>
            <div className="mt-5 overflow-x-auto rounded-2xl bg-black/25 p-5 font-mono text-sm leading-7 text-slate-300">
              Film<br />
              └── Act<br />
              &nbsp;&nbsp;&nbsp;&nbsp;└── Sequence<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Scene<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Shot<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── Take A<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;├── Take B<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;└── Selected Take
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="panel rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3">
              <Layers3 className="h-5 w-5 text-cyan-300" />
              <h2 className="text-xl font-black">Módulos V7</h2>
            </div>
            <div className="mt-4 space-y-2">
              {modules.map(([name, description]) => (
                <div key={name} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    {name}
                  </div>
                  <div className="mt-1 pl-6 text-xs leading-5 text-slate-500">{description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel rounded-3xl p-5">
            <div className="flex items-center gap-3">
              <Mic2 className="h-5 w-5 text-violet-300" />
              <h3 className="font-black">Regla de ejecución</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Los agentes planifican. Los servicios deterministas ejecutan. Ningún Agent recibe credenciales de proveedor.
            </p>
          </div>

          <div className="panel rounded-3xl p-5">
            <div className="flex items-center gap-3">
              <Film className="h-5 w-5 text-cyan-300" />
              <h3 className="font-black">Escala objetivo</h3>
            </div>
            <div className="mt-3 text-sm leading-7 text-slate-400">
              1–180 minutos · hasta 5 actos · 200 escenas · 2,000 shots · múltiples Takes · 100 personajes.
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}
