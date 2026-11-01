# ViralCine 6 Safe — migración de gasto controlado

## Objetivo

La versión Safe cambia la regla principal del sistema:

> ninguna llamada pagada ocurre sin un ticket de costo visible y una autorización explícita.

## Problema detectado en 5.x

El flujo actual combina varias operaciones pagadas: imagen, voz, video, lip-sync, auditoría de calidad y música. Aunque cada operación tenga un costo pequeño o razonable, el usuario puede terminar pagando varias capas antes de ver una escena completa.

Además, un proveedor puede fallar después de iniciar un proceso técnico y dejar un estado contable ambiguo. Por eso el proveedor no debe ser la única defensa: el motor debe controlar el gasto antes de cada llamada.

## Arquitectura propuesta

### Modo Preview

- Un solo proveedor de video.
- Sin fallback automático a otro proveedor.
- Sin auditoría OpenAI automática.
- Sin música generada durante pruebas.
- Sin lip-sync para narración.
- Reutiliza todos los assets ya aprobados.
- Genera una sola toma por autorización.
- Montaje local con FFmpeg.
- Revisión humana de la escena completa.

Proveedor propuesto para preview: Runway Dev con `gen4_turbo` a 720p.

Snapshot de precio del 2026-10-06: 5 créditos por segundo; Runway indica US$0.01 por crédito. Una toma de 8 segundos tiene un costo máximo local calculado de 40 créditos = US$0.40. El precio se muestra siempre antes de habilitar una llamada y debe sustituirse por un dry-run/estimatedCost del proveedor cuando esa capa quede integrada.

### Modo Final

Solo después de aprobar la puesta en escena:

- proveedor de mayor calidad elegido conscientemente;
- voz final;
- lip-sync solo cuando un personaje habla en cámara;
- música final una sola vez;
- exportación local.

## Regla de gasto

Antes de cada operación pagada se debe mostrar:

- proveedor;
- modelo;
- duración;
- precio unitario;
- costo máximo de esa llamada;
- costo acumulado del proyecto;
- asset que se reutilizará;
- asset que se creará.

La llamada solo puede ejecutarse con una confirmación explícita que incluya el importe.

## Sin reintentos automáticos

Un fallo de proveedor termina la operación.

El sistema conserva:

- task/request ID;
- estado del proveedor;
- asset de entrada;
- asset de salida si existe;
- importe reservado/estimado.

No se vuelve a llamar a la API hasta reconciliar el intento.

## Escena completa / reparación por toma

La unidad de revisión sigue siendo la escena completa.

La unidad de reparación es una sola toma.

Una toma aprobada nunca se vuelve a generar por una reparación de otra toma.

## Proveedor de migración

Runway Dev se propone porque dispone de:

- proyecto y API key independientes;
- créditos explícitos;
- precios por modelo publicados;
- gestión de tareas;
- consulta del estado de cada task;
- cancelación;
- SDK oficial Node.js;
- outputs con task ID recuperable.

La integración debe permanecer desactivada hasta que el Safe Cost Gate esté terminado y probado sin red.


## Snapshot de precios

- Fecha: 2026-10-06.
- Fuente oficial: https://docs.dev.runwayml.com/guides/pricing/
- Preview inicial: `gen4_turbo` = 5 créditos/segundo.
- Crédito: US$0.01.
- Tope local por llamada por defecto: US$0.50.

Los precios son datos externos y pueden cambiar. ViralCine 6 Safe no debe autorizar una generación usando silenciosamente un precio antiguo.
