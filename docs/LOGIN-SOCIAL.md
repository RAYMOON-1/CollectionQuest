# Entrar con Google, Facebook y Apple

En la página ya están los tres botones (en "Iniciar sesión" y en "Crear cuenta"). Para que funcionen hay que **activar cada uno en Supabase**
y crear una "app" en el sitio de cada empresa. Es trabajo de configuración (no de código) y se hace una sola vez.

> Los nombres de los menús de Google, Facebook, Apple y Supabase cambian de vez en cuando. La idea siempre es la misma:
> 1) crear la app, 2) pegar en ella la **dirección de regreso** de Supabase, 3) copiar el **ID** y la **clave** a Supabase.

## Antes de empezar (datos que vas a usar)

- **Dirección de regreso (Callback URL)** de tu proyecto:
  `https://pcxgazidzsqlfpceljsm.supabase.co/auth/v1/callback`
  (también aparece en Supabase > Authentication > Sign In / Providers, al abrir cada proveedor).
- Tu sitio: `https://raymoon-1.github.io/CollectionQuest/`
- En Supabase > Authentication > **URL Configuration**:
  - Site URL: `https://raymoon-1.github.io/CollectionQuest/`
  - Redirect URLs: `https://raymoon-1.github.io/CollectionQuest/**` y `http://localhost:5500/**`
- Necesitas un **aviso de privacidad** publicado (una página tuya con tu aviso). Google y Facebook lo piden para dejar entrar a todo el público.

Para cada proveedor: en Supabase abre **Authentication > Sign In / Providers**, entra al proveedor, actívalo y pega el *Client ID* y la *Client Secret* que obtengas abajo.

## Google (gratis)

1. Entra a <https://console.cloud.google.com> y crea un proyecto (por ejemplo "Collection Quest").
2. **APIs y servicios > Pantalla de consentimiento de OAuth**: tipo *Externo*, nombre de la app, tu correo de soporte y tu correo de contacto.
   Permisos: los básicos (`email`, `profile`, `openid`).
3. **APIs y servicios > Credenciales > Crear credenciales > ID de cliente de OAuth**, tipo **Aplicación web**.
   - *Orígenes autorizados de JavaScript*: `https://raymoon-1.github.io`
   - *URI de redireccionamiento autorizados*: la **Callback URL** de arriba.
4. Copia el **ID de cliente** y el **Secreto** a Supabase (proveedor Google).
5. Al terminar las pruebas, en la pantalla de consentimiento pulsa **Publicar aplicación**; si no, solo entran las cuentas que agregaste como "usuarios de prueba".

## Facebook (gratis)

1. Entra a <https://developers.facebook.com>, **Mis apps > Crear app**. Caso de uso: *Autenticar y solicitar datos de usuarios con el inicio de sesión con Facebook*.
2. En **Inicio de sesión con Facebook > Configuración**, en *URI de redireccionamiento de OAuth válidos* pega la **Callback URL**.
3. En **Configuración de la app > Básica**: copia el **ID de la app** y la **Clave secreta** a Supabase (proveedor Facebook).
   Ahí mismo agrega la URL de tu **aviso de privacidad** y el dominio `raymoon-1.github.io`.
4. Permisos: `public_profile` y `email`.
5. Cambia la app de modo *Desarrollo* a **Activa (Live)** para que entre cualquier persona. Mientras esté en desarrollo solo entran tú y los testers que agregues.
6. Aviso: Facebook no siempre entrega el correo (si la persona no lo tiene o no lo autoriza). La página funciona igual: crea el usuario con un nombre automático.

## Apple (requiere cuenta de pago)

Apple pide el **Apple Developer Program: unos 99 USD al año**. Sin esa cuenta no se puede activar.

1. En <https://developer.apple.com/account> > *Certificates, Identifiers & Profiles*:
   - **Identifiers > App IDs**: crea un App ID con la capacidad *Sign in with Apple*.
   - **Identifiers > Services IDs**: crea un Services ID (por ejemplo `com.tuapp.collectionquest.web`). Ese identificador es el **Client ID** que va en Supabase.
     Actívale *Sign in with Apple* > Configure: *Domains* = `pcxgazidzsqlfpceljsm.supabase.co` y *Return URLs* = la **Callback URL**.
   - **Keys**: crea una llave con *Sign in with Apple*, descarga el archivo `.p8` (solo se descarga una vez) y anota el **Key ID** y tu **Team ID**.
2. Supabase pide un **Secret Key (for OAuth)** que es un código especial (JWT) generado con ese `.p8`. La documentación de Supabase (Login with Apple) trae un generador.
   **Ese código caduca como máximo a los 6 meses**: ponte un recordatorio para generarlo de nuevo, o el botón de Apple dejará de funcionar de pronto.
3. Apple solo entrega nombre y correo la **primera vez**, y la persona puede ocultar su correo (llega una dirección privada de Apple). La página lo maneja bien.

## Si todavía no configuras uno

Abre `assets/js/config.js` y pon `false` en los que no estén listos. Su botón desaparece:

```js
AUTH_PROVIDERS: { google: true, facebook: false, apple: false },
```

Si alguien toca un botón de un proveedor que no está activado en Supabase, el navegador muestra una pantalla de error de Supabase. Por eso conviene ocultarlos hasta tenerlos listos.

## Cómo funciona por dentro

- La persona entra con Google/Facebook/Apple y regresa a la app ya con sesión. No se pide confirmar el correo (la red social ya lo verificó).
- Se le crea su perfil con un nombre de usuario automático (sale del correo o del nombre de la cuenta). Lo puede cambiar en *Editar perfil*.
- Si ya tenía una cuenta con ese mismo correo, Supabase une las dos cuentas (según tu configuración de "vincular cuentas").
- El filtro de correos inventados (`123456@…`, `prueba@…`) solo se aplica a registros por correo y contraseña, no a las redes sociales.
- La foto de perfil de la red social no se importa: se elige en *Editar perfil* y se guarda en tu propio almacenamiento.

## Problemas comunes

| Lo que ves | Qué significa |
|---|---|
| `provider is not enabled` en una pantalla de Supabase | Ese proveedor no está activado en Supabase. |
| `redirect_uri_mismatch` (Google) o "URL bloqueada" (Facebook) | La Callback URL no es exactamente la misma. Cópiala de nuevo. |
| Solo tú puedes entrar | Google en modo prueba / Facebook en modo desarrollo: publícalos. |
| El botón de Apple funcionaba y dejó de hacerlo | Venció el código secreto (6 meses): genera uno nuevo. |
