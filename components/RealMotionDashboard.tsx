'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Users, Video, Music2, Activity, LockKeyhole, LoaderCircle } from 'lucide-react';
import type { FilmProject } from '@/lib/domain/schemas';
import CharacterIdentityLockPanel from '@/components/CharacterIdentityLockPanel';
import PilotShotOnePanel from '@/components/PilotShotOnePanel';
import { getIdentityLockStatus } from '@/lib/engine/preflight-identity-check';
import { getPilotStateLockStatus } from '@/lib/engine/pilot-state-lock-v5';
import { getPilotRoutingLockStatus } from '@/lib/engine/pilot-routing-lock-v5';

type RoutingPreflight = {
  total: number;
  readyCount: number;
  ready: boolean;
  estimatedPilotUsd: number;
  reservedMovieUsd: number;
  movieLimitUsd: number;
  estimatedAfterPilotUsd: number;
  withinMovieLimit: boolean;
};

type SystemLike = {
  mode?: 'demo' | 'real';
  paidGenerationEnabled?: boolean;
  safetyReason?: string;
  ffmpeg?: boolean;
  veo?: boolean;
  fal?: boolean;
};

export default function RealMotionDashboard({
  project,
  system,
  locked,
  onProjectChange
}: {
  project: FilmProject;
  system: SystemLike | null;
  locked: boolean;
  onProjectChange: (project: FilmProject) => void;
}) {
  const plan = project.plan?.realMotion;
  const identityStatus = getIdentityLockStatus(project);
  const stateLockStatus = getPilotStateLockStatus(project);
  const routingLockStatus = getPilotRoutingLockStatus(project);
  const [stateLockBusy, setStateLockBusy] = useState(false);
  const [stateLockError, setStateLockError] = useState('');
  const [routingBusy, setRoutingBusy] = useState(false);
  const [routingError, setRoutingError] = useState('');
  const [routingPreflight, setRoutingPreflight] =
    useState<RoutingPreflight | null>(null);

  useEffect(() => {
    let active = true;

    fetch(
      `/api/projects/${project.id}/pilot-routing-lock`,
      { cache: 'no-store' }
    )
      .then((response) => response.json())
      .then((data: {
        ok: boolean;
        routing?: RoutingPreflight;
      }) => {
        if (active && data.ok && data.routing) {
          setRoutingPreflight(data.routing);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [project.id, project.updatedAt]);

  async function applyStateLocks() {
    setStateLockBusy(true);
    setStateLockError('');

    try {
      const response = await fetch(
        `/api/projects/${project.id}/pilot-state-lock`,
        { method: 'POST', cache: 'no-store' }
      );
      const data = await response.json() as {
        ok: boolean;
        error?: string;
        project?: FilmProject;
      };

      if (!response.ok || !data.ok || !data.project) {
        throw new Error(data.error || 'No se pudieron bloquear los estados del piloto.');
      }

      onProjectChange(data.project);
    } catch (reason) {
      setStateLockError(
        reason instanceof Error ? reason.message : 'Error desconocido'
      );
    } finally {
      setStateLockBusy(false);
    }
  }

  async function applyRoutingLocks() {
    setRoutingBusy(true);
    setRoutingError('');

    try {
      const response = await fetch(
        `/api/projects/${project.id}/pilot-routing-lock`,
        { method: 'POST', cache: 'no-store' }
      );

      const data = await response.json() as {
        ok: boolean;
        error?: string;
        project?: FilmProject;
        routing?: RoutingPreflight;
      };

      if (!response.ok || !data.ok || !data.project) {
        throw new Error(
          data.error || 'No se pudo bloquear el routing del piloto.'
        );
      }

      if (data.routing) {
        setRoutingPreflight(data.routing);
      }
      onProjectChange(data.project);
    } catch (reason) {
      setRoutingError(
        reason instanceof Error ? reason.message : 'Error desconocido'
      );
    } finally {
      setRoutingBusy(false);
    }
  }

  if (!plan) {
    return (
      <div className="panel rounded-3xl p-8 text-center">
        <Video className="mx-auto h-10 w-10 text-cyan-300" />
        <h2 className="mt-4 text-2xl font-black">Real Motion 5.0</h2>
        <p className="mx-auto mt-2 max-w-xl text-slate-400">
          Este proyecto todavía no tiene un plan Real Motion 5.0.
          El piloto “15 DÍAS” lo instala automáticamente.
        </p>
      </div>
    );
  }

  const pilotRows =
    project.plan?.scenes
      .flatMap((scene) => scene.shots.map((shot) => ({ scene, shot })))
      .filter(({ shot }) => plan.pilotShotIds.includes(shot.id)) || [];

  const providerLabel: Record<string, string> = {
    veo: 'Veo',
    'fal-video': 'Fal Video',
    runway: 'Runway',
    seedance: 'Seedance',
    wan: 'WAN'
  };

  return (
    <div className="space-y-5">
      <section className="panel rounded-3xl p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[.18em] text-cyan-300">
              FINAL MODE · VIDEO TEMPORAL REAL
            </div>
            <h2 className="mt-2 text-2xl font-black">Real Motion Router 5.0</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {plan.qualityRule}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/[.07] px-4 py-3 text-sm font-bold text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Still-motion FINAL: PROHIBIDO
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <MetricBox
            icon={<Users />}
            label="Character Bible"
            value={plan.characterBible.length + '/5'}
          />
          <MetricBox
            icon={<ShieldCheck />}
            label="Identity Lock"
            value={identityStatus.approved + '/' + identityStatus.required}
          />
          <MetricBox
            icon={<LockKeyhole />}
            label="State Lock"
            value={stateLockStatus.readyCount + '/' + stateLockStatus.total}
          />
          <MetricBox
            icon={<Activity />}
            label="Routing Lock"
            value={routingLockStatus.readyCount + '/' + routingLockStatus.total}
          />
          <MetricBox
            icon={<Video />}
            label="Piloto"
            value={pilotRows.length + '/8 tomas'}
          />
          <MetricBox
            icon={<Music2 />}
            label="Música"
            value={(project.plan?.musicPlan?.cues.length || 0) + ' cues'}
          />
          <MetricBox
            icon={<Activity />}
            label="Circuit breaker"
            value={plan.circuitBreaker.failureThreshold + ' fallos'}
          />
        </div>

        <div className="mt-5">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">
            Orden de proveedores
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {plan.providerOrder.map((provider, index) => {
              const configured =
                provider === 'veo'
                  ? Boolean(system?.veo)
                  : provider === 'fal-video'
                    ? Boolean(system?.fal)
                    : false;

              return (
                <span
                  key={provider}
                  className="rounded-full border border-white/10 bg-white/[.035] px-3 py-1.5 text-xs font-bold text-slate-300"
                >
                  {index + 1}. {providerLabel[provider] || provider}
                  {configured ? ' · listo' : ' · pendiente'}
                </span>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-600">
            Runway, Seedance y WAN ya existen como slots del router, pero no se
            marcarán disponibles hasta que exista un adapter y credencial válidos.
          </p>
        </div>
      </section>

      <CharacterIdentityLockPanel
        project={project}
        locked={locked}
        onProjectChange={onProjectChange}
      />

      <PilotShotOnePanel
        project={project}
        system={system}
        locked={locked}
        onProjectChange={onProjectChange}
      />

      <section className="panel rounded-3xl p-5 md:p-6">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-violet-300" />
          <div>
            <h2 className="text-xl font-black">Character Bible definitiva</h2>
            <p className="text-sm text-slate-500">
              La transformación cambia desgaste, vestuario y postura; nunca cambia de actor.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {plan.characterBible.map((character) => (
            <article
              key={character.characterId}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-black">{character.name}</h3>
                <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-black text-violet-300">
                  {character.states.length} estado(s)
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {character.identityLock}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {character.states.map((state) => (
                  <span
                    key={state.id}
                    className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-400"
                  >
                    {state.label}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel rounded-3xl p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-black">Piloto · primeras 8 tomas</h2>
            <p className="mt-1 text-sm text-slate-500">
              Cada actor queda asociado al estado narrativo exacto de esa toma antes de producir.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${
              stateLockStatus.ready
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-amber-500/10 text-amber-300'
            }`}>
              State Lock {stateLockStatus.readyCount}/{stateLockStatus.total}
            </span>

            <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${
              routingLockStatus.ready
                ? 'bg-emerald-500/10 text-emerald-300'
                : 'bg-amber-500/10 text-amber-300'
            }`}>
              Routing Lock {routingLockStatus.readyCount}/{routingLockStatus.total}
            </span>

            {!stateLockStatus.ready && (
              <button
                type="button"
                className="button-secondary"
                disabled={locked || stateLockBusy}
                onClick={applyStateLocks}
              >
                {stateLockBusy
                  ? <LoaderCircle className="h-4 w-4 animate-spin" />
                  : <LockKeyhole className="h-4 w-4" />}
                Bloquear estados
              </button>
            )}

            {!routingLockStatus.ready && (
              <button
                type="button"
                className="button-secondary"
                disabled={locked || routingBusy}
                onClick={applyRoutingLocks}
              >
                {routingBusy
                  ? <LoaderCircle className="h-4 w-4 animate-spin" />
                  : <Activity className="h-4 w-4" />}
                Bloquear routing
              </button>
            )}
          </div>
        </div>

        {stateLockError && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            {stateLockError}
          </div>
        )}

        {routingError && (
          <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
            {routingError}
          </div>
        )}

        {routingPreflight && (
          <div className={`mt-4 rounded-2xl border p-4 text-sm ${
            routingPreflight.withinMovieLimit
              ? 'border-emerald-400/20 bg-emerald-500/[.05] text-emerald-100/80'
              : 'border-red-400/20 bg-red-500/[.06] text-red-200'
          }`}>
            Costo preventivo de las 8 tomas: <strong>US${routingPreflight.estimatedPilotUsd.toFixed(2)}</strong>
            {' · '}Reservado previamente: US${routingPreflight.reservedMovieUsd.toFixed(2)}
            {' · '}Proyección: US${routingPreflight.estimatedAfterPilotUsd.toFixed(2)}
            {' · '}Límite de película: US${routingPreflight.movieLimitUsd.toFixed(2)}
          </div>
        )}

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {pilotRows.map(({ scene, shot }) => {
            const bindings = shot.characterIds.map((characterId) => {
              const character = plan.characterBible.find(
                (entry) => entry.characterId === characterId
              );
              const stateId = shot.characterStateIds?.[characterId];
              const state = character?.states.find((item) => item.id === stateId);
              return {
                characterName: character?.name || characterId,
                stateLabel: state?.label || 'SIN ESTADO'
              };
            });

            return (
            <article
              key={shot.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-sm font-black text-cyan-300">
                  {shot.order}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black">{shot.title}</h3>
                    <span className="text-[10px] text-slate-600">
                      E{scene.order} · {shot.durationSeconds}s
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {shot.motionSpec?.intention}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {bindings.map((binding) => (
                      <span
                        key={binding.characterName}
                        className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                          binding.stateLabel === 'SIN ESTADO'
                            ? 'bg-red-500/10 text-red-300'
                            : 'bg-violet-500/10 text-violet-300'
                        }`}
                      >
                        {binding.characterName} · {binding.stateLabel}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                    <span className="text-slate-600">Routing:</span>
                    {(shot.motionSpec?.preferredProviders || []).map((provider, index) => (
                      <span
                        key={provider}
                        className="rounded-full bg-cyan-500/10 px-2 py-1 text-cyan-300"
                      >
                        {index + 1}. {providerLabel[provider] || provider}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                    <span>Motion ≥ {shot.motionSpec?.minMotionScore}/10</span>
                    <span>Identidad ≥ {shot.motionSpec?.minIdentityScore}/10</span>
                    <span>Continuidad ≥ {shot.motionSpec?.minContinuityScore}/10</span>
                    <span>Anatomía ≥ {shot.motionSpec?.minAnatomyScore}/10</span>
                  </div>
                  <div className="mt-3 text-[11px] font-bold text-emerald-300">
                    Still fallback final: NO
                  </div>
                </div>
              </div>
            </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MetricBox({
  icon,
  label,
  value
}: {
  icon: React.ReactElement;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2 text-slate-600 [&>svg]:h-4 [&>svg]:w-4">
        {icon}
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 text-lg font-black text-slate-200">{value}</div>
    </div>
  );
}
