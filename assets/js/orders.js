/* ============================================================
   Ventas e intercambios.
   - Cada persona elige qué formas de pago acepta (menú desplegable): efectivo y/o transferencia
     (CLABE de 18 dígitos, titular, alias y banco).
   - Al pedir, el comprador elige cómo se entrega (en persona o por paquetería) y deja su contacto.
     Al aceptarse, las dos personas ven el contacto de la otra para ponerse de acuerdo.
   Collection Quest NO procesa pagos ni guarda datos de tarjeta: el dinero va directo entre las dos personas.
   ============================================================ */
(window.CQ_MODULES = window.CQ_MODULES || []).push(function (A) {
  const {
    $, $$, esc, icon, sb, money, RARITY, safeImageUrl, verifiedBadge, friendlyError, toast,
    clabeValid, formatClabe, contactHTML
  } = window.CQ;
  const { uid, state } = A;

  const METHOD = {
    efectivo:      { label: 'Pago en efectivo',       icon: 'banknote' },
    transferencia: { label: 'Pago con transferencia', icon: 'landmark' },
    enlace:        { label: 'Pago con enlace (anterior)', icon: 'link' }     // solo para operaciones viejas
  };
  const CHOOSABLE = ['efectivo', 'transferencia'];
  const DELIVERY = {
    persona:    { label: 'En persona',    long: 'En persona (acuerdan lugar y hora)' },
    paqueteria: { label: 'Por paquetería', long: 'Por paquetería (acuerdan dirección y envío)' }
  };
  const STATUS = {
    pendiente: 'Pendiente', aceptada: 'Aceptada', confirmada: 'Pago confirmado',
    completada: 'Completada', rechazada: 'Rechazada', cancelada: 'Cancelada'
  };
  const SAFETY = 'Collection Quest no procesa pagos y nunca te pide datos de tarjeta. El pago y la entrega los acuerdan directamente las dos personas. Verifica siempre que los datos sean de la persona con la que tratas.';
  const COMMIT = 'Es un compromiso: si la otra persona acepta, deberás cumplir. El pago y la entrega son directos entre ustedes.';

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

  const methodSelect = (list, label, id = 'od-method') => `
    <div class="field">
      <label for="${id}">${esc(label)}</label>
      <select class="input" id="${id}">${list.map((m) => `<option value="${m}">${esc(METHOD[m].label)}</option>`).join('')}</select>
    </div>`;

  /* ---------------------------------------------------------------
     Pedir comprar / proponer intercambio
     --------------------------------------------------------------- */
  A.openOrderDialog = async function (it) {
    const dlg = ensureDialog('dlg-order', 'Solicitud');
    const isSale = it.listing === 'venta';
    dlg.innerHTML = `${head(isSale ? 'Comprar' : 'Proponer intercambio')}<div class="dlg-body"><p class="hint">Cargando…</p></div>`;
    dlg.showModal();
    const body = dlg.querySelector('.dlg-body');
    const owner = it.owner?.username || '';

    const [sm, mm] = await Promise.all([
      sb.rpc('seller_methods', { p_seller: it.owner_id }),
      isSale ? Promise.resolve({ data: [] }) : sb.rpc('seller_methods', { p_seller: uid })
    ]);
    if (sm.error) { body.innerHTML = `<p>${esc(friendlyError(sm.error))}</p>`; return; }
    const ownerMethods = sm.data && sm.data.length ? sm.data : ['efectivo'];
    const myMethods = mm.data && mm.data.length ? mm.data : ['efectivo'];

    let mine = [];
    if (!isSale) {
      const r = await sb.from('items').select('id, name, value, rarity, image_url, listing')
        .eq('owner_id', uid).neq('listing', 'subasta').order('created_at', { ascending: false }).limit(60);
      mine = r.data || [];
      if (!mine.length) {
        body.innerHTML = `
          <p>Para proponer un intercambio necesitas tener al menos un artículo en tu colección (que no esté en subasta).</p>
          <div class="dlg-actions"><button class="btn btn-green" type="button" id="od-add">${icon('plus', 'dark', 20)}Registrar artículo</button></div>`;
        $('#od-add', dlg).addEventListener('click', () => { dlg.close(); A.openItemDialog(); });
        return;
      }
    }

    body.innerHTML = `
      <form id="od-form" novalidate>
        <div class="form-error" id="od-error" role="alert"></div>
        ${isSale ? `
          <p><b>${esc(it.name)}</b> de @${esc(owner)}: <b>${money(it.value)}</b></p>
          ${methodSelect(ownerMethods, '¿Cómo vas a pagar?')}`
        : `
          <p>Quieres: <b>${esc(it.name)}</b> (${money(it.value)}) de @${esc(owner)}</p>
          <p class="label" style="font-weight:600;margin:12px 0 6px">¿Qué ofreces a cambio?</p>
          <div class="pick-list" role="radiogroup" aria-label="Artículo que ofreces">
            ${mine.map((m, i) => {
              const img = safeImageUrl(m.image_url);
              return `<div class="pick"><input type="radio" name="offered" id="of-${esc(m.id)}" value="${esc(m.id)}" ${i === 0 ? 'checked' : ''}>
                <label for="of-${esc(m.id)}">${img ? `<img class="thumb" src="${esc(img)}" alt="">` : icon('package', 'muted', 40)}
                  <span>${esc(m.name)}<small>${esc((RARITY[m.rarity] || {}).label || '')}, ${money(m.value)}</small></span></label></div>`;
            }).join('')}
          </div>
          <div id="od-pay"></div>`}

        <div class="field">
          <label for="od-delivery">¿Cómo se entrega?</label>
          <select class="input" id="od-delivery">
            ${Object.keys(DELIVERY).map((k) => `<option value="${k}">${esc(DELIVERY[k].long)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="od-contact">Tu contacto (para que te escriban)</label>
          <input class="input" id="od-contact" maxlength="120" autocomplete="off" placeholder="WhatsApp, teléfono o correo" value="${esc(state.profile.contact || '')}">
          <span class="hint">Cuando @${esc(owner)} acepte, verá este contacto y tú verás el suyo, para ponerse de acuerdo en la entrega.</span>
        </div>
        <div class="field">
          <label for="od-note">Mensaje (opcional)</label>
          <textarea class="input" id="od-note" maxlength="300" placeholder="Ej. Puedo pasar por ella el sábado."></textarea>
        </div>
        <div class="notice">${esc(SAFETY)}</div>
        <div class="dlg-actions">
          <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
          <button class="btn btn-green" type="submit" id="od-submit">Continuar</button>
        </div>
      </form>`;

    // Intercambio: calcula la diferencia al elegir qué ofreces
    const offered = () => mine.find((m) => m.id === (dlg.querySelector('input[name="offered"]:checked') || {}).value);
    const diffInfo = () => {
      const off = offered();
      if (!off) return null;
      const d = Number(it.value) - Number(off.value);
      return { off, d: Math.abs(d), kind: d === 0 ? 'igual' : d > 0 ? 'pago-yo' : 'pago-el' };
    };
    function paintDiff() {
      const box = $('#od-pay', dlg);
      if (!box) return;
      const di = diffInfo();
      if (!di) { box.innerHTML = ''; return; }
      if (di.kind === 'igual') {
        box.innerHTML = `<div class="diff-box same"><b>Mismo valor.</b> No hay nada que pagar: solo confirma el intercambio.</div>`;
      } else if (di.kind === 'pago-yo') {
        box.innerHTML = `<div class="diff-box">Lo que pides vale <b>${money(di.d)}</b> más. <b>Tú pagas la diferencia: ${money(di.d)}</b> a @${esc(owner)}.</div>
          ${methodSelect(ownerMethods, '¿Cómo pagas la diferencia?')}`;
      } else {
        box.innerHTML = `<div class="diff-box">Lo que ofreces vale <b>${money(di.d)}</b> más. <b>@${esc(owner)} te paga la diferencia: ${money(di.d)}</b>.</div>
          ${methodSelect(myMethods, '¿Cómo quieres recibir la diferencia?')}
          ${myMethods.length === 1 ? '<p class="hint" style="margin:-8px 0 12px">Solo tienes efectivo. Agrega transferencia en «Mis datos de cobro».</p>' : ''}`;
      }
    }
    if (!isSale) {
      paintDiff();
      dlg.querySelector('.pick-list').addEventListener('change', paintDiff);
    }

    $('#od-form', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#od-error', dlg);
      err.classList.remove('show');
      const fail = (m) => { err.innerHTML = `${icon('circle-alert', 'pink', 18)}<span>${esc(m)}</span>`; err.classList.add('show'); };

      const contact = $('#od-contact', dlg).value.trim();
      if (contact.length < 5) return fail('Deja tu contacto (WhatsApp, teléfono o correo) para que la otra persona pueda escribirte.');
      const delivery = $('#od-delivery', dlg).value;
      const method = ($('#od-method', dlg) || {}).value || null;

      let offeredItem = null, di = null, title, html, label;
      const delTxt = `<p>Entrega: <b>${esc(DELIVERY[delivery].label)}</b>. Después se ponen en contacto para acordar los detalles.</p>`;
      if (isSale) {
        title = 'Confirmar compra';
        label = 'Sí, solicitar compra';
        html = `<p>Vas a solicitar la compra de <b>${esc(it.name)}</b> a @${esc(owner)} por <b>${money(it.value)}</b>.</p>
                <p>Forma de pago: <b>${esc(METHOD[method].label)}</b>.</p>${delTxt}
                <p class="warn">${esc(COMMIT)} Si algo no te convence, cancela ahora.</p>`;
      } else {
        offeredItem = offered();
        di = diffInfo();
        if (!offeredItem) return fail('Elige qué artículo ofreces.');
        title = 'Confirmar intercambio';
        label = 'Sí, proponer intercambio';
        const base = `<p>Cambias <b>${esc(offeredItem.name)}</b> (${money(offeredItem.value)}) por <b>${esc(it.name)}</b> (${money(it.value)}) de @${esc(owner)}.</p>`;
        html = di.kind === 'igual'
          ? `${base}<p>Las dos piezas valen lo mismo: <b>no se paga diferencia</b>, solo se confirma el intercambio.</p>${delTxt}<p class="warn">${esc(COMMIT)}</p>`
          : di.kind === 'pago-yo'
            ? `${base}<p>La pieza que pides vale más: <b>tú pagas la diferencia de ${money(di.d)}</b> con <b>${esc(METHOD[method].label)}</b>.</p>${delTxt}<p class="warn">${esc(COMMIT)}</p>`
            : `${base}<p>Tu pieza vale más: <b>@${esc(owner)} te paga la diferencia de ${money(di.d)}</b> con <b>${esc(METHOD[method].label)}</b>.</p>${delTxt}<p class="warn">${esc(COMMIT)}</p>`;
      }
      const go = await A.confirm({ title, html, confirmLabel: label });
      if (!go) return;

      const btn = $('#od-submit', dlg);
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      // Guarda el contacto en tu perfil si lo cambiaste o no lo tenías
      if (contact !== (state.profile.contact || '')) {
        const { error: ce } = await sb.from('profiles').update({ contact }).eq('id', uid);
        if (ce) { fail(friendlyError(ce)); btn.disabled = false; btn.textContent = 'Continuar'; return; }
        state.profile.contact = contact;
      }
      const needsMethod = isSale || (di && di.kind !== 'igual');
      const { error } = await sb.rpc('create_order', {
        p_item: it.id,
        p_method: needsMethod ? method : null,
        p_offered: isSale ? null : offeredItem.id,
        p_note: $('#od-note', dlg).value,
        p_delivery: delivery
      });
      if (error) {
        fail(friendlyError(error));
        btn.disabled = false;
        btn.textContent = 'Continuar';
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
     Mis datos de cobro: menú desplegable para elegir qué formas de pago aceptas
     --------------------------------------------------------------- */
  A.openPaymentDialog = async function () {
    const dlg = ensureDialog('dlg-payment', 'Datos de cobro');
    dlg.innerHTML = `${head('Mis datos de cobro')}<div class="dlg-body"><p class="hint">Cargando…</p></div>`;
    dlg.showModal();
    const { data: cur } = await sb.from('payment_profiles').select('*').eq('user_id', uid).maybeSingle();
    const accepted = new Set((cur && cur.accepted_methods && cur.accepted_methods.length) ? cur.accepted_methods : ['efectivo']);

    dlg.querySelector('.dlg-body').innerHTML = `
      <form id="pp-form" novalidate>
        <div class="form-error" id="pp-error" role="alert"></div>
        <p class="hint" style="margin-bottom:14px">Elige con qué formas de pago quieres que te paguen. Los datos solo los ve la persona que te va a pagar, y únicamente cuando la operación ya está aceptada.</p>

        <div class="field">
          <span class="label" id="pm-lbl">Formas de pago que aceptas</span>
          <div class="multi" id="pm-multi">
            <button type="button" class="input multi-btn" id="pm-btn" aria-haspopup="true" aria-expanded="false" aria-labelledby="pm-lbl pm-sum">
              <span id="pm-sum"></span>${icon('chevron-down', 'muted', 18)}
            </button>
            <div class="multi-panel" id="pm-panel" role="group" aria-labelledby="pm-lbl" hidden>
              ${CHOOSABLE.map((m) => `
                <label class="multi-opt">
                  <input type="checkbox" value="${m}" ${accepted.has(m) ? 'checked' : ''}>
                  ${icon(METHOD[m].icon, 'white', 20)}<span>${esc(METHOD[m].label)}</span>
                </label>`).join('')}
            </div>
          </div>
        </div>

        <section class="pay-section" id="pm-transfer" hidden>
          <h3>${icon('landmark', 'blue', 22)}Datos de tu transferencia</h3>
          <div class="field">
            <label for="pp-clabe">Cuenta CLABE (18 dígitos)</label>
            <input class="input" id="pp-clabe" inputmode="numeric" autocomplete="off" maxlength="22" placeholder="000 000 00000000000 0" value="${esc(formatClabe(cur?.transfer_clabe || ''))}">
            <span class="hint" id="pp-clabe-hint">Son 18 números, sin espacios.</span>
          </div>
          <div class="field">
            <label for="pp-holder">Nombre del titular</label>
            <input class="input" id="pp-holder" maxlength="80" autocomplete="off" value="${esc(cur?.transfer_holder || '')}">
          </div>
          <div class="fields-2">
            <div class="field">
              <label for="pp-alias">Alias</label>
              <input class="input" id="pp-alias" maxlength="40" autocomplete="off" value="${esc(cur?.transfer_alias || '')}">
            </div>
            <div class="field">
              <label for="pp-bank">Banco</label>
              <input class="input" id="pp-bank" maxlength="60" autocomplete="off" value="${esc(cur?.transfer_bank || '')}">
            </div>
          </div>
        </section>

        <p class="hint" style="margin-bottom:14px">El efectivo se acuerda en persona. No se piden datos de tarjeta.</p>
        <div class="notice">${esc(SAFETY)}</div>
        <div class="dlg-actions">
          <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
          <button class="btn btn-green" type="submit" id="pp-submit">Guardar</button>
        </div>
      </form>`;

    // ----- menú desplegable de formas de pago -----
    const btnM = $('#pm-btn', dlg);
    const panel = $('#pm-panel', dlg);
    const checks = () => $$('input[type="checkbox"]', panel);
    const chosen = () => checks().filter((c) => c.checked).map((c) => c.value);
    function paintMethods() {
      const c = chosen();
      $('#pm-sum', dlg).textContent = c.length ? c.map((m) => METHOD[m].label).join(', ') : 'Elige al menos una forma de pago';
      $('#pm-transfer', dlg).hidden = !c.includes('transferencia');
    }
    function setPanel(open) {
      panel.hidden = !open;
      btnM.setAttribute('aria-expanded', String(open));
    }
    btnM.addEventListener('click', () => setPanel(panel.hidden));
    panel.addEventListener('change', paintMethods);
    dlg.onclick = (e) => { if (!panel.hidden && !e.target.closest('#pm-multi')) setPanel(false); };
    dlg.oncancel = (e) => { if (!panel.hidden) { e.preventDefault(); setPanel(false); btnM.focus(); } };
    paintMethods();

    const clabeInput = $('#pp-clabe', dlg);
    const hint = $('#pp-clabe-hint', dlg);
    clabeInput.addEventListener('input', () => {
      const d = clabeInput.value.replace(/\D/g, '').slice(0, 18);
      clabeInput.value = d.length === 18 ? formatClabe(d) : d;
      hint.textContent = d.length === 0 ? 'Son 18 números, sin espacios.'
        : d.length < 18 ? `Llevas ${d.length} de 18 números.`
        : (clabeValid(d) ? 'CLABE válida.' : 'Esa CLABE no es válida: revisa los números.');
    });

    $('#pp-form', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#pp-error', dlg);
      err.classList.remove('show');
      const fail = (m) => { err.innerHTML = `${icon('circle-alert', 'pink', 18)}<span>${esc(m)}</span>`; err.classList.add('show'); };

      const methods = chosen();
      if (!methods.length) return fail('Elige al menos una forma de pago.');
      const withTransfer = methods.includes('transferencia');
      const clabe = clabeInput.value.replace(/\D/g, '');
      const holder = $('#pp-holder', dlg).value.trim();
      const alias = $('#pp-alias', dlg).value.trim();
      const bank = $('#pp-bank', dlg).value.trim();

      if (withTransfer) {
        if (!clabeValid(clabe)) return fail('La CLABE debe tener 18 números y ser válida.');
        if (holder.length < 3) return fail('Escribe el nombre del titular.');
        if (!alias) return fail('Escribe el alias de la cuenta.');
        if (!bank) return fail('Escribe el banco.');
      }

      const btn = $('#pp-submit', dlg);
      btn.disabled = true;
      const { error } = await sb.from('payment_profiles').upsert({
        user_id: uid,
        accepted_methods: methods,
        transfer_clabe: withTransfer ? clabe : '',
        transfer_holder: withTransfer ? holder : '',
        transfer_alias: withTransfer ? alias : '',
        transfer_bank: withTransfer ? bank : '',
        transfer_info: '',
        payment_link: '',
        updated_at: new Date().toISOString()
      });
      btn.disabled = false;
      if (error) return fail(friendlyError(error));
      dlg.close();
      toast('Formas de pago guardadas.');
    });
  };

  /* ---------------------------------------------------------------
     Pantalla: ventas e intercambios
     --------------------------------------------------------------- */
  let opsTab = 'ventas';
  const dateTxt = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

  function payInstructions(o, info) {
    if (!o.amount || !o.payment_method) return '';
    const receiver = o.receiver_id === o.seller_id ? o.seller : o.buyer;
    const un = receiver?.username || '';
    const m = o.payment_method;
    let inner = '';
    if (m === 'efectivo') {
      inner = `<b>Pago en efectivo: ${money(o.amount)}.</b> Acuerda con @${esc(un)} cuándo y cómo entregarlo (en persona o con el envío).`;
    } else if (m === 'transferencia') {
      inner = info && info.transfer_clabe
        ? `<b>Transfiere ${money(o.amount)} a:</b>\nBanco: ${esc(info.transfer_bank)}\nTitular: ${esc(info.transfer_holder)}\nCLABE: ${esc(formatClabe(info.transfer_clabe))}\nAlias: ${esc(info.transfer_alias)}`
        : `@${esc(un)} ya no tiene datos de transferencia guardados. Escríbele para acordar el pago.`;
    } else {
      inner = `Esta operación se creó con un método de pago anterior. Acuerda el pago de ${money(o.amount)} directamente con @${esc(un)}.`;
    }
    const copy = m === 'transferencia' && info?.transfer_clabe
      ? `<br><button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(info.transfer_clabe)}" style="margin-top:8px">${icon('copy', 'white', 16)}Copiar CLABE</button>` : '';
    return `<div class="pay-box">${inner}${copy}</div>`;
  }

  // Bloque de contacto y entrega (en persona o paquetería)
  function deliveryBlock(o, other) {
    const open = ['pendiente', 'aceptada', 'confirmada'].includes(o.status);
    const showContact = ['aceptada', 'confirmada', 'completada'].includes(o.status) || (o.status === 'pendiente' && o.seller_id === uid);
    const del = o.delivery || 'persona';
    let html = '';
    if (showContact) {
      html += `<div class="contact-box">${icon('message-circle', 'green', 22)}<div>
        <b>Contáctense para acordar la entrega</b> (${esc(DELIVERY[del].label.toLowerCase())})<br>
        ${other?.contact
          ? `@${esc(other.username || '')}: ${contactHTML(other.contact)}`
          : `@${esc(other?.username || '')} todavía no dejó un contacto. Búscalo por otro medio.`}
        ${o.tracking ? `<br>Guía de rastreo: <b>${esc(o.tracking)}</b>` : ''}
      </div></div>`;
      if (!state.profile.contact && o.status !== 'completada') {
        html += `<div class="notice" style="margin-top:10px">Todavía no tienes un contacto: la otra persona no podrá escribirte.
          <button class="btn btn-ghost btn-sm" type="button" data-act="mycontact" style="margin-top:8px">Agregar mi contacto</button></div>`;
      }
    }
    if (open) {
      html += `<div class="ship-row">
        <div class="field">
          <label for="dl-${esc(o.id)}">Entrega</label>
          <select class="input" id="dl-${esc(o.id)}" data-ship="${esc(o.id)}">
            ${Object.keys(DELIVERY).map((k) => `<option value="${k}" ${k === del ? 'selected' : ''}>${esc(DELIVERY[k].long)}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="trw-${esc(o.id)}" ${del === 'paqueteria' ? '' : 'hidden'}>
          <label for="tr-${esc(o.id)}">Guía de rastreo</label>
          <input class="input" id="tr-${esc(o.id)}" maxlength="80" value="${esc(o.tracking || '')}" placeholder="Número de guía (opcional)">
        </div>
        <button class="btn btn-ghost btn-sm" type="button" data-act="ship" data-id="${esc(o.id)}">${icon('truck', 'white', 16)}Guardar entrega</button>
      </div>`;
    }
    return html;
  }

  function orderCard(o, pay, recvMethods) {
    const iAmSeller = o.seller_id === uid;
    const other = iAmSeller ? o.buyer : o.seller;
    const un = other?.username || '';
    const img = safeImageUrl(o.item_image_url);
    const isSale = o.kind === 'compra';
    const confirmer = o.payer_id || o.buyer_id;
    const completer = confirmer === o.buyer_id ? o.seller_id : o.buyer_id;
    const iConfirm = uid === confirmer;
    const iComplete = uid === completer;
    const iPay = o.payer_id === uid;
    const hasMoney = !!o.amount;
    const payerName = iPay ? 'tú' : '@' + un;

    let line;
    if (isSale) line = `${money(o.amount)} · ${esc(METHOD[o.payment_method]?.label || '')}${o.is_auction ? ' · Subasta ganada' : ''}`;
    else line = `Cambio: ${esc(o.offered_item_name || 'un artículo')} (${money(o.offered_value)}) por ${esc(o.item_name)} (${money(o.item_value)})`
      + (hasMoney ? `<br>Diferencia: ${money(o.amount)}, la paga ${esc(payerName)} · ${esc(METHOD[o.payment_method]?.label || '')}` : '<br>Mismo valor: sin diferencia');
    line += `<br>Entrega: ${esc(DELIVERY[o.delivery || 'persona'].label)}`;

    const btn = (act, label, cls = '', ic = '') =>
      `<button class="btn ${cls} btn-sm" type="button" data-act="${act}" data-id="${esc(o.id)}">${ic}${label}</button>`;
    let msg = '';
    let actions = '';
    let extra = '';

    if (o.status === 'pendiente') {
      if (iAmSeller) {
        msg = `@${esc(un)} quiere ${isSale ? 'comprar' : 'intercambiar'}. ¿Aceptas?`;
        actions = btn('accept', 'Aceptar', 'btn-green', icon('check', 'dark', 16)) + btn('reject', 'Rechazar', 'btn-ghost');
      } else {
        msg = `Esperando a que @${esc(un)} acepte tu solicitud.`;
        actions = btn('cancel', 'Cancelar solicitud', 'btn-ghost');
      }
    } else if (o.status === 'aceptada') {
      if (iConfirm) {
        msg = hasMoney
          ? (iPay ? `Haz tu pago de ${money(o.amount)}, ponte de acuerdo para la entrega y luego confirma aquí.` : `Confirma cuando entregues el pago de ${money(o.amount)}.`)
          : 'Ponte de acuerdo para la entrega y luego confirma aquí.';
        if (iPay && hasMoney) extra = payInstructions(o, pay);
        const lbl = hasMoney ? (o.payment_method === 'efectivo' ? 'Ya entregué el efectivo' : 'Ya pagué') : 'Confirmo el intercambio';
        actions = btn('confirm', lbl, 'btn-green', icon('check', 'dark', 16)) + btn('cancel', 'Cancelar', 'btn-ghost');
        if (iPay && o.is_auction && recvMethods && recvMethods.length > 1) {
          extra += `<div class="field" style="margin:10px 0 0"><label for="mth-${esc(o.id)}">Método de pago</label>
            <select class="input" id="mth-${esc(o.id)}" data-method="${esc(o.id)}">${recvMethods.filter((m) => METHOD[m]).map((m) => `<option value="${m}" ${m === o.payment_method ? 'selected' : ''}>${esc(METHOD[m].label)}</option>`).join('')}</select></div>`;
        }
      } else {
        msg = `Esperando a que @${esc(un)} ${hasMoney ? 'confirme su pago' : 'confirme el intercambio'}.`;
        actions = btn('cancel', 'Cancelar operación', 'btn-ghost');
      }
    } else if (o.status === 'confirmada') {
      if (iComplete) {
        msg = hasMoney
          ? `@${esc(un)} dice que ya hizo el pago de ${money(o.amount)}. Cuando lo verifiques y se entreguen las piezas, márcala como completada: los artículos cambiarán de dueño.`
          : `@${esc(un)} confirmó el intercambio. Cuando se entreguen las piezas, márcalo como completado: los artículos cambiarán de dueño.`;
        actions = btn('complete', 'Marcar como completada', 'btn-green', icon('circle-check', 'dark', 16)) + btn('cancel', 'Cancelar', 'btn-ghost');
      } else {
        msg = `Esperando a que @${esc(un)} confirme que recibió ${hasMoney ? 'el pago' : 'todo'}.`;
        actions = btn('cancel', 'Cancelar', 'btn-ghost');
      }
    } else if (o.status === 'completada') {
      msg = isSale
        ? (iAmSeller ? `Listo. El artículo pasó a la colección de @${esc(un)}.` : '¡Listo! El artículo ya es tuyo.')
        : 'Listo. Los dos artículos ya cambiaron de dueño.';
      if (!iAmSeller || !isSale) actions = `<a class="btn btn-sm" href="#mia">Ver mi colección</a>`;
    } else if (o.status === 'rechazada') {
      msg = iAmSeller ? 'Rechazaste esta solicitud.' : `@${esc(un)} rechazó tu solicitud.`;
    } else if (o.status === 'cancelada') {
      msg = 'Esta operación se canceló.';
    }

    return `
      <article class="order-card">
        <div class="order-img">${img ? `<img class="photo" src="${esc(img)}" alt="">` : icon('package', 'muted', 40)}</div>
        <div>
          <div class="order-top">
            <h3>${esc(o.item_name)}</h3>
            <span class="status st-${esc(o.status)}">${esc(STATUS[o.status])}</span>
          </div>
          <p class="order-meta">${isSale ? 'Compra' : 'Intercambio'}: ${line}<br>
            ${iAmSeller ? (isSale ? 'Comprador' : 'Otra persona') : (isSale ? 'Vendedor' : 'Otra persona')}: <a href="#perfil/${esc(encodeURIComponent(un))}">@${esc(un)}</a>${verifiedBadge(other, 13)} · ${esc(dateTxt(o.created_at))}
            ${o.note ? `<br>Mensaje: ${esc(o.note)}` : ''}</p>
          ${msg ? `<p>${msg}</p>` : ''}
          ${extra}
          ${deliveryBlock(o, other)}
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
    accept: 'Solicitud aceptada. Pónganse en contacto para acordar la entrega.', reject: 'Solicitud rechazada.',
    confirm: 'Confirmado. Avisamos a la otra persona.', cancel: 'Operación cancelada.',
    complete: '¡Operación completada! Los artículos cambiaron de dueño.'
  };

  // Mensaje de advertencia para cada paso importante
  function warnFor(act, o) {
    const isSale = o.kind === 'compra';
    const hasMoney = !!o.amount;
    const name = esc(o.item_name);
    if (act === 'accept') return {
      title: isSale ? 'Aceptar la venta' : 'Aceptar el intercambio',
      html: `<p>${isSale ? `Vas a vender <b>${name}</b> por <b>${money(o.amount)}</b>.` : `Vas a intercambiar <b>${name}</b> por <b>${esc(o.offered_item_name || 'otra pieza')}</b>${hasMoney ? ` con una diferencia de <b>${money(o.amount)}</b>` : ''}.`}</p>
             <p>Entrega: <b>${esc(DELIVERY[o.delivery || 'persona'].label)}</b>. Después de aceptar, tú y la otra persona verán el contacto del otro para acordar los detalles.</p>
             <p class="warn">Al aceptar te comprometes a cumplir. Si no vas a poder, rechaza ahora.</p>`,
      label: 'Sí, aceptar'
    };
    if (act === 'reject') return { title: 'Rechazar solicitud', html: '<p>La otra persona verá que rechazaste. No se puede deshacer.</p>', label: 'Sí, rechazar', tone: 'danger' };
    if (act === 'cancel') return { title: 'Cancelar la operación', html: '<p>Se cancela para las dos personas y no se puede deshacer.</p>', label: 'Sí, cancelar', tone: 'danger' };
    if (act === 'confirm') return {
      title: hasMoney ? 'Confirmar pago' : 'Confirmar intercambio',
      html: hasMoney ? `<p>Confirma solo si <b>ya hiciste</b> el pago de <b>${money(o.amount)}</b> (o ya entregaste el efectivo).</p><p class="warn">Si confirmas sin haber pagado, la otra persona podría reportarte.</p>`
                     : `<p>Confirma que estás de acuerdo con el intercambio de <b>${name}</b>.</p>`,
      label: 'Sí, confirmar'
    };
    if (act === 'complete') return {
      title: 'Completar la operación',
      html: `<p>Confirma solo si ya recibiste ${hasMoney ? 'el pago' : 'todo'} y se entregaron las piezas${o.delivery === 'paqueteria' ? ' (o ya salió el envío)' : ''}.</p>
             <p class="warn">Al completar, los artículos cambian de dueño y <b>no se puede deshacer</b>.</p>`,
      label: 'Sí, completar'
    };
    return null;
  }

  A.views.operaciones = {
    title: 'Ventas e intercambios',
    sub: 'Tus compras, ventas e intercambios en curso.',
    async render(panel, _p, isCurrent) {
      const emb = (alias, fk) => `${alias}:profiles!${fk}(id, username, avatar_url, avatar_color, verified, contact)`;
      const { data, error } = await sb.from('orders')
        .select(`*, ${emb('buyer', 'buyer_id')}, ${emb('seller', 'seller_id')}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!isCurrent()) return;
      const rows = data || [];

      // Datos de cobro de quienes me van a recibir mi pago (la base solo entrega los que corresponden)
      const recvIds = [...new Set(rows.filter((o) => o.payer_id === uid && ['aceptada', 'confirmada'].includes(o.status)).map((o) => o.receiver_id))];
      const pay = {};
      if (recvIds.length) {
        const { data: pp } = await sb.from('payment_profiles').select('*').in('user_id', recvIds);
        (pp || []).forEach((r) => { pay[r.user_id] = r; });
      }
      // Métodos disponibles para cambiar el pago de una subasta ganada
      const recvMethods = {};
      await Promise.all(rows.filter((o) => o.is_auction && o.status === 'aceptada' && o.payer_id === uid).map(async (o) => {
        const { data: m } = await sb.rpc('seller_methods', { p_seller: o.receiver_id });
        recvMethods[o.id] = m || [];
      }));
      if (!isCurrent()) return;

      const ventas = rows.filter((o) => o.seller_id === uid);
      const compras = rows.filter((o) => o.buyer_id === uid);
      const needs = (o) => {
        const confirmer = o.payer_id || o.buyer_id;
        const completer = confirmer === o.buyer_id ? o.seller_id : o.buyer_id;
        return (o.status === 'pendiente' && o.seller_id === uid) || (o.status === 'aceptada' && uid === confirmer) || (o.status === 'confirmada' && uid === completer);
      };
      if (opsTab === 'ventas' && !ventas.length && compras.length) opsTab = 'compras';

      function draw() {
        const list = opsTab === 'ventas' ? ventas : compras;
        const pending = list.filter(needs).length;
        panel.innerHTML = `
          <div class="notice">${esc(SAFETY)}
            <br><button class="btn btn-ghost btn-sm" type="button" id="ops-pay" style="margin-top:8px">${icon('banknote', 'white', 16)}Mis datos de cobro</button></div>
          <div class="tabs-inline" role="tablist" aria-label="Operaciones">
            <button type="button" role="tab" data-tab="ventas" aria-selected="${opsTab === 'ventas'}">Lo que me piden (${ventas.length})</button>
            <button type="button" role="tab" data-tab="compras" aria-selected="${opsTab === 'compras'}">Lo que yo pedí (${compras.length})</button>
          </div>
          ${pending ? `<p class="hint" style="margin-bottom:12px">${pending} operación${pending === 1 ? '' : 'es'} esperando tu respuesta.</p>` : ''}
          ${list.length
            ? `<div class="order-list">${list.map((o) => orderCard(o, pay[o.receiver_id], recvMethods[o.id])).join('')}</div>`
            : `<div class="empty">${icon('handshake', 'muted', 52)}<h3>${opsTab === 'ventas' ? 'Nadie te ha pedido nada todavía' : 'Todavía no has pedido nada'}</h3>
               <p>${opsTab === 'ventas' ? 'Cuando alguien quiera comprar o intercambiar uno de tus artículos, aparecerá aquí.' : 'Entra a un artículo en venta o intercambio y toca Comprar o Proponer intercambio.'}</p>
               <a class="btn" href="${opsTab === 'ventas' ? '#mia' : '#venta'}">${opsTab === 'ventas' ? 'Ver mi colección' : 'Ver artículos en venta'}</a></div>`}`;
      }
      draw();

      panel.onchange = async (e) => {
        const ship = e.target.closest('[data-ship]');
        if (ship) {   // al elegir paquetería aparece el campo de guía
          const w = $(`#trw-${CSS.escape(ship.dataset.ship)}`, panel);
          if (w) w.hidden = ship.value !== 'paqueteria';
          return;
        }
        const sel = e.target.closest('[data-method]');
        if (!sel) return;
        const { error: err } = await sb.rpc('set_order_method', { p_order: sel.dataset.method, p_method: sel.value });
        if (err) { toast(friendlyError(err), 'error'); return; }
        toast('Método de pago actualizado.');
        A.reloadRoute();
      };

      panel.onclick = async (e) => {
        const tab = e.target.closest('[data-tab]');
        if (tab) { opsTab = tab.dataset.tab; draw(); return; }
        if (e.target.closest('#ops-pay')) return A.openPaymentDialog();
        const cp = e.target.closest('[data-copy]');
        if (cp) {
          try { await navigator.clipboard.writeText(cp.dataset.copy); toast('CLABE copiada.'); }
          catch (err) { toast('No se pudo copiar. Selecciónala y cópiala a mano.', 'error'); }
          return;
        }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.dataset.act;

        if (act === 'mycontact') { if (await A.ensureContact()) A.reloadRoute(); return; }
        if (act === 'ship') {
          const id = b.dataset.id;
          const delivery = $(`#dl-${CSS.escape(id)}`, panel).value;
          const tracking = delivery === 'paqueteria' ? $(`#tr-${CSS.escape(id)}`, panel).value : '';
          b.disabled = true;
          const { error: err } = await sb.rpc('set_order_shipping', { p_order: id, p_delivery: delivery, p_tracking: tracking });
          if (err) { b.disabled = false; toast(friendlyError(err), 'error'); return; }
          toast('Entrega guardada. La otra persona la verá.');
          A.reloadRoute();
          return;
        }

        const order = rows.find((r) => r.id === b.dataset.id);
        if (act === 'accept' && !(await A.ensureContact())) return;   // para acordar la entrega hace falta un contacto
        const w = order && warnFor(act, order);
        if (w) {
          const go = await A.confirm({ title: w.title, html: w.html, confirmLabel: w.label, tone: w.tone });
          if (!go) return;
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
