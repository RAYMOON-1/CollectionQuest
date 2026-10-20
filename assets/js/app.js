(async function () {
  const {
    $, $$, esc, icon, sb, configured,
    RARITY, RARITY_ORDER, LISTING, CATEGORIES, CATEGORY_ORDER,
    money, levelInfo, rarityFromValue, searchTokens,
    safeImageUrl, avatarHTML, verifiedBadge,
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
     Estado y piezas compartidas
     ------------------------------------------------------------------ */
  const PAGE_SIZE = 24;
  const ITEM_SELECT =
    'id, owner_id, name, description, value, category, listing, rarity, points, image_url, created_at, ' +
    'owner:profiles!owner_id(id, username, avatar_url, level, contact, verified)';
  const PROFILE_SELECT = 'id, username, avatar_url, banner_url, bio, level, points, verified, role, created_at';

  const ITEM_VIEWS = {
    todos:       { title: 'Todos los artículos', sub: 'Lo que la comunidad exhibe, vende e intercambia.', scope: (q) => q },
    venta:       { title: 'Venta',               sub: 'Piezas disponibles para comprar.',                 scope: (q) => q.eq('listing', 'venta') },
    intercambio: { title: 'Intercambio',         sub: 'Piezas abiertas a un trueque.',                    scope: (q) => q.eq('listing', 'intercambio') },
    exhibicion:  { title: 'Exhibición',          sub: 'Museos personales para admirar.',                  scope: (q) => q.eq('listing', 'exhibicion') }
  };

  const state = {
    profile: null,
    route: { name: 'todos', param: '' },
    q: '', rarity: '', category: '', sort: 'recientes'
  };
  const itemCache = new Map();

  // "A" es lo que comparten app.js y los módulos (social.js, orders.js, verify.js).
  const A = {
    uid, sb, state, itemCache, views: {},
    PAGE_SIZE, ITEM_SELECT, PROFILE_SELECT
  };

  /* ------------------------------------------------------------------
     Perfil propio
     ------------------------------------------------------------------ */
  async function loadProfile() {
    const { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error || !data) {
      toast('No se encontró tu perfil. Ejecuta sql/schema.sql en Supabase y crea la cuenta de nuevo.', 'error');
      state.profile = state.profile || {
        id: uid, username: (session.user.email || 'usuario').split('@')[0],
        avatar_url: null, banner_url: null, bio: '', contact: '', points: 0, level: 1, role: 'usuario', verified: false
      };
    } else {
      state.profile = data;
    }
    renderProfileUI();
  }
  A.refreshProfile = loadProfile;

  function renderProfileUI() {
    const p = state.profile;
    const info = levelInfo(p.points);

    $('#btn-profile').innerHTML = avatarHTML(p, 42);
    $('#level-num').textContent = info.level;
    $('#pm-name').innerHTML = `@${esc(p.username)}${verifiedBadge(p, 15)}`;
    $('#pm-level').textContent = `Nivel ${info.level}: ${info.title}` + (p.role === 'admin' ? ' (administrador)' : '');
    $('#nav-admin').hidden = p.role !== 'admin';

    $('#drawer-user').innerHTML = `
      <div class="row">
        ${avatarHTML(p, 46)}
        <div>
          <b>@${esc(p.username)}${verifiedBadge(p, 15)}</b>
          <small>Nivel ${info.level}: ${esc(info.title)}</small>
        </div>
      </div>
      <div class="xp" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${info.pct}" aria-label="Progreso al siguiente nivel"><i style="width:${info.pct}%"></i></div>
      <div class="xp-meta"><span>${info.points} pts</span><span>${info.toNext} para el nivel ${info.level + 1}</span></div>`;
  }

  // Avatar elegido en el registro cuando todavía no había sesión (había que confirmar el correo).
  async function applyPendingAvatar() {
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem('cq_pending_avatar') || 'null'); } catch (e) { /* nada */ }
    if (!pending || String(pending.email).toLowerCase() !== String(session.user.email || '').toLowerCase()) return;
    try {
      localStorage.removeItem('cq_pending_avatar');
      if (state.profile.avatar_url) return;
      const blob = await (await fetch(pending.dataUrl)).blob();
      const url = await uploadImage('avatars', blob, uid);
      const { error } = await sb.from('profiles').update({ avatar_url: url }).eq('id', uid);
      if (!error) { state.profile.avatar_url = url; renderProfileUI(); }
    } catch (e) { /* si falla, se sube desde el perfil */ }
  }

  /* ------------------------------------------------------------------
     Avisos en el menú (solicitudes de amistad, operaciones pendientes...)
     ------------------------------------------------------------------ */
  function setCount(id, n) {
    const el = $('#' + id);
    if (!el) return;
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = !(n > 0);
  }
  async function refreshCounts() {
    try {
      const [fr, ord] = await Promise.all([
        sb.from('friendships').select('id', { count: 'exact', head: true }).eq('addressee_id', uid).eq('status', 'pendiente'),
        sb.from('orders').select('id, seller_id, buyer_id, status').in('status', ['pendiente', 'aceptada', 'confirmada'])
      ]);
      setCount('cnt-amigos', fr.count || 0);
      const mine = (ord.data || []).filter((o) =>
        (o.seller_id === uid && (o.status === 'pendiente' || o.status === 'confirmada')) ||
        (o.buyer_id === uid && o.status === 'aceptada'));
      setCount('cnt-operaciones', mine.length);
      if (state.profile.role === 'admin') {
        const v = await sb.from('verifications').select('id', { count: 'exact', head: true }).eq('status', 'pendiente');
        setCount('cnt-admin', v.count || 0);
      }
    } catch (e) { /* los avisos son opcionales */ }
  }
  A.refreshCounts = refreshCounts;

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
  $('#pm-mine').addEventListener('click', () => { closeProfileMenu(); navigate('mia'); });
  $('#pm-verify').addEventListener('click', () => { closeProfileMenu(); if (A.openVerifyDialog) A.openVerifyDialog(); });
  $('#pm-pay').addEventListener('click', () => { closeProfileMenu(); if (A.openPaymentDialog) A.openPaymentDialog(); });
  $('#pm-logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    location.href = 'index.html';
  });

  $$('.nav-item[data-view]').forEach((b) =>
    b.addEventListener('click', () => navigate(b.dataset.view)));
  $('#nav-add').addEventListener('click', () => { closeDrawer(false); openItemDialog(); });
  $('#fab-add').addEventListener('click', () => openItemDialog());

  /* ------------------------------------------------------------------
     Diálogos: cerrar con [data-close] y al tocar el fondo (solo el detalle)
     ------------------------------------------------------------------ */
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) { closer.closest('dialog').close(); return; }
    if (e.target instanceof HTMLDialogElement && e.target.id === 'dlg-detail') e.target.close();
  });
  // Un enlace a otra pantalla dentro de un diálogo lo cierra.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('dialog a[href^="#"]');
    if (a) a.closest('dialog').close();
  });

  /* ------------------------------------------------------------------
     Navegación por hash: #todos, #perfil/roy, #ranking...
     ------------------------------------------------------------------ */
  let routeToken = 0;

  function navigate(name, param) {
    const h = '#' + name + (param ? '/' + encodeURIComponent(param) : '');
    if (location.hash === h) route(); else location.hash = h;
  }
  A.navigate = navigate;

  function setHead(title, sub, hidden) {
    $('#view-title').textContent = title || '';
    $('#view-sub').textContent = sub || '';
    $('.view-head').hidden = !!hidden;
    document.title = (title ? title + ' | ' : '') + 'Collection Quest';
  }
  A.setHead = setHead;

  async function route() {
    const my = ++routeToken;
    const raw = location.hash.slice(1);
    const [rawName, ...rest] = raw.split('/');
    let name = rawName || 'todos';
    let param = '';
    try { param = decodeURIComponent(rest.join('/')); } catch (e) { param = rest.join('/'); }
    if (name === 'mia') { name = 'perfil'; param = state.profile.username; }

    state.route = { name, param };
    closeDrawer(false);
    closeProfileMenu();

    const navKey = name === 'perfil' && param === state.profile.username ? 'mia' : name;
    $$('.nav-item[data-view]').forEach((b) => {
      if (b.dataset.view === navKey) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    const itemsPanel = $('#items-panel');
    const customPanel = $('#custom-panel');

    if (ITEM_VIEWS[name]) {
      customPanel.hidden = true;
      customPanel.innerHTML = '';
      itemsPanel.hidden = false;
      setHead(ITEM_VIEWS[name].title, ITEM_VIEWS[name].sub);
      mainList.load(true);
      loadPeopleStrip();
      return;
    }

    const def = A.views[name];
    if (!def || (def.adminOnly && state.profile.role !== 'admin')) { navigate('todos'); return; }

    itemsPanel.hidden = true;
    $('#people-strip').hidden = true;
    customPanel.hidden = false;
    customPanel.innerHTML = '<div class="empty"><p>Cargando…</p></div>';
    setHead(typeof def.title === 'function' ? def.title(param) : def.title, def.sub || '');
    try {
      await def.render(customPanel, param, () => my === routeToken);
    } catch (err) {
      if (my !== routeToken) return;
      customPanel.innerHTML = `<div class="empty">${icon('circle-alert', 'pink', 48)}<h3>No se pudo cargar esta pantalla</h3><p>${esc(friendlyError(err))}</p></div>`;
    }
    window.scrollTo(0, 0);
  }
  A.reloadRoute = route;
  window.addEventListener('hashchange', route);

  /* ------------------------------------------------------------------
     Búsqueda (artículos y coleccionistas) — ignora acentos, comas y puntos
     ------------------------------------------------------------------ */
  let searchTimer;
  function onSearch(q) {
    state.q = q;
    const v = state.route.name;
    if (ITEM_VIEWS[v]) { mainList.load(true); loadPeopleStrip(); }
    else if (A.views[v] && A.views[v].search) A.views[v].search(q);
    else navigate('todos');
  }
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => onSearch(e.target.value.trim()), 300);
  });
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(searchTimer);
    onSearch($('#search').value.trim());
  });

  async function fetchPeople(q, limit = 24, offset = 0) {
    let qb = sb.from('profiles').select(PROFILE_SELECT, { count: 'exact' });
    searchTokens(q).forEach((t) => { qb = qb.ilike('search_text', `%${t}%`); });
    return qb.order('points', { ascending: false }).order('username', { ascending: true }).range(offset, offset + limit - 1);
  }
  A.fetchPeople = fetchPeople;

  function personCardHTML(p) {
    const info = levelInfo(p.points);
    return `
      <a class="person-card" href="#perfil/${esc(encodeURIComponent(p.username))}">
        ${avatarHTML(p, 52)}
        <div class="who">
          <b>@${esc(p.username)}${verifiedBadge(p, 15)}</b>
          <small>Nivel ${info.level}: ${esc(info.title)}, ${p.points} pts</small>
          ${p.bio ? `<p>${esc(p.bio)}</p>` : ''}
        </div>
      </a>`;
  }
  A.personCardHTML = personCardHTML;

  let stripToken = 0;
  async function loadPeopleStrip() {
    const my = ++stripToken;
    const box = $('#people-strip');
    if (!searchTokens(state.q).length) { box.hidden = true; box.innerHTML = ''; return; }
    const { data } = await fetchPeople(state.q, 6);
    if (my !== stripToken) return;
    if (!data || !data.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.innerHTML = `<h2>Coleccionistas</h2><div class="people-grid">${data.map(personCardHTML).join('')}</div>`;
    box.hidden = false;
  }

  /* ------------------------------------------------------------------
     Tarjetas y listas de artículos (las usan todas las pantallas)
     ------------------------------------------------------------------ */
  function cardHTML(it) {
    const r = RARITY[it.rarity] || RARITY.comun;
    const l = LISTING[it.listing] || LISTING.exhibicion;
    const c = CATEGORIES[it.category];
    const img = safeImageUrl(it.image_url);
    return `
      <article class="card r-${esc(it.rarity)}" data-id="${esc(it.id)}" tabindex="0" role="button"
               aria-label="${esc(it.name)}, ${esc(r.label)}, ${esc(money(it.value))}">
        <div class="card-img">
          ${img
            ? `<img class="photo" loading="lazy" src="${esc(img)}" alt="">`
            : icon('package', 'muted', 52)}
          <span class="badge badge-rarity">${icon('gem', r.color, 14)}${esc(r.label)}</span>
          ${c ? `<span class="badge badge-cat">${icon(c.icon, 'white', 14)}${esc(c.label)}</span>` : ''}
          <span class="badge badge-listing l-${esc(it.listing)}">${icon(l.icon, l.color, 14)}${esc(l.label)}</span>
        </div>
        <div class="card-body">
          <h3>${esc(it.name)}</h3>
          <div class="card-foot">
            <span class="value">${money(it.value)}</span>
            <span class="owner">${avatarHTML(it.owner, 22)}<span>@${esc(it.owner?.username || '')}</span>${verifiedBadge(it.owner, 13)}</span>
          </div>
        </div>
      </article>`;
  }
  A.cardHTML = cardHTML;

  /* Lista paginada de artículos.
     opts.grid / opts.more: elementos HTML
     opts.scope(qb): filtros propios de la pantalla (por ejemplo, solo ventas)
     opts.getFilters(): { q, rarity, category, sort }
     opts.empty(filtered): HTML cuando no hay resultados  */
  function createItemList(opts) {
    let items = [];
    let total = 0;
    let page = 0;
    let req = 0;

    async function load(reset) {
      const my = ++req;
      if (reset) {
        page = 0;
        opts.grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join('');
        opts.more.hidden = true;
      }
      const f = opts.getFilters();
      let qb = sb.from('items').select(ITEM_SELECT, { count: 'exact' });
      qb = opts.scope(qb);
      if (f.rarity) qb = qb.eq('rarity', f.rarity);
      if (f.category) qb = qb.eq('category', f.category);
      searchTokens(f.q).forEach((t) => { qb = qb.ilike('search_text', `%${t}%`); });

      if (f.sort === 'rareza') qb = qb.order('points', { ascending: false }).order('value', { ascending: false });
      else if (f.sort === 'valor') qb = qb.order('value', { ascending: false });
      else if (f.sort === 'nombre') qb = qb.order('name', { ascending: true });
      else qb = qb.order('created_at', { ascending: false });
      qb = qb.order('id', { ascending: true });

      const from = page * PAGE_SIZE;
      qb = qb.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await qb;
      if (my !== req) return; // llegó una búsqueda más nueva

      if (error) {
        if (!reset) {
          // "Cargar más": un error NO debe borrar lo que ya se ve.
          if (error.code === 'PGRST103') { opts.more.hidden = true; return; } // ya no hay más
          page = Math.max(0, page - 1);
          opts.more.hidden = false;
          toast(friendlyError(error), 'error');
          return;
        }
        const noTables = error.code === '42P01' || /schema cache|does not exist|column/i.test(error.message || '');
        opts.grid.innerHTML = `
          <div class="empty">
            ${icon('circle-alert', 'pink', 48)}
            <h3>No se pudieron cargar los artículos</h3>
            <p>${noTables ? 'Faltan tablas o columnas. Ejecuta sql/schema.sql en el SQL Editor de Supabase.' : esc(friendlyError(error))}</p>
          </div>`;
        opts.more.hidden = true;
        return;
      }

      items = reset ? data : items.concat(data);
      total = count ?? items.length;
      data.forEach((it) => itemCache.set(it.id, it));
      render();
      if (opts.onCount) opts.onCount(total);
    }

    function render() {
      if (!items.length) {
        const f = opts.getFilters();
        const filtered = !!(searchTokens(f.q).length || f.rarity || f.category);
        opts.grid.innerHTML = opts.empty(filtered);
        const add = opts.grid.querySelector('[data-add]');
        if (add) add.addEventListener('click', () => openItemDialog());
        opts.more.hidden = true;
        return;
      }
      opts.grid.innerHTML = items.map(cardHTML).join('');
      opts.more.hidden = items.length >= total;
    }

    opts.more.addEventListener('click', async () => {
      opts.more.disabled = true;
      page += 1;
      await load(false);
      opts.more.disabled = false;
    });
    opts.grid.addEventListener('click', (e) => {
      const c = e.target.closest('.card[data-id]');
      if (c) openDetail(c.dataset.id);
    });
    opts.grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const c = e.target.closest('.card[data-id]');
      if (c) { e.preventDefault(); openDetail(c.dataset.id); }
    });

    return { load, get items() { return items; }, get total() { return total; } };
  }
  A.createItemList = createItemList;

  /* ----- Lista principal (Todos / Venta / Intercambio / Exhibición) ----- */
  const mainList = createItemList({
    grid: $('#grid'),
    more: $('#btn-more'),
    scope: (qb) => (ITEM_VIEWS[state.route.name] || ITEM_VIEWS.todos).scope(qb),
    getFilters: () => state,
    empty: (filtered) => {
      if (filtered) {
        return `<div class="empty">${icon('package', 'muted', 52)}<h3>No encontramos nada con esa búsqueda</h3><p>Prueba con otra palabra o quita los filtros.</p></div>`;
      }
      return `<div class="empty">${icon('package', 'muted', 52)}<h3>Aquí todavía no hay nada</h3><p>Sé la primera persona en publicar en esta sección.</p>
        <button class="btn btn-green" type="button" data-add>${icon('plus', 'dark', 20)}Registrar artículo</button></div>`;
    },
    onCount: (total) => {
      const v = ITEM_VIEWS[state.route.name];
      if (v) $('#view-sub').textContent = `${v.sub} ${total} ${total === 1 ? 'artículo' : 'artículos'}.`;
    }
  });

  /* ----- Filtros ----- */
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
    mainList.load(true);
  });

  $('#filter-category').innerHTML =
    '<option value="">Todas las categorías</option>' +
    CATEGORY_ORDER.map((k) => `<option value="${k}">${esc(CATEGORIES[k].plural)}</option>`).join('');
  $('#filter-category').addEventListener('change', (e) => {
    state.category = e.target.value;
    mainList.load(true);
  });
  $('#sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    mainList.load(true);
  });

  /* ------------------------------------------------------------------
     Detalle del artículo
     ------------------------------------------------------------------ */
  async function openDetail(id) {
    const it = itemCache.get(id);
    if (!it) return;
    const dlg = $('#dlg-detail');
    const r = RARITY[it.rarity] || RARITY.comun;
    const l = LISTING[it.listing] || LISTING.exhibicion;
    const c = CATEGORIES[it.category];
    const img = safeImageUrl(it.image_url);
    const mine = it.owner_id === uid;
    const isAdmin = state.profile.role === 'admin';
    const canDelete = mine || isAdmin;
    const delLabel = mine ? 'Eliminar' : 'Eliminar (admin)';
    const lvl = it.owner?.level || 1;
    const lvlTitle = levelInfo((lvl - 1) ** 2 * 25).title;
    const tradable = it.listing !== 'exhibicion';
    const canOrder = tradable && !mine;

    let contactBlock = '';
    if (canOrder) {
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
            ${c ? `<span class="badge">${icon(c.icon, 'white', 14)}${esc(c.label)}</span>` : ''}
            <span class="badge l-${esc(it.listing)}" style="--bc:${it.listing === 'venta' ? 'var(--green)' : it.listing === 'intercambio' ? 'var(--t-rara)' : 'var(--t-epica)'}">${icon(l.icon, l.color, 14)}${esc(l.label)}</span>
          </div>
          <p class="price">${money(it.value)}</p>
          <p class="desc">${it.description ? esc(it.description) : 'Sin descripción.'}</p>
          <a class="owner-box" href="#perfil/${esc(encodeURIComponent(it.owner?.username || ''))}" style="text-decoration:none;color:inherit">
            ${avatarHTML(it.owner, 44)}
            <div><b>@${esc(it.owner?.username || '')}${verifiedBadge(it.owner, 15)}</b><small>Nivel ${lvl}: ${esc(lvlTitle)}</small></div>
          </a>
          ${contactBlock}
          ${canOrder ? `<div id="det-order-slot" style="margin-bottom:14px">
              <button class="btn btn-green btn-block" type="button" id="det-order">
                ${icon(it.listing === 'venta' ? 'shopping-bag' : 'arrow-left-right', 'dark', 20)}${it.listing === 'venta' ? 'Comprar' : 'Proponer intercambio'}
              </button>
            </div>` : ''}
          ${canDelete ? `
            <div class="dlg-actions" style="justify-content:space-between">
              <button class="btn btn-red btn-sm" type="button" id="det-delete">${icon('trash-2', 'white', 18)}${delLabel}</button>
              ${mine ? `<button class="btn btn-sm" type="button" id="det-edit">${icon('pencil', 'white', 18)}Editar</button>` : ''}
            </div>` : ''}
        </div>
      </div>`;

    if (canOrder) {
      $('#det-order', dlg).addEventListener('click', () => {
        dlg.close();
        if (A.openOrderDialog) A.openOrderDialog(it);
      });
      // ¿ya hay una solicitud abierta para este artículo?
      sb.from('orders').select('id, status').eq('item_id', it.id).eq('buyer_id', uid)
        .in('status', ['pendiente', 'aceptada', 'confirmada']).limit(1)
        .then(({ data }) => {
          const slot = $('#det-order-slot', dlg);
          if (data && data.length && slot) {
            slot.innerHTML = `<p class="hint">Ya tienes una solicitud en curso para este artículo. <a href="#operaciones">Ver mis operaciones</a></p>`;
          }
        });
    }

    if (mine) {
      $('#det-edit', dlg).addEventListener('click', () => { dlg.close(); openItemDialog(it); });
    }
    if (canDelete) {
      const del = $('#det-delete', dlg);
      let armed = false;
      del.addEventListener('click', async () => {
        if (!armed) {
          armed = true;
          del.innerHTML = `${icon('trash-2', 'white', 18)}¿Seguro? Toca otra vez`;
          setTimeout(() => {
            if (armed && del.isConnected) { armed = false; del.innerHTML = `${icon('trash-2', 'white', 18)}${delLabel}`; }
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
  A.openDetail = openDetail;

  /* ------------------------------------------------------------------
     Registrar / editar artículo
     ------------------------------------------------------------------ */
  const dlgItem = $('#dlg-item');
  const itemForm = $('#item-form');
  const itemError = $('#item-error');
  let editing = null;
  let photoBlob = null;
  let photoUrl = null;

  $('#cat-grid').innerHTML = CATEGORY_ORDER.map((k) => `
    <div class="choice">
      <input type="radio" name="category" id="c-${k}" value="${k}">
      <label for="c-${k}">${icon(CATEGORIES[k].icon, 'white', 22)}${esc(CATEGORIES[k].label)}</label>
    </div>`).join('');

  function showItemError(msg) {
    itemError.innerHTML = `${icon('circle-alert', 'pink', 18)}<span>${esc(msg)}</span>`;
    itemError.classList.add('show');
  }

  function renderPhoto(url) {
    const drop = $('#photo-drop');
    drop.classList.remove('invalid');
    if (url) {
      drop.innerHTML = `<img class="photo" src="${esc(url)}" alt="Vista previa de la foto">`;
    } else {
      drop.innerHTML = `
        <div class="placeholder">
          ${icon('image', 'muted', 44)}
          <span>La foto es obligatoria: elige una de la galería o toma una</span>
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
      const cat = $(`input[name="category"][value="${item.category}"]`);
      if (cat) cat.checked = true;
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
  A.openItemDialog = openItemDialog;

  $('#item-value').addEventListener('input', updateRarityPreview);
  $('#item-desc').addEventListener('input', updateDescCount);

  async function setPhoto(fileOrBlob) {
    try {
      photoBlob = await compressImage(fileOrBlob, 1920, 0.88);
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
    const category = ($('input[name="category"]:checked') || {}).value;

    const hasPhoto = !!photoBlob || !!(editing && editing.image_url);
    if (!hasPhoto) {
      $('#photo-drop').classList.add('invalid');
      return showItemError('La foto del artículo es obligatoria.');
    }
    if (name.length < 2) return showItemError('Escribe el nombre del artículo (mínimo 2 letras).');
    if (!category) return showItemError('Elige la categoría del artículo.');
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

      const payload = { name, description, value, category, listing, image_url };
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

  // Tras crear, editar o borrar: se refrescan puntos, nivel y pantalla.
  async function afterChange() {
    const before = state.profile.level;
    await loadProfile();
    if (state.profile.level > before) {
      const info = levelInfo(state.profile.points);
      toast(`¡Subiste al nivel ${info.level}: ${info.title}!`);
    }
    refreshCounts();
    await route();
  }
  A.afterChange = afterChange;

  /* ------------------------------------------------------------------
     Editar perfil: avatar, banner y "sobre ti"
     ------------------------------------------------------------------ */
  const dlgProfile = $('#dlg-profile');
  const profileError = $('#profile-error');
  let pendingAvatar = null;
  let pendingAvatarUrl = null;
  let pendingBanner = null;
  let pendingBannerUrl = null;
  let removeBanner = false;

  function showProfileError(msg) {
    profileError.innerHTML = `${icon('circle-alert', 'pink', 18)}<span>${esc(msg)}</span>`;
    profileError.classList.add('show');
  }
  function renderBannerPreview(url) {
    $('#pf-banner').innerHTML = url ? `<img class="photo" src="${esc(url)}" alt="Vista previa del banner">` : '';
  }

  function openProfileDialog() {
    const p = state.profile;
    const info = levelInfo(p.points);
    pendingAvatar = null; pendingBanner = null; removeBanner = false;
    if (pendingAvatarUrl) { URL.revokeObjectURL(pendingAvatarUrl); pendingAvatarUrl = null; }
    if (pendingBannerUrl) { URL.revokeObjectURL(pendingBannerUrl); pendingBannerUrl = null; }
    profileError.classList.remove('show');

    renderBannerPreview(safeImageUrl(p.banner_url));
    $('#profile-avatar').innerHTML = avatarHTML(p, 76);
    $('#profile-level').textContent = `Nivel ${info.level}: ${info.title} (${info.points} pts)`;
    $('#pf-username').value = p.username;
    $('#pf-bio').value = p.bio || '';
    $('#pf-contact').value = p.contact || '';
    $('#bio-count').textContent = `${$('#pf-bio').value.length} / 300`;
    dlgProfile.showModal();
  }
  A.openProfileDialog = openProfileDialog;

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

  $('#btn-banner').addEventListener('click', () => $('#file-banner').click());
  $('#file-banner').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      pendingBanner = await compressImage(f, 1600, 0.85);
      removeBanner = false;
      if (pendingBannerUrl) URL.revokeObjectURL(pendingBannerUrl);
      pendingBannerUrl = URL.createObjectURL(pendingBanner);
      renderBannerPreview(pendingBannerUrl);
    } catch (err) {
      showProfileError(friendlyError(err));
    }
  });
  $('#btn-banner-remove').addEventListener('click', () => {
    pendingBanner = null;
    removeBanner = true;
    renderBannerPreview(null);
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
      const oldBanner = state.profile.banner_url;
      if (pendingAvatar) update.avatar_url = await uploadImage('avatars', pendingAvatar, uid);
      if (pendingBanner) update.banner_url = await uploadImage('banners', pendingBanner, uid);
      else if (removeBanner) update.banner_url = null;

      const { error } = await sb.from('profiles').update(update).eq('id', uid);
      if (error) throw error;
      if (pendingAvatar && oldAvatar) removeImageByUrl('avatars', oldAvatar);
      if ((pendingBanner || removeBanner) && oldBanner) removeImageByUrl('banners', oldBanner);

      dlgProfile.close();
      toast('Perfil actualizado.');
      await loadProfile();
      await route();
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
  await applyPendingAvatar();
  (window.CQ_MODULES || []).forEach((register) => register(A));
  refreshCounts();
  await route();
})();
