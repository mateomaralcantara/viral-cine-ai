# ViralCine 3.0.1 — eliminación segura de proyectos

## Funcionalidad

- Añade el botón **Eliminar** en la cabecera del proyecto seleccionado.
- Solicita confirmación antes de ejecutar la operación.
- Elimina inmediatamente el proyecto de la lista del estudio.
- Mueve el directorio completo a `.data/trash/projects` para permitir recuperación manual.
- Conserva guion, escenas, tomas, audios, videos, checkpoints e informes de calidad.
- Rechaza la eliminación cuando el proyecto está planificando, en cola, produciendo o componiendo.

## Recuperación

Los proyectos eliminados se guardan con este formato:

```text
.data/trash/projects/ID-FECHA/
```

Esta versión no vacía la papelera automáticamente.
