# Collection Quest

Plataforma web para coleccionistas: exhibe, vende o intercambia tus piezas, sube de nivel según su
rareza, agrega amigos y compite en el ranking.

**Stack:** HTML + CSS + JavaScript puro y Supabase (PostgreSQL, Auth, Storage). Sin build, sin Node.

## Qué incluye

- Registro con correo validado (sin correos temporales ni mal escritos), mensaje "Revisa tu correo" con botón para abrir la bandeja, reenvío y página de confirmación.
- Perfil con avatar, **banner**, "sobre ti" y contacto. Perfil público con su colección, nivel y amigos.
- Artículos con foto **obligatoria**, categoría (cómic, manga, carta, vinilo, figura, videojuego, arte, moneda, estampilla), valor y descripción. La rareza y los puntos los calcula la base de datos.
- Buscador que ignora acentos, mayúsculas, comas y puntos. Busca artículos y coleccionistas.
- Amigos, Coleccionistas (buscar perfiles) y Ranking por puntos.
- Ventas e intercambios con tres formas de pago: **efectivo**, **transferencia** (CLABE de 18 dígitos validada, titular, alias y banco) y **tarjeta** (enlace de pago seguro del vendedor: la tarjeta se escribe en Mercado Pago, PayPal o Stripe, nunca aquí). Al completar, el artículo cambia de dueño y se recalculan puntos y niveles.
- Intercambios justos: si las dos piezas valen lo mismo solo se confirma; si una vale más, quien dio la de menor valor paga la diferencia.
- **Subastas con pujas en tiempo real**: precio inicial, duración, puja mínima, cuenta regresiva y aviso cuando te superan. Si alguien puja en los últimos 2 minutos, se alarga 2 minutos. El ganador recibe una operación para pagar.
- Mensajes de advertencia para confirmar toda compra, venta, intercambio, subasta y puja.
- Buscador principal con sugerencias de **coleccionistas y artículos** mientras escribes.
- Color del aro del avatar editable, barras de desplazamiento con estilo y menú con desplazamiento.
- Verificación de perfil con identificación oficial, revisada por un administrador (las fotos se borran al revisar).

## Puesta en marcha

Lee **`ACTUALIZAR.md`**: tiene los pasos exactos (Supabase y GitHub Pages) en orden. La seguridad está explicada en **`docs/SEGURIDAD.md`**.

## Cómo se calcula la rareza y el nivel

| Rareza | Valor | Puntos |
|---|---|---|
| Común | menos de 500 | 10 |
| Rara | 500 a 2,499 | 25 |
| Épica | 2,500 a 9,999 | 60 |
| Mítica | 10,000 a 49,999 | 150 |
| Legendaria | 50,000 o más | 400 |

Nivel = `1 + floor(raíz(puntos / 25))`. Para cambiar los umbrales edita `rarity_for_value` y
`points_for_rarity` en `sql/schema.sql` y los mismos números en `assets/js/config.js`.

## Estructura

```
index.html  auth.html  confirmado.html  app.html
assets/
  css/style.css
  js/config.js     ← llaves de Supabase
  js/common.js     ← utilidades (iconos, imágenes, búsqueda, validación de correo)
  js/app.js        ← núcleo: rutas, artículos, perfil
  js/social.js     ← perfil público, amigos, coleccionistas, ranking
  js/orders.js     ← ventas, intercambios y datos de cobro
  js/verify.js     ← verificación de identidad y panel de admin
  js/auctions.js   ← subastas con pujas en tiempo real
  js/landing.js  js/auth.js  js/confirmado.js
  icons/<color>/   ← iconos SVG locales (sin emojis)
sql/schema.sql     ← tablas, triggers, seguridad y storage (se puede volver a correr)
sql/tests.sql      ← 151 pruebas automáticas
docs/              ← ERD y entregables por semana
```

## Seguridad incluida

- RLS en todas las tablas. Los usuarios no pueden tocar sus puntos, nivel, rol ni su marca de verificado.
- Las operaciones (compras e intercambios) solo se crean y cambian mediante funciones de la base, con reglas de quién puede hacer qué.
- Los datos de cobro solo los ve el comprador cuando el vendedor ya aceptó.
- Las identificaciones van a un bucket privado, solo las ven su dueño y los admins, y se borran al revisar. No se guarda ningún número de la identificación.
- Todo texto de usuarios se escapa antes de mostrarse, y solo se muestran imágenes del Storage de tu proyecto.

## Límites actuales

- **No se guardan ni se piden datos de tarjeta** (número, vencimiento, CVV), a propósito: guardarlos es ilegal para el CVV y peligroso para todos. Para cobrar con tarjeta *dentro* de la plataforma hace falta Stripe o Mercado Pago con un servidor (Supabase Edge Functions); queda como siguiente paso. Mientras tanto, el pago con tarjeta usa el enlace seguro del vendedor.
- Las pujas son un compromiso, pero no hay depósito en garantía: si el ganador no paga, la operación se cancela y el vendedor puede volver a subastar.
- El correo se valida por formato, dominio y confirmación. Ningún sistema puede saber si un buzón existe sin enviarle un mensaje: por eso la cuenta no se activa hasta confirmar.
- Los avisos de solicitudes y operaciones aparecen dentro de la app (globos en el menú), no por correo.

## Créditos

Iconos: [Lucide](https://lucide.dev) (licencia ISC), guardados localmente.
Tipografías: Pixelify Sans y Plus Jakarta Sans (Google Fonts, licencia OFL).
