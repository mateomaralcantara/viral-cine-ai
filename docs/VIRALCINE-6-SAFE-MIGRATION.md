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

Proveedor propuesto: Runway Dev con Grok Imagine Video 1.5 Lite a 720p para pruebas.

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
