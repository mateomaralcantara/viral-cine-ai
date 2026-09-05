# Actualización 2.0.1

Esta versión corrige la producción en modo demo con las distribuciones de
FFmpeg para Windows que no incluyen un decodificador SVG.

Las referencias de personajes y las imágenes de las escenas demo ahora se
generan directamente como PNG, sin dependencias adicionales.

## Actualizar conservando proyectos

1. Detén ViralCine con `Ctrl+C`.
2. Copia el contenido de esta versión sobre la carpeta de la versión anterior.
3. Acepta **Reemplazar los archivos**. La carpeta `.data` existente no se borra.
4. Ejecuta nuevamente:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-dev.ps1
```

5. Abre el proyecto fallido y pulsa **Producir película** otra vez.

