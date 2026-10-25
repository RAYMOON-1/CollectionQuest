# Seguridad de los datos

Explicado sin tecnicismos: qué protegemos, cómo, y qué NO hacemos a propósito.

## Tarjetas: no se guardan, punto

Collection Quest **no pide ni guarda** número de tarjeta, fecha de vencimiento ni CVV. Es a propósito:

- El CVV **no se puede guardar legalmente** (lo prohíbe la norma PCI-DSS de la industria de tarjetas), ni siquiera cifrado.
- Si la base de datos se filtrara algún día, lo que no existe no se puede robar.

El "Pago con tarjeta" funciona con el **enlace de pago seguro** de quien vende (Mercado Pago, PayPal o Stripe): el comprador escribe su tarjeta en la página del procesador, nunca en nuestra página.
Si más adelante quieres cobrar con tarjeta *dentro* de Collection Quest, se hace con Stripe Elements o Mercado Pago Bricks: los campos de tarjeta son de ellos (dentro de un recuadro seguro) y a tu base solo llega un aviso de "pagado". Eso necesita una cuenta del procesador y una función en Supabase (Edge Function).

## Identificaciones (verificación de perfil)

- Las fotos van a un **espacio privado** de Supabase: nadie puede abrirlas con un enlace público.
- Solo las ven **la persona dueña y los administradores**. Los enlaces para verlas duran **60 segundos**.
- Cuando un administrador aprueba o rechaza, **las fotos se borran** y su ruta se borra de la base.
- **No se guarda ningún número** de la identificación (ni CURP, ni clave de elector). Se le sugiere al usuario tapar esos datos.
- La persona acepta con una casilla que la revisen solo para verificar su identidad.
- Recomendación: agrega un **aviso de privacidad** a tu sitio que diga esto mismo (en México lo pide la LFPDPPP).

## Datos de cobro (CLABE, titular, alias, banco)

- Solo los ve su dueño, y la persona que debe pagarle **únicamente cuando la operación ya fue aceptada**. El resto del mundo no los ve.
- La CLABE se valida (18 números con dígito verificador) tanto en la página como en la base de datos.
- Supabase cifra los discos donde guarda todo ("en reposo") y la conexión es siempre HTTPS.

## Reglas dentro de la base de datos

- Todas las tablas tienen **RLS** (cada quien solo ve y toca lo suyo).
- Nadie puede cambiarse sus **puntos, nivel, rol ni la marca de verificado** desde el navegador.
- Las compras, intercambios, pujas y subastas **solo cambian mediante funciones** con reglas (quién puede hacer qué y cuándo). No se pueden "hackear" mandando datos directo a la tabla.
- Se rechazan correos temporales, mal escritos o inventados, y las cuentas que nunca confirman su correo se borran a los 2 días.

## Protección en el navegador

- Cada página trae una **política de contenido (CSP)**: solo permite cargar código de tu propio sitio y de la librería de Supabase, y solo conectarse a Supabase. Eso frena que alguien inyecte código malicioso.
- Todo texto escrito por usuarios se **escapa** antes de mostrarse.
- Solo se muestran imágenes del almacenamiento de tu proyecto.

## Lo que sí te toca a ti (5 minutos)

1. **Activa verificación en dos pasos** en tu cuenta de Supabase y de GitHub. Si te roban esa cuenta, nada de lo demás sirve.
2. En el navegador solo va la **Publishable key** (la de `config.js`). **Nunca** pongas la *secret / service_role* en el código ni la subas a GitHub.
3. En Supabase > Authentication: activa **CAPTCHA** (Attack Protection) para frenar registros automáticos y, si tu plan lo ofrece, la protección contra **contraseñas filtradas**.
4. Configura un **SMTP propio** (Resend, Brevo...) para que los correos de confirmación lleguen siempre.
5. Mira de vez en cuando *Database > Backups* y descarga un respaldo antes de cambios grandes.
6. Si algún día sospechas de una filtración: genera llaves nuevas en *Project Settings > API* y cambia `config.js`.
