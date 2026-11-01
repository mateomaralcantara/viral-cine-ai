# ViralCine V7 — Nivel 2: Planificación de hasta 90 minutos

## Estado

Esta rama amplía Cinema Core sin modificar el master original de V6. El corte de cuatro minutos de 15 DÍAS, si se generó en los datos de V7, aparece reproducible en la pestaña Película final. No sustituye los originales.

## Nueva pestaña

Abrir /v7/films/v7-film-01db01f78f6c0e5afee6?tab=feature

El planificador ofrece cinco escalas: 4, 10, 15, 30, 60 y 90 minutos. Divide el tiempo exactamente en tres actos, escenas y tomas, y presenta segundos de generación teóricos. Solo calcula costo de video cuando el servidor dispone de una tarifa explícita, no inventa precios. El plan es de CAPACIDAD: no contiene guion escrito, referencias aprobadas, metraje generado, autorizaciones ni colas de ejecución.

Seleccionar 90 minutos no extiende artificialmente 15 DÍAS. Para una nueva película larga hará falta una historia y un guion propios.

## Corte de 4 minutos

El endpoint cerrado de V7 lee únicamente el archivo 15-DIAS-LIBROSELLER-4MIN-CORTE-CERRADO.mp4 de directorios locales de exportación cierre-4min-*. Soporta HEAD/GET y rangos 206 para la reproducción; V6 sigue intacto. Si no existe el archivo, el panel lo informa y mantiene el master heredado por separado.

## Configuración

Usar VIRALCINE_DATA_DIR para apuntar a datos locales V7 y VIRALCINE_V6_DATA_DIR para recursos originales V6.

Mantener ALLOW_EXTERNAL_API_CALLS=false, ALLOW_PAID_GENERATION=false y V7_CINEMA_PAID_ENABLED=false. V7_VEO_USD_PER_SECOND es opcional y solo permite mostrar un costo teórico al aportar una tarifa verificada.

## Próxima integración, aún pendiente

Para generar películas largas automáticamente se necesitan un guion original aprobado, persistencia duradera de escenas y tareas, voces e identidades con derechos, autorizaciones y presupuesto reconciliado, un supervisor de calidad y render incremental con recuperación de fallos. Este planificador NO declara terminados esos componentes.

Validar con npm run typecheck, npm test y npm run build; CI sin llamadas a proveedores.

La rama nace de feat/v7-cinema-core-veo-safe. No combinar ni sobrescribir la rama local feat/v7-integrated sin inspeccionar los cambios del usuario. No usar git reset --hard.
