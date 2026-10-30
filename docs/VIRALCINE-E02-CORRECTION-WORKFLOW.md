# ViralCine V7 — flujo de correcciones por toma

## Alcance de esta entrega

Implementación inicial en **Escena 02, Dos toques de bocina**, para E02-P01 a E02-P07. No altera videos aprobados ni inicia automáticamente una generación.

1. Desde el panel **Centro de correcciones**, elegir una toma.
2. Editar el prompt y pulsar **Guardar versión · gratis**. Cada versión se escribe de forma inmutable en el directorio local de la película.
3. **Simular cámara · gratis** usa FFmpeg sobre la fotografía aprobada en Supabase (6 s). **No simula movimiento de personas ni valida el resultado de un modelo de IA**.
4. **Diagnosticar Runway · gratis** consulta un task existente por GET y muestra su estado y failureCode.
5. Para corregir una generación: confirmar una versión, marcar la casilla de costo US$0.50, escribir `AUTORIZO E02-P04` (o el ID seleccionado) y pulsar **Autorizar y generar solo ...**. Sin casilla y texto exacto, no se envía la generación.
6. El backend verifica la referencia por SHA-256, el saldo del proveedor y el costo y prompt exactos. Ante un registro anterior, consulta el mismo task para exigir estado `FAILED` sin salida antes de archivarlo. Una tarea `RUNNING`, `SUCCEEDED` o desconocida **nunca** se reenvía.
7. Cada versión tiene un recibo de autorización creado exclusivamente (`wx`) antes de contactar el endpoint de generación. Si ocurre un corte después, queda bloqueado cualquier segundo envío de esa versión; el director deberá reconciliar el estado. El original se archiva en `corrections/attempts`, sin borrar evidencias. Se cuentan los archivos históricos en el presupuesto bruto.
8. **Recuperar misma tarea** solo consulta la tarea existente y recupera su MP4. **No** ejecuta un nuevo POST de generación.

## Directorios

`VIRALCINE_DATA_DIR/v7/films/film-dos-toques-de-bocina-v7/e02-p04/corrections/`
- `revisions/v...json`: prompts inmutables, hash de prompt y hash SHA-256 de la fotografía.
- `revisions/latest.json`: puntero atómico a última versión.
- `previews/v...mp4`: vista previa local gratuita.
- `attempts/v....authorization.json`: recibo de autorización, una vez por revisión.
- `attempts/v....previous-operation.json`: registro original cuando Runway confirmó FAILED sin salida.

El MP4 principal y el registro activo siguen las rutas de siempre; la compatibilidad con las tomas anteriores se conserva.

## Instalación local segura

Este PR tiene como base `feat/v8-e02-direct-cloud-bootstrap`. **No sobrescribas una carpeta con cambios sin guardar.**

```powershell
cd "C:\Users\martin\Desktop\VSC\BestS\viral-cine-v7-cinema-core"
git status --short
git fetch origin feat/v8-e02-correction-workflow-20261030
# Si git status muestra cambios locales, guárdalos primero en una rama o commit propio.
git switch --track -c feat/v8-e02-correction-workflow-20261030 origin/feat/v8-e02-correction-workflow-20261030
$env:VIRALCINE_DATA_DIR="C:\Users\martin\Desktop\VSC\BestS\viral-cine-v7-integration\.data"
$env:V7_STUDIO_LOCAL_PORT="3010"
npm run typecheck
npm test
npm run dev -- -p 3010 -H 127.0.0.1
```

El servidor debe funcionar en modo desarrollo. La API de Runway de la aplicación solo puede generar si se configuró deliberadamente `RUNWAYML_API_SECRET` y `V7_RUNWAY_E02_ENABLED=true`; **no actives esto durante pruebas gratuitas**.

## Validaciones obligatorias antes de fusionar/desplegar

- `npm run typecheck` y `npm test` correctos.
- Todas las 7 imágenes de la Escena 02 aprobadas y sus hashes accesibles.
- Crear dos revisiones sin perder la anterior y reproducir previsualización de 6 s sin llamar a proveedores.
- Diagnosticar el task original de P04 y comprobar el error `INTERNAL.BAD_OUTPUT.CODE01` antes de un intento nuevo.
- Confirmar que sin consentimiento explícito la acción pagada está bloqueada y que la misma versión no se puede ejecutar dos veces.
- Verificar que P01-P03 siguen en `review-required` y conservan sus MP4, que P05-P07 no se generan y que el balance de Runway no cambia durante las pruebas gratuitas.

## Limitaciones conscientes

- El motor de correcciones solo está integrado en **Escena 02**, no en todas las escenas del largometraje.
- Cambiar caras o sustituir actores dentro de un MP4 ya generado **todavía requiere una herramienta específica y QA**; esta entrega no hace face replacement.
- La simulación local mueve la cámara sobre una imagen fija, no produce una escena nueva con personas animadas.
- Las voces, diálogos y el montaje final siguen como flujos independientes existentes; no se modifican en esta entrega.
- Un rechazo interno de Runway no garantiza un reembolso automático. La contabilidad es bruta y conservadora; el saldo real debe contrastarse con el proveedor.
