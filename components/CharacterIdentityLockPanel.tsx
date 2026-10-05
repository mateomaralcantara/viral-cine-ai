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
  getCharacterMasterReference,
  getIdentityLockStatus
} from '@/lib/engine/preflight-identity-check';

export default function CharacterIdentityLockPanel({
  project,
  locked,
  onProjectChange
}: {
  project: FilmProject;
  locked: boolean;
  onProjectChange: (project: FilmProject) => void;
}) {
  const [busyCharacter, setBusyCharacter] = useState('');
  const [error, setError] = useState('');

  const bible = project.plan?.realMotion?.characterBible || [];
  const status = getIdentityLockStatus(project);

  if (!bible.length) return null;

  async function uploadReference(
    characterId: string,
    file: File
  ) {
    setBusyCharacter(characterId);
    setError('');

    try {
      const form = new FormData();
      form.set('characterId', characterId);
      form.set('file', file);

      const response = await fetch(
        `/api/projects/${project.id}/identity-lock`,
        {
          method: 'POST',
          body: form,
          cache: 'no-store'
        }
      );

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        project?: FilmProject;
      };

      if (!response.ok || !data.ok || !data.project) {
        throw new Error(
          data.error || 'No se pudo guardar la referencia.'
        );
      }

      onProjectChange(data.project);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusyCharacter('');
    }
  }

  async function setApproved(
    characterId: string,
    approved: boolean
  ) {
    setBusyCharacter(characterId);
    setError('');

    try {
      const response = await fetch(
        `/api/projects/${project.id}/identity-lock`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            characterId,
            approved
          }),
          cache: 'no-store'
        }
      );

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        project?: FilmProject;
      };

      if (!response.ok || !data.ok || !data.project) {
        throw new Error(
          data.error || 'No se pudo actualizar Identity Lock.'
        );
      }

      onProjectChange(data.project);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusyCharacter('');
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
              IDENTITY LOCK 5.0
            </div>

            <h2 className="mt-1 text-xl font-black">
              Referencias visuales maestras
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Cada actor debe tener una única identidad visual aprobada.
              Los estados narrativos pueden cambiar ropa, cabello,
              desgaste y postura, pero nunca el rostro base.
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
          const referenceAsset = getCharacterMasterReference(
            project,
            character.characterId
          );

          const approved =
            character.identityApproved === true &&
            Boolean(referenceAsset);

          const busy =
            busyCharacter === character.characterId;

          return (
            <article
              key={character.characterId}
              className={`overflow-hidden rounded-3xl border ${
                approved
                  ? 'border-emerald-400/25 bg-emerald-500/[.035]'
                  : 'border-white/10 bg-black/20'
              }`}
            >
              <div className="grid gap-0 md:grid-cols-[190px_minmax(0,1fr)]">
                <div className="aspect-square min-h-[190px] bg-gradient-to-br from-violet-950 to-slate-950">
                  {referenceAsset ? (
                    <img
                      src={assetUrl(project.id, referenceAsset)}
                      alt={`Referencia maestra de ${character.name}`}
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
                        approved
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : referenceAsset
                            ? 'bg-amber-500/10 text-amber-300'
                            : 'bg-slate-500/10 text-slate-400'
                      }`}
                    >
                      {approved
                        ? 'IDENTIDAD BLOQUEADA'
                        : referenceAsset
                          ? 'PENDIENTE DE APROBACIÓN'
                          : 'FALTA REFERENCIA'}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {character.identityLock}
                  </p>

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

                  <div className="mt-5 flex flex-wrap gap-2">
                    <label
                      className={`button-secondary cursor-pointer ${
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

                      {referenceAsset
                        ? 'Cambiar referencia'
                        : 'Subir referencia'}

                      <input
                        className="hidden"
                        type="file"
                        accept="image/jpeg,image/png"
                        disabled={locked || busy}
                        onChange={(event) => {
                          const input = event.currentTarget;
                          const file = input.files?.[0];

                          if (file) {
                            uploadReference(
                              character.characterId,
                              file
                            ).finally(() => {
                              input.value = '';
                            });
                          }
                        }}
                      />
                    </label>

                    {!approved ? (
                      <button
                        type="button"
                        className="button-primary"
                        disabled={
                          locked ||
                          busy ||
                          !referenceAsset
                        }
                        onClick={() =>
                          setApproved(
                            character.characterId,
                            true
                          )
                        }
                      >
                        {busy ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        Aprobar identidad
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={locked || busy}
                        onClick={() =>
                          setApproved(
                            character.characterId,
                            false
                          )
                        }
                      >
                        <UnlockKeyhole className="h-4 w-4" />
                        Desbloquear
                      </button>
                    )}
                  </div>

                  {approved && (
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-300">
                      <Check className="h-4 w-4" />
                      Esta referencia será la identidad maestra del personaje.
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!status.ready && (
        <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/[.06] p-4 text-sm leading-6 text-amber-100/80">
          La producción Real Motion permanece bloqueada hasta que
          todas las identidades tengan referencia visual y aprobación.
          Esto evita gastar en tomas con rostros inconsistentes.
        </div>
      )}
    </section>
  );
}

function assetUrl(projectId: string, asset: string) {
  return `/api/projects/${projectId}/assets/${asset
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function messageOf(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : 'Error desconocido';
}
