/* ============================================================
   Collection Quest - Escáner RFID (Web Serial API + Supabase)
   ============================================================ */
(function() {
    let serialPort = null;
    let serialWriter = null;
    let isReading = false;

    // Detecta la instancia global de Supabase en Collection Quest
    function getSupabase() {
        if (window.CQ && window.CQ.sb) return window.CQ.sb;
        if (typeof supabaseClient !== 'undefined') return supabaseClient;
        if (window.supabaseClient) return window.supabaseClient;
        if (window.sb) return window.sb;
        if (window.supabase && typeof window.supabase.from === 'function') return window.supabase;
        return null;
    }

    // 1. Inyectar botón dentro del menú lateral desplegable (debajo de #nav-add) y el modal
    function initScannerUI() {
        if (document.getElementById('cq-rfid-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'cq-rfid-btn';
        btn.type = 'button';
        btn.className = 'nav-item';
        btn.innerHTML =
            '<img class="ico" src="assets/antena.webp" width="22" height="22" alt="" style="object-fit: contain;">' +
            '<span>Escáner RFID</span>';
        btn.addEventListener('click', connectScanner);

        const navAdd = document.getElementById('nav-add');
        if (navAdd && navAdd.parentNode) {
            navAdd.parentNode.insertBefore(btn, navAdd.nextSibling);
        } else {
            btn.style.cssText = 'position: fixed; bottom: 20px; left: 20px; z-index: 9998; background: #120f33; border: 1px solid #FFBF1F; padding: 10px 16px; border-radius: 999px;';
            document.body.appendChild(btn);
        }

        const modal = document.createElement('div');
        modal.id = 'cq-rfid-modal';
        modal.style.cssText = 'display: none; position: fixed; inset: 0; z-index: 9999; background: rgba(10, 14, 26, 0.85); backdrop-filter: blur(6px); align-items: center; justify-content: center; padding: 16px;';
        modal.innerHTML =
            '<div id="cq-rfid-card" style="background: #141B2D; border: 2px solid #FFBF1F; border-radius: 16px; max-width: 420px; width: 100%; padding: 24px; color: #F1F5F9; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.65); position: relative; font-family: inherit;">' +
            '<button id="cq-rfid-close" style="position: absolute; top: 12px; right: 14px; background: none; border: none; color: #94A3B8; font-size: 24px; cursor: pointer;">&times;</button>' +
            '<div id="cq-rfid-content"></div>' +
            '</div>';
        document.body.appendChild(modal);

        document.getElementById('cq-rfid-close').addEventListener('click', function() {
            modal.style.display = 'none';
        });
    }

    // 2. Conectar con ESP32 vía USB (Chrome / Edge)
    async function connectScanner() {
        if (!('serial' in navigator)) {
            alert('Usa Google Chrome o Microsoft Edge para conectar el escáner RFID.');
            return;
        }

        try {
            serialPort = await navigator.serial.requestPort();
            await serialPort.open({ baudRate: 9600 });

            const textEncoder = new TextEncoderStream();
            textEncoder.readable.pipeTo(serialPort.writable);
            serialWriter = textEncoder.writable.getWriter();

            const btn = document.getElementById('cq-rfid-btn');
            btn.innerHTML =
                '<img class="ico" src="assets/antena.webp" width="22" height="22" alt="" style="object-fit: contain;">' +
                '<span style="color: #10B981; font-weight: 700;">Escáner Conectado</span>';

            readSerialLoop();
        } catch (err) {
            console.error('Error al abrir puerto serial:', err);
        }
    }

    // 3. Escuchar los UID enviados desde el ESP32
    async function readSerialLoop() {
        const textDecoder = new TextDecoderStream();
        serialPort.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();
        isReading = true;
        let buffer = '';

        try {
            while (isReading) {
                const res = await reader.read();
                if (res.done) break;
                buffer += res.value;
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.startsWith('UID:')) {
                        const uid = line.replace('UID:', '').trim();
                        await lookupCardByUID(uid);
                    }
                }
            }
        } catch (err) {
            console.error('Conexión serial cerrada:', err);
        } finally {
            reader.releaseLock();
        }
    }

    // 4. Buscar el UID en la tabla "items" de Supabase
    async function lookupCardByUID(uid) {
        const sb = getSupabase();
        if (!sb) {
            alert('No se detectó la conexión a Supabase en esta página.');
            return;
        }

        const { data: item, error } = await sb
            .from('items')
            .select('*')
            .eq('rfid_uid', uid)
            .maybeSingle();

        if (error || !item) {
            if (serialWriter) await serialWriter.write('0'); // Enciende LED Rojo en ESP32
            await renderNotFound(uid, sb);
            return;
        }

        if (serialWriter) await serialWriter.write('1'); // Enciende LED Verde en ESP32
        renderPokemonCard(item, uid);
    }

    // 5A. Mostrar tarjeta encontrada
    function renderPokemonCard(item, uid) {
        const modal = document.getElementById('cq-rfid-modal');
        const card = document.getElementById('cq-rfid-card');
        const content = document.getElementById('cq-rfid-content');

        const rarityCfg = (window.CQ_CONFIG && window.CQ_CONFIG.RARITY && window.CQ_CONFIG.RARITY[item.rarity]) || {
            label: item.rarity || 'Común',
            hex: '#46A8FF',
            points: item.points || 10
        };

        const itemName = item.name || item.title || 'Sin nombre';
        const rawVal = item.value != null ? item.value : (item.price != null ? item.price : 0);
        const itemValue = Number(rawVal).toFixed(2);
        const pts = item.points || rarityCfg.points;

        card.style.borderColor = rarityCfg.hex;
        content.innerHTML =
            '<span style="display: inline-block; padding: 4px 12px; border-radius: 999px; background: ' + rarityCfg.hex + '22; color: ' + rarityCfg.hex + '; font-weight: 700; font-size: 12px; text-transform: uppercase; margin-bottom: 10px;">' +
            '★ ' + rarityCfg.label + ' (+' + pts + ' pts)</span>' +
            '<h2 style="margin: 6px 0 12px; font-size: 22px;">' + itemName + '</h2>' +
            (item.image_url ? '<img src="' + item.image_url + '" alt="' + itemName + '" style="width: 180px; height: 240px; object-fit: cover; border-radius: 12px; margin: 0 auto 14px; border: 2px solid ' + rarityCfg.hex + '; display: block;">' : '') +
            '<p style="color: #CBD5E1; font-size: 14px; margin-bottom: 14px;">' + (item.description || 'Sin descripción registrada.') + '</p>' +
            '<div style="display: flex; justify-content: space-around; background: #0B101D; padding: 10px; border-radius: 10px;">' +
            '<div><small style="color:#94A3B8;">Valor</small><div style="font-weight:700; color:#10B981;">$' + itemValue + '</div></div>' +
            '<div><small style="color:#94A3B8;">Tag UID</small><div style="font-family:monospace; color:#38BDF8;">${uid}</div></div>' +
            '</div>';
        modal.style.display = 'flex';
    }

    // 5B. Mostrar "Dato no encontrado" con opción para vincular el sticker en 1 clic
    async function renderNotFound(uid, sb) {
        const modal = document.getElementById('cq-rfid-modal');
        const card = document.getElementById('cq-rfid-card');
        const content = document.getElementById('cq-rfid-content');

        const { data: unlinkedItems } = await sb
            .from('items')
            .select('id, name')
            .is('rfid_uid', null)
            .order('created_at', { ascending: false })
            .limit(30);

        const optionsHTML = (unlinkedItems || [])
            .map(function(it) { return '<option value="' + it.id + '">' + it.name + '</option>'; })
            .join('');

        card.style.borderColor = '#EF4444';
        content.innerHTML =
            '<div style="font-size: 42px; margin-bottom: 6px;">❌</div>' +
            '<h2 style="color: #F87171; margin: 0 0 8px;">Dato no encontrado</h2>' +
            '<p style="color: #CBD5E1; font-size: 14px; margin-bottom: 12px;">Este tag no está registrado en <strong>Collection Quest</strong>.</p>' +
            '<div style="background: #0B101D; padding: 8px; border-radius: 8px; font-family: monospace; color: #FBBF24; margin-bottom: 14px;">UID: ' + uid + '</div>' +
            (optionsHTML ?
                '<div style="border-top: 1px solid #1E293B; padding-top: 12px; text-align: left;">' +
                '<label style="font-size: 12px; color: #94A3B8; display: block; margin-bottom: 6px;">¿Vincular este sticker a una tarjeta existente?</label>' +
                '<select id="cq-rfid-select" style="width: 100%; padding: 8px; border-radius: 8px; background: #0B101D; color: #fff; border: 1px solid #334155; margin-bottom: 8px;">' + optionsHTML + '</select>' +
                '<button id="cq-rfid-link-btn" style="width: 100%; padding: 10px; border-radius: 8px; border: none; background: #3B82F6; color: #fff; font-weight: 700; cursor: pointer;">Vincular Tag a esta Tarjeta</button>' +
                '</div>' :
                '');

        const linkBtn = document.getElementById('cq-rfid-link-btn');
        if (linkBtn) {
            linkBtn.addEventListener('click', async function() {
                const itemId = document.getElementById('cq-rfid-select').value;
                const { error } = await sb.from('items').update({ rfid_uid: uid }).eq('id', itemId);
                if (error) {
                    alert('Error al vincular: ' + error.message);
                } else {
                    await lookupCardByUID(uid);
                }
            });
        }

        modal.style.display = 'flex';
    }

    window.addEventListener('DOMContentLoaded', initScannerUI);
})();