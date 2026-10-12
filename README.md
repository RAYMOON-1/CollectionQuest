# Collection Quest

Plataforma web para coleccionistas: exhibe, vende o intercambia tus piezas. El sistema asigna la
rareza de cada artículo (común, rara, épica, mítica, legendaria) y sube de nivel a cada usuario.

**Stack:** HTML + CSS + JavaScript puro y Supabase (PostgreSQL, Auth, Storage). Sin build, sin Node.

## Puesta en marcha (10 minutos)

1. **Base de datos.** En Supabase abre *SQL Editor > New query*, pega todo `sql/schema.sql` y dale *Run*.
   Crea tablas, reglas de rareza/nivel, seguridad (RLS) y los buckets `avatars` e `items`.
2. **Registro sin correo de confirmación (solo para desarrollo).** En *Authentication > Providers > Email*
   desactiva *Confirm email*. Así el usuario entra y sube su avatar en el mismo registro.
   Si lo dejas activado también funciona: confirma el correo, inicia sesión y pon tu avatar en tu perfil.
3. **Conexión.** Abre `assets/js/config.js` y pega tu *Project URL* y tu *Publishable key*
   (en *Project Settings > API*). Nunca uses la secret key / service_role en el navegador.
4. **Ejecutar.** Sirve la carpeta con un servidor local (no abras los archivos con doble clic):
   - VS Code: extensión *Live Server* > clic derecho en `index.html` > *Open with Live Server*.
   - o en terminal: `python -m http.server 5500` y abre `http://localhost:5500`.

   La cámara del navegador solo funciona en `localhost` o en `https`.

## Páginas

| Archivo | Qué hace |
|---|---|
| `index.html` | Página inicial: explica la plataforma y lleva a iniciar sesión o crear cuenta. |
| `auth.html` | Iniciar sesión y crear cuenta (con avatar opcional). |
| `app.html` | App principal: menú desplegable, buscador, perfil, botón **+**, detalle de artículos. |

Menú desplegable: Todos los artículos, Venta, Intercambio, Exhibición, Mi colección y Registrar artículo.
Esquina superior derecha: nivel y avatar, con editar perfil (avatar, nombre, "sobre ti", contacto), Mi colección y cerrar sesión.

## Cómo se calcula la rareza y el nivel

La rareza depende del **valor** que declara el usuario. La calcula un trigger en la base de datos,
así nadie puede escoger su propia rareza desde el navegador.

| Rareza | Valor | Puntos |
|---|---|---|
| Común | menos de 500 | 10 |
| Rara | 500 a 2,499 | 25 |
| Épica | 2,500 a 9,999 | 60 |
| Mítica | 10,000 a 49,999 | 150 |
| Legendaria | 50,000 o más | 400 |

Nivel del usuario = `1 + floor(raíz(puntos / 25))`: 25 pts = nivel 2, 100 = nivel 3, 225 = nivel 4, 400 = nivel 5…
Los puntos son la suma de todas sus piezas y se recalculan solos al crear, editar o borrar.

Para cambiar los umbrales edita las funciones `rarity_for_value` y `points_for_rarity` en `sql/schema.sql`
y los mismos números en `assets/js/config.js` (este último solo sirve para la vista previa del formulario).

## Estructura

```
index.html  auth.html  app.html
assets/
  css/style.css
  js/config.js    ← aquí van tus llaves de Supabase
  js/common.js    ← utilidades (iconos, imágenes, mensajes)
  js/landing.js   js/auth.js   js/app.js
  icons/<color>/  ← iconos SVG locales (sin emojis)
sql/schema.sql
```

## Seguridad incluida

- RLS activado: todos ven la galería, pero cada quien solo crea, edita o borra lo suyo.
- Los usuarios no pueden modificar sus propios puntos ni nivel (permisos por columna).
- Cada usuario solo sube archivos a su carpeta del Storage; solo se aceptan JPG, PNG y WebP.
- Todo texto de usuarios se escapa antes de mostrarse, y solo se muestran imágenes del Storage de tu proyecto.
- Las fotos se reducen a 1280 px antes de subirse para cuidar el espacio del plan gratuito.

## Pendiente a futuro (según tu ERS)

- No hay pagos dentro de la plataforma: en venta e intercambio, el contacto del dueño aparece en la pieza.
- Rol de administrador, módulo de misiones/logros y estadísticas globales.
- Al publicar el sitio (Netlify, Vercel, GitHub Pages) agrega su URL en *Authentication > URL Configuration*.

## Créditos

Iconos: [Lucide](https://lucide.dev) (licencia ISC), descargados y guardados localmente.
Tipografías: Pixelify Sans y Plus Jakarta Sans (Google Fonts, licencia OFL).
