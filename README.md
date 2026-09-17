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
- Actualización automática firmada desde GitHub Releases, con respaldo obligatorio antes de instalar.
- Aplicación Tauri v2 preparada para generar instaladores `.msi` y `.exe` de Windows.
- Modo oscuro persistente desde Configuración.
- Sección `Ahorrado` con transferencia automática del saldo positivo al cerrar cada ciclo e historial por ciclo.
- Gastos recurrentes diarios, semanales y mensuales. Los mensuales usan un día de facturación del 1 al 31 y se ajustan automáticamente al último día disponible en meses más cortos.
- Los gastos únicos solo pueden registrarse dentro del ciclo presupuestario actual. Si hay más de tres recurrentes, la barra lateral ofrece una vista completa para administrarlos.

Los datos permanecen en el navegador y no se envían a ningún servidor.

## Distribución y actualizaciones

La versión instalada consulta el manifiesto firmado `latest.json` en GitHub Releases. Al detectar una versión distinta, solicita exportar el respaldo Excel y luego descarga, verifica e instala automáticamente el nuevo instalador. Finalmente, Saldo se reinicia.

Para publicar una actualización, crea un Release de GitHub con un tag `vX.Y.Z` y adjunta los artefactos firmados generados por el workflow. La clave privada de firma debe existir únicamente como secreto `TAURI_SIGNING_PRIVATE_KEY` del repositorio; nunca debe incluirse en Git. La versión HTML abierta directamente no puede usar este actualizador nativo.

## Generar el instalador Tauri

Requisitos: Node.js 20+, Rust estable y las herramientas de compilación de Windows.

```powershell
npm install
npm run tauri:build
```

Los instaladores se generan en:

- `src-tauri/target/release/bundle/msi/`
- `src-tauri/target/release/bundle/nsis/`

También existe un workflow de GitHub Actions (`Build Windows installer`) que genera ambos artefactos al ejecutar manualmente el workflow o al publicar un tag con formato `v1.0.0`.

Para abrir la aplicación compilada sin una ventana de consola, usa el acceso directo creado por el instalador o ejecuta `Iniciar Saldo.vbs`. El archivo `.bat` se conserva únicamente como lanzador de compatibilidad del prototipo web.