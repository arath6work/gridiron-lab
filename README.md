# Gridiron Lab — NFL Analytics

Primera versión visual de una web de estadísticas NFL para GitHub Pages.

## Importante
La interfaz usa cifras **ilustrativas** para probar tablas, filtros, navegación y gráficas. No son resultados ni estadísticas oficiales. La siguiente etapa es conectar una fuente de datos y reemplazar estos datos de demostración.

## Estructura
- `index.html`: estructura y secciones de la web.
- `styles.css`: diseño responsive estilo broadcast deportivo.
- `app.js`: navegación, tablas, filtros y cálculos de demostración.
- `data/`: aquí guardaremos los datos normalizados que consumirá la página.
- `.github/workflows/`: automatización de actualización/publicación.

## Publicar en GitHub Pages
1. Crea un repositorio público llamado `gridiron-lab` (o el nombre que prefieras).
2. Sube el contenido de esta carpeta a la raíz del repositorio.
3. En GitHub, entra a **Settings → Pages**.
4. En **Build and deployment**, selecciona **Deploy from a branch**, rama `main`, carpeta `/ (root)`, y guarda.
5. Espera a que GitHub publique el sitio.

## Hojas de la hoja de cálculo que estamos reutilizando
- `Partidos`: fuente primaria, una fila por partido.
- `Ofensiva`: GP, yardas totales, yardas por partido, pase, carrera, puntos y puntos por partido.
- `Defensiva`: yardas y puntos permitidos, tanto totales como por partido.
- `Tabla`: récord, porcentaje de victorias, puntos a favor/en contra y diferencial.
- `Playoff Picture`: clasificación proyectada por conferencia.

## Siguiente paso
Conectar una fuente de datos verificable (por ejemplo, datasets de nflverse) a un archivo normalizado `data/nfl.json` y crear un workflow programado de GitHub Actions para actualizarlo. No se debe confundir la maqueta actual con datos reales.
