# Gridiron Lab — NFL Analytics

Sitio estático para GitHub Pages. La actualización de estadísticas se ejecuta con GitHub Actions y utiliza los archivos de schedules y play-by-play de nflverse.

## Estadísticas y definiciones

- **Yardas totales ofensivas:** yardas netas de pase (yardas de pase menos yardas perdidas en capturas) + yardas terrestres. Las yardas recibidas se calculan aparte y nunca se suman otra vez al total.
- **Primeros downs totales:** suma de primeros downs por carrera, pase y penalización. La defensiva muestra las mismas categorías concedidas.
- **Conversión de downs:** conversiones / intentos para 3rd y 4th down.
- **Regular y playoffs:** se calculan por separado (`REG` y `POST`) para evitar mezclar estadísticas entre tipos de temporada.
- **Equipos por temporada:** se construyen a partir de los calendarios de esa temporada; no se crean equipos históricos ficticios ni duplicados por alias.
- **Ordenamiento:** pulsa un encabezado para alternar orden ascendente/descendente.

## Actualizar datos

1. Sube los archivos del repositorio conservando las rutas.
2. En GitHub abre **Actions → Update NFL data → Run workflow** para ejecutar una actualización manual.
3. Comprueba que el workflow termine en verde. El workflow de Pages vuelve a publicar el sitio cuando la actualización concluye correctamente.

El workflow también se ejecuta automáticamente durante la temporada. La generación puede tardar porque descarga datos play-by-play de cada temporada desde 1999.

## Pruebas locales

```bash
python -m py_compile scripts/update_nfl_data.py tests/test_stats.py
python tests/test_stats.py
node --check app.js
```

La prueba incluida usa datos sintéticos y valida las fórmulas principales sin requerir conexión a internet.
