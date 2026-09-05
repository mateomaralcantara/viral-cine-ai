# ViralCine 3.3: seguridad offline y control de gasto

## Invariantes

- `PRODUCTION_MODE=demo` nunca puede llamar a OpenAI, Gemini, Veo ni Fal.ai.
- El modo real necesita simultáneamente `ALLOW_EXTERNAL_API_CALLS=true` y `ALLOW_PAID_GENERATION=true`.
- Los valores vacíos, de ejemplo y `DISABLED_OFFLINE` nunca cuentan como credenciales.
- El cambio automático entre proveedores pagados está desactivado.
- Una nota baja nunca autoriza por sí sola otra generación.
- Un proyecto que contiene generaciones pagadas no se sobrescribe en modo demo.
- Cada video recibido se valida y se guarda como checkpoint antes de auditar su calidad.
- Un error de saldo produce `paused-billing`; un bloqueo local produce `paused-safety`.
- El worker registra mensajes saneados y continúa atendiendo el panel.

## Orden de una toma real

1. Validar el plan y el presupuesto completo.
2. Reutilizar voz e imagen existentes cuando sea posible.
3. Seleccionar un único proveedor de video.
4. Registrar la reserva inmediatamente antes de enviar la solicitud.
5. Guardar el resultado bruto y su estado.
6. Normalizar y validar el MP4 localmente.
7. Crear el checkpoint de la toma.
8. Auditar calidad.
9. Pausar ante un rechazo; no regenerar automáticamente.

## Verificación sin créditos

```powershell
npm run check:env
npm run typecheck
npm test
npm run smoke
npm run build
```

La prueba `smoke` crea video local con FFmpeg dentro de `.data-smoke`; no usa proveedores externos.

## Activación real deliberada

La producción real permanece bloqueada hasta que el operador cambie conscientemente los dos interruptores de autorización y configure un límite de película. Se recomienda comenzar con un proyecto piloto nuevo, mantener `SHOT_MAX_TOTAL_GENERATIONS=1` y conservar `AUTO_REGENERATE=false`.

Nunca se debe restaurar un respaldo antiguo de `.env.local` completo sobre esta configuración: se copian solamente las claves necesarias y se mantienen los interruptores en `false` hasta el momento de una prueba autorizada.
