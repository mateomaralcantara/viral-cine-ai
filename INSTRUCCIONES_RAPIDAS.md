# Instrucciones rápidas para ViralCine 3.0

## Iniciar

```powershell
cd "C:\Users\martin\Desktop\VSC\BestS\viral-cine-ai"
powershell -ExecutionPolicy Bypass -File .\run-dev.ps1
```

Abre `http://localhost:3000`. `run-dev.ps1` inicia el panel y el worker juntos.

## Producción real

En `.env.local`:

```env
PRODUCTION_MODE=real
OPENAI_API_KEY=tu_clave
VIDEO_PROVIDER=auto
GEMINI_API_KEY=tu_clave
FAL_KEY=tu_clave
SCENE_QUALITY_MODE=strict
SCENE_QUALITY_MIN_SCORE=9.0
SCENE_QUALITY_MAX_ATTEMPTS=3
COST_AI_VIDEO_SECOND=0.10
COST_AVATAR_SECOND=0.30
```

Solo necesitas una clave de video: Gemini o Fal.ai. Fal.ai es necesario para avatar con lip-sync y música. Nunca compartas `.env.local`.

## Verificar antes de gastar

```powershell
powershell -ExecutionPolicy Bypass -File .\verificar-primer-video.ps1 -ProbarAPIs -Completo
```

Después crea un proyecto nuevo. Revisa el presupuesto: ahora cuenta todos los segundos y hasta tres intentos por toma. En modo real las escenas serán video, no galerías de imágenes.
