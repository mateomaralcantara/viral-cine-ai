'use client';

import { useState } from 'react';
import {
  Check,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Upload,
  UnlockKeyhole
} from 'lucide-react';
import type { FilmProject } from '@/lib/domain/schemas';
import {
  getCharacterBodyReference,
  getCharacterMasterReference,
  getIdentityLockStatus
} from '@/lib/engine/preflight-identity-check';

type ReferenceKind = 'face' | 'body';

export default function CharacterIdentityLockPanel({
  project,
  locked,
  onProjectChange
}: {
  project: FilmProject;
  locked: boolean;
  onProjectChange: (project: FilmProject) => void;
}) {
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  const bible = project.plan?.realMotion?.characterBible || [];
  const status = getIdentityLockStatus(project);

  if (!bible.length) return null;

  async function uploadReference(
    characterId: string,
    kind: ReferenceKind,
    file: File
  ) {
    const key = `${characterId}:${kind}`;
    setBusyKey(key);
    setError('');

    try {
      const form = new FormData();
      form.set('characterId', characterId);
      form.set('kind', kind);
      form.set('file', file);

      const response = await fetch(
        `/api/projects/${project.id}/identity-lock`,
        { method: 'POST', body: form, cache: 'no-store' }
      );

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        project?: FilmProject;
      };

      if (!response.ok || !data.ok || !data.project) {
        throw new Error(data.error || 'No se pudo guardar la referencia.');
      }

      onProjectChange(data.project);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusyKey('');
    }
  }

  async function setApproved(
    characterId: string,
    kind: ReferenceKind,
    approved: boolean
  ) {
    const key = `${characterId}:${kind}`;
    setBusyKey(key);
    setError('');

    try {
      const response = await fetch(
        `/api/projects/${project.id}/identity-lock`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId, kind, approved }),
          cache: 'no-store'
        }
      );

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        project?: FilmProject;
      };

      if (!response.ok || !data.ok || !data.project) {
        throw new Error(data.error || 'No se pudo actualizar Identity Lock.');
      }

      onProjectChange(data.project);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusyKey('');
    }
  }

  return (
    <section className="panel rounded-3xl p-5 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/10">
            <LockKeyhole className="h-5 w-5 text-violet-300" />
          </div>

          <div>
            <div className="text-xs font-black uppercase tracking-[.18em] text-violet-300">
              IDENTITY LOCK 5.1 · FACE + BODY
            </div>

            <h2 className="mt-1 text-xl font-black">
              Identidad visual completa
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Cada personaje necesita FACE MASTER y BODY MASTER aprobados.
              El rostro fija identidad facial; el cuerpo fija proporciones,
              complexión, postura y lectura a distancia.
            </p>
          </div>
        </div>

        <div
          className={`w-fit rounded-2xl border px-4 py-3 text-sm font-black ${
            status.ready
              ? 'border-emerald-400/25 bg-emerald-500/[.08] text-emerald-300'
              : 'border-amber-400/25 bg-amber-500/[.08] text-amber-200'
          }`}
        >
          {status.ready
            ? `IDENTITY LOCK ${status.approved}/${status.required} · LISTO`
            : `IDENTITY LOCK ${status.approved}/${status.required}`}
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {bible.map((character) => {
          const faceReference = getCharacterMasterReference(
            project,
            character.characterId
          );
          const bodyReference = getCharacterBodyReference(
            project,
            character.characterId
          );

          const faceApproved =
            (character.faceApproved ?? character.identityApproved === true) &&
            Boolean(faceReference);
          const bodyApproved =
            character.bodyApproved === true &&
            Boolean(bodyReference);
          const characterReady = faceApproved && bodyApproved;

          return (
            <article
              key={character.characterId}
              className={`overflow-hidden rounded-3xl border ${
                characterReady
                  ? 'border-emerald-400/25 bg-emerald-500/[.035]'
                  : 'border-white/10 bg-black/20'
              }`}
            >
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black">
                      {character.name}
                    </h3>
                    <div className="mt-1 text-[11px] uppercase tracking-wider text-slate-600">
                      {character.characterId}
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                      characterReady
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {characterReady
                      ? 'IDENTIDAD COMPLETA'
                      : `${Number(faceApproved) + Number(bodyApproved)}/2 LOCKS`}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {character.identityLock}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <ReferenceCard
                    title="FACE MASTER"
                    subtitle="Rostro / identidad"
                    projectId={project.id}
                    referenceAsset={faceReference}
                    approved={faceApproved}
                    busy={busyKey === `${character.characterId}:face`}
                    locked={locked}
                    onUpload={(file) =>
                      uploadReference(character.characterId, 'face', file)
                    }
                    onApprove={(approved) =>
                      setApproved(character.characterId, 'face', approved)
                    }
                  />

                  <ReferenceCard
                    title="BODY MASTER"
                    subtitle="Cuerpo completo / distancia"
                    projectId={project.id}
                    referenceAsset={bodyReference}
                    approved={bodyApproved}
                    busy={busyKey === `${character.characterId}:body`}
                    locked={locked}
                    onUpload={(file) =>
                      uploadReference(character.characterId, 'body', file)
                    }
                    onApprove={(approved) =>
                      setApproved(character.characterId, 'body', approved)
                    }
                  />
                </div>

                <div className="mt-4">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                    Estados derivados
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {character.states.map((state) => (
                      <span
                        key={state.id}
                        className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-400"
                      >
                        {state.label}
                      </span>
                    ))}
                  </div>
                </div>

                {characterReady && (
                  <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-300">
                    <Check className="h-4 w-4" />
                    Face + Body bloqueados para producción.
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!status.ready && (
        <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/[.06] p-4 text-sm leading-6 text-amber-100/80">
          La producción Real Motion permanece bloqueada hasta que los cinco
          personajes tengan FACE MASTER + BODY MASTER aprobados.
          Las aprobaciones de rostro que ya hiciste se conservan.
        </div>
      )}
    </section>
  );
}

function ReferenceCard({
  title,
  subtitle,
  projectId,
  referenceAsset,
  approved,
  busy,
  locked,
  onUpload,
  onApprove
}: {
  title: string;
  subtitle: string;
  projectId: string;
  referenceAsset?: string;
  approved: boolean;
  busy: boolean;
  locked: boolean;
  onUpload: (file: File) => Promise<void>;
  onApprove: (approved: boolean) => Promise<void>;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border ${
        approved
          ? 'border-emerald-400/20 bg-emerald-500/[.03]'
          : 'border-white/10 bg-black/20'
      }`}
    >
      <div className="aspect-[4/5] bg-gradient-to-br from-violet-950 to-slate-950">
        {referenceAsset ? (
          <img
            src={assetUrl(projectId, referenceAsset)}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <div className="text-center">
              <ImageIcon className="mx-auto h-8 w-8 text-slate-700" />
              <div className="mt-2 text-xs text-slate-600">
                Sin referencia
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-black text-slate-200">
              {title}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-600">
              {subtitle}
            </div>
          </div>

          <span
            className={`rounded-full px-2 py-1 text-[9px] font-black ${
              approved
                ? 'bg-emerald-500/10 text-emerald-300'
                : referenceAsset
                  ? 'bg-amber-500/10 text-amber-300'
                  : 'bg-white/5 text-slate-500'
            }`}
          >
            {approved
              ? 'APROBADO'
              : referenceAsset
                ? 'REVISAR'
                : 'PENDIENTE'}
          </span>
        </div>

        <div className="mt-3 grid gap-2">
          <label
            className={`button-secondary cursor-pointer justify-center ${
              locked || busy
                ? 'pointer-events-none opacity-50'
                : ''
            }`}
          >
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {referenceAsset ? 'Cambiar' : 'Subir'}

            <input
              className="hidden"
              type="file"
              accept="image/jpeg,image/png"
              disabled={locked || busy}
              onChange={(event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];

                if (file) {
                  onUpload(file).finally(() => {
                    input.value = '';
                  });
                }
              }}
            />
          </label>

          {!approved ? (
            <button
              type="button"
              className="button-primary justify-center"
              disabled={locked || busy || !referenceAsset}
              onClick={() => onApprove(true)}
            >
              {busy ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Aprobar
            </button>
          ) : (
            <button
              type="button"
              className="button-secondary justify-center"
              disabled={locked || busy}
              onClick={() => onApprove(false)}
            >
              <UnlockKeyhole className="h-4 w-4" />
              Desbloquear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function assetUrl(projectId: string, asset: string) {
  return `/api/projects/${projectId}/assets/${asset
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Error desconocido';
}
