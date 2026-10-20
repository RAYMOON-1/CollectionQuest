(async function () {
  const { $, esc, icon, sb, configured, getSession, friendlyError, compressImage, uploadImage, toast, validateEmail, inboxLink } = window.CQ;

  const errBox = $('#auth-error');
  const infoBox = $('#auth-info');

  function clearMessages() { errBox.classList.remove('show'); infoBox.classList.remove('show'); }
  function showError(msg) {
    infoBox.classList.remove('show');
    errBox.innerHTML = `${icon('circle-alert', 'pink', 18)}<span>${esc(msg)}</span>`;
    errBox.classList.add('show');
  }
  function showInfo(msg) {
    errBox.classList.remove('show');
    infoBox.textContent = msg;
    infoBox.classList.add('show');
  }

  // A donde regresa el enlace del correo (la misma carpeta donde está esta página).
  const redirectTo = new URL('confirmado.html', location.href).href;

  /* ---------- Pestañas ---------- */
  const tabs = { login: $('#tab-login'), registro: $('#tab-registro') };
  const panels = { login: $('#panel-login'), registro: $('#panel-registro') };
  const verifyPanel = $('#verify-panel');

  function setTab(mode) {
    verifyPanel.hidden = true;
    $('.tabs').hidden = false;
    Object.keys(tabs).forEach((k) => {
      const active = k === mode;
      tabs[k].setAttribute('aria-selected', String(active));
      tabs[k].tabIndex = active ? 0 : -1;
      panels[k].hidden = !active;
    });
    clearMessages();
    document.title = (mode === 'registro' ? 'Crear cuenta' : 'Iniciar sesión') + ' | Collection Quest';
  }
  Object.keys(tabs).forEach((k) => {
    tabs[k].addEventListener('click', () => setTab(k));
    tabs[k].addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const other = k === 'login' ? 'registro' : 'login';
        setTab(other);
        tabs[other].focus();
      }
    });
  });
  setTab(new URLSearchParams(location.search).get('modo') === 'registro' ? 'registro' : 'login');

  if (!configured) {
    showError('Primero conecta Supabase: pega tu Project URL y tu Publishable key en assets/js/config.js.');
  } else {
    const session = await getSession();
    if (session) { location.replace('app.html'); return; }
  }

  /* ---------- Pantalla "Revisa tu correo" ---------- */
  let resendTimer = null;
  let pendingEmail = '';

  function showVerifyPanel(email) {
    pendingEmail = email;
    clearMessages();
    Object.values(panels).forEach((p) => (p.hidden = true));
    $('.tabs').hidden = true;
    verifyPanel.hidden = false;
    $('#verify-email').textContent = email;

    const link = inboxLink(email);
    const open = $('#btn-open-inbox');
    if (link) { open.href = link; open.hidden = false; } else { open.hidden = true; }
    startResendCooldown(60);
    document.title = 'Revisa tu correo | Collection Quest';
  }

  function startResendCooldown(seconds) {
    const btn = $('#btn-resend');
    clearInterval(resendTimer);
    let left = seconds;
    btn.disabled = true;
    const tick = () => {
      if (left <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.textContent = 'Reenviar correo';
        return;
      }
      btn.textContent = `Reenviar correo (${left} s)`;
      left -= 1;
    };
    tick();
    resendTimer = setInterval(tick, 1000);
  }

  $('#btn-resend').addEventListener('click', async () => {
    const { error } = await sb.auth.resend({ type: 'signup', email: pendingEmail, options: { emailRedirectTo: redirectTo } });
    if (error) { toast(friendlyError(error), 'error'); startResendCooldown(30); return; }
    toast('Listo, te enviamos el correo otra vez.');
    startResendCooldown(60);
  });

  $('#btn-to-login').addEventListener('click', () => {
    setTab('login');
    $('#login-email').value = pendingEmail;
    $('#login-pass').focus();
  });

  /* ---------- Iniciar sesión ---------- */
  panels.login.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    if (!configured) return showError('Falta configurar Supabase en assets/js/config.js.');

    const email = $('#login-email').value.trim();
    const password = $('#login-pass').value;
    if (!email || !password) return showError('Escribe tu correo y tu contraseña.');

    const btn = $('#login-submit');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      btn.disabled = false;
      btn.textContent = 'Iniciar sesión';
      if (/Email not confirmed/i.test(error.message)) { showVerifyPanel(email.toLowerCase()); return; }
      showError(friendlyError(error));
      return;
    }
    location.href = 'app.html';
  });

  /* ---------- Avatar del registro ---------- */
  let avatarFile = null;
  let avatarBlob = null;
  const preview = $('#reg-avatar-preview');
  const fileInput = $('#reg-avatar-file');

  $('#reg-avatar-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showError('Elige un archivo de imagen (JPG, PNG o WebP).');
    try {
      avatarFile = file;
      avatarBlob = await compressImage(file, 400, 0.88);
      preview.innerHTML = `<img class="avatar" src="${URL.createObjectURL(avatarBlob)}" alt="Vista previa de tu avatar">`;
      clearMessages();
    } catch (err) {
      showError(friendlyError(err));
    }
  });

  // Si hay que confirmar el correo no hay sesión todavía: guardamos un avatar chiquito
  // en este navegador y la app lo sube sola en cuanto la persona entre por primera vez.
  async function stashAvatarForLater(email) {
    if (!avatarFile) return;
    try {
      const small = await compressImage(avatarFile, 256, 0.8);
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(small);
      });
      localStorage.setItem('cq_pending_avatar', JSON.stringify({ email, dataUrl }));
    } catch (e) { /* si falla, se sube después desde el perfil */ }
  }

  /* ---------- Crear cuenta ---------- */
  panels.registro.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    if (!configured) return showError('Falta configurar Supabase en assets/js/config.js.');

    const username = $('#reg-username').value.trim().toLowerCase();
    const password = $('#reg-pass').value;
    const check = validateEmail($('#reg-email').value);

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return showError('El usuario debe tener de 3 a 20 caracteres: letras minúsculas, números o guion bajo.');
    }
    if (!check.ok) {
      if (check.suggestion) {
        $('#reg-email').value = check.suggestion;
        return showInfo(`Parece que había un error de dedo. Cambiamos tu correo a ${check.suggestion}. Revísalo y toca Crear cuenta otra vez.`);
      }
      return showError(check.message);
    }
    if (password.length < 6) return showError('La contraseña debe tener al menos 6 caracteres.');
    const email = check.email;

    const btn = $('#reg-submit');
    btn.disabled = true;
    btn.textContent = 'Creando cuenta…';
    const reset = () => { btn.disabled = false; btn.textContent = 'Crear cuenta'; };

    try {
      const { data: taken } = await sb.from('profiles').select('id').eq('username', username).maybeSingle();
      if (taken) { showError('Ese nombre de usuario ya está en uso. Prueba con otro.'); return reset(); }

      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { username }, emailRedirectTo: redirectTo }
      });
      if (error) { showError(friendlyError(error)); return reset(); }

      // Supabase devuelve identities vacío cuando el correo ya existe.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        showError('Ese correo ya tiene cuenta. Inicia sesión.');
        return reset();
      }

      if (data.session) {
        // Confirmación de correo desactivada en Supabase: ya hay sesión.
        if (avatarBlob) {
          try {
            const url = await uploadImage('avatars', avatarBlob, data.user.id);
            await sb.from('profiles').update({ avatar_url: url }).eq('id', data.user.id);
          } catch (err) {
            toast('Tu cuenta se creó, pero no se pudo subir el avatar. Súbelo desde tu perfil.', 'error');
          }
        }
        location.href = 'app.html';
        return;
      }

      await stashAvatarForLater(email);
      reset();
      showVerifyPanel(email);
    } catch (err) {
      showError(friendlyError(err));
      reset();
    }
  });
})();
