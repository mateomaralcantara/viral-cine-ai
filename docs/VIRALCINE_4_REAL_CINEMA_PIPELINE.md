# ViralCine 4.0 — Real Cinema Pipeline

## Objetivo

ViralCine 4.0 cambia el corazón del sistema: deja de tratar una película como una colección de imágenes animadas con voz y pasa a un pipeline de **audio primero + video generativo real + lip-sync + continuidad + montaje**.

Las imágenes de personajes se mantienen únicamente como referencias de identidad. Nunca deben ser el producto final de producción real.

## Principios no negociables

1. Cada personaje tiene una identidad visual estable y una identidad vocal persistente.
2. Todo diálogo tiene `speakerId`; nunca se asigna la voz simplemente al primer personaje visible.
3. La voz se genera antes del video final y se guarda como checkpoint reutilizable.
4. El video base se genera con movimiento real en todos sus fotogramas.
5. Si existe diálogo visible, se aplica lip-sync después de generar el video base.
6. El audio final sustituye cualquier voz nativa inventada por el generador de video.
7. Cada operación pagada se registra en un libro mayor antes y después de enviarse al proveedor.
8. Una operación con estado incierto nunca se reintenta automáticamente.
9. Los segmentos técnicos de 4–8 segundos son invisibles para el usuario; la interfaz trabaja con escenas.
10. La producción completa permanece bloqueada hasta que el piloto de una escena sea aprobado manualmente.

---

# Flujo completo

## 0. Migración segura 3.3 -> 4.0

Antes de tocar un proyecto existente:

- crear respaldo de `project.json` y checkpoints;
- no mover ni sobrescribir videos, imágenes, audios o exports existentes;
- conservar todos los `videoAsset` ya pagados;
- convertir `spokenText` antiguo a una línea de diálogo compatible;
- cuando una toma antigua tenga un solo personaje, usar ese personaje como `speakerId`;
- cuando una toma antigua tenga varios personajes y no pueda saberse quién habla, marcarla para revisión manual en vez de adivinar;
- no regenerar automáticamente material existente durante la migración.

Los nuevos campos son compatibles con proyectos 3.3:

```ts
character.voiceProvider
character.voiceId
character.voiceModel
shot.speakerId
shot.dialogueLines
shot.alignmentAsset
shot.baseVideoAsset
shot.lipSyncAsset
shot.pipelineVersion
scene.dialogueTurns
```

---

## 1. Guion estructurado

El guion ya no entrega solamente un bloque de `dialogue`.

Cada escena debe contener turnos explícitos:

```json
{
  "dialogueTurns": [
    {
      "speakerId": "jesus-id",
      "text": "Padre, perdónalos...",
      "emotion": "agotado pero sereno"
    },
    {
      "speakerId": "maria-id",
      "text": "Hijo mío...",
      "emotion": "dolor contenido"
    }
  ]
}
```

Regla: un turno = un hablante.

---

## 2. Casting visual

Cada personaje conserva:

```json
{
  "id": "jesus-id",
  "name": "Jesús",
  "appearance": "...",
  "wardrobe": "...",
  "referenceAsset": "images/character-jesus-id.png"
}
```

Las referencias visuales se usan únicamente para consistencia del generador.

Nunca deben convertirse en una imagen con zoom para sustituir video real en `PRODUCTION_MODE=real`.

---

## 3. Casting vocal persistente

Cada personaje guarda su proveedor y `voiceId`:

```json
{
  "voiceProvider": "elevenlabs",
  "voiceId": "VOICE_ID_PERSISTENTE",
  "voiceModel": "eleven_multilingual_v2",
  "voiceStability": 0.5,
  "voiceSimilarity": 0.8,
  "voiceStyle": 0.25,
  "voiceSpeed": 1.0
}
```

El mismo personaje debe usar el mismo `voiceId` durante toda la película y en futuras regeneraciones del mismo proyecto.

No se debe clonar una voz de una persona real sin autorización.

---

## 4. Planificador de segmentos cinematográficos

La escena sigue siendo la unidad narrativa visible para el usuario.

Internamente se divide en segmentos técnicos de 4–8 segundos para respetar los límites de los generadores actuales.

Reglas:

- un hablante principal visible por segmento de diálogo;
- máximo dos personajes principales visibles cuando existe diálogo;
- el hablante debe ocupar una posición facial legible;
- no alternar plano general, medio y primer plano dentro del mismo segmento;
- no pedir montaje interno al generador;
- los cambios de cámara ocurren entre segmentos y luego FFmpeg los une.

---

## 5. Audio primero

Para cada segmento:

1. resolver `speakerId`;
2. resolver `voiceId`;
3. generar TTS;
4. guardar MP3;
5. guardar alineación temporal;
6. registrar costo;
7. crear checkpoint antes de generar video.

Ejemplo de archivos:

```text
audio/
  scene-001-shot-01.mp3
  scene-001-shot-01.alignment.json
```

La alineación permite conocer inicio y fin de caracteres/palabras y mejora auditoría, subtítulos y lip-sync.

---

## 6. Video base real

El generador de video recibe:

- prompt visual del segmento;
- cámara;
- referencias de identidad;
- continuidad de vestuario;
- estado emocional;
- duración exacta;
- opcionalmente primer/último fotograma cuando el proveedor lo soporte.

El resultado se guarda primero como:

```text
video/scene-001-shot-01-base.mp4
```

Este archivo se conserva aunque falle el lip-sync.

En producción real queda prohibido reemplazar un fallo de video por `renderAnimatedImage`.

---

## 7. Lip-sync posterior

Si el segmento contiene diálogo:

```text
video base + audio oficial -> lip-sync provider -> video sincronizado
```

Salida:

```text
video/scene-001-shot-01-lipsync.mp4
```

Después FFmpeg normaliza:

- resolución;
- framerate;
- duración;
- codec;
- audio oficial.

Si el segmento no contiene diálogo, no se paga lip-sync.

---

## 8. Ambiente, efectos y música

El audio se separa conceptualmente en cuatro capas:

1. voces;
2. ambiente;
3. efectos;
4. música.

La voz nunca se mezcla dentro de la música generada.

La música se genera una vez por proyecto o por bloques largos y se reutiliza.

FFmpeg hace la mezcla final localmente.

---

## 9. Continuidad entre segmentos

Para ocultar las uniones:

- conservar vestuario, luz, localización y props;
- reutilizar referencias oficiales;
- conservar eje de mirada;
- usar último fotograma como referencia del segmento siguiente cuando el proveedor lo soporte;
- aplicar transiciones únicamente en montaje local;
- igualar audio y color en postproducción.

---

## 10. Auditoría automática

Cada segmento debe comprobar:

- movimiento real;
- ausencia de congelamiento;
- rostro correcto;
- identidad del personaje;
- vestuario;
- labios sincronizados;
- audio audible;
- duración;
- ausencia de texto/logos inesperados;
- continuidad con el segmento anterior.

Una nota baja no debe disparar una regeneración pagada automáticamente.

El material se pausa para revisión cuando el problema sea crítico.

---

# Libro mayor de gastos

Archivo append-only:

```text
checkpoints/spend-ledger.jsonl
```

Operaciones soportadas:

```text
script
image
voice
video
lip-sync
music
audit
```

Cada registro contiene:

```json
{
  "operation": "lip-sync",
  "provider": "fal",
  "model": "fal-ai/sync-lipsync/v3",
  "state": "submitted",
  "estimatedUsd": 0.112,
  "sceneId": "...",
  "shotId": "...",
  "idempotencyKey": "lip-sync:shot-id:8"
}
```

Estados:

```text
reserved
submitted
succeeded
failed-no-charge
failed-unknown
reconciled
```

`failed-unknown` bloquea reintento automático.

---

# Modo piloto obligatorio

Configuración recomendada:

```text
PILOT_MODE=true
PILOT_MAX_SCENES=1
PILOT_MAX_SHOTS=4
PILOT_MAX_SPEND_USD=1.00
```

El piloto debe:

- producir únicamente una escena;
- limitarse a 3–4 segmentos;
- no ampliar presupuesto;
- requerir aprobación manual para desbloquear producción completa;
- conservar todos sus archivos para que la película final pueda reutilizarlos.

---

# Proveedores simulados

El modo offline debe poder reproducir fallos sin costo:

```text
success
429
network-timeout
accepted-then-timeout
missing-file
corrupt-file
crash-after-save
worker-restart
```

Objetivo: probar reconciliación, idempotencia y recuperación antes de autorizar proveedores reales.

---

# Proveedores 4.0

Configuración inicial:

```text
Guion / dirección         OpenAI
Voces persistentes        ElevenLabs
Video principal           Veo / Google y proveedor alternativo configurable
Lip-sync                  Fal (Sync Lipsync / modelo configurable)
Música                    proveedor configurable
Montaje                   FFmpeg local
Auditoría                  OpenAI + validaciones FFmpeg/ffprobe
```

Los nombres concretos de modelos permanecen en variables de entorno para evitar acoplar el código a una versión comercial.

---

# Variables nuevas

```dotenv
REAL_CINEMA_PIPELINE=true
REAL_CINEMA_NATIVE_AUDIO=false

ELEVENLABS_API_KEY=
ELEVENLABS_TTS_MODEL=eleven_multilingual_v2
ELEVENLABS_NARRATOR_VOICE_ID=
ELEVENLABS_STABILITY=0.50
ELEVENLABS_SIMILARITY_BOOST=0.80
ELEVENLABS_STYLE=0.25
ELEVENLABS_SPEED=1.00

ENABLE_LIPSYNC=true
FAL_LIPSYNC_MODEL=fal-ai/sync-lipsync/v3
FAL_LIPSYNC_SYNC_MODE=cut_off

COST_SCRIPT_CALL=0.08
COST_LIPSYNC_SECOND=0.014
COST_MUSIC_SECOND=0.003

PILOT_MODE=true
PILOT_MAX_SCENES=1
PILOT_MAX_SHOTS=4
PILOT_MAX_SPEND_USD=1.00

FAKE_PROVIDER_SCENARIO=success
FAKE_PROVIDER_STAGE=
```

---

# Estrategia de entrega

La actualización se distribuye como una rama Git aislada:

```text
feat/viralcine-4-real-cinema
```

No se recomienda instalarla como un ZIP sobre la carpeta existente porque eso:

- dificulta saber qué archivo cambió;
- puede sobrescribir archivos locales;
- complica rollback;
- mezcla código nuevo con código viejo.

La forma segura es:

1. guardar cambios locales;
2. hacer backup de metadatos del proyecto;
3. traer la rama;
4. ejecutar instalación/verificación offline;
5. ejecutar tests y typecheck;
6. abrir el panel en modo offline;
7. migrar un proyecto real sin regenerar assets;
8. ejecutar proveedores falsos;
9. aprobar piloto offline;
10. habilitar APIs externas;
11. ejecutar un único piloto real;
12. solo después autorizar producción completa.

---

# Criterio de aceptación 4.0

ViralCine 4.0 no se considera listo hasta cumplir simultáneamente:

- proyecto 3.3 abre sin perder assets;
- ninguna fotografía animada aparece en producción real;
- cada parlamento tiene un hablante inequívoco;
- cada personaje reutiliza su propia voz;
- existe checkpoint de voz antes de video;
- existe checkpoint de video base antes de lip-sync;
- lip-sync solo se cobra cuando hay diálogo;
- reinicio del worker no duplica una operación pagada;
- timeout posterior a aceptación queda en `failed-unknown` o se reconcilia;
- libro mayor incluye guion, imágenes, voz, video, lip-sync, música y auditoría;
- piloto bloquea producción completa;
- `npm run typecheck` pasa;
- `npm test` pasa;
- pruebas offline pasan en Windows;
- piloto real de una escena pasa calidad y presupuesto.
