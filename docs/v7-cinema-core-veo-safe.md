# ViralCine V7 Cinema Core — piloto 15 DÍAS

## Estado y objetivo

Esta rama conecta el panel V7 a un orquestador inicial de Google Veo. Instalarla no produce videos ni consume créditos. Todas las generaciones están bloqueadas por defecto.

El piloto lee el paquete local de siete tomas Libroseller, creado previamente en la carpeta .data/v7/films, y muestra referencias, presupuesto, operaciones y video candidato. No modifica los originales de V6. LS02 y LS05 se realizan con grabación REAL de Libroseller, no con generación de texto de interfaz.

## Configuración local en .env.local

Añadir estas claves con valores seguros y sin publicar sus valores reales:

    V7_CINEMA_PAID_ENABLED=false
    V7_CINEMA_ADMIN_TOKEN=REEMPLAZAR_CON_SECRETO_ALEATORIO_DE_32_CARACTERES
    V7_CINEMA_MAX_USD=0
    V7_VEO_USD_PER_SECOND=0

El valor cero bloquea las generaciones. Confirmar en la cuenta Gemini API la tarifa y saldo antes de establecer una tarifa positiva y un límite.

Para habilitar una prueba autorizada se necesitan las banderas adicionales del motor ya existente:

    PRODUCTION_MODE=real
    ALLOW_EXTERNAL_API_CALLS=true
    ALLOW_PAID_GENERATION=true
    GEMINI_API_KEY=SECRETO_EXISTENTE

Cuidado: estas tres banderas globales pueden permitir generación en OTRAS rutas preexistentes. Usarlas solo en un ambiente local privado y controlado. El endpoint nuevo exige token administrativo en Authorization Bearer, comprobación de origen, confirmación expresa de costo y hash de referencia.

## Operación

Abrir /v7/films/v7-film-01db01f78f6c0e5afee6?tab=production

Inspeccionar referencia. Si la imagen no contiene a los personajes correctos, NO autorizar. Seleccionar LS01, aprobar la referencia y costo estimado y, cuando corresponda, enviar UNA solicitud. La generación crea reserva persistente exclusiva (wx), guarda el identificador de Google y no hace reintentos automáticos. El botón Recuperar consulta la MISMA tarea mediante Google operations y descarga su MP4, pero nunca inicia otra generación. Cada video es candidato pendiente de QA humano; el montaje final sigue separado.

## Riesgos y límites

El costo mostrado es ESTIMADO, no un tope duro garantizado por Google.
El presupuesto mostrado incluye solo las operaciones Cinema Core registradas en este módulo. No incorpora automáticamente los cobros anteriores ni los de otros proveedores o de V6; conciliar con facturación real antes de gastar.
El bloqueo se realiza con archivos y una exclusión local: NO apto para servidores sin disco persistente, Vercel serverless o varias instancias. Antes de desplegar, migrar el registro de operaciones y la reserva de presupuesto a Supabase mediante transacciones e índice único. Si hay un corte o estado incierto, no borrar registros ni volver a generar: consultar la operación original o conciliar manualmente.
Los archivos de estado se guardan dentro de la carpeta V7 del film. No registrar claves en Git, prompts ni mensajes.

## Validación local sin gastos

    npm run typecheck
    npm test
    npm run build

El CI usa ALLOW_EXTERNAL_API_CALLS=false y ALLOW_PAID_GENERATION=false.

## Integración con el equipo local

La rama remota feat/v7-cinema-core-veo-safe nace de feat/viralcine-7-feature-film-os. El equipo del usuario ejecuta feat/v7-integrated con modificaciones locales no publicadas. No usar reset hard, no sobrescribir su V7 local ni V6: revisar la solicitud de cambios y aplicarlos mediante cherry-pick controlado o un nuevo worktree. Resolver conflictos de V7FilmWorkspace antes de integrar. Esta entrega es un piloto integrado de producción, no una plataforma completamente automática de QA y master.


## Media separada V6 / V7 (local)

Los datos de V7 pueden residir en el worktree de integración, mientras que los medios originales siguen en V6. El resolver de assets acepta una variable adicional que señala el árbol V6 solo para localizar y leer recursos:

    VIRALCINE_DATA_DIR=C:\Users\martin\Desktop\VSC\BestS\viral-cine-v7-integration\.data
    VIRALCINE_V6_DATA_DIR=C:\Users\martin\Desktop\VSC\BestS\viral-cine-ai\.data

Esto resuelve los 404 cuando el master o las tomas originales existen en V6 pero el servidor de V7 los busca bajo la raíz incorrecta. No copia ni reescribe archivos originales. Si persiste un 404, comprobar la ruta del asset en el registro: una ruta correcta no reconstruye un archivo ausente.

Después de cambiar variables de entorno, detener Next.js mediante Ctrl+C y reiniciar en la terminal actual. Mantener las banderas pagadas desactivadas.
