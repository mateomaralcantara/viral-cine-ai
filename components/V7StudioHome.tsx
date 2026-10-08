'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Film,
  Gauge,
  Languages,
  LoaderCircle,
  GitMerge,
  ShieldCheck,
  Sparkles,
  WalletCards
} from 'lucide-react';
import V7FilmLibrary, { type V7LibraryV7LibraryFilmSummary } from '@/components/V7FilmLibrary';

type CreateResponse = {
  ok?: boolean;
  film?: V7LibraryFilmSummary;
  error?: string;
  preflight?: {
    errors?: string[];
    warnings?: string[];
  };
};

const durationPresets = [5, 15, 30, 60, 90, 120];
const genres = ['Drama', 'Acción', 'Comedia', 'Suspenso', 'Terror', 'Romance', 'Documental', 'Histórica', 'Ciencia ficción'];

export default function V7StudioHome() {
  const [films, setFilms] = useState<V7LibraryFilmSummary[]>([]);
  const [loadingFilms, setLoadingFilms] = useState(true);
  const [creating, setCreating] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [message, setMessage] = useState('');
  const [migrationMessage, setMigrationMessage] = useState('');
  const requestId = useRef<string>(crypto.randomUUID());
  const [form, setForm] = useState({
    title: '',
    story: '',
    durationMinutes: 90,
    genre: 'Drama',
    aspectRatio: '16:9',
    language: 'es',
    budgetUsd: 0,
    quality: 'cine'
  });

  useEffect(() => {
    void refreshFilms();
  }, []);

  const lengthLabel = useMemo(() => {
    if (form.durationMinutes <= 10) return 'Corto';
    if (form.durationMinutes < 60) return 'Media duración';
    return 'Largometraje';
  }, [form.durationMinutes]);

  async function refreshFilms() {
    setLoadingFilms(true);
    try {
      const response = await fetch('/api/v7/films', { cache: 'no-store' });
      const body = await response.json() as { ok?: boolean; films?: V7LibraryFilmSummary[] };
      setFilms(body.films || []);
    } finally {
      setLoadingFilms(false);
    }
  }

  async function createFilm() {
    setCreating(true);
    setMessage('');
    try {
      const response = await fetch('/api/v7/films', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: requestId.current,
          ...form,
          budgetUsd: Number(form.budgetUsd),
          durationMinutes: Number(form.durationMinutes)
        })
      });
      const body = await response.json() as CreateResponse;
      if (!response.ok || !body.ok || !body.film) {
        const errors = body.preflight?.errors?.join(' · ');
        throw new Error(errors || body.error || 'No se pudo crear la película.');
      }
      const warnings = body.preflight?.warnings || [];
      if (warnings.length) setMessage(warnings.join(' · '));
      window.location.href = '/v7/films/' + encodeURIComponent(body.film.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      requestId.current = crypto.randomUUID();
    } finally {
      setCreating(false);
    }
  }

  async function migrateLegacy() {
    setMigrating(true);
    setMigrationMessage('');
    try {
      const response = await fetch('/api/v7/migrate-v6', { method: 'POST' });
      const body = await response.json() as {
        migrated?: Array<unknown>;
        skipped?: Array<unknown>;
        failed?: Array<unknown>;
        error?: string;
      };
      if (!response.ok && response.status !== 207) throw new Error(body.error || 'Migración fallida.');
      setMigrationMessage(
        'Migrados: ' + (body.migrated?.length || 0) +
        ' · Ya existentes: ' + (body.skipped?.length || 0) +
        ' · Fallos: ' + (body.failed?.length || 0)
      );
      await refreshFilms();
    } catch (error) {
      setMigrationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setMigrating(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-4 py-6 md:px-8">
      <header className="panel rounded-3xl p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-3 text-violet-300">
              <Film className="h-6 w-6" />
              <span className="text-xs font-black uppercase tracking-[.24em]">ViralCine 7 · Feature Film OS</span>
            </div>
            <h1 className="mt-3 text-3xl font-black md:text-5xl">Crear. Producir. Terminar.</h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-400">
              V7 es ahora la línea principal. Sirve para cortos y largometrajes y se endurecerá módulo por módulo:
              historia, casting, voces, música, continuidad, producción, QA y master.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[.08] px-4 py-3 text-sm font-bold text-emerald-300">
            <ShieldCheck className="mr-2 inline h-4 w-4" />
            CREAR PROYECTO = US$0
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="panel rounded-3xl p-5 md:p-7">
          <div className="mb-6 flex items-center gap-3">
            <Clapperboard className="h-6 w-6 text-violet-300" />
            <div>
              <h2 className="text-2xl font-black">CREAR PELÍCULA</h2>
              <p className="text-sm text-slate-500">El proyecto se crea en V7 sin llamar proveedores externos.</p>
            </div>
          </div>

          <div className="grid gap-5">
            <Field label="Título">
              <input
                className="field"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Ej. 15 DÍAS"
              />
            </Field>

            <Field label="Historia">
              <textarea
                className="field min-h-40 resize-y"
                value={form.story}
                onChange={(event) => setForm({ ...form, story: event.target.value })}
                placeholder="Describe la historia, conflicto, personajes y final que deseas..."
              />
            </Field>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Duración">
                <div className="space-y-3">
                  <div className="relative">
                    <Clock3 className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                    <input
                      className="field pl-10"
                      type="number"
                      min={1}
                      max={180}
                      value={form.durationMinutes}
                      onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {durationPresets.map((value) => (
                      <button
                        type="button"
                        key={value}
                        className={
                          'rounded-full border px-3 py-1.5 text-xs font-bold ' +
                          (form.durationMinutes === value
                            ? 'border-violet-400/60 bg-violet-500/15 text-violet-200'
                            : 'border-white/10 bg-white/[.03] text-slate-400')
                        }
                        onClick={() => setForm({ ...form, durationMinutes: value })}
                      >
                        {value} min
                      </button>
                    ))}
                  </div>
                  <div className="text-xs font-bold text-cyan-300">{lengthLabel}</div>
                </div>
              </Field>

              <Field label="Género">
                <select className="field" value={form.genre} onChange={(event) => setForm({ ...form, genre: event.target.value })}>
                  {genres.map((genre) => <option key={genre}>{genre}</option>)}
                </select>
              </Field>

              <Field label="Formato">
                <select
                  className="field"
                  value={form.aspectRatio}
                  onChange={(event) => setForm({ ...form, aspectRatio: event.target.value })}
                >
                  <option value="16:9">16:9 · Cine / streaming</option>
                  <option value="2.39:1">2.39:1 · Cinemascope</option>
                  <option value="9:16">9:16 · Vertical</option>
                  <option value="1:1">1:1 · Cuadrado</option>
                  <option value="4:3">4:3 · Clásico</option>
                </select>
              </Field>

              <Field label="Idioma">
                <div className="relative">
                  <Languages className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                  <select
                    className="field pl-10"
                    value={form.language}
                    onChange={(event) => setForm({ ...form, language: event.target.value })}
                  >
                    <option value="es">Español</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </Field>

              <Field label="Presupuesto">
                <div className="relative">
                  <WalletCards className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                  <input
                    className="field pl-10"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.budgetUsd}
                    onChange={(event) => setForm({ ...form, budgetUsd: Number(event.target.value) })}
                    placeholder="US$ 0.00"
                  />
                </div>
              </Field>

              <Field label="Calidad">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['cine', 'Cine'],
                    ['premium', 'Premium'],
                    ['maxima', 'Máxima']
                  ] as const).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setForm({ ...form, quality: value })}
                      className={
                        'rounded-xl border px-3 py-3 text-sm font-black transition ' +
                        (form.quality === value
                          ? 'border-violet-400/60 bg-violet-500/15 text-white'
                          : 'border-white/10 bg-black/20 text-slate-400 hover:border-white/20')
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {message && (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[.07] p-4 text-sm text-amber-200">
                {message}
              </div>
            )}

            <button
              className="button-primary mt-2 min-h-14 text-base"
              disabled={creating}
              onClick={createFilm}
            >
              {creating ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              {creating ? 'CREANDO PROYECTO V7…' : 'CREAR PELÍCULA'}
            </button>

            <div className="grid gap-3 text-xs text-slate-500 sm:grid-cols-3">
              <div className="rounded-xl bg-black/20 p-3">✓ Preflight antes de producción</div>
              <div className="rounded-xl bg-black/20 p-3">✓ Sin gasto al crear</div>
              <div className="rounded-xl bg-black/20 p-3">✓ Proyecto recuperable</div>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="panel rounded-3xl p-5 md:p-6">
            <div className="flex items-center gap-3">
              <Gauge className="h-5 w-5 text-cyan-300" />
              <h2 className="text-xl font-black">Áreas V7</h2>
            </div>
            <div className="mt-4 space-y-2">
              {[
                'Historia y guion',
                'Selección de personajes',
                'Voces / Voice DNA',
                'Banda sonora',
                'Continuidad',
                'Producción de video',
                'QA y reparación',
                'Postproducción',
                'Master final'
              ].map((label, index) => (
                <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/10 text-xs font-black text-violet-300">
                    {index + 1}
                  </div>
                  <span className="text-sm font-bold">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel rounded-3xl p-5">
            <div className="flex items-center gap-3">
              <GitMerge className="h-5 w-5 text-violet-300" />
              <h3 className="font-black">Migrar catálogo V6</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Importa todos tus proyectos anteriores a V7 sin borrar, copiar ni sobrescribir los originales.
            </p>
            <button className="button-secondary mt-4 w-full" disabled={migrating} onClick={migrateLegacy}>
              {migrating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              {migrating ? 'Migrando…' : 'MIGRAR V6 → V7'}
            </button>
            {migrationMessage && <div className="mt-3 text-xs leading-5 text-slate-400">{migrationMessage}</div>}
          </div>

          <div className="panel rounded-3xl p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              <h3 className="font-black">Política desde ahora</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              V7 es el producto principal. V6 queda congelado como respaldo técnico mientras sustituimos cada módulo por su versión endurecida.
            </p>
            <a href="/v7/system" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-violet-300 hover:text-violet-200">
              Ver arquitectura V7 <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </aside>
      </section>

      <V7FilmLibrary films={films} loading={loadingFilms} onRefresh={() => { void refreshFilms(); }} />

      <footer className="py-6 text-center text-xs text-slate-600">
        <a href="/legacy-v6" className="hover:text-slate-400">ViralCine 6 legacy</a>
      </footer>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-300">{label}</span>
      {children}
    </label>
  );
}
