# ViralCine 3.0.3 — recuperación ante saldo Google y validación Fal.ai

Esta versión corrige el escenario en el que Google responde HTTP 429 por créditos prepagados agotados y Fal.ai responde HTTP 422.

## Cambios

- Vidu Q3 recibe prompts de hasta 2,000 caracteres, conservando las restricciones finales de continuidad.
- La duración enviada a Fal.ai siempre es un entero válido de 1 a 16 segundos.
- Los errores de validación de Fal.ai muestran la ubicación y el mensaje del campo rechazado.
- En `VIDEO_PROVIDER=auto`, un 429 por saldo de Google abre un circuito de 15 minutos: se omiten Gemini Omni y Veo y se continúa con Fal.ai.
- Reiniciar ViralCine restablece el circuito; recargar Google permite volver a usar sus proveedores.

## Configuración recomendada

Para producir solo con Fal.ai mientras Google no tenga créditos:

```env
VIDEO_PROVIDER=fal
```

Después de comprar créditos en Google AI Studio, puede volver a:

```env
VIDEO_PROVIDER=auto
```

Los errores HTTP 429 y 422 no deben resolverse pulsando reintentar repetidamente: primero se corrige el saldo o el dato rechazado.
