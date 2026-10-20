# Cómo actualizar tu proyecto (en este orden)

## 1. Base de datos (Supabase)

1. Abre tu proyecto > **SQL Editor** > *New query*.
2. Pega **todo** `sql/schema.sql` y dale **Run**. Es seguro correrlo sobre lo que ya tienes: agrega lo nuevo sin borrar tus datos.
   Tus artículos anteriores quedan con categoría "carta" (los puedes editar).
3. (Opcional) Pega `sql/tests.sql` y dale Run. Debe salir `TODAS LAS PRUEBAS PASARON (88 de 88)`. No deja datos de prueba.
4. Hazte administrador (una sola vez, cambia el nombre por tu usuario):
   ```sql
   update public.profiles set role = 'admin' where username = 'tu_usuario';
   ```
5. (Opcional) Limpia la tabla vieja `products`: al final de `schema.sql` hay dos líneas comentadas para borrarla. La app usa `items`.

## 2. Correos (Supabase > Authentication)

1. **Sign In / Providers > Email**: activa **Confirm email**.
2. **URL Configuration**:
   - Site URL: `https://raymoon-1.github.io/CollectionQuest/`
   - Redirect URLs: `https://raymoon-1.github.io/CollectionQuest/**` y `http://localhost:5500/**` (para probar en tu compu).
3. Importante: el correo que trae Supabase por defecto **manda muy pocos mensajes por hora** y es solo para pruebas.
   Antes de abrir el sitio a más gente configura un SMTP propio en *Authentication > SMTP Settings* (Resend, Brevo o Gmail con contraseña de aplicación).

## 3. Código (GitHub)

1. Descomprime este zip.
2. Copia **todo su contenido** dentro de tu repositorio `CollectionQuest`, reemplazando archivos (los archivos van en la raíz, junto a `index.html`).
   Tu `assets/js/config.js` ya trae tu Project URL y tu Publishable key.
3. Sube los cambios:
   ```
   git add .
   git commit -m "Amigos, ranking, ventas, verificación y más"
   git push
   ```
4. GitHub Pages se actualiza en 1 o 2 minutos. Si ves la versión vieja, refresca con **Ctrl + F5**.

## 4. Probar rápido

1. Crea una cuenta con un correo real y confirma desde el mensaje.
2. Registra un artículo (la foto y la categoría son obligatorias).
3. Entra a **Ranking**, **Coleccionistas** y **Ventas e intercambios** desde el menú.
4. Para probar ventas necesitas dos cuentas: una vende (con *Mis datos de cobro* en el menú de tu perfil) y otra compra.
