/* ============================================================
   Collection Quest - Alerta en Tiempo Real para Administrador
   Notifica al admin cuando un usuario intenta subir un artículo
   ============================================================ */
(function() {
        let pendingQueue = [];
        let isModalOpen = false;

        async function initAdminItemAlerts() {
            const CQ = window.CQ;
            if (!CQ || !CQ.sb) return;
            const sb = CQ.sb;

            const session = await CQ.getSession();
            if (!session || !session.user) return;

            // Verificar si el usuario actual es administrador
            const { data: me } = await sb
                .from('profiles')
                .select('id, role')
                .eq('id', session.user.id)
                .maybeSingle();

            if (!me || me.role !== 'admin') return;

            createAdminModal();

            // 1. Cargar artículos que ya estén pendientes al abrir la página
            const { data: existingPending } = await sb
                .from('items')
                .select('*, owner:profiles!items_owner_id_fkey(username)')
                .eq('approval_status', 'pendiente')
                .order('created_at', { ascending: true });

            if (existingPending && existingPending.length > 0) {
                pendingQueue.push(...existingPending);
                showNextPendingAlert(sb);
            }

            // 2. Escuchar en tiempo real cada vez que alguien inserte un artículo nuevo
            sb.channel('admin-new-items-alert')
                .on(
                    'postgres_changes', { event: 'INSERT', schema: 'public', table: 'items' },
                    async(payload) => {
                        const newItem = payload.new;
                        if (!newItem || newItem.approval_status !== 'pendiente') return;

                        // Obtener el nombre de usuario del dueño
                        const { data: ownerData } = await sb
                            .from('profiles')
                            .select('username')
                            .eq('id', newItem.owner_id)
                            .maybeSingle();

                        newItem.owner = ownerData || { username: 'usuario' };
                        pendingQueue.push(newItem);
                        playAdminAlertTone();
                        showNextPendingAlert(sb);
                    }
                )
                .subscribe();
        }

        function playAdminAlertTone() {
            try {
                const ctx = new(window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.12);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.35);
            } catch (e) { /* sin audio si el navegador no ha tenido interacción previa */ }
        }

        function createAdminModal() {
            if (document.getElementById('cq-admin-item-modal')) return;
            const modal = document.createElement('div');
            modal.id = 'cq-admin-item-modal';
            modal.style.cssText =
                'display: none; position: fixed; inset: 0; z-index: 10000; background: rgba(7, 6, 26, 0.88); backdrop-filter: blur(6px); align-items: center; justify-content: center; padding: 16px;';
            modal.innerHTML =
                '<div style="background: #141B2D; border: 2px solid #FFC21A; border-radius: 16px; max-width: 480px; width: 100%; padding: 24px; color: #F1F5F9; box-shadow: 0 24px 60px rgba(0,0,0,0.75); position: relative; font-family: inherit; max-height: 90vh; overflow-y: auto;">' +
                '<button id="cq-admin-item-close" type="button" style="position: absolute; top: 12px; right: 14px; background: none; border: none; color: #94A3B8; font-size: 24px; cursor: pointer;">&times;</button>' +
                '<div id="cq-admin-item-body"></div>' +
                '</div>';
            document.body.appendChild(modal);

            document.getElementById('cq-admin-item-close').addEventListener('click', () => {
                modal.style.display = 'none';
                isModalOpen = false;
            });
        }

        function showNextPendingAlert(sb) {
            if (isModalOpen || pendingQueue.length === 0) return;
            isModalOpen = true;

            const item = pendingQueue[0];
            const modal = document.getElementById('cq-admin-item-modal');
            const body = document.getElementById('cq-admin-item-body');

            const cats = (item.categories && item.categories.length ? item.categories : [item.category]).join(', ');
            const unitsTxt = item.units ? `${item.units} unidades` : 'Producción normal';
            const ownerName = (item.owner && item.owner.username) ? `@${item.owner.username}` : 'Coleccionista';
            const valueFmt = Number(item.value || 0).toFixed(2);

            body.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
        <span style="background:#FFC21A22; color:#FFC21A; border:1px solid #FFC21A66; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700;">
          🔔 SOLICITUD DE NUEVO ARTÍCULO (${pendingQueue.length} pendiente${pendingQueue.length > 1 ? 's' : ''})
        </span>
      </div>

      <h2 style="margin: 4px 0 6px; font-size: 20px; color: #FFFFFF;">${item.name}</h2>
      <p style="margin: 0 0 14px; font-size: 13px; color: #94A3B8;">Solicitado por: <strong style="color:#38BDF8;">${ownerName}</strong></p>

      ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" style="width: 180px; height: 220px; object-fit: cover; border-radius: 12px; border: 2px solid #334155; display: block; margin: 0 auto 14px;">` : ''}

      <div style="background: #0B101D; border: 1px solid #1E293B; border-radius: 10px; padding: 12px; font-size: 13px; display: grid; gap: 8px; margin-bottom: 16px;">
        <div><span style="color:#94A3B8;">Descripción:</span> <span style="color:#E2E8F0;">${item.description || 'Sin descripción'}</span></div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div><span style="color:#94A3B8;">Valor declarado:</span><br><strong style="color:#10B981;">$${valueFmt} MXN</strong></div>
          <div><span style="color:#94A3B8;">Modalidad:</span><br><strong style="color:#F1F5F9; text-transform:capitalize;">${item.listing}</strong></div>
          <div><span style="color:#94A3B8;">Categorías:</span><br><strong style="color:#C084FC; text-transform:capitalize;">${cats}</strong></div>
          <div><span style="color:#94A3B8;">Existencias / Rareza:</span><br><strong style="color:#FBBF24;">${unitsTxt} (${item.rarity})</strong></div>
        </div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button id="cq-admin-approve" type="button" style="flex: 1; padding: 11px; border-radius: 10px; border: none; background: #10B981; color: #052E16; font-weight: 800; cursor: pointer;">
          ✔ Aprobar y publicar
        </button>
        <button id="cq-admin-reject" type="button" style="flex: 1; padding: 11px; border-radius: 10px; border: 1px solid #EF4444; background: #EF444422; color: #F87171; font-weight: 700; cursor: pointer;">
          ✖ Rechazar
        </button>
      </div>
    `;

    document.getElementById('cq-admin-approve').addEventListener('click', async () => {
      const { error } = await sb
        .from('items')
        .update({ approval_status: 'aprobado' })
        .eq('id', item.id);

      if (error) {
        alert('Error al aprobar: ' + error.message);
        return;
      }
      if (window.CQ.toast) window.CQ.toast(`"${item.name}" aprobado y publicado.`);
      advanceQueue(sb);
    });

    document.getElementById('cq-admin-reject').addEventListener('click', async () => {
      const { error } = await sb
        .from('items')
        .delete()
        .eq('id', item.id);

      if (error) {
        alert('Error al rechazar: ' + error.message);
        return;
      }
      if (window.CQ.toast) window.CQ.toast(`"${item.name}" rechazado y eliminado.`, 'error');
      advanceQueue(sb);
    });

    modal.style.display = 'flex';
  }

  function advanceQueue(sb) {
    pendingQueue.shift();
    isModalOpen = false;
    const modal = document.getElementById('cq-admin-item-modal');
    if (pendingQueue.length > 0) {
      showNextPendingAlert(sb);
    } else {
      modal.style.display = 'none';
    }
  }

  window.addEventListener('DOMContentLoaded', initAdminItemAlerts);
})();