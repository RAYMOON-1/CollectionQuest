# Entregables de las semanas 1 a 6

| Semana | Actividad | Entregable del cronograma | Dónde está | Cómo comprobarlo |
|---|---|---|---|---|
| 1 (23 al 29 sep) | Modelado relacional en PostgreSQL | Diagrama ERD y tablas activas en Supabase | `docs/erd.png`, `docs/ERD.md`, `sql/schema.sql` | Corre `schema.sql` y revisa *Database > Tables*: `profiles` e `items`. |
| 2 (30 sep al 6 oct) | Triggers y funciones SQL (rareza) | Scripts SQL de cálculo automático probados | `sql/schema.sql` (sección 3) y `sql/tests.sql` | Corre `tests.sql`: debe decir "TODAS LAS PRUEBAS PASARON (151 de 151)". |
| 3 (7 al 13 oct) | Autenticación y seguridad RLS | Módulo Auth con reglas de seguridad por rol | `auth.html`, `assets/js/auth.js`, `sql/schema.sql` (secciones 4, 5 y 5b) | Roles `usuario` y `admin`. Las pruebas T37 a T48 verifican qué puede y qué no puede cada rol. |
| 4 (14 al 20 oct) | Supabase Storage (imágenes HD) | Buckets configurados y vinculados a ítems | `sql/schema.sql` (sección 6), `assets/js/common.js` | Buckets `avatars` e `items`. La foto de cada artículo se guarda en `items.image_url`. |
| 5 (21 al 27 oct) | Frontend base (HTML5 / CSS3 / JS) | Prototipo web responsivo maquetado | `index.html`, `auth.html`, `app.html`, `assets/css/style.css` | Ábrelo en el celular y en la compu: se adapta a ambos. |
| 6 (28 oct al 3 nov) | Integración frontend + Supabase SDK | Conexión en vivo para CRUD y autenticación | `assets/js/app.js`, `auth.js`, `landing.js` | Registra un usuario, agrega, edita y borra un artículo, y mira cómo cambian tu rareza, puntos y nivel. |

## Adelantos fuera del cronograma (ya incluidos)

| Función | Dónde |
|---|---|
| Perfiles públicos con banner y colección | `assets/js/social.js` |
| Amigos y solicitudes | `social.js`, tabla `friendships` |
| Coleccionistas (buscar perfiles) y ranking por puntos | `social.js` |
| Categorías de producto, foto obligatoria, búsqueda sin acentos | `app.js`, `sql/schema.sql` |
| Ventas e intercambios con método de pago | `assets/js/orders.js`, tablas `orders` y `payment_profiles` |
| Verificación de perfil con identificación oficial | `assets/js/verify.js`, tabla `verifications` |
| Correo válido, mensaje "Revisa tu correo" y página de confirmación | `auth.html`, `confirmado.html` |
| Forma de pago: efectivo, transferencia (CLABE, titular, alias, banco) y tarjeta (enlace seguro) | `orders.js`, tabla `payment_profiles` |
| Intercambios con diferencia de valor y mensajes de advertencia para confirmar | `orders.js`, función `create_order` |
| Subastas con pujas en tiempo real | `auctions.js`, tablas `auctions` y `bids` |
| Color del aro del avatar, barras de desplazamiento y buscador con sugerencias | `app.js`, `style.css` |
| Seguridad: CSP, URLs temporales, datos de pago protegidos | `docs/SEGURIDAD.md` |

## Lo que sigue (semanas 7 a 10)

- Semana 7: PWA (manifest y service workers).
- Semana 8: carga de inventario real y optimización.
- Semana 9: pruebas integrales y ajustes de QA.
- Semana 10: despliegue en producción con SSL y dominio.

## Cómo hacerte administrador

Regístrate normal y luego, una sola vez, en el SQL Editor:

```sql
update public.profiles set role = 'admin' where username = 'tu_usuario';
```

Un administrador ve el botón "Eliminar (admin)" en artículos de cualquier persona. Nadie puede
darse el rol a sí mismo desde la página: la base de datos no lo permite.
