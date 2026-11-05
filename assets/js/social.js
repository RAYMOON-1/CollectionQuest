/* ============================================================
   Perfiles públicos, coleccionistas, amigos y ranking
   ============================================================ */
(window.CQ_MODULES = window.CQ_MODULES || []).push(function (A) {
  const {
    $, $$, esc, icon, sb, RARITY, RARITY_ORDER, CATEGORIES, CATEGORY_ORDER,
    levelInfo, safeImageUrl, avatarHTML, verifiedBadge, friendlyError, toast
  } = window.CQ;
  const { uid, state } = A;

  const MINI = 'id, username, avatar_url, avatar_color, level, points, verified, bio';

  /* ---------------------------------------------------------------
     Perfil público (también es "Mi colección" cuando eres tú)
     --------------------------------------------------------------- */
  let profileList = null;

  async function relationWith(otherId) {
    const { data } = await sb.from('friendships')
      .select('id, status, requester_id, addressee_id')
      .or(`and(requester_id.eq.${uid},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${uid})`)
      .maybeSingle();
    return data || null;
  }

  function friendActionsHTML(rel) {
    if (!rel) {
      return `<button class="btn btn-green" type="button" data-fa="add">${icon('user-plus', 'dark', 20)}Agregar amigo</button>`;
    }
    if (rel.status === 'aceptada') {
      return `<span class="status st-completada">${icon('user-check', 'green', 14)} Son amigos</span>
              <button class="btn btn-ghost btn-sm" type="button" data-fa="remove">${icon('user-minus', 'white', 18)}Quitar amigo</button>`;
    }
    if (rel.requester_id === uid) {
      return `<span class="status st-pendiente">Solicitud enviada</span>
              <button class="btn btn-ghost btn-sm" type="button" data-fa="cancel">Cancelar</button>`;
    }
    return `<button class="btn btn-green" type="button" data-fa="accept">${icon('check', 'dark', 20)}Aceptar solicitud</button>
            <button class="btn btn-ghost btn-sm" type="button" data-fa="cancel">Rechazar</button>`;
  }

  // Maneja los botones de amistad (agregar, aceptar, cancelar, quitar) en cualquier pantalla.
  async function runFriendAction(action, otherId, rel, btn) {
    btn.disabled = true;
    let error = null;
    if (action === 'add') {
      ({ error } = await sb.from('friendships').insert({ requester_id: uid, addressee_id: otherId }));
      if (!error) toast('Solicitud enviada.');
    } else if (action === 'accept') {
      ({ error } = await sb.from('friendships').update({ status: 'aceptada' }).eq('id', rel.id));
      if (!error) toast('¡Ahora son amigos!');
    } else if (action === 'cancel' || action === 'remove') {
      ({ error } = await sb.from('friendships').delete().eq('id', rel.id));
    }
    if (error) {
      btn.disabled = false;
      toast(error.code === '23505' ? 'Ya existe una solicitud entre ustedes. Recarga la pantalla.' : friendlyError(error), 'error');
      return;
    }
    A.refreshCounts();
    A.reloadRoute();
  }

  A.views.perfil = {
    title: '',
    async render(panel, username, isCurrent) {
      const { data: p, error } = await sb.from('profiles').select(A.PROFILE_SELECT).eq('username', username).maybeSingle();
      if (error) throw error;
      if (!isCurrent()) return;
      if (!p) {
        A.setHead('Perfil no encontrado', '');
        panel.innerHTML = `<div class="empty">${icon('users', 'muted', 52)}<h3>No encontramos a @${esc(username)}</h3>
          <p>Puede que haya cambiado su nombre de usuario.</p>
          <a class="btn" href="#personas">Buscar coleccionistas</a></div>`;
        return;
      }

      const me = p.id === uid;
      const [fc, relRes, rarityRes] = await Promise.all([
        sb.rpc('friend_count', { p_user: p.id }),
        me ? Promise.resolve(null) : relationWith(p.id),
        sb.from('items').select('rarity').eq('owner_id', p.id)
      ]);
      if (!isCurrent()) return;

      const rel = relRes;
      const rows = rarityRes.data || [];
      const counts = {};
      RARITY_ORDER.forEach((k) => (counts[k] = 0));
      rows.forEach((r) => { if (counts[r.rarity] !== undefined) counts[r.rarity]++; });
      const info = levelInfo(p.points);
      const banner = safeImageUrl(p.banner_url);

      A.setHead('', '', true);
      document.title = `@${p.username} | Collection Quest`;

      panel.innerHTML = `
        <section class="profile-hero" aria-label="Perfil de @${esc(p.username)}">
          <div class="banner">${banner ? `<img class="photo" src="${esc(banner)}" alt="">` : ''}</div>
          <div class="hero-body">
            <span class="hero-avatar">${avatarHTML(p, 104)}</span>
            <div class="hero-row">
              <div>
                <h1 class="hero-name">@${esc(p.username)}${verifiedBadge(p, 26)}</h1>
                <div class="hero-meta">
                  <span class="lvl">Nivel ${info.level}: ${esc(info.title)}</span>
                  <span>${p.points} puntos</span>
                  ${p.role === 'admin' ? '<span>Administrador</span>' : ''}
                </div>
              </div>
              <div class="hero-actions" id="hero-actions">
                ${me
                  ? `<button class="btn" type="button" data-fa="edit">${icon('pencil', 'white', 18)}Editar perfil</button>
                     ${p.verified ? '' : `<button class="btn btn-ghost" type="button" data-fa="verify">${icon('badge-check', 'green', 18)}Verificar perfil</button>`}`
                  : friendActionsHTML(rel)}
              </div>
            </div>
            ${p.bio ? `<p class="hero-bio">${esc(p.bio)}</p>` : (me ? '<p class="hero-bio hint">Aún no escribes nada sobre ti. Toca Editar perfil.</p>' : '')}
            <div class="xp" style="margin-top:16px;max-width:420px" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${info.pct}" aria-label="Progreso al siguiente nivel"><i style="width:${info.pct}%"></i></div>
            <div class="xp-meta" style="max-width:420px"><span>${info.points} pts</span><span>${info.toNext} para el nivel ${info.level + 1}</span></div>
            <div class="hero-stats">
              <div class="mini-stat"><b>${rows.length}</b>piezas</div>
              <div class="mini-stat"><b>${fc.data ?? 0}</b>amigos</div>
              ${RARITY_ORDER.map((k) => `<div class="mini-stat" style="color:${RARITY[k].hex}"><b style="color:${RARITY[k].hex}">${counts[k]}</b>${esc(RARITY[k].label.toLowerCase())}${counts[k] === 1 ? '' : 's'}</div>`).join('')}
            </div>
          </div>
        </section>

        <h2 class="section-title">${me ? 'Mi colección' : `Colección de @${esc(p.username)}`}</h2>
        <div class="toolbar">
          <label class="sr-only" for="pr-cat">Categoría</label>
          <select class="input filter" id="pr-cat">
            <option value="">Todas las categorías</option>
            ${CATEGORY_ORDER.map((k) => `<option value="${k}">${esc(CATEGORIES[k].plural)}</option>`).join('')}
          </select>
          <label class="sr-only" for="pr-sort">Ordenar por</label>
          <select class="input sort" id="pr-sort">
            <option value="recientes">Más recientes</option>
            <option value="rareza">Mayor rareza</option>
            <option value="valor">Mayor valor</option>
            <option value="nombre">Nombre (A–Z)</option>
          </select>
        </div>
        <div class="grid" id="pr-grid" aria-live="polite"></div>
        <div class="more"><button class="btn btn-ghost" id="pr-more" type="button" hidden>Cargar más</button></div>`;

      // botones del encabezado
      $('#hero-actions', panel).addEventListener('click', (e) => {
        const b = e.target.closest('[data-fa]');
        if (!b) return;
        const a = b.dataset.fa;
        if (a === 'edit') return A.openProfileDialog();
        if (a === 'verify') return A.openVerifyDialog && A.openVerifyDialog();
        if (a === 'remove' && !b.dataset.armed) {
          b.dataset.armed = '1';
          b.textContent = '¿Seguro? Toca otra vez';
          setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.innerHTML = `${icon('user-minus', 'white', 18)}Quitar amigo`; } }, 4000);
          return;
        }
        runFriendAction(a, p.id, rel, b);
      });

      // colección
      const f = { cat: '', sort: 'recientes' };
      profileList = A.createItemList({
        grid: $('#pr-grid', panel),
        more: $('#pr-more', panel),
        scope: (qb) => qb.eq('owner_id', p.id),
        getFilters: () => ({ q: state.q, rarity: '', category: f.cat, sort: f.sort }),
        empty: (filtered) => filtered
          ? `<div class="empty">${icon('package', 'muted', 52)}<h3>Nada con ese filtro</h3><p>Prueba con otra palabra o categoría.</p></div>`
          : `<div class="empty">${icon('package', 'muted', 52)}<h3>${me ? 'Tu colección está vacía' : 'Todavía no tiene artículos'}</h3>
              <p>${me ? 'Registra tu primera pieza y el sistema le asignará su rareza.' : 'Vuelve más tarde.'}</p>
              ${me ? `<button class="btn btn-green" type="button" data-add>${icon('plus', 'dark', 20)}Registrar mi primer artículo</button>` : ''}</div>`
      });
      $('#pr-cat', panel).addEventListener('change', (e) => { f.cat = e.target.value; profileList.load(true); });
      $('#pr-sort', panel).addEventListener('change', (e) => { f.sort = e.target.value; profileList.load(true); });
      profileList.load(true);
    },
    search() { if (profileList) profileList.load(true); }
  };

  /* ---------------------------------------------------------------
     Coleccionistas (buscar perfiles)
     --------------------------------------------------------------- */
  const peopleState = { offset: 0, token: 0 };

  async function loadPeople(panel, reset) {
    const my = ++peopleState.token;
    const grid = $('#pp-grid', panel);
    const more = $('#pp-more', panel);
    if (reset) { peopleState.offset = 0; grid.innerHTML = '<div class="empty"><p>Buscando…</p></div>'; more.hidden = true; }
    const { data, count, error } = await A.fetchPeople(state.q, A.PAGE_SIZE, peopleState.offset);
    if (my !== peopleState.token) return;
    if (error) {
      if (!reset) { toast(friendlyError(error), 'error'); more.hidden = false; peopleState.offset -= A.PAGE_SIZE; return; }
      grid.innerHTML = `<div class="empty">${icon('circle-alert', 'pink', 48)}<h3>No se pudo buscar</h3><p>${esc(friendlyError(error))}</p></div>`;
      return;
    }
    if (reset && !data.length) {
      grid.innerHTML = `<div class="empty">${icon('users', 'muted', 52)}<h3>No encontramos coleccionistas</h3><p>Prueba con otro nombre. La búsqueda ignora acentos, comas y puntos.</p></div>`;
      more.hidden = true;
      return;
    }
    const html = data.map(A.personCardHTML).join('');
    if (reset) grid.innerHTML = html; else grid.insertAdjacentHTML('beforeend', html);
    peopleState.offset += data.length;
    more.hidden = peopleState.offset >= (count ?? 0);
  }

  let peoplePanel = null;
  A.views.personas = {
    title: 'Coleccionistas',
    sub: 'Encuentra a otros coleccionistas y agrégalos como amigos. Usa la barra de arriba para buscar por nombre.',
    async render(panel) {
      peoplePanel = panel;
      panel.innerHTML = `<div class="people-grid" id="pp-grid"></div>
        <div class="more"><button class="btn btn-ghost" id="pp-more" type="button" hidden>Cargar más</button></div>`;
      $('#pp-more', panel).addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        await loadPeople(panel, false);
        e.currentTarget.disabled = false;
      });
      await loadPeople(panel, true);
    },
    search() { if (peoplePanel && peoplePanel.isConnected) loadPeople(peoplePanel, true); }
  };

  /* ---------------------------------------------------------------
     Ranking por puntos
     --------------------------------------------------------------- */
  A.views.ranking = {
    title: 'Ranking',
    sub: 'Los coleccionistas con más puntos. Cada pieza suma según su rareza.',
    async render(panel, _p, isCurrent) {
      const { data, error } = await sb.from('profiles').select(A.PROFILE_SELECT)
        .gt('points', 0).order('points', { ascending: false }).order('username', { ascending: true }).limit(50);
      if (error) throw error;
      if (!isCurrent()) return;

      const myPts = state.profile.points;
      let myBlock = '';
      if (myPts > 0) {
        const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true }).gt('points', myPts);
        myBlock = `<div class="my-rank">${icon('trophy', 'gold', 30)}<div><b>Tu posición: #${(count || 0) + 1}</b><br><span class="hint">${myPts} puntos, nivel ${levelInfo(myPts).level}</span></div></div>`;
      } else {
        myBlock = `<div class="my-rank">${icon('trophy', 'muted', 30)}<div><b>Todavía no estás en el ranking</b><br><span class="hint">Registra tu primer artículo para sumar puntos.</span></div></div>`;
      }
      if (!isCurrent()) return;

      if (!data.length) {
        panel.innerHTML = myBlock + `<div class="empty">${icon('trophy', 'muted', 52)}<h3>Aún no hay nadie en el ranking</h3><p>Sé la primera persona en sumar puntos.</p></div>`;
        return;
      }
      panel.innerHTML = myBlock + `<ol class="rank-list" style="list-style:none;padding:0;margin:0">${data.map((p, i) => {
        const info = levelInfo(p.points);
        const pos = i + 1;
        return `<li><a class="rank-row ${p.id === uid ? 'me' : ''}" href="#perfil/${esc(encodeURIComponent(p.username))}">
          <span class="rank-pos ${pos <= 3 ? 'p' + pos : ''}">${pos === 1 ? icon('crown', 'gold', 24) : '#' + pos}</span>
          ${avatarHTML(p, 46)}
          <span class="rank-info"><b>@${esc(p.username)}${verifiedBadge(p, 15)}</b><small>Nivel ${info.level}: ${esc(info.title)}</small></span>
          <span class="rank-pts">${p.points}<small>puntos</small></span>
        </a></li>`;
      }).join('')}</ol>`;
    }
  };

  /* ---------------------------------------------------------------
     Amigos
     --------------------------------------------------------------- */
  let friendsTab = 'amigos';

  A.views.amigos = {
    title: 'Amigos',
    sub: 'Tus amigos y las solicitudes pendientes.',
    async render(panel, _p, isCurrent) {
      const emb = (alias, fk) => `${alias}:profiles!${fk}(${MINI})`;
      const { data, error } = await sb.from('friendships')
        .select(`id, status, requester_id, addressee_id, created_at, ${emb('requester', 'requester_id')}, ${emb('addressee', 'addressee_id')}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!isCurrent()) return;

      const rows = data || [];
      const friends = rows.filter((r) => r.status === 'aceptada');
      const received = rows.filter((r) => r.status === 'pendiente' && r.addressee_id === uid);
      const sent = rows.filter((r) => r.status === 'pendiente' && r.requester_id === uid);
      if (friendsTab === 'amigos' && !friends.length && received.length) friendsTab = 'recibidas';

      const lists = { amigos: friends, recibidas: received, enviadas: sent };
      const tabLabel = { amigos: 'Amigos', recibidas: 'Recibidas', enviadas: 'Enviadas' };
      const other = (r) => (r.requester_id === uid ? r.addressee : r.requester);

      const emptyText = {
        amigos: 'Todavía no tienes amigos agregados. Busca coleccionistas y manda tu primera solicitud.',
        recibidas: 'No tienes solicitudes pendientes.',
        enviadas: 'No has enviado solicitudes pendientes.'
      };

      function draw() {
        const list = lists[friendsTab];
        panel.innerHTML = `
          <div class="tabs-inline" role="tablist" aria-label="Amigos">
            ${Object.keys(lists).map((k) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${friendsTab === k}">${tabLabel[k]} (${lists[k].length})</button>`).join('')}
          </div>
          ${list.length ? `<div class="people-grid">${list.map((r) => `
              <div>
                ${A.personCardHTML(other(r))}
                <div class="order-actions" style="margin-top:8px">
                  ${friendsTab === 'recibidas'
                    ? `<button class="btn btn-green btn-sm" type="button" data-act="accept" data-id="${esc(r.id)}">${icon('check', 'dark', 16)}Aceptar</button>
                       <button class="btn btn-ghost btn-sm" type="button" data-act="cancel" data-id="${esc(r.id)}">Rechazar</button>`
                    : friendsTab === 'enviadas'
                      ? `<button class="btn btn-ghost btn-sm" type="button" data-act="cancel" data-id="${esc(r.id)}">Cancelar solicitud</button>`
                      : `<button class="btn btn-ghost btn-sm" type="button" data-act="remove" data-id="${esc(r.id)}">Quitar amigo</button>`}
                </div>
              </div>`).join('')}</div>`
            : `<div class="empty">${icon('users', 'muted', 52)}<h3>${esc(emptyText[friendsTab])}</h3><a class="btn" href="#personas">Buscar coleccionistas</a></div>`}`;
      }
      draw();

      panel.onclick = async (e) => {
        const t = e.target.closest('[data-tab]');
        if (t) { friendsTab = t.dataset.tab; draw(); return; }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'remove' && !b.dataset.armed) {
          b.dataset.armed = '1';
          b.textContent = '¿Seguro? Toca otra vez';
          setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Quitar amigo'; } }, 4000);
          return;
        }
        b.disabled = true;
        const { error: err } = b.dataset.act === 'accept'
          ? await sb.from('friendships').update({ status: 'aceptada' }).eq('id', b.dataset.id)
          : await sb.from('friendships').delete().eq('id', b.dataset.id);
        if (err) { b.disabled = false; toast(friendlyError(err), 'error'); return; }
        if (b.dataset.act === 'accept') toast('¡Ahora son amigos!');
        A.refreshCounts();
        A.reloadRoute();
      };
    }
  };
});
