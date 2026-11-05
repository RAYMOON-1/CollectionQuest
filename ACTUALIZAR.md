# Cómo actualizar tu proyecto (en este orden)

## 1. Base de datos (Supabase)

1. (Opcional, recomendado) Activa la extensión **pg_cron** en *Database > Extensions* antes de correr el SQL: así las subastas se cierran solas cada minuto y se limpian las cuentas sin confirmar. Sin ella todo funciona igual.
2. Abre tu proyecto > **SQL Editor** > *New query*, pega **todo** `sql/schema.sql` y dale **Run**. Es seguro correrlo sobre lo que ya tienes: agrega lo nuevo sin borrar tus datos.
   - Quien ya tenía transferencia guardada queda con "efectivo y transferencia" aceptados.
   - El enlace de pago ya no se usa (las operaciones viejas que lo usaron se siguen viendo).
3. (Opcional) Pega `sql/tests.sql` y dale Run. Debe salir `TODAS LAS PRUEBAS PASARON (169 de 169)`. No deja datos de prueba.
4. Hazte administrador (una sola vez, cambia el nombre por tu usuario):
   ```sql
   update public.profiles set role = 'admin' where username = 'tu_usuario';
   ```
5. Tiempo real de las pujas: en *Database > Publications* abre `supabase_realtime` y revisa que estén `auctions` y `bids` (el script las agrega solo). Si no, la página consulta cada 3 segundos y también funciona.

## 2. Correos y acceso (Supabase > Authentication)

1. **Sign In / Providers > Email**: deja activado **Confirm email**.
2. **URL Configuration**:
   - Site URL: `https://raymoon-1.github.io/CollectionQuest/`
   - Redirect URLs: `https://raymoon-1.github.io/CollectionQuest/**` y `http://localhost:5500/**`.
3. **Emails > Templates > Confirm signup**: pega `docs/correo-confirmacion.html` y pon como asunto `Confirma tu cuenta de Collection Quest`.
4. El correo que trae Supabase por defecto **manda muy pocos mensajes por hora** (solo para pruebas). Configura un SMTP propio en *Authentication > SMTP Settings* (Resend, Brevo o Gmail con contraseña de aplicación).
5. **Google, Facebook y Apple**: sigue `docs/LOGIN-SOCIAL.md`. Mientras no esté listo uno, pon `false` en `AUTH_PROVIDERS` de `assets/js/config.js` para ocultar su botón.
6. Lee `docs/SEGURIDAD.md` (5 minutos).

## 3. Código (GitHub)

1. Descomprime este zip.
2. Copia **todo su contenido** dentro de tu repositorio `CollectionQuest`, reemplazando archivos (van en la raíz, junto a `index.html`). Tu `assets/js/config.js` ya trae tu Project URL y tu Publishable key.
3. Sube los cambios:
   ```
   git add .
   git commit -m "Formas de pago elegibles, entrega, contacto y login social"
   git push
   ```
4. GitHub Pages se actualiza en 1 o 2 minutos. Si ves la versión vieja, refresca con **Ctrl + F5**.

## 4. Probar rápido

1. Crea una cuenta con un correo real y confirma desde el mensaje.
2. Menú de tu perfil > **Mis datos de cobro**: abre el menú desplegable y elige tus formas de pago.
3. Con dos cuentas (dos navegadores): una publica un artículo en venta y la otra lo compra eligiendo "en persona" o "por paquetería". Al aceptar, las dos ven el contacto de la otra.
4. En **Coleccionistas** busca un usuario; en la barra de la página principal busca artículos.
