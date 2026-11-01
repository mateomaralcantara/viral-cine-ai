# ViralCine — repositorio único (auditoría 2026-11-01)

Repositorio canónico: `mateomaralcantara/viral-cine-ai`. Rama objetivo: `main`.
Esta consolidación parte de `feat/v8-e02-correction-workflow-20261030` (`827b9eb`), que incluye íntegramente la historia de `main` y **42 ramas históricas adicionales**. No duplicar esas ramas ni reescribir su historial.

## Estado confirmado
- Película: **Dos toques de bocina**, 10 escenas / 600 s.
- E02: 7 tomas / 55 s. E02-P01, P02 y P03 tienen MP4 locales; P04 tuvo una tarea Runway identificada, confirmada `FAILED` / `INTERNAL.BAD_OUTPUT.CODE01`, sin MP4; P05-P07 no iniciadas.
- Saldo de Runway **869 créditos** en la última consulta explícita; no afirmar que sigue igual sin consultarlo.
- La integración selectiva P04 **en la computadora del propietario** aprobó `361/361` tests y TypeScript, sin generar videos. NO equivale a pruebas completas de esta rama GitHub.
- PR de corrección previo: **#38**; sus checks remotos han fallado en GitHub, pendiente diagnóstico antes de promover a main.

## Tres ramas divergentes: conservar, no fusionar ciegamente
1. `feat/v7-supabase-architecture`: dos archivos de documentación/diagnóstico read-only incorporados aquí; números históricos no son estado actual.
2. `feat/v8-e02-runway-qa-gated-preflight`: 42 commits exclusivos, con Edge Functions, SQL y tareas de ejecución/cron; requiere revisión, pruebas e inventario de autorizaciones antes de adoptar flujos con gasto. Se mantiene intacta en GitHub.
3. `fix/offline-safety-4-0`: un commit antiguo exclusivo; revisar su delta contra mecanismos posteriores antes de mezclar.

## Código local antes de la consolidación
- `viral-cine-v7-cinema-core` (principal): cambios locales no confirmados en GitHub.
- `viral-cine-v7-integration`: datos/MP4/registros operacionales, **no repositorio de código ni apto para volcado público**.
- `viral-cine-v7-correction-review`: worktree de revisión.
- `viral-cine-v7-p04-integracion-20261031-220537`: worktree independiente con corrección selectiva comprobada.
- Respaldo del propietario: `C:\Users\martin\ViralCine-Backups\20261031-213510`. No borrarlo antes de reconciliar cambios.

## Política de promoción
1. Nunca subir `.env*`, credenciales, media privada, `.data*`, registros Runway, recibos de autorización ni tokens.
2. No habilitar `V7_RUNWAY_E02_ENABLED` por defecto ni ejecutar endpoints pagados durante fusiones/tests.
3. Usar rama de consolidación y PR contra `main`; **solo fusionar al verde de typecheck, tests, build y auditoría de diferencias**.
4. No sobrescribir la carpeta local principal con `git reset --hard` ni `git clean -fd`; conciliar cambios locales primero.
5. Ninguna ejecución pagada o nuevo retry de P04 forma parte de esta consolidación.
6. Para corregir nuevas tomas: actualizar `main`, crear una rama corta, probar en datos aislados, abrir PR y fusionar; mantener `main` como versión canónica.
