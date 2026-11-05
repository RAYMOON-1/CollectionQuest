(async function () {
  const { $, icon, getSession, configured } = window.CQ;

  function show(kind, title, text, actionsHTML) {
    $('#ok-icon').innerHTML = kind === 'ok' ? icon('mail-check', 'green', 42) : icon('circle-alert', 'pink', 42);
    $('#ok-icon').style.borderColor = kind === 'ok' ? 'var(--green)' : 'var(--pink)';
    $('#ok-title').textContent = title;
    $('#ok-text').textContent = text;
    $('#ok-actions').innerHTML = actionsHTML;
    document.title = title + ' | Collection Quest';
  }

  // Supabase manda los errores del enlace en el hash (#error=...) o en la URL (?error=...).
  const fromHash = new URLSearchParams(location.hash.slice(1));
  const fromQuery = new URLSearchParams(location.search);
  const problem = fromHash.get('error_description') || fromQuery.get('error_description');

  if (problem) {
    show('error', 'Ese enlace ya no sirve',
      'El enlace venció o ya se usó. Inicia sesión: si tu correo no está confirmado, desde ahí puedes pedir otro.',
      '<a class="btn btn-block" href="auth.html?modo=login">Ir a iniciar sesión</a>');
    return;
  }

  if (!configured) {
    show('error', 'Falta configurar Supabase', 'Revisa assets/js/config.js.', '');
    return;
  }

  // Al abrir el enlace, Supabase crea la sesión solo. Le damos unos segundos.
  let session = null;
  for (let i = 0; i < 8 && !session; i++) {
    session = await getSession();
    if (!session) await new Promise((r) => setTimeout(r, 400));
  }
  history.replaceState(null, '', location.pathname);

  if (session) {
    show('ok', '¡Correo confirmado!', 'Tu cuenta ya está activa. Ya puedes entrar a tu colección.',
      '<a class="btn btn-green btn-block" href="app.html">Entrar a Collection Quest</a>');
  } else {
    show('ok', '¡Correo confirmado!', 'Tu cuenta ya está activa. Inicia sesión para entrar.',
      '<a class="btn btn-green btn-block" href="auth.html?modo=login">Iniciar sesión</a>');
  }
})();
