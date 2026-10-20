(async function () {
  const { $, esc, icon, RARITY, RARITY_ORDER, LISTING, money, sb, configured, safeImageUrl, getSession } = window.CQ;

  /* ----- Escalera de rareza (sale de config.js) ----- */
  const ladder = $('#ladder');
  ladder.innerHTML = RARITY_ORDER.map((key, i) => {
    const r = RARITY[key];
    const next = RARITY[RARITY_ORDER[i + 1]];
    const range = next
      ? `$${r.min.toLocaleString('es-MX')} a $${(next.min - 1).toLocaleString('es-MX')}`
      : `$${r.min.toLocaleString('es-MX')} o más`;
    return `
      <article class="ladder-step" style="--tier:${r.hex}">
        ${icon('gem', r.color, 30)}
        <h3>${esc(r.label)}</h3>
        <p>${range}<br><b>+${r.points} puntos</b></p>
      </article>`;
  }).join('');

  if (!configured) return;

  /* ----- Si ya hay sesión, el botón lleva directo a la app ----- */
  const session = await getSession();
  if (session) {
    $('#hero-actions').innerHTML = `
      <a class="btn btn-green" href="app.html">
        ${icon('layout-grid', 'dark', 22)} Ir a mi colección
      </a>`;
    const top = $('#top-login');
    top.textContent = 'Mi colección';
    top.href = 'app.html';
  }

  /* ----- Piezas destacadas (las más raras) ----- */
  const { data, error } = await sb
    .from('items')
    .select('name, value, rarity, listing, image_url, owner:profiles!owner_id(username)')
    .order('points', { ascending: false })
    .order('value', { ascending: false })
    .limit(4);

  if (error || !data || !data.length) return;

  $('#featured').innerHTML = data.map((it) => {
    const r = RARITY[it.rarity] || RARITY.comun;
    const l = LISTING[it.listing] || LISTING.exhibicion;
    const img = safeImageUrl(it.image_url);
    return `
      <article class="card r-${esc(it.rarity)}">
        <div class="card-img">
          ${img ? `<img class="photo" loading="lazy" src="${esc(img)}" alt="${esc(it.name)}">` : icon('package', 'muted', 48)}
          <span class="badge badge-rarity">${icon('gem', r.color, 14)}${esc(r.label)}</span>
          <span class="badge badge-listing l-${esc(it.listing)}">${icon(l.icon, l.color, 14)}${esc(l.label)}</span>
        </div>
        <div class="card-body">
          <h3>${esc(it.name)}</h3>
          <div class="card-foot">
            <span class="value">${money(it.value)}</span>
            <span class="owner"><span>@${esc(it.owner?.username || '')}</span></span>
          </div>
        </div>
      </article>`;
  }).join('');
  $('#featured-section').hidden = false;
})();
