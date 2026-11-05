/* ============================================================
   Subastas con pujas en tiempo real.
   - Realtime de Supabase: cada puja llega al instante a todas las pantallas abiertas.
   - Si Realtime no está activo en tu proyecto, la página consulta cada 3 segundos.
   - Cuenta regresiva en vivo; pujar en los últimos 2 minutos alarga la subasta 2 minutos.
   Una puja es un compromiso de compra: al terminar, quien gana recibe una operación para pagar.
   ============================================================ */
(window.CQ_MODULES = window.CQ_MODULES || []).push(function (A) {
  const {
    $, esc, icon, sb, money, RARITY, CATEGORIES, safeImageUrl, avatarHTML, verifiedBadge,
    friendlyError, toast, fmtCountdown
  } = window.CQ;
  const { uid } = A;

  function ensureDialog(id, label) {
    let d = document.getElementById(id);
    if (!d) {
      d = document.createElement('dialog');
      d.id = id;
      d.setAttribute('aria-label', label);
      document.body.appendChild(d);
    }
    return d;
  }
  const ago = (iso) => {
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 1000));
    if (s < 60) return `hace ${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
  };

  A.openAuctionDialog = async function (item) {
    const dlg = ensureDialog('dlg-auction', 'Subasta');
    dlg.innerHTML = `<div class="dlg-body"><p class="hint">Cargando subasta…</p></div>`;
    dlg.showModal();

    const mine = item.owner_id === uid;
    let a = null;
    let bids = [];
    let built = false;
    let closed = false;
    let subscribed = false;
    let dirty = false;
    let finalizing = false;
    let actionsKey = '';
    let topBidId = null;
    let timer = null;
    let poll = null;
    let channel = null;
    let pollN = 0;

    const cleanup = () => {
      closed = true;
      clearInterval(timer);
      clearInterval(poll);
      if (channel) { try { sb.removeChannel(channel); } catch (e) { /* nada */ } }
    };
    dlg.addEventListener('close', cleanup, { once: true });

    async function load() {
      const [ar, br] = await Promise.all([
        sb.from('auctions')
          .select('*, bidder:profiles!current_bidder(id, username, avatar_url, avatar_color, verified)')
          .eq('item_id', item.id).maybeSingle(),
        sb.from('bids')
          .select('id, amount, created_at, bidder:profiles!bidder_id(id, username, avatar_url, avatar_color, verified)')
          .eq('item_id', item.id).order('created_at', { ascending: false }).limit(10)
      ]);
      if (closed) return;
      if (ar.error) { toast(friendlyError(ar.error), 'error'); return; }
      const prev = a;
      a = ar.data;
      bids = br.data || [];
      if (built && a) {
        if (prev && prev.current_bidder === uid && a.current_bidder !== uid && a.status === 'activa' && a.bid_count > prev.bid_count) {
          toast(`Te superaron en la subasta de ${item.name}. ¡Puja de nuevo!`, 'error');
        }
        paint();
      }
    }

    try { await sb.rpc('finalize_expired_auctions'); } catch (e) { /* nada */ }
    await load();
    if (closed) return;
    if (!a) {
      dlg.innerHTML = `<div class="dlg-head"><h2>Subasta</h2><button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 'white', 22)}</button></div>
        <div class="dlg-body"><p>Esta subasta no está disponible.</p></div>`;
      return;
    }

    /* ---------- estructura fija ---------- */
    const r = RARITY[item.rarity] || RARITY.comun;
    const c = CATEGORIES[item.category];
    const img = safeImageUrl(item.image_url);
    dlg.innerHTML = `
      <div class="detail r-${esc(item.rarity)}">
        <div class="detail-img">${img ? `<img class="photo" src="${esc(img)}" alt="${esc(item.name)}">` : icon('package', 'muted', 72)}</div>
        <div class="dlg-body">
          <div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
            <h2>${esc(item.name)}</h2>
            <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 'white', 22)}</button>
          </div>
          <div class="meta">
            <span class="badge" style="--bc:${r.hex}">${icon('gem', r.color, 14)}${esc(r.label)}</span>
            ${c ? `<span class="badge">${icon(c.icon, 'white', 14)}${esc(c.label)}</span>` : ''}
            <span class="badge" style="--bc:var(--pink)">${icon('gavel', 'pink', 14)}Subasta</span>
          </div>
          <p class="desc">${item.description ? esc(item.description) : 'Sin descripción.'}</p>
          <a class="owner-box" href="#perfil/${esc(encodeURIComponent(item.owner?.username || ''))}" style="text-decoration:none;color:inherit">
            ${avatarHTML(item.owner, 44)}
            <div><b>@${esc(item.owner?.username || '')}${verifiedBadge(item.owner, 15)}</b><small>Vendedor</small></div>
          </a>
          <div class="au-box" aria-live="polite">
            <p class="au-label" id="au-label"></p>
            <p class="au-price" id="au-price"></p>
            <p class="au-leader" id="au-leader"></p>
            <div class="au-timer" id="au-timerbox">${icon('timer', 'white', 20)}<span id="au-time"></span></div>
          </div>
          <div id="au-actions"></div>
          <h3 style="margin:16px 0 6px;font-size:1.1rem">Pujas recientes</h3>
          <ol class="au-bids" id="au-bids"></ol>
        </div>
      </div>`;
    built = true;

    /* ---------- partes que cambian en vivo ---------- */
    function state() {
      const ms = new Date(a.ends_at) - Date.now();
      const live = a.status === 'activa' && ms > 0;
      return { ms, live };
    }

    function paintActions(live) {
      const key = live ? (mine ? (a.bid_count > 0 ? 'mine-bids' : 'mine-free') : 'bid') : 'ended:' + a.status;
      if (key === actionsKey) return;
      actionsKey = key;
      const box = $('#au-actions', dlg);
      if (live && !mine) {
        box.innerHTML = `
          <div class="form-error" id="au-error" role="alert"></div>
          <form class="au-form" id="au-form" novalidate>
            <div class="field">
              <label for="au-amount">Tu puja ($)</label>
              <input class="input" id="au-amount" type="number" step="0.01" inputmode="decimal">
              <span class="hint" id="au-min"></span>
            </div>
            <button class="btn btn-pink" type="submit" id="au-go">${icon('gavel', 'white', 20)}Pujar</button>
          </form>
          <p class="hint">Una puja es un compromiso de compra: si nadie te supera, deberás pagar. Collection Quest no procesa pagos.</p>`;
        $('#au-amount', dlg).addEventListener('input', () => { dirty = true; });
        $('#au-form', dlg).addEventListener('submit', onBid);
      } else if (live && mine) {
        box.innerHTML = a.bid_count > 0
          ? `<div class="notice">Es tu subasta. Ya tiene pujas, así que no se puede cancelar ni editar el artículo.</div>`
          : `<div class="notice">Es tu subasta y todavía no tiene pujas.</div>
             <button class="btn btn-red btn-sm" type="button" id="au-cancel">${icon('trash-2', 'white', 16)}Cancelar subasta</button>`;
        const cb = $('#au-cancel', dlg);
        if (cb) cb.addEventListener('click', onCancel);
      } else {
        let html = '';
        if (a.status === 'cancelada') {
          html = '<div class="notice">El vendedor canceló esta subasta.</div>';
        } else if (a.current_bidder) {
          const w = a.bidder?.username || '';
          if (a.current_bidder === uid) {
            html = `<div class="diff-box same"><b>¡Ganaste!</b> Pagas ${money(a.current_bid)} a @${esc(item.owner?.username || '')}. Elige cómo pagar en tus operaciones.</div>
                    <a class="btn btn-green btn-block" href="#operaciones">Ir a pagar</a>`;
          } else if (mine) {
            html = `<div class="diff-box same">Ganó <b>@${esc(w)}</b> con ${money(a.current_bid)}. Revisa Ventas e intercambios para cobrar.</div>
                    <a class="btn btn-block" href="#operaciones">Ver mis operaciones</a>`;
          } else {
            html = `<div class="notice">Ganó @${esc(w)} con ${money(a.current_bid)}.</div>`;
          }
        } else {
          html = '<div class="notice">La subasta terminó sin pujas.</div>';
        }
        box.innerHTML = html;
      }
    }

    function paint() {
      if (!a || closed) return;
      const { ms, live } = state();
      const hasBid = a.current_bid != null;
      $('#au-label', dlg).textContent = live ? (hasBid ? 'Puja actual' : 'Precio inicial') : (hasBid ? 'Puja ganadora' : 'Precio inicial');
      $('#au-price', dlg).textContent = money(hasBid ? a.current_bid : a.start_price);
      $('#au-leader', dlg).innerHTML = live
        ? (a.current_bidder
            ? (a.current_bidder === uid ? '<b>Tú llevas la puja más alta</b>' : `@${esc(a.bidder?.username || '')} lleva la puja más alta`)
            : 'Todavía no hay pujas: sé la primera persona.')
        : (a.status === 'cancelada' ? 'Subasta cancelada' : 'Subasta terminada');
      $('#au-time', dlg).textContent = live ? fmtCountdown(ms) : 'Terminó';
      $('#au-timerbox', dlg).classList.toggle('hot', live && ms < 60000);

      paintActions(live);

      if (live && !mine) {
        const min = hasBid ? Number(a.current_bid) + Number(a.min_increment) : Number(a.start_price);
        const input = $('#au-amount', dlg);
        $('#au-min', dlg).textContent = `Puja mínima: ${money(min)}`;
        input.min = String(min);
        if (!dirty || Number(input.value) < min) { input.value = min.toFixed(2); dirty = false; }
        const leader = a.current_bidder === uid;
        input.disabled = leader;
        $('#au-go', dlg).disabled = leader;
        if (leader) $('#au-min', dlg).textContent = 'Ya llevas la puja más alta. Espera a que alguien te supere.';
      }

      const list = $('#au-bids', dlg);
      list.innerHTML = bids.length
        ? bids.map((b, i) => `<li class="${i === 0 ? 'top' : ''}" data-bid="${esc(b.id)}">
              ${avatarHTML(b.bidder, 32)}
              <span class="who"><b>@${esc(b.bidder?.username || '')}</b>${verifiedBadge(b.bidder, 13)}<small>${esc(ago(b.created_at))}</small></span>
              <span class="amt">${money(b.amount)}</span></li>`).join('')
        : '<li><span class="who">Todavía no hay pujas.</span></li>';
      if (bids[0] && bids[0].id !== topBidId) {
        if (topBidId !== null) list.firstElementChild.classList.add('au-flash');
        topBidId = bids[0].id;
      }
    }

    /* ---------- acciones ---------- */
    async function onBid(e) {
      e.preventDefault();
      const err = $('#au-error', dlg);
      err.classList.remove('show');
      const fail = (m) => { err.innerHTML = `${icon('circle-alert', 'pink', 18)}<span>${esc(m)}</span>`; err.classList.add('show'); };
      const amount = parseFloat($('#au-amount', dlg).value);
      const min = a.current_bid != null ? Number(a.current_bid) + Number(a.min_increment) : Number(a.start_price);
      if (!Number.isFinite(amount)) return fail('Escribe cuánto quieres pujar.');
      if (amount < min) return fail(`La puja mínima es ${money(min)}.`);

      const go = await A.confirm({
        title: 'Confirmar puja',
        html: `<p>Vas a pujar <b>${money(amount)}</b> por <b>${esc(item.name)}</b>.</p>
               <p class="warn">Una puja es un compromiso de compra: si nadie te supera, deberás pagarle a @${esc(item.owner?.username || '')} directamente. Collection Quest no procesa pagos.</p>`,
        confirmLabel: 'Sí, pujar'
      });
      if (!go) return;

      const btn = $('#au-go', dlg);
      btn.disabled = true;
      const { error } = await sb.rpc('place_bid', { p_item: item.id, p_amount: amount });
      if (error) {
        fail(friendlyError(error));
        btn.disabled = false;
        await load();
        return;
      }
      dirty = false;
      toast('¡Puja enviada!');
      await load();
    }

    async function onCancel() {
      const go = await A.confirm({
        title: 'Cancelar la subasta',
        html: '<p>El artículo volverá a exhibición. Solo puedes cancelar si nadie ha pujado.</p>',
        confirmLabel: 'Sí, cancelar subasta', tone: 'danger'
      });
      if (!go) return;
      const { error } = await sb.rpc('cancel_auction', { p_item: item.id });
      if (error) { toast(friendlyError(error), 'error'); return; }
      dlg.close();
      toast('Subasta cancelada.');
      A.afterChange();
    }

    paint();

    /* ---------- reloj, tiempo real y respaldo ---------- */
    timer = setInterval(async () => {
      if (closed || !a) return;
      const { ms, live } = state();
      $('#au-time', dlg).textContent = live ? fmtCountdown(ms) : 'Terminó';
      $('#au-timerbox', dlg).classList.toggle('hot', live && ms < 60000);
      if (!live && a.status === 'activa' && !finalizing) {
        finalizing = true;
        try { await sb.rpc('finalize_expired_auctions'); } catch (e) { /* nada */ }
        await load();
        finalizing = false;
      }
    }, 1000);

    try {
      channel = sb.channel('auction-' + item.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions', filter: `item_id=eq.${item.id}` }, () => load())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `item_id=eq.${item.id}` }, () => load())
        .subscribe((status) => { subscribed = status === 'SUBSCRIBED'; });
    } catch (e) { subscribed = false; }

    // Respaldo: si Realtime no está activo, se consulta cada 3 segundos (y cada 15 si sí lo está).
    poll = setInterval(() => {
      pollN += 1;
      if (!subscribed || pollN % 5 === 0) load();
    }, 3000);
  };
});
