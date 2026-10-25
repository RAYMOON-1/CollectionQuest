/* ============================================================
   Utilidades compartidas por todas las páginas
   ============================================================ */
(function () {
  const cfg = window.CQ_CONFIG || {};
  const configured =
    !!cfg.SUPABASE_URL && !!cfg.SUPABASE_KEY &&
    !cfg.SUPABASE_URL.includes('TU_PROYECTO') &&
    !cfg.SUPABASE_KEY.includes('TU_PUBLISHABLE');

  const sb = configured && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY)
    : null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------- Seguridad: todo texto de usuarios pasa por esc() ---------- */
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

  /* ---------- Iconos (imágenes locales en assets/icons/<color>/) ---------- */
  const icon = (name, color = 'white', size = 20, cls = '') =>
    `<img class="ico ${cls}" src="assets/icons/${color}/${name}.svg" width="${size}" height="${size}" alt="" aria-hidden="true">`;

  /* ---------- Catálogos ---------- */
  const RARITY = cfg.RARITY || {};
  const RARITY_ORDER = ['comun', 'rara', 'epica', 'mitica', 'legendaria'];

  const LISTING = {
    venta:       { label: 'Venta',       icon: 'tag',              color: 'green'  },
    intercambio: { label: 'Intercambio', icon: 'arrow-left-right', color: 'blue'   },
    exhibicion:  { label: 'Exhibición',  icon: 'eye',              color: 'purple' },
    subasta:     { label: 'Subasta',     icon: 'gavel',            color: 'pink'   }
  };

  const LEVEL_TITLES = [
    'Novato', 'Aprendiz', 'Explorador', 'Coleccionista', 'Experto',
    'Maestro', 'Gran maestro', 'Campeón', 'Leyenda'
  ];

  function rarityFromValue(v) {
    const n = Number(v) || 0;
    let found = 'comun';
    RARITY_ORDER.forEach((k) => { if (RARITY[k] && n >= RARITY[k].min) found = k; });
    return found;
  }

  // Mismo cálculo que la función level_for_points de la base de datos.
  function levelInfo(points) {
    const p = Math.max(0, Number(points) || 0);
    const level = 1 + Math.floor(Math.sqrt(p / 25));
    const floor = 25 * (level - 1) ** 2;
    const next = 25 * level ** 2;
    const pct = Math.min(100, Math.round(((p - floor) / (next - floor)) * 100));
    const title = LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)];
    return { level, points: p, floor, next, pct, title, toNext: next - p };
  }

  const money = (n) =>
    '$' + Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });

  /* ---------- Imágenes ---------- */
  // Solo se muestran imágenes que vengan del Storage de TU proyecto.
  function safeImageUrl(url) {
    if (!url || !configured) return null;
    const prefix = cfg.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1/object/public/';
    return String(url).startsWith(prefix) ? url : null;
  }

  function avatarHTML(profile, size = 40) {
    const name = profile?.username || '?';
    const url = safeImageUrl(profile?.avatar_url);
    const ringColor = /^#[0-9a-f]{6}$/i.test(profile?.avatar_color || '') ? profile.avatar_color : '';
    const ring = ringColor ? `;--ring:${ringColor}` : '';
    if (url) {
      return `<img class="avatar" src="${esc(url)}" alt="" width="${size}" height="${size}" style="--s:${size}px${ring}">`;
    }
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `<span class="avatar avatar-fallback" style="--s:${size}px;--h:${h}${ring}" aria-hidden="true">${esc(name[0].toUpperCase())}</span>`;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
      img.src = url;
    });
  }

  // Reduce y convierte a JPG para que suba rápido y no gaste tu espacio gratis.
  async function compressImage(file, maxDim = 1280, quality = 0.85) {
    let src;
    try {
      src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      src = await loadImage(file);
    }
    const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
    const w = Math.round(src.width * scale);
    const h = Math.round(src.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))),
        'image/jpeg',
        quality
      )
    );
  }

  async function uploadImage(bucket, blob, uid) {
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${uid}/${Date.now()}-${rand}.jpg`;
    const { error } = await sb.storage.from(bucket).upload(path, blob, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: false
    });
    if (error) throw error;
    return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }

  // Borra un archivo viejo (si falla, no pasa nada).
  async function removeImageByUrl(bucket, url) {
    try {
      const marker = `/storage/v1/object/public/${bucket}/`;
      const i = String(url || '').indexOf(marker);
      if (i === -1) return;
      const path = decodeURIComponent(url.slice(i + marker.length));
      await sb.storage.from(bucket).remove([path]);
    } catch (e) { /* silencioso */ }
  }


  /* ---------- Categorías de productos ---------- */
  const CATEGORIES = {
    comic:      { label: 'Cómic',      plural: 'Cómics',      icon: 'book-open'  },
    manga:      { label: 'Manga',      plural: 'Manga',       icon: 'book-text'  },
    carta:      { label: 'Carta',      plural: 'Cartas',      icon: 'layers'     },
    vinilo:     { label: 'Vinilo',     plural: 'Vinilos',     icon: 'disc-3'     },
    figura:     { label: 'Figura',     plural: 'Figuras',     icon: 'bot'        },
    videojuego: { label: 'Videojuego', plural: 'Videojuegos', icon: 'gamepad-2'  },
    arte:       { label: 'Arte',       plural: 'Arte',        icon: 'palette'    },
    moneda:     { label: 'Moneda',     plural: 'Monedas',     icon: 'coins'      },
    estampilla: { label: 'Estampilla', plural: 'Estampillas', icon: 'stamp'      }
  };
  const CATEGORY_ORDER = ['comic', 'manga', 'carta', 'vinilo', 'figura', 'videojuego', 'arte', 'moneda', 'estampilla'];

  /* ---------- Búsqueda: sin acentos, comas ni puntos ----------
     "Cámión, Rojo." se convierte en las palabras ["camion", "rojo"].
     Es el mismo criterio que usa la base de datos (función norm_text). */
  function normText(s) {
    return String(s ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  function searchTokens(q) {
    const t = normText(q);
    return t ? t.split(' ').slice(0, 6) : [];
  }

  /* ---------- Correos válidos ---------- */
  const DISPOSABLE = [
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com', 'tempmail.com',
    'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'sharklasers.com', 'maildrop.cc',
    'dispostable.com', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'mohmal.com',
    'emailondeck.com', 'spamgourmet.com', 'tempr.email', 'moakt.com', 'mailnesia.com', 'burnermail.io',
    'discard.email', 'tempinbox.com', 'mytemp.email', 'tmpmail.org', 'tmpmail.net', 'mail.tm',
    'inboxkitten.com', 'anonbox.net', '33mail.com', 'guerrillamailblock.com', 'grr.la', 'spam4.me',
    'trashmail.net', 'wegwerfmail.de', 'example.com'
  ];
  const EMAIL_TYPOS = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.con': 'gmail.com',
    'gmail.co': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.cm': 'gmail.com',
    'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmai.com': 'hotmail.com',
    'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'outloook.com': 'outlook.com',
    'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com',
    'iclod.com': 'icloud.com', 'icloud.con': 'icloud.com'
  };

  // Correos obviamente inventados: 123456, aaaaaa, prueba1, test...
  function looksFake(local) {
    return /(012345|123456|234567|345678|456789|567890|098765|987654|876543|765432|654321)/.test(local)
      || /(.)\1{5,}/.test(local)
      || /^(test|prueba|asdf|qwerty|fake|correo|nada|xxx|aaa|abc|abcd|admin|user|usuario)[0-9_.-]*$/.test(local);
  }

  // ¿El dominio existe y recibe correo? (consulta DNS pública; si no hay internet, se deja pasar)
  async function domainHasMail(domain) {
    const ask = async (type) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 3000);
      try {
        const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`, { signal: ctl.signal });
        return await r.json();
      } finally { clearTimeout(t); }
    };
    try {
      const mx = await ask('MX');
      if (mx.Status === 3) return false;                         // el dominio no existe
      if (mx.Answer && mx.Answer.length) return true;
      const a = await ask('A');
      return !!(a.Answer && a.Answer.length);
    } catch (e) { return true; }
  }

  function validateEmail(raw) {
    const email = String(raw || '').trim().toLowerCase();
    if (!email) return { ok: false, message: 'Escribe tu correo electrónico.' };
    const parts = email.split('@');
    const bad = { ok: false, message: 'Ese correo no parece válido. Revisa que tenga la forma nombre@dominio.com' };
    if (parts.length !== 2 || email.length > 254) return bad;
    const [local, domain] = parts;
    if (!local || local.length > 64 || !/^[a-z0-9._%+\-]+$/.test(local)) return bad;
    if (local.startsWith('.') || local.endsWith('.') || email.includes('..')) return bad;
    const labels = domain.split('.');
    if (labels.length < 2) return bad;
    if (!labels.every((l) => /^[a-z0-9\-]+$/.test(l) && !l.startsWith('-') && !l.endsWith('-'))) return bad;
    if (!/^[a-z]{2,24}$/.test(labels[labels.length - 1])) return bad;

    if (looksFake(local)) {
      return { ok: false, message: 'Ese correo parece de prueba o inventado. Usa tu correo real: ahí te llega el mensaje para confirmar tu cuenta.' };
    }
    if (EMAIL_TYPOS[domain]) {
      return { ok: false, message: `¿Quisiste decir ${local}@${EMAIL_TYPOS[domain]}?`, suggestion: `${local}@${EMAIL_TYPOS[domain]}` };
    }
    if (DISPOSABLE.some((d) => domain === d || domain.endsWith('.' + d))) {
      return { ok: false, message: 'No aceptamos correos temporales. Usa tu correo de siempre.' };
    }
    return { ok: true, email };
  }

  // Enlace a la bandeja de entrada según el proveedor (si lo conocemos).
  function inboxLink(email) {
    const d = String(email || '').split('@')[1]?.toLowerCase() || '';
    if (/^(gmail|googlemail)\.com$/.test(d)) return 'https://mail.google.com/';
    if (/^(outlook|hotmail|live|msn)\./.test(d)) return 'https://outlook.live.com/mail/';
    if (/^yahoo\./.test(d) || d === 'ymail.com') return 'https://mail.yahoo.com/';
    if (d === 'icloud.com' || d === 'me.com') return 'https://www.icloud.com/mail';
    if (d === 'proton.me' || d === 'protonmail.com') return 'https://mail.proton.me/';
    return null;
  }

  /* ---------- CLABE (18 dígitos con dígito verificador) ---------- */
  function clabeValid(c) {
    if (!/^[0-9]{18}$/.test(c || '')) return false;
    const w = [3, 7, 1];
    let total = 0;
    for (let i = 0; i < 17; i++) total += (Number(c[i]) * w[i % 3]) % 10;
    return (10 - (total % 10)) % 10 === Number(c[17]);
  }
  const formatClabe = (c) => String(c || '').replace(/^(\d{3})(\d{3})(\d{11})(\d)$/, '$1 $2 $3 $4');

  function fmtCountdown(ms) {
    if (ms <= 0) return 'Terminó';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return d > 0 ? `${d} d ${p(h)}:${p(m)}:${p(sec)}` : `${p(h)}:${p(m)}:${p(sec)}`;
  }

  /* ---------- Insignia de perfil verificado ---------- */
  const verifiedBadge = (p, size = 16) =>
    p && p.verified
      ? `<img class="ico verified" src="assets/icons/green/badge-check.svg" width="${size}" height="${size}" alt="Perfil verificado" title="Perfil verificado">`
      : '';

  // Sube un archivo a un bucket PRIVADO y regresa su ruta (no una URL pública).
  async function uploadPrivate(bucket, blob, uid, prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${uid}/${prefix}-${Date.now()}-${rand}.jpg`;
    const { error } = await sb.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return path;
  }

  /* ---------- Mensajes ---------- */
  function friendlyError(err) {
    const msg = String(err?.message || err || '');
    if (err?.code === '23505' || /duplicate key/i.test(msg)) return 'Ese nombre de usuario ya está en uso.';
    if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
    if (/Email not confirmed/i.test(msg)) return 'Confirma tu correo antes de entrar. Revisa tu bandeja de entrada.';
    if (/already registered/i.test(msg)) return 'Ese correo ya tiene cuenta. Inicia sesión.';
    if (/at least \d+ characters/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
    if (/rate limit/i.test(msg)) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
    if (/Database error saving new user/i.test(msg)) return 'No pudimos crear la cuenta. Revisa que tu correo sea real (no se aceptan correos temporales) y que el nombre de usuario no esté repetido.';
    if (/Failed to fetch|NetworkError/i.test(msg)) return 'No se pudo conectar con Supabase. Revisa tu internet y assets/js/config.js.';
    if (/row-level security|violates row/i.test(msg)) return 'No tienes permiso para hacer eso. ¿Ejecutaste sql/schema.sql?';
    if (/mime|not allowed/i.test(msg)) return 'Ese tipo de archivo no está permitido. Usa JPG, PNG o WebP.';
    if (/exceeded the maximum|too large|payload/i.test(msg)) return 'La imagen es demasiado pesada.';
    return msg || 'Algo salió mal. Intenta de nuevo.';
  }

  function toast(message, type = 'ok') {
    let box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.className = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `${icon(type === 'error' ? 'circle-alert' : 'check', type === 'error' ? 'pink' : 'green', 18)}<span>${esc(message)}</span>`;
    box.appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 6000 : 3200);
  }

  function configBanner() {
    if (configured) return;
    const b = document.createElement('div');
    b.className = 'config-banner';
    b.innerHTML =
      `${icon('circle-alert', 'dark', 18)}<span>Falta conectar Supabase: abre <b>assets/js/config.js</b> y pega tu Project URL y tu Publishable key.</span>`;
    document.body.prepend(b);
  }

  async function getSession() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session || null;
  }

  window.CQ = {
    cfg, configured, sb,
    $, $$, esc, icon,
    RARITY, RARITY_ORDER, LISTING,
    rarityFromValue, levelInfo, money,
    CATEGORIES, CATEGORY_ORDER, normText, searchTokens,
    validateEmail, domainHasMail, inboxLink, verifiedBadge, clabeValid, formatClabe, fmtCountdown,
    safeImageUrl, avatarHTML,
    compressImage, uploadImage, uploadPrivate, removeImageByUrl,
    friendlyError, toast, configBanner, getSession
  };

  document.addEventListener('DOMContentLoaded', configBanner);
})();
