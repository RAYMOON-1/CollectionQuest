# Seguridad de los datos

Explicado sin tecnicismos: qué protegemos, cómo, y qué NO hacemos a propósito.

## Tarjetas: no se piden ni se guardan

Collection Quest **no pide ni guarda** número de tarjeta, fecha de vencimiento ni CVV, y tampoco hay enlaces de pago.
Las formas de pago son **efectivo** y **transferencia**: el dinero va directo entre las dos personas.

- El CVV **no se puede guardar legalmente** (lo prohíbe la norma PCI-DSS), ni siquiera cifrado.
- Si algún día se filtrara la base de datos, lo que no existe no se puede robar.
- Si más adelante quieres cobrar con tarjeta *dentro* de Collection Quest, se hace con Stripe o Mercado Pago (sus campos seguros): a tu base solo llegaría un aviso de "pagado". Necesita una cuenta del procesador y una función en Supabase.

## Identificaciones (verificación de perfil)

- Las fotos van a un **espacio privado** de Supabase: nadie puede abrirlas con un enlace público.
- Solo las ven **la persona dueña y los administradores**. Los enlaces para verlas duran **60 segundos**.
- Cuando un administrador aprueba o rechaza, **las fotos se borran** y su ruta se borra de la base.
- **No se guarda ningún número** de la identificación. Se le sugiere al usuario tapar esos datos.
- La persona acepta con una casilla que la revisen solo para verificar su identidad.
- Recomendación: agrega un **aviso de privacidad** a tu sitio que diga esto mismo (en México lo pide la LFPDPPP).

## Datos de cobro (CLABE, titular, alias, banco)

- Solo los ve su dueño, y la persona que debe pagarle **únicamente cuando la operación ya fue aceptada**.
- La CLABE se valida (18 números con dígito verificador) en la página y en la base de datos.
- Cada persona elige qué formas de pago acepta; nadie puede pagar con una que no aceptó.
- Supabase cifra los discos donde guarda todo ("en reposo") y la conexión es siempre HTTPS.

## Contacto (WhatsApp, teléfono, correo)

- Para acordar la entrega, las dos personas de una operación ven el contacto de la otra.
- El contacto **no se muestra a visitantes sin sesión**: la base de datos no se lo entrega ni siquiera por la API. Lo ven personas con sesión iniciada en los artículos de venta o intercambio.
- Cada quien decide si lo deja o no en su perfil; para comprar o aceptar una venta se pide uno, porque sin él no se puede coordinar la entrega.
- Los enlaces de WhatsApp y llamada se arman solos a partir del número; un teléfono de 10 dígitos se toma como de México (+52).

## Inicio de sesión con Google, Facebook y Apple

- La contraseña nunca pasa por Collection Quest: la maneja la red social.
- Los inicios con redes sociales no se piden confirmar por correo, porque la red ya verificó la cuenta.
- Pasos de configuración: `docs/LOGIN-SOCIAL.md`.

## Reglas dentro de la base de datos

- Todas las tablas tienen **RLS** (cada quien solo ve y toca lo suyo).
- Nadie puede cambiarse sus **puntos, nivel, rol ni la marca de verificado** desde el navegador.
- Las compras, intercambios, pujas y subastas **solo cambian mediante funciones** con reglas (quién puede hacer qué y cuándo).
- Se rechazan correos temporales, mal escritos o inventados (por correo y contraseña), y las cuentas que nunca confirman se borran a los 2 días.

## Protección en el navegador

- Cada página trae una **política de contenido (CSP)**: solo permite cargar código de tu propio sitio y de la librería de Supabase, y solo conectarse a Supabase. Eso frena que alguien inyecte código malicioso.
- Todo texto escrito por usuarios se **escapa** antes de mostrarse.
- Solo se muestran imágenes del almacenamiento de tu proyecto.

## Lo que sí te toca a ti (5 minutos)

1. **Activa verificación en dos pasos** en tu cuenta de Supabase y de GitHub. Si te roban esa cuenta, nada de lo demás sirve.
2. En el navegador solo va la **Publishable key** (la de `config.js`). **Nunca** pongas la *secret / service_role* en el código ni la subas a GitHub. Lo mismo para las claves secretas de Google, Facebook y Apple: van solo en Supabase.
3. En Supabase > Authentication: activa **CAPTCHA** (Attack Protection) para frenar registros automáticos y, si tu plan lo ofrece, la protección contra **contraseñas filtradas**.
4. Configura un **SMTP propio** (Resend, Brevo...) para que los correos de confirmación lleguen siempre.
5. Mira de vez en cuando *Database > Backups* y descarga un respaldo antes de cambios grandes.
6. Si sospechas de una filtración: genera llaves nuevas en *Project Settings > API* y cambia `config.js`.
