# Saldo · Gestión de gastos personales

Prototipo funcional de una aplicación de escritorio/web para controlar el presupuesto mensual, organizar gastos y generar respaldos.

## Ejecutar con un clic

En Windows, no es necesario instalar nada:

1. Descarga o copia la carpeta completa del proyecto.
2. Abre la carpeta.
3. Haz doble clic en **`Iniciar Saldo.bat`**.

La aplicación se abrirá automáticamente en el navegador predeterminado. No cierres ni muevas `index.html`, `styles.css` o `app.js`: deben permanecer junto al lanzador.

Como alternativa, también se puede abrir `index.html` directamente con doble clic.

## Funcionalidades incluidas

- Configuración del ingreso mensual y día de corte del ciclo.
- Dashboard inicial con presupuesto restante, progreso, gráfico de torta y actividad reciente.
- Alta de gastos con descripción, importe, fecha, categoría y marca de gasto recurrente.
- Creación y eliminación segura de categorías personalizadas.
- Estadísticas por categoría, porcentajes, promedio y gastos recurrentes.
- Búsqueda y filtrado de gastos.
- Informe mensual preparado para imprimir o guardar como PDF desde el diálogo del navegador.
- Exportación de un respaldo compatible con Excel (`.xls`).
- Importación del mismo respaldo para restaurar ingresos, categorías y gastos.
- Persistencia automática en `localStorage`.
- Comprobación de nuevas versiones publicada en GitHub, con respaldo obligatorio antes de continuar.

Los datos permanecen en el navegador y no se envían a ningún servidor.

## Distribución y actualizaciones

La versión publicada se declara en `version.json` y la aplicación consulta ese archivo en la rama `main` de GitHub. Al detectar una versión distinta, solicita exportar el respaldo Excel antes de continuar. Si se cancela, el aviso se oculta para esa versión; la comprobación permanece disponible en **Configuración → Actualizaciones**.

Por las restricciones de seguridad del navegador, una aplicación HTML abierta como archivo local no puede reemplazar sus propios archivos automáticamente. Después de exportar el respaldo, el botón **Continuar** abre la ubicación de la nueva versión para que el usuario descargue y reemplace la carpeta. En una futura versión instalable (por ejemplo, un ejecutable de Windows), este mismo control puede conectarse a un actualizador automático.