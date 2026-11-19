# Prueba la página completa en un navegador (Chromium) con un Supabase simulado.
#   pip install playwright && playwright install chromium
#   python3 dev-tests/run.py
import subprocess, time, re, os
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..')
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
mock = open(os.path.join(HERE,'mock_supabase.js')).read()
CFG = "window.CQ_CONFIG={SUPABASE_URL:'https://x.supabase.co',SUPABASE_KEY:'k',AUTH_PROVIDERS:{google:true,facebook:true,apple:true},RARITY:{comun:{label:'Común',maxUnits:null,range:'Más de 5,000 o producción normal',points:10,color:'gray',hex:'#A7B0C4'},rara:{label:'Rara',maxUnits:5000,range:'501 a 5,000 unidades',points:25,color:'blue',hex:'#46A8FF'},epica:{label:'Épica',maxUnits:500,range:'101 a 500 unidades',points:60,color:'purple',hex:'#B26CFF'},mitica:{label:'Mítica',maxUnits:100,range:'11 a 100 unidades',points:150,color:'pink',hex:'#FF5FCF'},legendaria:{label:'Legendaria',maxUnits:10,range:'1 a 10 unidades',points:400,color:'gold',hex:'#FFC21A'}}};"
PHOTO = os.path.join(HERE,'photo.png'); SHOT = '/tmp/cq_shots/'; os.makedirs(SHOT, exist_ok=True)
errors=[]; fails=[]; U='http://localhost:8765/'
def check(name, cond, extra=''):
    print(('OK   ' if cond else 'FALLA'), name, ('' if cond else extra))
    if not cond: fails.append(name)
try:
  with sync_playwright() as p:
    b = p.chromium.launch()
    def mk(w=1280,h=900):
        ctx = b.new_context(viewport={'width':w,'height':h}); pg = ctx.new_page()
        pg.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type=='error' and 'ERR_' not in m.text and 'fonts.g' not in m.text else None)
        pg.on('pageerror', lambda e: errors.append('PAGEERROR '+str(e)))
        pg.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(body=mock, content_type='application/javascript'))
        pg.route('**/assets/js/config.js', lambda r: r.fulfill(body=CFG, content_type='application/javascript'))
        pg.route('**/fonts.g*/**', lambda r: r.abort())
        pg.route('https://x.supabase.co/**', lambda r: r.abort())
        pg.route('https://dns.google/**', lambda r: r.abort())
        return pg
    def yes(pg):
        pg.wait_for_selector('#dlg-confirm[open]'); t=pg.inner_text('#dlg-confirm h2'); pg.click('#dlg-confirm [data-cf="yes"]'); pg.wait_for_timeout(300); return t
    def no(pg):
        pg.wait_for_selector('#dlg-confirm[open]'); t=pg.inner_text('#dlg-confirm h2'); pg.click('#dlg-confirm [data-cf="no"]'); pg.wait_for_timeout(300); return t
    def open_form(pg):
        pg.click('#fab-add'); pg.wait_for_timeout(300)
    def fill_item(pg, name, cats, photo=True):
        pg.fill('#item-name', name)
        for c in cats: pg.check(f'#c-{c}', force=True)
        if photo: pg.set_input_files('#file-gallery', PHOTO)
        pg.wait_for_timeout(300)
    def save_item(pg):
        pg.click('#item-submit'); pg.wait_for_timeout(900)

    # ================= página inicial: rareza por unidades
    pg=mk(); pg.goto(U+'index.html'); pg.wait_for_timeout(600)
    t=pg.inner_text('#ladder')
    check('landing: rareza por unidades (1 a 10, 11 a 100, 101 a 500...)', all(x in t for x in ['1 a 10 unidades','11 a 100 unidades','101 a 500 unidades','501 a 5,000 unidades']) and 'Cuantas menos unidades' in pg.inner_text('body'))

    # ================= formulario: categorías 1 a 3
    pg=mk(); pg.goto(U+'app.html'); pg.wait_for_timeout(1000)
    open_form(pg)
    check('9 categorías en casillas', pg.locator('#cat-grid input[type="checkbox"]').count()==9 and '0 de 3' in pg.inner_text('#cat-count'))
    for c in ['comic','manga','carta']: pg.check(f'#c-{c}', force=True)
    check('con 3 elegidas las demás se bloquean', pg.is_disabled('#c-vinilo') and pg.is_disabled('#c-arte') and '3 de 3' in pg.inner_text('#cat-count'))
    pg.uncheck('#c-manga', force=True)
    check('al quitar una se desbloquean', not pg.is_disabled('#c-vinilo') and '2 de 3' in pg.inner_text('#cat-count'))
    pg.uncheck('#c-comic', force=True); pg.uncheck('#c-carta', force=True)
    pg.fill('#item-name','Sin categoría'); pg.set_input_files('#file-gallery', PHOTO); pg.wait_for_timeout(300)
    pg.click('#item-submit'); pg.wait_for_timeout(250)
    check('se exige al menos una categoría', 'al menos una categoría' in pg.inner_text('#item-error'))

    # ================= rareza por unidades (vista previa)
    for raw,exp in [('',"Común"),('10','Legendaria'),('1','Legendaria'),('11','Mítica'),('100','Mítica'),('101','Épica'),('500','Épica'),('501','Rara'),('5000','Rara'),('5001','Común')]:
        pg.fill('#item-units', raw); pg.wait_for_timeout(60)
        if exp not in pg.inner_text('#rarity-preview'): check(f'vista previa de rareza con {raw or "vacío"} unidades', False, pg.inner_text('#rarity-preview'))
    check('vista previa de rareza por unidades (vacío, 1, 10, 11, 100, 101, 500, 501, 5000, 5001)', True)
    pg.fill('#item-value','99999'); pg.fill('#item-units',''); pg.wait_for_timeout(60)
    check('el valor ya no cambia la rareza', 'Común' in pg.inner_text('#rarity-preview'))
    pg.keyboard.press('Escape')

    # ================= precio en línea: búsqueda automática, tope y guardado
    open_form(pg)
    check('antes de tener datos se explica qué falta', 'automáticamente' in pg.inner_text('#estimate-box'))
    pg.fill('#item-name','Charizard Holo'); pg.check('#c-carta', force=True); pg.wait_for_timeout(1300)
    check('sin foto no se busca todavía', pg.evaluate("window.__invoked||0")==0)
    pg.set_input_files('#file-gallery', PHOTO); pg.wait_for_timeout(1900)
    check('con nombre + categoría + foto se busca solo, una vez', pg.evaluate("window.__invoked")==1)
    body=pg.evaluate("window.__lastBody")
    check('se manda nombre, categorías y una foto chica', body['name']=='Charizard Holo' and body['categories']==['carta'] and body['image']['mime']=='image/jpeg' and 'units' not in body)
    box=pg.inner_text('#estimate-box')
    check('muestra precio estimado, rango, confianza y máximo', '$500' in box and '$450' in box and '$600' in box and 'confianza media' in box and '$520' in box)
    check('el valor se llena solo y se muestra el tope', pg.input_value('#item-value')=='500' and '$520' in pg.inner_text('#value-hint') and pg.get_attribute('#item-value','max')=='520')
    pg.click('#estimate-box summary'); pg.wait_for_timeout(100)
    check('fuentes y precios con enlace', pg.locator('#estimate-box a[href^="https://www.ebay.com"]').count()>=1 and pg.locator('#estimate-box a[rel*="noopener"]').count()>=1)
    check('sugerencias de búsqueda de Google (obligatorias) en un recuadro aislado', pg.locator('iframe.sg-frame[sandbox]').count()==1 and 'Google Search Suggestions chip' in pg.frame_locator('iframe.sg-frame').locator('body').inner_text())
    check('sugiere las unidades encontradas en línea', pg.is_visible('#est-units') and '100' in pg.inner_text('.est-units'))
    pg.screenshot(path=SHOT+'s_estimate.png')
    pg.click('#est-units'); pg.wait_for_timeout(100)
    check('al usarlas cambia la rareza', pg.input_value('#item-units')=='100' and 'Mítica' in pg.inner_text('#rarity-preview'))
    pg.fill('#item-value','521'); pg.click('#item-submit'); pg.wait_for_timeout(250)
    check('un peso arriba del tope se rechaza en la página', 'no puede pasar de $520' in pg.inner_text('#item-error'))
    pg.fill('#item-value','520'); save_item(pg)
    check('con 520 (estimado + 20) se guarda como precio estimado', pg.evaluate("(()=>{const i=window.__db.items.find(x=>x.name==='Charizard Holo');return i&&i.value===520&&i.value_source==='estimado'&&i.estimated_value===500&&i.units===100&&i.rarity==='mitica'&&JSON.stringify(i.categories)==='[\"carta\"]'})()"))
    check('el aviso de guardado dice la rareza', 'Mítica' in pg.inner_text('#toasts'))

    # ================= cambiar el nombre invalida la búsqueda
    open_form(pg)
    fill_item(pg,'Charizard Holo',['carta']); pg.wait_for_timeout(1700)
    n1=pg.evaluate("window.__invoked")
    pg.fill('#item-name','Blastoise Holo'); pg.wait_for_timeout(150)
    check('al cambiar el nombre se avisa y se quita el tope', 'Cambiaste el nombre' in pg.inner_text('#estimate-box') and pg.get_attribute('#item-value','max') is None)
    pg.wait_for_timeout(1700)
    check('y se vuelve a buscar sola', pg.evaluate("window.__invoked")==n1+1 and 'Precio estimado en línea' in pg.inner_text('#estimate-box'))
    pg.keyboard.press('Escape')

    # ================= sin precios, falla y límite: se puede poner el precio a mano
    open_form(pg); fill_item(pg,'Cuadro sinprecio',['arte']); pg.wait_for_timeout(1800)
    check('sin precios confiables: se avisa', 'No encontramos precios confiables' in pg.inner_text('#estimate-box'))
    pg.fill('#item-value','99999'); save_item(pg)
    check('se guarda a mano y queda "sin resultados"', pg.evaluate("(()=>{const i=window.__db.items.find(x=>x.name==='Cuadro sinprecio');return i&&i.value===99999&&i.value_source==='sin_resultados'})()"))
    open_form(pg); fill_item(pg,'Cosa falla',['figura']); pg.wait_for_timeout(1800)
    check('si el servicio falla: mensaje claro y se puede seguir', 'No se pudo consultar internet' in pg.inner_text('#estimate-box') and pg.is_visible('#est-search'))
    pg.fill('#item-value','250'); save_item(pg)
    check('queda como "sin verificar" (manual)', pg.evaluate("(()=>{const i=window.__db.items.find(x=>x.name==='Cosa falla');return i&&i.value_source==='manual'&&!i.estimate_id})()"))
    open_form(pg); fill_item(pg,'Cosa limite',['figura']); pg.wait_for_timeout(1800)
    check('si se pasó el límite diario se explica', 'límite' in pg.inner_text('#estimate-box'))
    pg.keyboard.press('Escape')

    # ================= dos categorías, tarjetas, filtro y detalle
    open_form(pg); fill_item(pg,'Cómic de arte rarísimo',['comic','arte']); pg.wait_for_timeout(1800)
    pg.fill('#item-value','515'); pg.fill('#item-units','50'); save_item(pg)
    check('se guarda con 2 categorías (la primera es la principal)', pg.evaluate("(()=>{const i=window.__db.items.find(x=>x.name==='Cómic de arte rarísimo');return i&&i.category==='comic'&&JSON.stringify(i.categories)==='[\"comic\",\"arte\"]'&&i.rarity==='mitica'})()"))
    pg.evaluate("location.hash='#todos'"); pg.wait_for_timeout(500)
    check('la tarjeta muestra "+1" y las unidades', pg.locator('#grid .badge-more').count()>=1 and 'Edición de' in pg.inner_text('#grid'))
    pg.select_option('#filter-category','arte'); pg.wait_for_timeout(700)
    exp=pg.evaluate("Math.min(24, window.__db.items.filter(i=>i.categories.includes('arte')).length)")
    check('el filtro encuentra por cualquiera de las categorías', pg.locator('#grid .card').count()==exp and exp>=5, f'{pg.locator("#grid .card").count()} vs {exp}')
    pg.select_option('#filter-category',''); pg.wait_for_timeout(500)
    pg.fill('#search','cómic batman año'); pg.wait_for_timeout(900)
    pg.locator('#grid .card').first.click(); pg.wait_for_timeout(400)
    d=pg.inner_text('#dlg-detail')
    check('el detalle muestra todas las categorías, las unidades y el origen del precio', 'Cómic' in d and 'Arte' in d and 'Edición de 100 unidades' in d and 'Precio sin verificar' in d, d[:200])
    pg.keyboard.press('Escape'); pg.fill('#search',''); pg.wait_for_timeout(700)
    pg.locator('#grid .card', has_text='Charizard Holo').first.click(); pg.wait_for_timeout(400)
    check('el precio estimado en línea se ve en el detalle', 'Precio estimado en línea' in pg.inner_text('#dlg-detail'))
    pg.keyboard.press('Escape')

    # ================= editar: no busca sola
    pg.evaluate("location.hash='#mia'"); pg.wait_for_timeout(900)
    pg.locator('#pr-grid .card', has_text='Mi figura en venta').click(); pg.wait_for_timeout(300); pg.click('#det-edit'); pg.wait_for_timeout(500)
    n2=pg.evaluate("window.__invoked"); pg.wait_for_timeout(1500)
    check('al editar no se busca sola, solo con el botón', pg.evaluate("window.__invoked")==n2 and pg.is_visible('#est-search'))
    check('al editar vienen sus categorías y unidades', pg.is_checked('#c-figura'))
    pg.keyboard.press('Escape')

    # ================= regresión: búsqueda, pagos, operaciones, subastas, sesión
    pg.evaluate("location.hash='#todos'"); pg.wait_for_timeout(500)
    pg.fill('#search','alberto'); pg.wait_for_timeout(900)
    check('buscador principal: solo artículos', pg.locator('.person-card').count()==0 and pg.get_attribute('#search','placeholder')=='Buscar artículos')
    pg.evaluate("location.hash='#personas'"); pg.wait_for_timeout(700)
    pg.fill('#search','alberto'); pg.wait_for_timeout(800)
    check('Coleccionistas: solo coleccionistas', pg.locator('#pp-grid .person-card').count()==1)
    pg.evaluate("location.hash='#todos'"); pg.wait_for_timeout(500)
    pg.click('#btn-profile'); pg.click('#pm-pay'); pg.wait_for_timeout(500)
    pg.click('#pm-btn'); pg.check('#pm-panel input[value="transferencia"]'); pg.wait_for_timeout(100)
    pg.fill('#pp-clabe','0020100777 7777 7771'); pg.fill('#pp-holder','Roy Cortés'); pg.fill('#pp-alias','roy.mx'); pg.fill('#pp-bank','Banco Y'); pg.click('#pp-submit'); pg.wait_for_timeout(500)
    check('formas de pago elegibles', pg.evaluate("window.__db.payment_profiles.find(x=>x.user_id==='u1').accepted_methods.join()")=='efectivo,transferencia')
    pg.evaluate("location.hash='#venta'"); pg.wait_for_timeout(800)
    for i in range(pg.locator('#grid .card').count()):
        pg.locator('#grid .card').nth(i).click(); pg.wait_for_timeout(250)
        if pg.locator('#det-order').count() and 'alberto' in pg.inner_text('.owner-box'): break
        pg.keyboard.press('Escape')
    pg.click('#det-order'); pg.wait_for_timeout(600)
    check('comprar: forma de pago y entrega en listas desplegables', pg.locator('#od-method option').count()==2 and pg.locator('#od-delivery option').count()==2)
    pg.select_option('#od-delivery','paqueteria'); pg.click('#od-submit'); t=yes(pg); pg.wait_for_timeout(700)
    check('compra con confirmación y entrega por paquetería', t=='Confirmar compra' and pg.evaluate("window.__db.orders.some(o=>o.delivery==='paqueteria'&&o.buyer_id==='u1'&&o.id!=='o2')"))
    pg.evaluate("location.hash='#operaciones'"); pg.wait_for_timeout(900)
    pg.click('[data-tab="compras"]'); pg.wait_for_timeout(300)
    check('operaciones: contacto del otro y datos de transferencia', 'Contáctense para acordar la entrega' in pg.inner_text('.order-list') and 'CLABE: 002 010 07777777777 1' in pg.inner_text('.order-list'))
    pg.evaluate("location.hash='#subastas'"); pg.wait_for_timeout(900)
    pg.locator('#grid .card', has_text='ajeno').click(); pg.wait_for_timeout(700)
    pg.fill('#au-amount','110'); pg.click('#au-go'); t=yes(pg); pg.wait_for_timeout(800)
    check('subasta: pujar con confirmación', t=='Confirmar puja' and '110' in pg.inner_text('#au-price'))
    pg.keyboard.press('Escape')
    pl=mk(); pl.goto(U+'app.html'); pl.wait_for_timeout(900)
    pl.click('#btn-profile'); pl.click('#pm-logout'); pl.wait_for_timeout(800)
    pl.goto(U+'app.html'); pl.wait_for_timeout(900)
    check('cerrar sesión: no se puede volver a la app', pl.url.endswith('auth.html'))
    pq=mk(); pq.goto(U+'app.html'); pq.wait_for_timeout(900)
    pq.evaluate("sessionStorage.setItem('cq_out','1'); window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))"); pq.wait_for_timeout(900)
    check('"Atrás" después de cerrar sesión pide sesión otra vez', pq.url.endswith('index.html'))
    pa=mk(); pa.goto(U+'auth.html'); pa.wait_for_timeout(500)
    check('inicio de sesión con Google, Facebook y Apple', pa.locator('#social .social-btn').count()==3)
    m=mk(390,820); m.goto(U+'app.html'); m.wait_for_timeout(900); m.click('#fab-add'); m.wait_for_timeout(300)
    m.fill('#item-name','Móvil prueba'); m.check('#c-carta', force=True); m.set_input_files('#file-gallery', PHOTO); m.wait_for_timeout(2000)
    m.screenshot(path=SHOT+'m_form.png', full_page=False)
    b.close()
finally:
    srv.terminate()
print('\nFALLAS:', fails or 'ninguna')
print('ERRORES JS:', errors or 'ninguno')
