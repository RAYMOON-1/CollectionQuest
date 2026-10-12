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
    exhibicion:  { label: 'Exhibición',  icon: 'eye',              color: 'purple' }
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
    if (url) {
      return `<img class="avatar" src="${esc(url)}" alt="" width="${size}" height="${size}" style="--s:${size}px">`;
    }
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `<span class="avatar avatar-fallback" style="--s:${size}px;--h:${h}" aria-hidden="true">${esc(name[0].toUpperCase())}</span>`;
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

  /* ---------- Mensajes ---------- */
  function friendlyError(err) {
    const msg = String(err?.message || err || '');
    if (err?.code === '23505' || /duplicate key/i.test(msg)) return 'Ese nombre de usuario ya está en uso.';
    if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
    if (/Email not confirmed/i.test(msg)) return 'Confirma tu correo antes de entrar. Revisa tu bandeja de entrada.';
    if (/already registered/i.test(msg)) return 'Ese correo ya tiene cuenta. Inicia sesión.';
    if (/at least \d+ characters/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
    if (/rate limit/i.test(msg)) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
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
    safeImageUrl, avatarHTML,
    compressImage, uploadImage, removeImageByUrl,
    friendlyError, toast, configBanner, getSession
  };

  document.addEventListener('DOMContentLoaded', configBanner);
})();
