/* ============================================================
   Verificación de perfil con identificación oficial.
   - La foto se sube a un bucket PRIVADO (solo tú y los admins la ven).
   - Un administrador la revisa y, al terminar, las fotos se BORRAN.
   - No se pide ni se guarda ningún número de la identificación.
   ============================================================ */
(window.CQ_MODULES = window.CQ_MODULES || []).push(function (A) {
  const {
    $, esc, icon, sb, avatarHTML, verifiedBadge, friendlyError, toast,
    compressImage, uploadPrivate
  } = window.CQ;
  const { uid, state } = A;
  const BUCKET = 'verifications';

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
     Usuario: pedir la verificación
     --------------------------------------------------------------- */
  A.openVerifyDialog = async function () {
    const dlg = ensureDialog('dlg-verify', 'Verificar mi perfil');
    dlg.innerHTML = `${head('Verificar mi perfil')}<div class="dlg-body"><p class="hint">Cargando…</p></div>`;
    dlg.showModal();
    const body = dlg.querySelector('.dlg-body');

    if (state.profile.verified) {
      body.innerHTML = `<div class="verif-state">${icon('badge-check', 'green', 32)}<div><b>Tu perfil está verificado.</b><br>
        <span class="hint">Aparece la palomita junto a tu nombre en artículos, ranking y perfil.</span></div></div>
        <div class="dlg-actions"><button class="btn" type="button" data-close>Listo</button></div>`;
      return;
    }

    const { data: last, error } = await sb.from('verifications')
      .select('id, status, reject_reason, id_path, selfie_path, created_at')
      .eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) { body.innerHTML = `<p>${esc(friendlyError(error))}</p>`; return; }

    if (last && last.status === 'pendiente') {
      body.innerHTML = `
        <div class="verif-state">${icon('clock', 'gold', 32)}<div><b>Tu solicitud está en revisión.</b><br>
          <span class="hint">Un administrador la revisará pronto. Cuando termine, las fotos se borran.</span></div></div>
        <div class="dlg-actions">
          <button class="btn btn-ghost" type="button" id="vf-cancel">Cancelar solicitud</button>
          <button class="btn" type="button" data-close>Cerrar</button>
        </div>`;
      $('#vf-cancel', dlg).addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        const { error: err } = await sb.from('verifications').delete().eq('id', last.id);
        if (err) { toast(friendlyError(err), 'error'); e.currentTarget.disabled = false; return; }
        const paths = [last.id_path, last.selfie_path].filter(Boolean);
        if (paths.length) sb.storage.from(BUCKET).remove(paths);
        toast('Solicitud cancelada y fotos borradas.');
        A.openVerifyDialog();
        A.refreshCounts();
      });
      return;
    }

    const rejected = last && last.status === 'rechazada'
      ? `<div class="verif-state">${icon('circle-alert', 'pink', 32)}<div><b>Tu solicitud anterior fue rechazada.</b><br>
          <span class="hint">${last.reject_reason ? 'Motivo: ' + esc(last.reject_reason) + '. ' : ''}Puedes intentarlo de nuevo.</span></div></div>` : '';

    body.innerHTML = `
      <form id="vf-form" novalidate>
        ${rejected}
        <div class="form-error" id="vf-error" role="alert"></div>
        <p class="hint" style="margin-bottom:14px">Sube una foto de tu identificación oficial (INE, pasaporte o licencia) para obtener la palomita de perfil verificado.
          Puedes tapar el número y la dirección: solo necesitamos ver tu nombre y tu foto.</p>

        <div class="field">
          <label for="vf-id">Foto de tu identificación <span class="req">*</span></label>
          <input class="input" id="vf-id" type="file" accept="image/*" capture="environment">
        </div>
        <div class="field">
          <label for="vf-selfie">Foto tuya sosteniendo la identificación (recomendada)</label>
          <input class="input" id="vf-selfie" type="file" accept="image/*" capture="user">
        </div>

        <div class="notice">Tus fotos van a un espacio privado: solo tú y los administradores pueden verlas. Cuando se revise tu solicitud se borran, y no guardamos ningún número de tu identificación.</div>

        <div style="margin-bottom:16px">
          <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;font-weight:500;font-size:.92rem">
            <input type="checkbox" id="vf-ok" style="margin-top:4px;position:static;opacity:1;width:18px;height:18px;flex:none">
            Acepto que revisen mi identificación solo para verificar que soy yo.
          </label>
        </div>

        <div class="dlg-actions">
          <button class="btn btn-ghost" type="button" data-close>Cancelar</button>
          <button class="btn btn-green" type="submit" id="vf-submit">Enviar a revisión</button>
        </div>
      </form>`;

    $('#vf-form', dlg).addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#vf-error', dlg);
      err.classList.remove('show');
      const fail = (m) => { err.innerHTML = `${icon('circle-alert', 'pink', 18)}<span>${esc(m)}</span>`; err.classList.add('show'); };

      const idFile = $('#vf-id', dlg).files[0];
      const selfieFile = $('#vf-selfie', dlg).files[0];
      if (!idFile) return fail('Sube la foto de tu identificación.');
      if (!idFile.type.startsWith('image/') || (selfieFile && !selfieFile.type.startsWith('image/'))) return fail('Usa archivos de imagen (JPG, PNG o WebP).');
      if (!$('#vf-ok', dlg).checked) return fail('Marca la casilla para aceptar la revisión.');

      const btn = $('#vf-submit', dlg);
      btn.disabled = true;
      btn.textContent = 'Subiendo…';
      const uploaded = [];
      try {
        const idBlob = await compressImage(idFile, 1600, 0.85);
        const idPath = await uploadPrivate(BUCKET, idBlob, uid, 'id');
        uploaded.push(idPath);
        let selfiePath = null;
        if (selfieFile) {
          const sBlob = await compressImage(selfieFile, 1600, 0.85);
          selfiePath = await uploadPrivate(BUCKET, sBlob, uid, 'selfie');
          uploaded.push(selfiePath);
        }
        const { error: insErr } = await sb.from('verifications').insert({ user_id: uid, id_path: idPath, selfie_path: selfiePath });
        if (insErr) throw insErr;
        dlg.close();
        toast('Solicitud enviada. Te avisaremos cuando la revisen.');
        A.refreshCounts();
      } catch (ex) {
        if (uploaded.length) sb.storage.from(BUCKET).remove(uploaded);   // no dejamos fotos huérfanas
        fail(friendlyError(ex));
        btn.disabled = false;
        btn.textContent = 'Enviar a revisión';
      }
    });
  };

  /* ---------------------------------------------------------------
     Administrador: revisar solicitudes
     --------------------------------------------------------------- */
  A.views.admin = {
    title: 'Verificaciones',
    sub: 'Solicitudes de verificación pendientes. Al aprobar o rechazar, las fotos se borran.',
    adminOnly: true,
    async render(panel, _p, isCurrent) {
      const { data, error } = await sb.from('verifications')
        .select('id, user_id, id_path, selfie_path, created_at, user:profiles!user_id(id, username, avatar_url, avatar_color, verified, bio)')
        .eq('status', 'pendiente').order('created_at', { ascending: true });
      if (error) throw error;
      if (!isCurrent()) return;
      if (!data.length) {
        panel.innerHTML = `<div class="empty">${icon('shield-check', 'muted', 52)}<h3>No hay solicitudes pendientes</h3><p>Cuando alguien pida verificarse, aparecerá aquí.</p></div>`;
        return;
      }

      const signed = async (path) => {
        if (!path) return null;
        const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(path, 60);
        return s ? s.signedUrl : null;
      };
      const cards = await Promise.all(data.map(async (v) => {
        const [idUrl, selfieUrl] = await Promise.all([signed(v.id_path), signed(v.selfie_path)]);
        return { v, idUrl, selfieUrl };
      }));
      if (!isCurrent()) return;

      panel.innerHTML = `<div class="order-list">${cards.map(({ v, idUrl, selfieUrl }) => `
        <article class="verif-card" data-id="${esc(v.id)}">
          <div style="display:flex;align-items:center;gap:12px">
            ${avatarHTML(v.user, 48)}
            <div><b><a href="#perfil/${esc(encodeURIComponent(v.user?.username || ''))}">@${esc(v.user?.username || '')}</a></b><br>
              <span class="hint">Solicitud del ${esc(new Date(v.created_at).toLocaleDateString('es-MX'))}</span></div>
          </div>
          <div class="verif-imgs">
            ${idUrl ? `<a href="${esc(idUrl)}" target="_blank" rel="noopener noreferrer"><img src="${esc(idUrl)}" alt="Identificación de @${esc(v.user?.username || '')}"></a>` : '<p class="hint">Sin foto de identificación.</p>'}
            ${selfieUrl ? `<a href="${esc(selfieUrl)}" target="_blank" rel="noopener noreferrer"><img src="${esc(selfieUrl)}" alt="Foto de @${esc(v.user?.username || '')} con su identificación"></a>` : ''}
          </div>
          <div class="field" style="margin:0">
            <label for="rs-${esc(v.id)}">Motivo (solo si rechazas)</label>
            <input class="input" id="rs-${esc(v.id)}" maxlength="200" placeholder="Ej. La foto salió borrosa">
          </div>
          <div class="order-actions" style="margin:0">
            <button class="btn btn-green btn-sm" type="button" data-act="approve">${icon('badge-check', 'dark', 16)}Aprobar</button>
            <button class="btn btn-red btn-sm" type="button" data-act="reject">Rechazar</button>
          </div>
        </article>`).join('')}</div>`;

      panel.onclick = async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const card = b.closest('.verif-card');
        const id = card.dataset.id;
        const approve = b.dataset.act === 'approve';
        const reason = $(`#rs-${CSS.escape(id)}`, card).value.trim();
        if (!approve && !reason) { toast('Escribe el motivo del rechazo.', 'error'); return; }
        card.querySelectorAll('button').forEach((x) => (x.disabled = true));
        const { data: paths, error: err } = await sb.rpc('review_verification', { p_id: id, p_approve: approve, p_reason: reason });
        if (err) {
          card.querySelectorAll('button').forEach((x) => (x.disabled = false));
          toast(friendlyError(err), 'error');
          return;
        }
        if (paths && paths.length) await sb.storage.from(BUCKET).remove(paths);   // se borran las fotos
        toast(approve ? 'Perfil verificado. Fotos borradas.' : 'Solicitud rechazada. Fotos borradas.');
        A.refreshCounts();
        A.reloadRoute();
      };
    }
  };
});
