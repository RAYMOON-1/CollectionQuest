(async function () {
  const { $, esc, icon, sb, configured, getSession, friendlyError, compressImage, uploadImage, toast } = window.CQ;

  const errBox = $('#auth-error');
  const infoBox = $('#auth-info');

  function clearMessages() {
    errBox.classList.remove('show');
    infoBox.classList.remove('show');
  }
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

  /* ---------- Pestañas ---------- */
  const tabs = { login: $('#tab-login'), registro: $('#tab-registro') };
  const panels = { login: $('#panel-login'), registro: $('#panel-registro') };

  function setTab(mode) {
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
      showError(friendlyError(error));
      btn.disabled = false;
      btn.textContent = 'Iniciar sesión';
      return;
    }
    location.href = 'app.html';
  });

  /* ---------- Avatar del registro ---------- */
  let avatarBlob = null;
  const preview = $('#reg-avatar-preview');
  const fileInput = $('#reg-avatar-file');

  $('#reg-avatar-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showError('Elige un archivo de imagen (JPG, PNG o WebP).');
    try {
      avatarBlob = await compressImage(file, 400, 0.88);
      const url = URL.createObjectURL(avatarBlob);
      preview.innerHTML = `<img class="avatar" src="${url}" alt="Vista previa de tu avatar">`;
      clearMessages();
    } catch (err) {
      showError(friendlyError(err));
    }
  });

  /* ---------- Crear cuenta ---------- */
  panels.registro.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();
    if (!configured) return showError('Falta configurar Supabase en assets/js/config.js.');

    const username = $('#reg-username').value.trim().toLowerCase();
    const email = $('#reg-email').value.trim();
    const password = $('#reg-pass').value;

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return showError('El usuario debe tener de 3 a 20 caracteres: letras minúsculas, números o guion bajo.');
    }
    if (!email) return showError('Escribe tu correo electrónico.');
    if (password.length < 6) return showError('La contraseña debe tener al menos 6 caracteres.');

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
        options: { data: { username } }
      });

      if (error) {
        const msg = /Database error saving new user/i.test(error.message)
          ? 'No se pudo crear tu perfil. Verifica que ejecutaste sql/schema.sql en Supabase.'
          : friendlyError(error);
        showError(msg);
        return reset();
      }

      // Supabase devuelve identities vacío cuando el correo ya existe.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        showError('Ese correo ya tiene cuenta. Inicia sesión.');
        return reset();
      }

      if (data.session) {
        // Sesión lista: subimos el avatar y entramos.
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

      // Si Supabase pide confirmar correo, todavía no hay sesión.
      showInfo('Cuenta creada. Te enviamos un correo para confirmarla. Después inicia sesión y sube tu avatar desde tu perfil.');
      reset();
      setTab('login');
      showInfo('Cuenta creada. Te enviamos un correo para confirmarla. Después inicia sesión y sube tu avatar desde tu perfil.');
      $('#login-email').value = email;
    } catch (err) {
      showError(friendlyError(err));
      reset();
    }
  });
})();
