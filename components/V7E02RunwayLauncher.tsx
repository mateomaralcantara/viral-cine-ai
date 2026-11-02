'use client';

import { useCallback, useEffect, useState } from 'react';

type Shot = {
  id: string;
  state: string;
  referenceReady: boolean;
  videoUrl: string | null;
  qaApproved: boolean;
  taskId: string | null;
};

type Status = {
  shots: Shot[];
  videoCount: number;
  qaCount: number;
  runwayKeyConfigured: boolean;
  policy: {
    status: string;
    spent_or_reserved_usd: string;
  } | null;
};

type Reply = {
  ok?: boolean;
  error?: string;
  setupRequired?: boolean;
  authenticated?: boolean;
  creditBalance?: number;
  sufficient?: boolean;
  status?: string;
};

async function call<T>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch('/api/v8/scene2', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
    cache: 'no-store'
  });

  const data = await response.json() as T & { error?: string };

  if (!response.ok || data.error) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

const labels: Record<string, string> = {
  'waiting-credits': 'Esperando inicio',
  'awaiting-executor': 'Lista para Runway',
  'reserved': 'Presupuesto reservado',
  'task-known': 'Generando video',
  'qa-pending': 'MP4 recibido / QA pendiente',
  'qa-approved': 'QA aprobado',
  'blocked': 'Requiere revision'
};

export default function V7E02RunwayLauncher() {
  const [authenticated, setAuthenticated] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [credits, setCredits] = useState<number | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  const refresh = useCallback(async () => {
    const data = await call<Status>('status');
    setStatus(data);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const info = await call<Reply>('info');

        setSetupRequired(info.setupRequired === true);
        setAuthenticated(info.authenticated === true);

        if (info.authenticated) {
          await refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  useEffect(() => {
    if (!authenticated) return;

    const timer = setInterval(() => {
      if (!busy) void refresh().catch(() => undefined);
    }, 20000);

    return () => clearInterval(timer);
  }, [authenticated, busy, refresh]);

  async function execute(fn: () => Promise<void>) {
    if (busy) return;

    setBusy(true);
    setError('');
    setMessage('');

    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function login() {
    void execute(async () => {
      await call(
        setupRequired ? 'setup' : 'login',
        { password, code: setupRequired ? code : undefined }
      );

      setPassword('');
      setCode('');
      setAuthenticated(true);
      await refresh();
      setMessage('Direccion de ViralCine conectada.');
    });
  }

  function connect() {
    void execute(async () => {
      if (!key.trim()) {
        throw new Error('Introduce la clave API de Runway.');
      }

      const result = await call<Reply>('save-key', {
        key: key.trim()
      });

      setKey('');
      setCredits(result.creditBalance ?? null);
      setMessage('Runway conectado y clave protegida. Produccion aun pausada.');
      await refresh();
    });
  }

  function balance() {
    void execute(async () => {
      const result = await call<Reply>('balance');

      setCredits(result.creditBalance ?? null);

      if (!result.sufficient) {
        throw new Error(
          `Runway tiene ${result.creditBalance ?? 0} creditos API. Se requieren 350.`
        );
      }

      setMessage(
        `Saldo API verificado: ${result.creditBalance} creditos.`
      );
    });
  }

  function launch() {
    void execute(async () => {
      if (!window.confirm(
        'AUTORIZACION E02: iniciar una unica generacion de 10 segundos ' +
        'por cada una de las 7 tomas, Runway Gen-4 Turbo, ' +
        'maximo US$3.50, SIN regeneraciones?'
      )) return;

      const result = await call<Reply>('launch');

      if (result.status !== 'armed') {
        throw new Error('Runway no confirmo el lanzamiento.');
      }

      setMessage(
        'Escena 02 habilitada. El supervisor de Supabase ' +
        'enviara las tomas y recuperara los MP4.'
      );

      await refresh();
    });
  }

  function pause() {
    void execute(async () => {
      await call('pause');
      setMessage(
        'Pausadas las nuevas generaciones. ' +
        'Los trabajos enviados pueden continuar.'
      );
      await refresh();
    });
  }

  if (loading) {
    return (
      <p className="mt-4 text-violet-200">
        Conectando supervisor de la Escena 02...
      </p>
    );
  }

  const shots = status?.shots || [];
  const policy = status?.policy;
  const armed = policy?.status === 'ready';

  return (
    <section className="mt-5 rounded-2xl border border-violet-400/40 bg-violet-400/[.06] p-5">
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-widest text-violet-300">
          Produccion real · Escena 02
        </p>
        <h3 className="mt-2 text-2xl font-black">
          Runway Gen-4 Turbo
        </h3>
        <p className="mt-2 text-sm text-slate-300">
          Siete fotografias aprobadas. Siete videos de 10 segundos.
          Presupuesto maximo US$3.50. Sin regeneraciones automaticas.
        </p>
      </div>

      {error && (
        <p role="alert" className="my-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="my-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {message}
        </p>
      )}

      {!authenticated ? (
        <div className="max-w-xl space-y-3 rounded-xl border border-white/10 p-4">
          <h4 className="font-bold">Acceso privado del director</h4>

          {setupRequired && (
            <label className="block text-sm">
              Codigo de activacion inicial
              <input
                className="field mt-2 w-full"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="Codigo de un solo uso"
              />
            </label>
          )}

          <label className="block text-sm">
            Contrasena de director
            <input
              type="password"
              autoComplete={setupRequired ? 'new-password' : 'current-password'}
              className="field mt-2 w-full"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimo 12 caracteres"
            />
          </label>

          <button
            type="button"
            className="button-primary"
            disabled={busy}
            onClick={login}
          >
            {setupRequired ? 'Activar estudio' : 'Entrar al estudio'}
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-xs text-slate-400">Videos recibidos</p>
              <strong className="text-2xl">
                {status?.videoCount ?? 0}/7
              </strong>
            </div>

            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-xs text-slate-400">QA aprobado</p>
              <strong className="text-2xl">
                {status?.qaCount ?? 0}/7
              </strong>
            </div>

            <div className="rounded-xl border border-white/10 p-3">
              <p className="text-xs text-slate-400">Presupuesto reservado</p>
              <strong className="text-2xl">
                US${Number(policy?.spent_or_reserved_usd || 0).toFixed(2)}
              </strong>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 p-4">
            <h4 className="font-bold">Conexion con Runway Dev</h4>
            <p className="mt-2 text-xs text-slate-300">
              {status?.runwayKeyConfigured
                ? 'Clave privada conectada a Supabase Vault.'
                : 'Falta conectar la clave API de Runway.'}
            </p>

            <label className="mt-3 block text-sm">
              Clave API de Runway
              <input
                className="field mt-2 w-full"
                type="password"
                autoComplete="off"
                value={key}
                onChange={e => setKey(e.target.value)}
                placeholder="Pega aqui tu clave API privada"
              />
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="button-secondary"
                disabled={busy}
                onClick={connect}
              >
                Conectar Runway
              </button>

              <button
                type="button"
                className="button-secondary"
                disabled={busy}
                onClick={balance}
              >
                Verificar creditos
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Saldo comprobado: {credits === null
                ? 'Aun sin consultar'
                : `${credits} creditos API`}
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-violet-400/25 p-4">
            <h4 className="font-black">
              Estado: {armed ? 'PRODUCCION ACTIVA' : 'PRODUCCION PAUSADA'}
            </h4>

            <p className="mt-2 text-sm text-slate-300">
              El supervisor procesa una toma por vez, guarda el ID de Runway,
              recupera el MP4 y lo registra para control de calidad.
            </p>

            <button
              type="button"
              className="button-primary mt-3"
              disabled={busy || armed}
              onClick={launch}
            >
              Iniciar Escena 02 - 7 tomas
            </button>

            <button
              type="button"
              className="button-secondary mt-3 ml-2"
              disabled={busy}
              onClick={pause}
            >
              Pausar nuevos renders
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {shots.map(shot => (
              <article
                key={shot.id}
                className="rounded-xl border border-white/10 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{shot.id}</strong>

                  <span className="text-xs text-violet-200">
                    {shot.qaApproved
                      ? 'QA aprobado'
                      : labels[shot.state] || shot.state}
                  </span>
                </div>

                {shot.videoUrl ? (
                  <video
                    src={shot.videoUrl}
                    controls
                    playsInline
                    preload="none"
                    className="mt-3 aspect-video w-full rounded-xl bg-black"
                  />
                ) : (
                  <p className="mt-2 text-xs text-slate-400">
                    {shot.taskId
                      ? 'Tarea Runway registrada. Esperando MP4.'
                      : 'Todavia no se ha enviado esta toma.'}
                  </p>
                )}
              </article>
            ))}
          </div>

          <button
            type="button"
            className="button-secondary mt-4"
            disabled={busy}
            onClick={() => void execute(refresh)}
          >
            Actualizar estado y videos
          </button>
        </>
      )}
    </section>
  );
}