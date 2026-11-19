# Precio estimado en línea, categorías múltiples y rareza por unidades

## Qué hace
- Al registrar un artículo, cuando ya hay **nombre + categorías + foto**, la página busca el precio en internet (una sola vez por combinación; también hay un botón).
- Muestra un **precio estimado en pesos** (mediana de lo encontrado), el rango, de dónde salió y qué tanta confianza tiene.
- El valor del artículo **no puede pasar del estimado más $20**. Lo revisan la página y, sobre todo, la base de datos.
- Si no se encuentran precios confiables o el servicio falla, se puede poner el precio a mano: el artículo queda marcado **"sin verificar"**.
- Funciona con las 9 categorías (cómic, manga, carta, vinilo, figura, videojuego, arte, moneda, estampilla). En arte y estampillas los precios suelen ser menos precisos.
- Cada artículo puede tener de **1 a 3 categorías**.
- La **rareza ya no depende del valor, sino de cuántas unidades existen**:

| Unidades que existen | Rareza | Puntos |
|---|---|---|
| 1 a 10 | Legendaria | 400 |
| 11 a 100 | Mítica | 150 |
| 101 a 500 | Épica | 60 |
| 501 a 5,000 | Rara | 25 |
| Más de 5,000, producción normal o sin dato | Común | 10 |

  Los artículos que ya tenías **conservan su rareza**: la migración les asigna unidades que dan la misma rareza (5, 50, 300 o 1,000). Cada dueño puede corregirlas al editar.

## Cómo activarlo (en este orden)
1. **Base de datos**: corre `sql/schema.sql` completo en el SQL Editor de Supabase (se puede correr sobre lo que ya tienes).
2. **Llave de Gemini**: en <https://aistudio.google.com> crea una API key. Revisa en la página de precios de Google cuánto cuesta la "búsqueda de Google" dentro de Gemini y qué entra gratis.
3. **Función en Supabase**: en *Edge Functions > Deploy a new function* ponle el nombre `estimate-price` y pega el contenido de `supabase/functions/estimate-price/index.ts`. Deja **Verify JWT activado**.
   (Con la CLI: `supabase functions deploy estimate-price`.)
4. **Secretos** (*Edge Functions > Secrets*):
   - `GEMINI_API_KEY` (obligatorio): tu llave.
   - `GEMINI_MODEL` (opcional): nombre del modelo. Por defecto usa `gemini-3.5-flash`; **los nombres de modelos cambian y los viejos se retiran**, así que confirma el nombre vigente en AI Studio y cámbialo aquí si hace falta (no hay que redesplegar).
   - `ALLOWED_ORIGINS` (opcional): páginas autorizadas, separadas por coma. Por defecto: `https://raymoon-1.github.io` y `http://localhost:5500`.
5. **Probar**: registra un artículo con foto, nombre y categoría. Debe aparecer el recuadro con el precio estimado.
6. **Exigir la búsqueda** (hazlo solo cuando ya funcione, porque sin la función nadie podría publicar):
   ```sql
   update public.app_settings set value = 1 where key = 'require_estimate';
   ```

## Ajustes (se cambian con SQL)
```sql
update public.app_settings set value = 20 where key = 'price_max_over';        -- pesos sobre el estimado
update public.app_settings set value = 20 where key = 'estimate_daily_limit';  -- búsquedas por persona al día
update public.app_settings set value = 0  where key = 'require_estimate';      -- 1 = obligatoria
```

## Cómo se evita la trampa
- El valor máximo lo calcula la base de datos con una búsqueda guardada que **solo la función puede escribir**. Esa búsqueda debe ser de la misma persona, del mismo nombre, de una de las mismas categorías y de los últimos 7 días.
- La función solo acepta precios cuya fuente aparece entre las páginas que la búsqueda de Google realmente consultó, descarta valores raros y usa la mediana.
- Hay límite diario por persona y un caché de 24 horas para que no se gaste de más.
- Con `require_estimate = 1` ya no se puede publicar sin haber buscado el precio.

## Lo que debes saber (límites y cuidados)
- **No lo pude probar contra Gemini ni contra internet de verdad.** Probé la base de datos (205 pruebas), la lógica de la función con servicios simulados (23 pruebas) y la página con un Supabase simulado. El primer uso real puede pedir ajustes (sobre todo el nombre del modelo).
- Las estimaciones son **aproximadas** (inteligencia artificial + búsqueda): pueden equivocarse, sobre todo en arte, piezas raras o ediciones difíciles de distinguir. La página lo dice.
- **Google exige mostrar sus "Search Suggestions"** junto a un resultado con búsqueda de Google. Ya se muestran en un recuadro aislado. Revisa también las condiciones de la API de Gemini sobre guardar resultados de búsqueda: aquí se guarda el precio calculado y las fuentes, y conviene confirmar que tu uso está permitido.
- El tope de $20 es muy estricto para piezas caras. Si lo quieres más flexible, cámbialo en `price_max_over`.
- **Las unidades las declara quien publica** (igual que antes el valor): alguien podría decir "una de 1". La búsqueda sugiere un número cuando lo encuentra, pero no es una verificación. Si esto se vuelve un problema, se pueden pedir pruebas (foto del número de serie) o revisarlas.
- Si la búsqueda no está activada, la página muestra el aviso y deja poner el precio a mano.

## Problemas comunes
| Lo que ves | Qué significa |
|---|---|
| "La búsqueda de precios todavía no está activada" | La función no está desplegada con ese nombre. |
| "La búsqueda de precios todavía no está configurada" | Falta el secreto `GEMINI_API_KEY`. |
| "No se pudo consultar internet en este momento" | Falló Gemini: revisa los registros de la función (*Edge Functions > Logs*) y el nombre del modelo. |
| "Ya hiciste N búsquedas hoy" | Límite diario (ajustable). |
| "La búsqueda de precio venció" | Pasaron más de 7 días: buscar otra vez. |
