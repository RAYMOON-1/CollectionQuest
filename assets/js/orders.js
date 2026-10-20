/* ============================================================
   Ventas e intercambios, con método de pago.
   Aquí NO se procesan pagos: el dinero va directo entre las dos
   personas (efectivo, transferencia o un enlace de pago del vendedor).
   ============================================================ */
(window.CQ_MODULES = window.CQ_MODULES || []).push(function (A) {
  const {
    $, $$, esc, icon, sb, money, RARITY, safeImageUrl, avatarHTML, verifiedBadge, friendlyError, toast
  } = window.CQ;
  const { uid, state } = A;

  const METHOD = {
    efectivo:      { label: 'Efectivo al entregar',                  icon: 'banknote'    },
    transferencia: { label: 'Transferencia bancaria',                icon: 'landmark'    },
    enlace:        { label: 'Enlace de pago (Mercado Pago, PayPal…)', icon: 'link'        }
  };
  const STATUS = {
    pendiente: 'Pendiente', aceptada: 'Aceptada', confirmada: 'Pago confirmado',
    completada: 'Completada', rechazada: 'Rechazada', cancelada: 'Cancelada'
  };
  const SAFETY = 'Collection Quest no procesa pagos. Nunca compartas el número de tu tarjeta ni tu NIP, y verifica que los datos sean de la persona con la que tratas.';

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
  const head = (title) => `
    <div class="dlg-head"><h2>${esc(title)}</h2>
      <button class="icon-btn" type="button" data-close aria-label="Cerrar">${icon('x', 'white', 22)}</button></div>`;

  /* ---------------------------------------------------------------
     Pedir comprar / proponer intercambio
     --------------------------------------------------------------- */
  A.openOrderDialog = async function (it) {
    const dlg = ensureDialog('dlg-order', 'Solicitud');
    const isSale = it.listing === 'venta';
    dlg.innerHTML = `${head(isSale ? 'Comprar' : 'Proponer intercambio')}<div class="dlg-body"><p class="hint">Cargando…</p></div>`;
    dlg.showModal();

    let body = '';
    if (isSale) {
      const { data: methods, error } = await sb.rpc('seller_methods', { p_seller: it.owner_id });
      if (error) { dlg.querySelector('.dlg-body').innerHTML = `<p>${esc(friendlyError(error))}</p>`; return; }
      const list = methods && methods.length ? methods : ['efectivo'];
      body = `
        <p><b>${esc(it.name)}</b> de @${esc(it.owner?.username || '')}: <b>${money(it.value)}</b></p>
        <p class="hint" style="margin:6px 0 14px">Elige cómo vas a pagar. Los datos de pago de la persona se muestran cuando acepte tu solicitud.</p>
        <div class="method-list" role="radiogroup" aria-label="Método de pago">
          ${list.map((m, i) => `
            <div class="pick"><input type="radio" name="method" id="m-${m}" value="${m}" ${i === 0 ? 'checked' : ''}>
              <label for="m-${m}">${icon(METHOD[m].icon, 'white', 24)}${esc(METHOD[m].label)}</label></div>`).join('')}
        </div>`;
    } else {
      const { data: mine } = await sb.from('items').select('id, name, value, rarity, image_url')
        .eq('owner_id', uid).order('created_at', { ascending: false }).limit(60);
      if (!mine || !mine.length) {
        dlg.querySelector('.dlg-body').innerHTML = `
          <p>Para proponer un intercambio necesitas tener al menos un artículo en tu colección.</p>
          <div class="dlg-actions"><button class="btn btn-green" type="button" id="od-add">${icon('plus', 'dark', 20)}Registrar artículo</button></div>`;
        $('#od-add', dlg).addEventListener('click', () => { dlg.close(); A.openItemDialog(); });
        return;
      }
      body = `
        <p>Quieres: <b>${esc(it.name)}</b> (${money(it.value)}) de @${esc(it.owner?.username || '')}</p>
        <p class="label" style="font-weight:600;margin:12px 0 6px">¿Qué ofreces a cambio?</p>
        <div class="pick-list" role="radiogroup" aria-label="Artículo que ofreces">
          ${mine.map((m, i) => {
            const img = safeImageUrl(m.image_url);
            return `<div class="pick"><input type="radio" name="offered" id="of-${esc(m.id)}" value="${esc(m.id)}" ${i === 0 ? 'checked' : ''}>
              <label for="of-${esc(m.id)}">${img ? `<img class="thumb" src="${esc(img)}" alt="">` : icon('package', 'muted', 40)}
                <span>${esc(m.name)}<small>${esc((RARITY[m.rarity] || {}).label || '')}, ${money(m.value)}</small></span></label></div>`;
          }).join('')}
        </div>`;
    }

    dlg.querySelector('.dlg-body').innerHTML = `
      <form id="od-form" novalidate>
        <div class="form-error" id="od-error" role="alert"></div>
        ${body}
        <div class="field">
          <label for="od-note">Mensaje (opcional)</label>
          <textarea class="input" id="od-note" maxlength="300" placeholder="Ej. Puedo pasar por ella el sábado."></textarea>
        </div>
        <div class="notice">${esc(SAFETY)}</div>
        <div class="dlg-actions">
          <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
          <button class="btn btn-green" type="submit" id="od-submit">Enviar solicitud</button>
        </div>
      </form>`;

    $('#od-form', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#od-error', dlg);
      err.classList.remove('show');
      const btn = $('#od-submit', dlg);
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      const method = (dlg.querySelector('input[name="method"]:checked') || {}).value || null;
      const offered = (dlg.querySelector('input[name="offered"]:checked') || {}).value || null;
      const { error } = await sb.rpc('create_order', {
        p_item: it.id,
        p_method: isSale ? method : null,
        p_offered: isSale ? null : offered,
        p_note: $('#od-note', dlg).value
      });
      if (error) {
        err.innerHTML = `${icon('circle-alert', 'pink', 18)}<span>${esc(friendlyError(error))}</span>`;
        err.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Enviar solicitud';
        return;
      }
      dlg.close();
      toast('Solicitud enviada. Te avisamos cuando la persona responda.');
      A.refreshCounts();
      opsTab = 'compras';
      A.navigate('operaciones');
    });
  };

  /* ---------------------------------------------------------------
     Mis datos de cobro (para cuando vendes)
     --------------------------------------------------------------- */
  A.openPaymentDialog = async function () {
    const dlg = ensureDialog('dlg-payment', 'Datos de cobro');
    dlg.innerHTML = `${head('Mis datos de cobro')}<div class="dlg-body"><p class="hint">Cargando…</p></div>`;
    dlg.showModal();
    const { data: cur } = await sb.from('payment_profiles').select('*').eq('user_id', uid).maybeSingle();

    dlg.querySelector('.dlg-body').innerHTML = `
      <form id="pp-form" novalidate>
        <div class="form-error" id="pp-error" role="alert"></div>
        <p class="hint" style="margin-bottom:14px">Estos datos solo los ve quien te compre, y únicamente cuando aceptes su solicitud. El efectivo siempre está disponible.</p>
        <div class="field">
          <label for="pp-transfer">Datos para transferencia</label>
          <textarea class="input" id="pp-transfer" maxlength="300" placeholder="Banco, CLABE, nombre del titular">${esc(cur?.transfer_info || '')}</textarea>
          <span class="hint">Déjalo vacío si no quieres recibir transferencias.</span>
        </div>
        <div class="field">
          <label for="pp-link">Enlace de pago (opcional)</label>
          <input class="input" id="pp-link" type="url" maxlength="300" placeholder="https://link.mercadopago.com.mx/… o https://paypal.me/…" value="${esc(cur?.payment_link || '')}">
          <span class="hint">Con un enlace de Mercado Pago o PayPal te pueden pagar con tarjeta sin que tú manejes sus datos.</span>
        </div>
        <div class="notice">${esc(SAFETY)}</div>
        <div class="dlg-actions">
          <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
          <button class="btn btn-green" type="submit" id="pp-submit">Guardar</button>
        </div>
      </form>`;

    $('#pp-form', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#pp-error', dlg);
      err.classList.remove('show');
      const transfer = $('#pp-transfer', dlg).value.trim();
      const link = $('#pp-link', dlg).value.trim();
      const fail = (m) => { err.innerHTML = `${icon('circle-alert', 'pink', 18)}<span>${esc(m)}</span>`; err.classList.add('show'); };
      if (link && !/^https:\/\/[^\s]+$/.test(link)) return fail('El enlace de pago debe empezar con https:// y no llevar espacios.');
      if (/\b(?:\d[ -]?){15,16}\b/.test(transfer)) {
        return fail('Parece que escribiste un número de tarjeta. No lo pongas aquí: usa tu CLABE o un enlace de pago.');
      }
      const btn = $('#pp-submit', dlg);
      btn.disabled = true;
      const { error } = await sb.from('payment_profiles').upsert({
        user_id: uid, transfer_info: transfer, payment_link: link, updated_at: new Date().toISOString()
      });
      btn.disabled = false;
      if (error) return fail(friendlyError(error));
      dlg.close();
      toast('Datos de cobro guardados.');
    });
  };

  /* ---------------------------------------------------------------
     Pantalla: ventas e intercambios
     --------------------------------------------------------------- */
  let opsTab = 'ventas';

  const dateTxt = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

  function payInstructions(o, payInfo) {
    if (o.kind !== 'compra') return '';
    const m = o.payment_method;
    const seller = o.seller || {};
    let inner = '';
    if (m === 'efectivo') {
      inner = `<b>Efectivo al entregar.</b> Acuerda el lugar y la hora con @${esc(seller.username || '')}${seller.contact ? ` (${esc(seller.contact)})` : ''} y paga ${money(o.amount)} cuando recibas la pieza.`;
    } else if (m === 'transferencia') {
      const t = payInfo?.transfer_info;
      inner = t
        ? `<b>Transfiere ${money(o.amount)} a:</b>\n${esc(t)}`
        : 'La persona aún no tiene datos de transferencia guardados. Escríbele para acordar.';
    } else if (m === 'enlace') {
      const l = payInfo?.payment_link;
      inner = l && /^https:\/\//.test(l)
        ? `<b>Paga ${money(o.amount)} con el enlace de @${esc(seller.username || '')}:</b><br><a class="btn btn-sm" style="margin-top:8px" href="${esc(l)}" target="_blank" rel="noopener noreferrer">${icon('external-link', 'white', 16)}Ir a pagar</a>`
        : 'La persona aún no tiene un enlace de pago guardado. Escríbele para acordar.';
    }
    const copy = m === 'transferencia' && payInfo?.transfer_info
      ? `<br><button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(payInfo.transfer_info)}" style="margin-top:8px">${icon('copy', 'white', 16)}Copiar datos</button>` : '';
    return `<div class="pay-box">${inner}${copy}</div>`;
  }

  function orderCard(o, payInfo) {
    const iAmSeller = o.seller_id === uid;
    const other = iAmSeller ? o.buyer : o.seller;
    const img = safeImageUrl(o.item_image_url);
    const isSale = o.kind === 'compra';
    const un = other?.username || '';

    let line = isSale
      ? `${money(o.amount)} · ${esc(METHOD[o.payment_method]?.label || '')}`
      : `Ofrece: ${esc(o.offered_item_name || 'un artículo')}`;

    let msg = '';
    let actions = '';
    const btn = (act, label, cls = '', ic = '') =>
      `<button class="btn ${cls} btn-sm" type="button" data-act="${act}" data-id="${esc(o.id)}">${ic}${label}</button>`;

    if (iAmSeller) {
      if (o.status === 'pendiente') {
        msg = `@${esc(un)} quiere ${isSale ? 'comprar' : 'intercambiar'}. ¿Aceptas?`;
        actions = btn('accept', 'Aceptar', 'btn-green', icon('check', 'dark', 16)) + btn('reject', 'Rechazar', 'btn-ghost');
      } else if (o.status === 'aceptada') {
        msg = `Esperando a que @${esc(un)} ${isSale ? 'confirme su pago' : 'confirme el intercambio'}.`;
        actions = btn('cancel', 'Cancelar operación', 'btn-ghost');
      } else if (o.status === 'confirmada') {
        msg = isSale
          ? `@${esc(un)} dice que ya pagó. Cuando lo verifiques y entregues la pieza, márcala como completada: el artículo pasará a su colección.`
          : `@${esc(un)} confirmó el intercambio. Cuando se entreguen las piezas, márcalo como completado: los artículos cambiarán de dueño.`;
        actions = btn('complete', 'Marcar como completada', 'btn-green', icon('circle-check', 'dark', 16)) + btn('cancel', 'Cancelar', 'btn-ghost');
      } else if (o.status === 'completada') {
        msg = `Listo. El artículo pasó a la colección de @${esc(un)}.`;
      }
    } else {
      if (o.status === 'pendiente') {
        msg = `Esperando a que @${esc(un)} acepte tu solicitud.`;
        actions = btn('cancel', 'Cancelar solicitud', 'btn-ghost');
      } else if (o.status === 'aceptada') {
        msg = isSale ? '@' + esc(un) + ' aceptó. Haz tu pago y luego confirma aquí.' : '@' + esc(un) + ' aceptó. Acuerden la entrega y luego confirma aquí.';
        actions = btn('confirm', isSale ? (o.payment_method === 'efectivo' ? 'Ya entregué el efectivo' : 'Ya pagué') : 'Confirmo el intercambio', 'btn-green', icon('check', 'dark', 16)) + btn('cancel', 'Cancelar', 'btn-ghost');
      } else if (o.status === 'confirmada') {
        msg = `Esperando a que @${esc(un)} confirme que recibió ${isSale ? 'el pago' : 'tu artículo'}.`;
        actions = btn('cancel', 'Cancelar', 'btn-ghost');
      } else if (o.status === 'completada') {
        msg = '¡Listo! El artículo ya es tuyo.';
        actions = `<a class="btn btn-sm" href="#mia">Ver mi colección</a>`;
      }
    }
    if (o.status === 'rechazada') msg = iAmSeller ? 'Rechazaste esta solicitud.' : `@${esc(un)} rechazó tu solicitud.`;
    if (o.status === 'cancelada') msg = 'Esta operación se canceló.';

    const showPay = !iAmSeller && isSale && (o.status === 'aceptada' || o.status === 'confirmada');
    const showContact = ['aceptada', 'confirmada', 'completada'].includes(o.status) && other?.contact;

    return `
      <article class="order-card">
        <div class="order-img">${img ? `<img class="photo" src="${esc(img)}" alt="">` : icon('package', 'muted', 40)}</div>
        <div>
          <div class="order-top">
            <h3>${esc(o.item_name)}</h3>
            <span class="status st-${esc(o.status)}">${esc(STATUS[o.status])}</span>
          </div>
          <p class="order-meta">${isSale ? 'Compra' : 'Intercambio'}: ${line}<br>
            ${iAmSeller ? 'Comprador' : 'Vendedor'}: <a href="#perfil/${esc(encodeURIComponent(un))}">@${esc(un)}</a>${verifiedBadge(other, 13)} · ${esc(dateTxt(o.created_at))}
            ${o.note ? `<br>Mensaje: ${esc(o.note)}` : ''}
            ${showContact ? `<br>Contacto: ${esc(other.contact)}` : ''}</p>
          ${msg ? `<p>${msg}</p>` : ''}
          ${showPay ? payInstructions(o, payInfo) : ''}
          ${actions ? `<div class="order-actions">${actions}</div>` : ''}
        </div>
      </article>`;
  }

  const RPC = {
    accept:   (id) => sb.rpc('respond_order', { p_order: id, p_accept: true }),
    reject:   (id) => sb.rpc('respond_order', { p_order: id, p_accept: false }),
    confirm:  (id) => sb.rpc('confirm_order',  { p_order: id }),
    cancel:   (id) => sb.rpc('cancel_order',   { p_order: id }),
    complete: (id) => sb.rpc('complete_order', { p_order: id })
  };
  const DONE = {
    accept: 'Solicitud aceptada.', reject: 'Solicitud rechazada.', confirm: 'Confirmado. Avisamos a la otra persona.',
    cancel: 'Operación cancelada.', complete: '¡Operación completada! El artículo cambió de dueño.'
  };

  A.views.operaciones = {
    title: 'Ventas e intercambios',
    sub: 'Tus compras, ventas e intercambios en curso.',
    async render(panel, _p, isCurrent) {
      const { data, error } = await sb.from('orders')
        .select('*, buyer:profiles!buyer_id(id, username, avatar_url, verified, contact), seller:profiles!seller_id(id, username, avatar_url, verified, contact)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!isCurrent()) return;
      const rows = data || [];

      // datos de pago (la base solo entrega los de ventas ya aceptadas)
      const sellerIds = [...new Set(rows.filter((o) => o.buyer_id === uid && ['aceptada', 'confirmada'].includes(o.status)).map((o) => o.seller_id))];
      const pay = {};
      if (sellerIds.length) {
        const { data: pp } = await sb.from('payment_profiles').select('*').in('user_id', sellerIds);
        (pp || []).forEach((r) => { pay[r.user_id] = r; });
      }
      if (!isCurrent()) return;

      const ventas = rows.filter((o) => o.seller_id === uid);
      const compras = rows.filter((o) => o.buyer_id === uid);
      const needs = (o) => (o.seller_id === uid && ['pendiente', 'confirmada'].includes(o.status)) || (o.buyer_id === uid && o.status === 'aceptada');
      if (opsTab === 'ventas' && !ventas.length && compras.length) opsTab = 'compras';

      function draw() {
        const list = opsTab === 'ventas' ? ventas : compras;
        const pending = (opsTab === 'ventas' ? ventas : compras).filter(needs).length;
        panel.innerHTML = `
          <div class="notice">${esc(SAFETY)}
            <br><button class="btn btn-ghost btn-sm" type="button" id="ops-pay" style="margin-top:8px">${icon('banknote', 'white', 16)}Mis datos de cobro</button></div>
          <div class="tabs-inline" role="tablist" aria-label="Operaciones">
            <button type="button" role="tab" data-tab="ventas" aria-selected="${opsTab === 'ventas'}">Lo que me piden (${ventas.length})</button>
            <button type="button" role="tab" data-tab="compras" aria-selected="${opsTab === 'compras'}">Lo que yo pedí (${compras.length})</button>
          </div>
          ${pending ? `<p class="hint" style="margin-bottom:12px">${pending} operación${pending === 1 ? '' : 'es'} esperando tu respuesta.</p>` : ''}
          ${list.length
            ? `<div class="order-list">${list.map((o) => orderCard(o, pay[o.seller_id])).join('')}</div>`
            : `<div class="empty">${icon('handshake', 'muted', 52)}<h3>${opsTab === 'ventas' ? 'Nadie te ha pedido nada todavía' : 'Todavía no has pedido nada'}</h3>
               <p>${opsTab === 'ventas' ? 'Cuando alguien quiera comprar o intercambiar uno de tus artículos, aparecerá aquí.' : 'Entra a un artículo en venta o intercambio y toca Comprar o Proponer intercambio.'}</p>
               <a class="btn" href="${opsTab === 'ventas' ? '#mia' : '#venta'}">${opsTab === 'ventas' ? 'Ver mi colección' : 'Ver artículos en venta'}</a></div>`}`;
      }
      draw();

      panel.onclick = async (e) => {
        const tab = e.target.closest('[data-tab]');
        if (tab) { opsTab = tab.dataset.tab; draw(); return; }
        if (e.target.closest('#ops-pay')) return A.openPaymentDialog();
        const cp = e.target.closest('[data-copy]');
        if (cp) {
          try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Datos copiados.'); }
          catch (err) { toast('No se pudo copiar. Selecciónalos y cópialos a mano.', 'error'); }
          return;
        }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'complete' && !b.dataset.armed) {
          b.dataset.armed = '1';
          b.textContent = '¿Ya recibiste el pago? Toca otra vez';
          setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Marcar como completada'; } }, 5000);
          return;
        }
        b.disabled = true;
        const { error: err } = await RPC[act](b.dataset.id);
        if (err) { b.disabled = false; toast(friendlyError(err), 'error'); return; }
        toast(DONE[act]);
        if (act === 'complete') { await A.afterChange(); return; }   // cambió el dueño: se recalculan puntos
        A.refreshCounts();
        A.reloadRoute();
      };
    }
  };
});
