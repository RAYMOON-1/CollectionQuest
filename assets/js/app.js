(async function () {
  const {
    $, $$, esc, icon, sb, configured,
    RARITY, RARITY_ORDER, LISTING,
    money, levelInfo, rarityFromValue,
    safeImageUrl, avatarHTML,
    compressImage, uploadImage, removeImageByUrl,
    friendlyError, toast
  } = window.CQ;

  /* ------------------------------------------------------------------
     Acceso: sin configuración o sin sesión, se regresa a la pantalla de entrada
     ------------------------------------------------------------------ */
  if (!configured) { location.replace('auth.html'); return; }
  const session = await window.CQ.getSession();
  if (!session) { location.replace('auth.html'); return; }
  const uid = session.user.id;

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') location.replace('index.html');
  });

  /* ------------------------------------------------------------------
     Estado
     ------------------------------------------------------------------ */
  const PAGE_SIZE = 24;
  const VIEWS = {
    todos:       { title: 'Todos los artículos', sub: 'Lo que la comunidad exhibe, vende e intercambia.' },
    venta:       { title: 'Venta',               sub: 'Piezas disponibles para comprar.' },
    intercambio: { title: 'Intercambio',         sub: 'Piezas abiertas a un trueque.' },
    exhibicion:  { title: 'Exhibición',          sub: 'Museos personales para admirar.' },
    mia:         { title: 'Mi colección',        sub: 'Todo lo que has registrado.' }
  };

  const state = {
    profile: null,
    view: 'todos',
    q: '',
    rarity: '',
    sort: 'recientes',
    page: 0,
    items: [],
    total: 0,
    reqId: 0
  };

  /* ------------------------------------------------------------------
     Perfil propio
     ------------------------------------------------------------------ */
  async function loadProfile() {
    const { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error || !data) {
      toast('No se encontró tu perfil. Ejecuta sql/schema.sql en Supabase y crea la cuenta de nuevo.', 'error');
      state.profile = state.profile || {
        id: uid,
        username: (session.user.email || 'usuario').split('@')[0],
        avatar_url: null, bio: '', contact: '', points: 0, level: 1
      };
    } else {
      state.profile = data;
    }
    renderProfileUI();
  }

  function renderProfileUI() {
    const p = state.profile;
    const info = levelInfo(p.points);

    $('#btn-profile').innerHTML = avatarHTML(p, 42);
    $('#level-num').textContent = info.level;
    $('#pm-name').textContent = '@' + p.username;
    $('#pm-level').textContent = `Nivel ${info.level}: ${info.title}`;

    $('#drawer-user').innerHTML = `
      <div class="row">
        ${avatarHTML(p, 46)}
        <div>
          <b>@${esc(p.username)}</b>
          <small>Nivel ${info.level}: ${esc(info.title)}</small>
        </div>
      </div>
      <div class="xp" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${info.pct}" aria-label="Progreso al siguiente nivel"><i style="width:${info.pct}%"></i></div>
      <div class="xp-meta"><span>${info.points} pts</span><span>${info.toNext} para el nivel ${info.level + 1}</span></div>`;
  }

  /* ------------------------------------------------------------------
     Menú lateral y menú de perfil
     ------------------------------------------------------------------ */
  const drawer = $('#drawer');
  const scrim = $('#scrim');
  const btnMenu = $('#btn-menu');

  function openDrawer() {
    drawer.classList.add('open');
    scrim.classList.add('show');
    btnMenu.setAttribute('aria-expanded', 'true');
    closeProfileMenu();
    setTimeout(() => $('.nav-item', drawer).focus(), 50);
  }
  function closeDrawer(returnFocus = true) {
    drawer.classList.remove('open');
    scrim.classList.remove('show');
    btnMenu.setAttribute('aria-expanded', 'false');
    if (returnFocus) btnMenu.focus();
  }
  btnMenu.addEventListener('click', openDrawer);
  $('#btn-close-menu').addEventListener('click', () => closeDrawer());
  scrim.addEventListener('click', () => closeDrawer());

  const profileMenu = $('#profile-menu');
  const btnProfile = $('#btn-profile');
  function closeProfileMenu() {
    profileMenu.hidden = true;
    btnProfile.setAttribute('aria-expanded', 'false');
  }
  btnProfile.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = profileMenu.hidden;
    profileMenu.hidden = !willOpen;
    btnProfile.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', (e) => {
    if (!profileMenu.hidden && !profileMenu.contains(e.target)) closeProfileMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (drawer.classList.contains('open')) closeDrawer();
    if (!profileMenu.hidden) { closeProfileMenu(); btnProfile.focus(); }
  });

  $('#pm-edit').addEventListener('click', () => { closeProfileMenu(); openProfileDialog(); });
  $('#pm-mine').addEventListener('click', () => { closeProfileMenu(); setView('mia'); });
  $('#pm-logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.href = 'index.html';
  });

  $$('.nav-item[data-view]').forEach((b) =>
    b.addEventListener('click', () => setView(b.dataset.view)));
  $('#nav-add').addEventListener('click', () => { closeDrawer(false); openItemDialog(); });
  $('#fab-add').addEventListener('click', () => openItemDialog());

  /* ------------------------------------------------------------------
     Diálogos: cerrar con [data-close] y al tocar el fondo
     ------------------------------------------------------------------ */
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) { closer.closest('dialog').close(); return; }
    // Solo el detalle se cierra al tocar el fondo (los formularios no, para no perder lo escrito).
    if (e.target instanceof HTMLDialogElement && e.target.id === 'dlg-detail') e.target.close();
  });

  /* ------------------------------------------------------------------
     Filtros, orden y búsqueda
     ------------------------------------------------------------------ */
  function renderChips() {
    const chips = [{ key: '', label: 'Todas', color: 'white', hex: '#eef0ff' }].concat(
      RARITY_ORDER.map((k) => ({ key: k, label: RARITY[k].label, color: RARITY[k].color, hex: RARITY[k].hex }))
    );
    $('#rarity-chips').innerHTML = chips.map((c) =>
      `<button type="button" class="chip" data-r="${c.key}" aria-pressed="${state.rarity === c.key}" style="--c:${c.hex}">
         ${icon('gem', c.color, 16)}${esc(c.label)}
       </button>`).join('');
  }
  $('#rarity-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    state.rarity = state.rarity === b.dataset.r ? '' : b.dataset.r;
    renderChips();
    fetchItems(true);
  });

  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    fetchItems(true);
  });

  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      fetchItems(true);
    }, 300);
  });
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(searchTimer);
    state.q = $('#search').value.trim();
    fetchItems(true);
  });

  /* ------------------------------------------------------------------
     Vistas
     ------------------------------------------------------------------ */
  function setView(v) {
    if (!VIEWS[v]) v = 'todos';
    state.view = v;
    history.replaceState(null, '', '#' + v);
    $$('.nav-item[data-view]').forEach((b) => {
      if (b.dataset.view === v) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#view-title').textContent = VIEWS[v].title;
    document.title = VIEWS[v].title + ' | Collection Quest';
    $('#stats').hidden = v !== 'mia';
    if (drawer.classList.contains('open')) closeDrawer(false);
    if (v === 'mia') loadStats();
    fetchItems(true);
  }

  async function loadStats() {
    const { data } = await sb.from('items').select('rarity').eq('owner_id', uid);
    const rows = data || [];
    const counts = {};
    RARITY_ORDER.forEach((k) => (counts[k] = 0));
    rows.forEach((r) => { if (counts[r.rarity] !== undefined) counts[r.rarity]++; });
    const info = levelInfo(state.profile.points);

    $('#stats').innerHTML = `
      <div class="stat">
        <h3>Tu nivel</h3>
        <div class="big">${info.level}: ${esc(info.title)}</div>
        <div class="xp" style="margin-top:10px"><i style="width:${info.pct}%"></i></div>
        <div class="xp-meta"><span>${info.points} puntos</span><span>${info.toNext} para el nivel ${info.level + 1}</span></div>
      </div>
      <div class="stat">
        <h3>Piezas registradas</h3>
        <div class="big">${rows.length}</div>
        <div class="rarity-counts">
          ${RARITY_ORDER.map((k) =>
            `<span style="color:${RARITY[k].hex}">${icon('gem', RARITY[k].color, 16)}${counts[k]} ${esc(RARITY[k].label.toLowerCase())}${counts[k] === 1 ? '' : 's'}</span>`
          ).join('')}
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------
     Carga de artículos
     ------------------------------------------------------------------ */
  const grid = $('#grid');
  const btnMore = $('#btn-more');

  function renderSkeleton() {
    grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join('');
    btnMore.hidden = true;
  }

  async function fetchItems(reset) {
    const myReq = ++state.reqId;
    if (reset) {
      state.page = 0;
      renderSkeleton();
    }

    // Quita caracteres que rompen los filtros de búsqueda.
    const q = state.q.replace(/[%,()*\\:"]/g, ' ').trim();

    let ownerIds = [];
    if (q) {
      const { data: found } = await sb.from('profiles').select('id').ilike('username', `%${q}%`).limit(20);
      ownerIds = (found || []).map((p) => p.id);
    }

    let qb = sb
      .from('items')
      .select(
        'id, owner_id, name, description, value, listing, rarity, points, image_url, created_at, owner:profiles!owner_id(id, username, avatar_url, level, contact)',
        { count: 'exact' }
      );

    if (['venta', 'intercambio', 'exhibicion'].includes(state.view)) qb = qb.eq('listing', state.view);
    if (state.view === 'mia') qb = qb.eq('owner_id', uid);
    if (state.rarity) qb = qb.eq('rarity', state.rarity);

    if (q) {
      const parts = [`name.ilike.%${q}%`, `description.ilike.%${q}%`];
      if (ownerIds.length) parts.push(`owner_id.in.(${ownerIds.join(',')})`);
      qb = qb.or(parts.join(','));
    }

    if (state.sort === 'rareza') qb = qb.order('points', { ascending: false }).order('value', { ascending: false });
    else if (state.sort === 'valor') qb = qb.order('value', { ascending: false });
    else if (state.sort === 'nombre') qb = qb.order('name', { ascending: true });
    else qb = qb.order('created_at', { ascending: false });
    qb = qb.order('id', { ascending: true });

    const from = state.page * PAGE_SIZE;
    qb = qb.range(from, from + PAGE_SIZE - 1);

    const { data, error, count } = await qb;
    if (myReq !== state.reqId) return; // llegó una búsqueda más nueva

    if (error) {
      const noTables = error.code === '42P01' || /schema cache|does not exist/i.test(error.message || '');
      grid.innerHTML = `
        <div class="empty">
          ${icon('circle-alert', 'pink', 48)}
          <h3>No se pudieron cargar los artículos</h3>
          <p>${noTables ? 'Faltan las tablas. Ejecuta sql/schema.sql en el SQL Editor de Supabase.' : esc(friendlyError(error))}</p>
        </div>`;
      btnMore.hidden = true;
      return;
    }

    state.items = reset ? data : state.items.concat(data);
    state.total = count ?? state.items.length;
    renderGrid();
  }

  btnMore.addEventListener('click', async () => {
    btnMore.disabled = true;
    state.page += 1;
    await fetchItems(false);
    btnMore.disabled = false;
  });

  function cardHTML(it) {
    const r = RARITY[it.rarity] || RARITY.comun;
    const l = LISTING[it.listing] || LISTING.exhibicion;
    const img = safeImageUrl(it.image_url);
    return `
      <article class="card r-${esc(it.rarity)}" data-id="${esc(it.id)}" tabindex="0" role="button"
               aria-label="${esc(it.name)}, ${esc(r.label)}, ${esc(money(it.value))}">
        <div class="card-img">
          ${img
            ? `<img class="photo" loading="lazy" src="${esc(img)}" alt="">`
            : icon('package', 'muted', 52)}
          <span class="badge badge-rarity">${icon('gem', r.color, 14)}${esc(r.label)}</span>
          <span class="badge badge-listing l-${esc(it.listing)}">${icon(l.icon, l.color, 14)}${esc(l.label)}</span>
        </div>
        <div class="card-body">
          <h3>${esc(it.name)}</h3>
          <div class="card-foot">
            <span class="value">${money(it.value)}</span>
            <span class="owner">${avatarHTML(it.owner, 22)}<span>@${esc(it.owner?.username || '')}</span></span>
          </div>
        </div>
      </article>`;
  }

  function renderGrid() {
    const sub = VIEWS[state.view].sub;
    $('#view-sub').textContent =
      `${sub} ${state.total} ${state.total === 1 ? 'artículo' : 'artículos'}.`;

    if (!state.items.length) {
      const filtered = state.q || state.rarity;
      let title, text, action = '';
      if (filtered) {
        title = 'No encontramos nada con esa búsqueda';
        text = 'Prueba con otra palabra o quita el filtro de rareza.';
      } else if (state.view === 'mia') {
        title = 'Tu colección está vacía';
        text = 'Registra tu primera pieza y el sistema le asignará su rareza.';
        action = `<button class="btn btn-green" type="button" id="empty-add">${icon('plus', 'dark', 20)}Registrar mi primer artículo</button>`;
      } else {
        title = 'Aquí todavía no hay nada';
        text = 'Sé la primera persona en publicar en esta sección.';
        action = `<button class="btn btn-green" type="button" id="empty-add">${icon('plus', 'dark', 20)}Registrar artículo</button>`;
      }
      grid.innerHTML = `<div class="empty">${icon('package', 'muted', 52)}<h3>${title}</h3><p>${text}</p>${action}</div>`;
      const add = $('#empty-add');
      if (add) add.addEventListener('click', () => openItemDialog());
      btnMore.hidden = true;
      return;
    }

    grid.innerHTML = state.items.map(cardHTML).join('');
    btnMore.hidden = state.items.length >= state.total;
  }

  function cardFromEvent(e) {
    return e.target.closest('.card[data-id]');
  }
  grid.addEventListener('click', (e) => {
    const c = cardFromEvent(e);
    if (c) openDetail(c.dataset.id);
  });
  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const c = cardFromEvent(e);
    if (c) { e.preventDefault(); openDetail(c.dataset.id); }
  });

  /* ------------------------------------------------------------------
     Detalle del artículo
     ------------------------------------------------------------------ */
  function openDetail(id) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return;
    const dlg = $('#dlg-detail');
    const r = RARITY[it.rarity] || RARITY.comun;
    const l = LISTING[it.listing] || LISTING.exhibicion;
    const img = safeImageUrl(it.image_url);
    const mine = it.owner_id === uid;
    const lvl = it.owner?.level || 1;
    const lvlTitle = levelInfo((lvl - 1) ** 2 * 25).title;
    const tradable = it.listing !== 'exhibicion';

    let contactBlock = '';
    if (tradable && !mine) {
      contactBlock = it.owner?.contact
        ? `<div class="contact-box">${icon('message-circle', 'green', 22)}<div><b>Contacto de @${esc(it.owner.username)}</b><br>${esc(it.owner.contact)}</div></div>`
        : `<p class="hint" style="margin-bottom:14px">Esta persona todavía no agregó un contacto en su perfil.</p>`;
    }

    dlg.innerHTML = `
      <div class="detail r-${esc(it.rarity)}">
        <div class="detail-img">
          ${img ? `<img class="photo" src="${esc(img)}" alt="${esc(it.name)}">` : icon('package', 'muted', 72)}
        </div>
        <div class="dlg-body">
          <div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
            <h2>${esc(it.name)}</h2>
            <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 'white', 22)}</button>
          </div>
          <div class="meta">
            <span class="badge" style="--bc:${r.hex}">${icon('gem', r.color, 14)}${esc(r.label)}, +${it.points} puntos</span>
            <span class="badge l-${esc(it.listing)}" style="--bc:${it.listing === 'venta' ? 'var(--green)' : it.listing === 'intercambio' ? 'var(--t-rara)' : 'var(--t-epica)'}">${icon(l.icon, l.color, 14)}${esc(l.label)}</span>
          </div>
          <p class="price">${money(it.value)}</p>
          <p class="desc">${it.description ? esc(it.description) : 'Sin descripción.'}</p>
          <div class="owner-box">
            ${avatarHTML(it.owner, 44)}
            <div><b>@${esc(it.owner?.username || '')}</b><small>Nivel ${lvl}: ${esc(lvlTitle)}</small></div>
          </div>
          ${contactBlock}
          ${mine ? `
            <div class="dlg-actions" style="justify-content:space-between">
              <button class="btn btn-red btn-sm" type="button" id="det-delete">${icon('trash-2', 'white', 18)}Eliminar</button>
              <button class="btn btn-sm" type="button" id="det-edit">${icon('pencil', 'white', 18)}Editar</button>
            </div>` : ''}
        </div>
      </div>`;

    if (mine) {
      $('#det-edit', dlg).addEventListener('click', () => { dlg.close(); openItemDialog(it); });
      const del = $('#det-delete', dlg);
      let armed = false;
      del.addEventListener('click', async () => {
        if (!armed) {
          armed = true;
          del.innerHTML = `${icon('trash-2', 'white', 18)}¿Seguro? Toca otra vez`;
          setTimeout(() => {
            if (armed && del.isConnected) { armed = false; del.innerHTML = `${icon('trash-2', 'white', 18)}Eliminar`; }
          }, 4000);
          return;
        }
        del.disabled = true;
        const { error } = await sb.from('items').delete().eq('id', it.id);
        if (error) { toast(friendlyError(error), 'error'); del.disabled = false; return; }
        removeImageByUrl('items', it.image_url);
        dlg.close();
        toast('Artículo eliminado.');
        await afterChange();
      });
    }
    dlg.showModal();
  }

  /* ------------------------------------------------------------------
     Registrar / editar artículo
     ------------------------------------------------------------------ */
  const dlgItem = $('#dlg-item');
  const itemForm = $('#item-form');
  const itemError = $('#item-error');
  let editing = null;
  let photoBlob = null;
  let photoUrl = null;

  function showItemError(msg) {
    itemError.innerHTML = `${icon('circle-alert', 'pink', 18)}<span>${esc(msg)}</span>`;
    itemError.classList.add('show');
  }

  function renderPhoto(url) {
    const drop = $('#photo-drop');
    if (url) {
      drop.innerHTML = `<img class="photo" src="${esc(url)}" alt="Vista previa de la foto">`;
    } else {
      drop.innerHTML = `
        <div class="placeholder" id="photo-placeholder">
          ${icon('image', 'muted', 44)}
          <span>Agrega una foto de tu artículo</span>
        </div>`;
    }
  }

  function updateRarityPreview() {
    const v = parseFloat($('#item-value').value);
    const key = rarityFromValue(Number.isFinite(v) ? v : 0);
    const r = RARITY[key];
    const box = $('#rarity-preview');
    box.style.setProperty('--tier', r.hex);
    box.innerHTML = `${icon('gem', r.color, 30)}<div><b>${esc(r.label)}</b><small>Rareza estimada, +${r.points} puntos</small></div>`;
  }

  function updateDescCount() {
    $('#desc-count').textContent = `${$('#item-desc').value.length} / 400`;
  }

  function openItemDialog(item = null) {
    editing = item;
    photoBlob = null;
    if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; }
    itemError.classList.remove('show');
    itemForm.reset();

    $('#item-title').textContent = item ? 'Editar artículo' : 'Registrar artículo';
    $('#item-submit').textContent = item ? 'Guardar cambios' : 'Guardar artículo';

    if (item) {
      $('#item-name').value = item.name;
      $('#item-value').value = item.value;
      $('#item-desc').value = item.description || '';
      const radio = $(`input[name="listing"][value="${item.listing}"]`);
      if (radio) radio.checked = true;
      renderPhoto(safeImageUrl(item.image_url));
    } else {
      renderPhoto(null);
    }
    updateRarityPreview();
    updateDescCount();
    closeDrawer(false);
    dlgItem.showModal();
    $('#item-name').focus({ preventScroll: true });
  }

  $('#item-value').addEventListener('input', updateRarityPreview);
  $('#item-desc').addEventListener('input', updateDescCount);

  async function setPhoto(fileOrBlob) {
    try {
      photoBlob = await compressImage(fileOrBlob, 1280, 0.85);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = URL.createObjectURL(photoBlob);
      renderPhoto(photoUrl);
      itemError.classList.remove('show');
    } catch (err) {
      showItemError(friendlyError(err));
    }
  }

  $('#btn-gallery').addEventListener('click', () => $('#file-gallery').click());
  $('#file-gallery').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) setPhoto(f);
  });
  $('#file-camera').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) setPhoto(f);
  });

  /* ----- Cámara ----- */
  const dlgCam = $('#dlg-camera');
  const camVideo = $('#cam-video');
  let camStream = null;

  function stopCamera() {
    if (camStream) camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
    camVideo.srcObject = null;
  }
  dlgCam.addEventListener('close', stopCamera);
  $('#cam-close').addEventListener('click', () => dlgCam.close());

  $('#btn-camera').addEventListener('click', async () => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    // En celular se abre la cámara nativa; en computadora, la vista en vivo.
    if (isTouch || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('#file-camera').click();
      return;
    }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false
      });
      camVideo.srcObject = camStream;
      dlgCam.showModal();
    } catch (err) {
      toast('No se pudo abrir la cámara. Revisa el permiso del navegador o elige una foto de la galería.', 'error');
    }
  });

  $('#cam-shot').addEventListener('click', () => {
    const w = camVideo.videoWidth;
    const h = camVideo.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(camVideo, 0, 0, w, h);
    canvas.toBlob((blob) => {
      dlgCam.close();
      if (blob) setPhoto(blob);
    }, 'image/jpeg', 0.92);
  });

  /* ----- Guardar ----- */
  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    itemError.classList.remove('show');

    const name = $('#item-name').value.trim();
    const description = $('#item-desc').value.trim();
    const value = parseFloat($('#item-value').value);
    const listing = ($('input[name="listing"]:checked') || {}).value || 'exhibicion';

    if (name.length < 2) return showItemError('Escribe el nombre del artículo (mínimo 2 letras).');
    if (!Number.isFinite(value) || value < 0) return showItemError('Escribe el valor estimado del artículo.');
    if (value > 9999999999) return showItemError('Ese valor es demasiado grande.');

    const btn = $('#item-submit');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
      let image_url = editing ? editing.image_url : null;
      let oldImage = null;
      if (photoBlob) {
        const newUrl = await uploadImage('items', photoBlob, uid);
        oldImage = editing ? editing.image_url : null;
        image_url = newUrl;
      }

      const payload = { name, description, value, listing, image_url };
      let saved;
      if (editing) {
        const { data, error } = await sb.from('items').update(payload).eq('id', editing.id).select('rarity, points').single();
        if (error) throw error;
        saved = data;
        if (oldImage) removeImageByUrl('items', oldImage);
      } else {
        const { data, error } = await sb.from('items').insert({ ...payload, owner_id: uid }).select('rarity, points').single();
        if (error) throw error;
        saved = data;
      }

      dlgItem.close();
      const rr = RARITY[saved.rarity];
      toast(editing
        ? `Cambios guardados. Rareza: ${rr.label}.`
        : `Artículo registrado. Rareza: ${rr.label}, +${saved.points} puntos.`);
      await afterChange();
    } catch (err) {
      showItemError(friendlyError(err));
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  // Tras crear, editar o borrar: se refrescan puntos, nivel y lista.
  async function afterChange() {
    const before = state.profile.level;
    await loadProfile();
    if (state.profile.level > before) {
      const info = levelInfo(state.profile.points);
      toast(`¡Subiste al nivel ${info.level}: ${info.title}!`);
    }
    if (state.view === 'mia') loadStats();
    await fetchItems(true);
  }

  /* ------------------------------------------------------------------
     Perfil: avatar y "sobre ti"
     ------------------------------------------------------------------ */
  const dlgProfile = $('#dlg-profile');
  const profileError = $('#profile-error');
  let pendingAvatar = null;
  let pendingAvatarUrl = null;

  function showProfileError(msg) {
    profileError.innerHTML = `${icon('circle-alert', 'pink', 18)}<span>${esc(msg)}</span>`;
    profileError.classList.add('show');
  }

  function openProfileDialog() {
    const p = state.profile;
    const info = levelInfo(p.points);
    pendingAvatar = null;
    if (pendingAvatarUrl) { URL.revokeObjectURL(pendingAvatarUrl); pendingAvatarUrl = null; }
    profileError.classList.remove('show');

    $('#profile-avatar').innerHTML = avatarHTML(p, 76);
    $('#profile-level').textContent = `Nivel ${info.level}: ${info.title} (${info.points} pts)`;
    $('#pf-username').value = p.username;
    $('#pf-bio').value = p.bio || '';
    $('#pf-contact').value = p.contact || '';
    $('#bio-count').textContent = `${$('#pf-bio').value.length} / 300`;
    dlgProfile.showModal();
  }

  $('#pf-bio').addEventListener('input', () => {
    $('#bio-count').textContent = `${$('#pf-bio').value.length} / 300`;
  });

  $('#btn-avatar').addEventListener('click', () => $('#file-avatar').click());
  $('#file-avatar').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      pendingAvatar = await compressImage(f, 400, 0.88);
      if (pendingAvatarUrl) URL.revokeObjectURL(pendingAvatarUrl);
      pendingAvatarUrl = URL.createObjectURL(pendingAvatar);
      $('#profile-avatar').innerHTML = `<img class="avatar" src="${pendingAvatarUrl}" alt="Vista previa de tu avatar" width="76" height="76" style="--s:76px">`;
    } catch (err) {
      showProfileError(friendlyError(err));
    }
  });

  $('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    profileError.classList.remove('show');

    const username = $('#pf-username').value.trim().toLowerCase();
    const bio = $('#pf-bio').value.trim();
    const contact = $('#pf-contact').value.trim();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return showProfileError('El usuario debe tener de 3 a 24 caracteres: letras minúsculas, números o guion bajo.');
    }

    const btn = $('#profile-submit');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      const update = { username, bio, contact };
      const oldAvatar = state.profile.avatar_url;
      if (pendingAvatar) update.avatar_url = await uploadImage('avatars', pendingAvatar, uid);

      const { error } = await sb.from('profiles').update(update).eq('id', uid);
      if (error) throw error;
      if (pendingAvatar && oldAvatar) removeImageByUrl('avatars', oldAvatar);

      dlgProfile.close();
      toast('Perfil actualizado.');
      await loadProfile();
      await fetchItems(true);
    } catch (err) {
      showProfileError(friendlyError(err));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar cambios';
    }
  });

  /* ------------------------------------------------------------------
     Arranque
     ------------------------------------------------------------------ */
  renderChips();
  await loadProfile();
  const startView = location.hash.slice(1);
  setView(VIEWS[startView] ? startView : 'todos');
})();
