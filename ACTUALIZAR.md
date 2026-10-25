# Cómo actualizar tu proyecto (en este orden)

## 1. Base de datos (Supabase)

1. (Opcional, recomendado) Antes de correr el SQL, activa la extensión **pg_cron** en *Database > Extensions*.
   Así las subastas se cierran solas cada minuto y las cuentas sin confirmar se limpian. Si no la activas, todo funciona igual:
   las subastas se cierran cuando alguien abre la pantalla de Subastas o la subasta.
2. Abre tu proyecto > **SQL Editor** > *New query*, pega **todo** `sql/schema.sql` y dale **Run**.
   Es seguro correrlo sobre lo que ya tienes: agrega lo nuevo sin borrar tus datos.
   - Los datos de transferencia que ya tenías guardados como texto libre se reemplazan por los cuatro campos nuevos: pídele a quien vende que los capture otra vez en *Mis datos de cobro*.
3. (Opcional) Pega `sql/tests.sql` y dale Run. Debe salir `TODAS LAS PRUEBAS PASARON (151 de 151)`. No deja datos de prueba.
4. Hazte administrador (una sola vez, cambia el nombre por tu usuario):
   ```sql
   update public.profiles set role = 'admin' where username = 'tu_usuario';
   ```
5. Tiempo real de las pujas: en *Database > Publications* abre `supabase_realtime` y revisa que estén `auctions` y `bids`
   (el script las agrega solo). Si no, la página consulta cada 3 segundos y también funciona.

## 2. Correos (Supabase > Authentication)

1. **Sign In / Providers > Email**: deja activado **Confirm email**.
2. **URL Configuration**:
   - Site URL: `https://raymoon-1.github.io/CollectionQuest/`
   - Redirect URLs: `https://raymoon-1.github.io/CollectionQuest/**` y `http://localhost:5500/**`.
3. **Emails > Templates > Confirm signup**: pega el contenido de `docs/correo-confirmacion.html`
   y pon como asunto `Confirma tu cuenta de Collection Quest`.
4. El correo que trae Supabase por defecto **manda muy pocos mensajes por hora** y es solo para pruebas.
   Configura un SMTP propio en *Authentication > SMTP Settings* (Resend, Brevo o Gmail con contraseña de aplicación).
5. Lee `docs/SEGURIDAD.md` (5 minutos): ahí van los pasos para proteger tu cuenta de Supabase.

## 3. Código (GitHub)

1. Descomprime este zip.
2. Copia **todo su contenido** dentro de tu repositorio `CollectionQuest`, reemplazando archivos (los archivos van en la raíz, junto a `index.html`).
   Tu `assets/js/config.js` ya trae tu Project URL y tu Publishable key.
3. Sube los cambios:
   ```
   git add .
   git commit -m "Subastas, pagos, seguridad y mas"
   git push
   ```
4. GitHub Pages se actualiza en 1 o 2 minutos. Si ves la versión vieja, refresca con **Ctrl + F5**.

## 4. Probar rápido

1. Crea una cuenta con un correo real y confirma desde el mensaje.
2. Registra un artículo (la foto y la categoría son obligatorias). Prueba la opción **Subastarlo**.
3. Con dos cuentas (dos navegadores): una puja y la otra ve la puja al instante.
4. Para probar ventas: una cuenta llena *Mis datos de cobro* (menú de tu perfil) y la otra compra.
