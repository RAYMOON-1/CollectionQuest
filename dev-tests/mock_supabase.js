// Supabase simulado para probar la página en un navegador sin internet ni cuenta.
(function(){
  const qsStr = location.search;
  const ADMIN = qsStr.includes('admin');
  const LOGGED = location.pathname.endsWith('app.html');
  const NOCONTACT = qsStr.includes('nocontact');
  const BASE = 'https://x.supabase.co';
  const norm = s => String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const rarU = u => (u==null||u<1)?'comun':u<=10?'legendaria':u<=100?'mitica':u<=500?'epica':u<=5000?'rara':'comun';
  const pts = r => ({legendaria:400,mitica:150,epica:60,rara:25,comun:10})[r];
  const ME = 'u1';
  const mkProfile = (id,username,extra={}) => ({id,username,avatar_url:null,avatar_color:null,banner_url:null,bio:'',contact:'',points:0,level:1,role:'usuario',verified:false,search_text:norm(username),created_at:new Date(Date.now()-86400e3*30).toISOString(),...extra});
  const db = {
    profiles:[
      mkProfile('u1','roy',{contact:NOCONTACT?'':'WhatsApp 33 1111 1111',role:ADMIN?'admin':'usuario',bio:'Colecciono cartas'}),
      mkProfile('u2','alberto',{verified:true,avatar_color:'#ff5fcf',contact:'alberto@correo.com',bio:'Cómics y mangas'}),
      mkProfile('u3','maría_g',{contact:'3322334455',bio:'Vinilos antiguos'})
    ],
    items:[], friendships:[], orders:[], payment_profiles:[], verifications:[], auctions:[], bids:[], estimates:[]
  };
  window.__db = db;
  const cats=['comic','manga','carta','vinilo','figura','videojuego','arte','moneda','estampilla'];
  const listings=['venta','intercambio','exhibicion'];
  const names=['Cómic Batman Año Cero','Cámión de lámina','Charizard holo 1999','Vinilo Soda Stereo','Figura Optimus Prime','Zelda Ocarina','Óleo paisaje','Moneda de plata 1921','Estampilla antigua'];
  function addItem(o){
    const categories = o.categories || [o.category];
    const row={id:'i'+(db.items.length+1),description:'Pieza de prueba <b>x</b>',image_url:null,units:null,value_source:'manual',estimated_value:null,created_at:new Date(Date.now()-db.items.length*1000).toISOString(),...o,categories,category:categories[0]};
    row.rarity=rarU(row.units); row.points=pts(row.rarity);
    row.search_text=norm(row.name+' '+row.description+' '+categories.map(c=>c+' '+c+'s').join(' ')); db.items.push(row); return row;
  }
  for(let i=0;i<26;i++){ const c=[cats[i%9]]; if(i%7===0) c.push('arte'); addItem({owner_id:['u2','u3','u1'][i%3],name:names[i%9]+(i>8?' '+i:''),value:[100,800,3200,12000,65000][i%5],categories:[...new Set(c)],listing:listings[i%3],units:i%4===0?100:null}); }
  const myVenta = addItem({owner_id:'u1',name:'Mi figura en venta',value:900,category:'figura',listing:'venta'});
  addItem({owner_id:'u1',name:'Mi vinilo a cambio',value:400,category:'vinilo',listing:'intercambio'});
  const auOther = addItem({owner_id:'u2',name:'Cuadro en subasta ajeno',value:3000,category:'arte',listing:'subasta'});
  const auMine  = addItem({owner_id:'u1',name:'Mi moneda en subasta',value:500,category:'moneda',listing:'subasta'});
  const inHour = new Date(Date.now()+3600e3).toISOString();
  db.auctions.push({item_id:auOther.id,seller_id:'u2',start_price:100,min_increment:5,current_bid:105,current_bidder:'u3',bid_count:2,ends_at:inHour,status:'activa',winner_id:null,created_at:''});
  db.bids.push({id:'b1',item_id:auOther.id,bidder_id:'u3',amount:105,created_at:new Date(Date.now()-60e3).toISOString()});
  db.bids.push({id:'b0',item_id:auOther.id,bidder_id:'u1',amount:100,created_at:new Date(Date.now()-120e3).toISOString()});
  db.auctions.push({item_id:auMine.id,seller_id:'u1',start_price:50,min_increment:3,current_bid:null,current_bidder:null,bid_count:0,ends_at:inHour,status:'activa',winner_id:null,created_at:''});
  db.payment_profiles.push({user_id:'u2',accepted_methods:['efectivo','transferencia'],transfer_clabe:'002010077777777771',transfer_holder:'Alberto Peña',transfer_alias:'alberto.mx',transfer_bank:'Banco X',transfer_info:'',payment_link:'',updated_at:''});
  const baseOrder = (o)=>({item_image_url:null,amount:null,payment_method:null,payer_id:null,receiver_id:null,item_value:null,offered_item_id:null,offered_item_name:null,offered_value:null,is_auction:false,delivery:'persona',tracking:'',note:'',created_at:new Date().toISOString(),updated_at:'',...o});
  db.orders.push(baseOrder({id:'o1',kind:'compra',item_id:myVenta.id,item_name:myVenta.name,seller_id:'u1',buyer_id:'u2',amount:900,payment_method:'efectivo',payer_id:'u2',receiver_id:'u1',item_value:900,note:'Lo quiero',status:'pendiente'}));
  const alVenta = db.items.find(i=>i.owner_id==='u2'&&i.listing==='venta');
  db.orders.push(baseOrder({id:'o2',kind:'compra',item_id:alVenta.id,item_name:alVenta.name,seller_id:'u2',buyer_id:'u1',amount:alVenta.value,payment_method:'transferencia',payer_id:'u1',receiver_id:'u2',item_value:alVenta.value,status:'aceptada'}));
  db.friendships.push({id:'f1',requester_id:'u3',addressee_id:'u1',status:'pendiente',created_at:new Date().toISOString()});
  if(ADMIN) db.verifications.push({id:'v1',user_id:'u3',id_path:'u3/id-1.jpg',selfie_path:'u3/selfie-1.jpg',status:'pendiente',created_at:new Date().toISOString()});

  function recalc(){ db.profiles.forEach(p=>{p.points=db.items.filter(i=>i.owner_id===p.id).reduce((a,i)=>a+i.points,0);p.level=1+Math.floor(Math.sqrt(p.points/25));}); }
  recalc();
  const cp = o => JSON.parse(JSON.stringify(o));

  function splitTop(s){ const out=[]; let d=0,cur=''; for(const ch of s){ if(ch==='(')d++; if(ch===')')d--; if(ch===','&&d===0){out.push(cur);cur=''; } else cur+=ch; } if(cur)out.push(cur); return out; }
  function cond(part){ const m=part.match(/^(\w+)\.(eq|ilike|in)\.(.*)$/); if(!m) return ()=>false; const [,c,op,v]=m;
    if(op==='eq') return r=>String(r[c])===v;
    if(op==='ilike') return r=>String(r[c]).toLowerCase().includes(v.replace(/%/g,'').toLowerCase());
    const arr=v.replace(/[()]/g,'').split(','); return r=>arr.includes(String(r[c])); }
  function orFilter(str){ const parts=splitTop(str).map(p=>{ if(p.startsWith('and(')){ const cs=splitTop(p.slice(4,-1)).map(cond); return r=>cs.every(f=>f(r)); } return cond(p); }); return r=>parts.some(f=>f(r)); }

  // Reglas de la base que la página debe respetar (copia de lo que hace el trigger)
  function itemRules(row, old){
    const err=(m)=>({error:{message:m,code:'23514'}});
    let cs = (row.categories&&row.categories.length)?[...new Set(row.categories)]:(row.category?[row.category]:[]);
    if(!cs.length) return {error:{message:'Elige al menos una categoría.',code:'23502'}};
    if(cs.length>3) return err('Elige máximo 3 categorías.');
    row.categories=cs; row.category=cs[0];
    row.rarity=rarU(row.units); row.points=pts(row.rarity);
    const changed = !old || row.estimate_id!==old.estimate_id || row.value!==old.value || row.name!==old.name;
    if(old){ row.value_source=old.value_source; row.estimated_value=old.estimated_value; }
    if(changed){
      if(!row.estimate_id){ row.value_source='manual'; row.estimated_value=null; }
      else {
        const e=db.estimates.find(x=>x.id===row.estimate_id);
        if(!e||e.user_id!==row.owner_id) return err('La búsqueda de precio no es válida: vuelve a buscar.');
        if(e.query_norm!==norm(row.name)) return err('El nombre cambió: vuelve a buscar el precio.');
        if(e.typical==null){ row.value_source='sin_resultados'; row.estimated_value=null; }
        else { if(row.value>e.typical+20) return err('El valor no puede pasar de $'+(e.typical+20)+'.00 (precio estimado $'+e.typical+'.00 más $20).'); row.value_source='estimado'; row.estimated_value=e.typical; }
      }
    }
    row.search_text=norm(row.name+' '+(row.description||'')+' '+row.categories.map(c=>c+' '+c+'s').join(' '));
    return {};
  }

  function qb(table){
    const q={table,op:'select',filters:[],orders:[],range:null,single:false,maybe:false,payload:null,cols:'',head:false,count:false};
    const api={
      select(cols,opts){ if(q.op==='select'){q.cols=cols||'';} if(opts&&opts.count)q.count=true; if(opts&&opts.head)q.head=true; return api; },
      insert(p){q.op='insert';q.payload=p;return api;},
      upsert(p){q.op='upsert';q.payload=p;return api;},
      update(p){q.op='update';q.payload=p;return api;},
      delete(){q.op='delete';return api;},
      eq(c,v){q.filters.push(r=>r[c]===v);return api;},
      neq(c,v){q.filters.push(r=>r[c]!==v);return api;},
      gt(c,v){q.filters.push(r=>r[c]>v);return api;},
      in(c,arr){q.filters.push(r=>arr.includes(r[c]));return api;},
      contains(c,arr){q.filters.push(r=>Array.isArray(r[c])&&arr.every(x=>r[c].includes(x)));return api;},
      ilike(c,pat){const n=pat.replace(/%/g,'').toLowerCase();q.filters.push(r=>String(r[c]).toLowerCase().includes(n));return api;},
      or(str){q.filters.push(orFilter(str));return api;},
      order(c,o){q.orders.push([c,(o&&o.ascending===false)?-1:1]);return api;},
      range(a,b){q.range=[a,b];return api;},
      limit(n){q.range=[0,n-1];return api;},
      single(){q.single=true;return api;},
      maybeSingle(){q.maybe=true;return api;},
      then(res,rej){return Promise.resolve(exec()).then(res,rej);}
    };
    function embed(rows){
      const re=/(\w+):profiles!(\w+)\(/g; let m; const embeds=[]; while((m=re.exec(q.cols))) embeds.push([m[1],m[2]]);
      const hasAuction=/(\w+):auctions\(/.exec(q.cols);
      return rows.map(r=>{ const o={...r}; embeds.forEach(([alias,fk])=>{ o[alias]=cp(db.profiles.find(p=>p.id===r[fk])||null); });
        if(hasAuction) o[hasAuction[1]]=cp(db.auctions.find(a=>a.item_id===r.id)||null); return o; });
    }
    function exec(){
      const rows=db[table];
      if(q.op==='insert'||q.op==='upsert'){
        const list=Array.isArray(q.payload)?q.payload:[q.payload]; const made=[];
        for(const p of list){
          let row;
          if(table==='items'){
            if(!p.image_url) return {data:null,error:{message:'La foto del artículo es obligatoria.',code:'23514'}};
            row=addItem({...p, categories:p.categories||(p.category?[p.category]:[]) });
            const r=itemRules(row,null); if(r.error){ db.items.pop(); return {data:null,error:r.error}; }
            recalc();
          } else if(table==='payment_profiles'){
            if(!p.accepted_methods||!p.accepted_methods.length) return {data:null,error:{message:'check constraint',code:'23514'}};
            const i=rows.findIndex(r=>r.user_id===p.user_id); if(i>=0){rows[i]={...rows[i],...p};row=rows[i];} else {row={...p};rows.push(row);}
          } else {
            row={id:table[0]+Math.random().toString(36).slice(2,8),created_at:new Date().toISOString(),status:'pendiente',...p};
            if(table==='friendships'&&rows.some(r=>[r.requester_id,r.addressee_id].sort().join()===[p.requester_id,p.addressee_id].sort().join())) return {data:null,error:{message:'duplicate key',code:'23505'}};
            rows.push(row);
          }
          made.push(row);
        }
        const pick=r=>q.cols&&q.cols.trim()?Object.fromEntries(q.cols.split(',').map(s=>s.trim()).filter(Boolean).map(k=>[k,r[k]])):r;
        return {data:q.single?cp(pick(made[0])):cp(made.map(pick)),error:null};
      }
      let matched=rows.filter(r=>q.filters.every(f=>f(r)));
      if(q.op==='update'){
        for(const r of matched){ const old=cp(r); Object.assign(r,q.payload);
          if(table==='items'){ const res=itemRules(r,old); if(res.error){ Object.keys(r).forEach(k=>delete r[k]); Object.assign(r,old); return {data:null,error:res.error}; } }
          if(table==='profiles'){r.search_text=norm(r.username+' '+r.bio);} }
        recalc();
        const m=matched[0]; return {data:q.single?(m?{id:m.id,rarity:m.rarity,points:m.points}:null):cp(matched),error:null}; }
      if(q.op==='delete'){ db[table]=rows.filter(r=>!matched.includes(r)); recalc(); return {data:null,error:null}; }
      const total=matched.length;
      if(q.head) return {data:null,count:total,error:null};
      matched=matched.slice();
      q.orders.slice().reverse().forEach(([c,d])=>{matched.sort((a,b)=>(a[c]>b[c]?1:a[c]<b[c]?-1:0)*d);});
      if(q.range){ if(q.range[0]>0&&q.range[0]>=total) return {data:null,error:{code:'PGRST103',message:'Requested range not satisfiable'}}; matched=matched.slice(q.range[0],q.range[1]+1); }
      matched=embed(matched);
      if(q.single||q.maybe) return {data:cp(matched[0]||null),error:null};
      return {data:cp(matched),error:null,count:q.count?total:undefined};
    }
    return api;
  }

  const err = m => ({data:null,error:{message:m}});
  const methodsOf = id => { const p=db.payment_profiles.find(x=>x.user_id===id); if(!p) return ['efectivo']; return ['efectivo','transferencia'].filter(m=>p.accepted_methods.includes(m)&&(m!=='transferencia'||p.transfer_clabe)); };
  const openStatuses=['pendiente','aceptada','confirmada'];
  const getO = id => db.orders.find(x=>x.id===id);
  const rpc = {
    friend_count:({p_user})=>({data:db.friendships.filter(f=>f.status==='aceptada'&&[f.requester_id,f.addressee_id].includes(p_user)).length,error:null}),
    seller_methods:({p_seller})=>({data:methodsOf(p_seller),error:null}),
    create_order:({p_item,p_method,p_offered,p_note,p_delivery})=>{
      const it=db.items.find(i=>i.id===p_item); if(!it) return err('Ese artículo ya no existe.');
      if(!['persona','paqueteria'].includes(p_delivery||'persona')) return err('Elige cómo se va a entregar: en persona o por paquetería.');
      if(it.owner_id===ME) return err('No puedes comprar ni intercambiar tus propios artículos.');
      if(db.orders.some(o=>o.buyer_id===ME&&o.item_id===p_item&&openStatuses.includes(o.status))) return err('Ya tienes una solicitud en curso para este artículo.');
      const base=baseOrder({id:'o'+(db.orders.length+1),item_id:it.id,item_name:it.name,item_image_url:it.image_url,seller_id:it.owner_id,buyer_id:ME,note:p_note||'',item_value:it.value,delivery:p_delivery||'persona',status:'pendiente'});
      if(it.listing==='venta'){ if(!p_method) return err('Elige un método de pago.'); if(!methodsOf(it.owner_id).includes(p_method)) return err('El vendedor no acepta ese método de pago.'); db.orders.push({...base,kind:'compra',amount:it.value,payment_method:p_method,payer_id:ME,receiver_id:it.owner_id}); }
      else if(it.listing==='intercambio'){ const off=db.items.find(i=>i.id===p_offered&&i.owner_id===ME); if(!off) return err('Ese artículo no es tuyo.');
        const diff=it.value-off.value; const o={...base,kind:'intercambio',offered_item_id:off.id,offered_item_name:off.name,offered_value:off.value};
        if(diff!==0){ if(!p_method) return err('Elige cómo se va a pagar la diferencia.');
          if(diff>0){ if(!methodsOf(it.owner_id).includes(p_method)) return err('El dueño de la pieza no acepta ese método para la diferencia.'); Object.assign(o,{amount:diff,payment_method:p_method,payer_id:ME,receiver_id:it.owner_id}); }
          else { if(!methodsOf(ME).includes(p_method)) return err('No tienes configurado ese método para recibir la diferencia.'); Object.assign(o,{amount:-diff,payment_method:p_method,payer_id:it.owner_id,receiver_id:ME}); } }
        db.orders.push(o); }
      else return err('Este artículo no está en venta ni en intercambio.');
      return {data:base.id,error:null};
    },
    set_order_shipping:({p_order,p_delivery,p_tracking})=>{const o=getO(p_order); if(!o||![o.seller_id,o.buyer_id].includes(ME)) return err('Esta operación no es tuya.'); if(!openStatuses.includes(o.status)) return err('Esta operación ya terminó.'); o.delivery=p_delivery; o.tracking=(p_tracking||'').slice(0,80); return {data:null,error:null};},
    respond_order:({p_order,p_accept})=>{const o=getO(p_order); if(!o||o.seller_id!==ME) return err('Solo quien vende puede responder.'); o.status=p_accept?'aceptada':'rechazada'; return {data:null,error:null};},
    confirm_order:({p_order})=>{const o=getO(p_order); if(!o||ME!==(o.payer_id||o.buyer_id)) return err('Solo quien paga puede confirmar el pago.'); o.status='confirmada'; return {data:null,error:null};},
    cancel_order:({p_order})=>{const o=getO(p_order); if(!o) return err('No encontramos esa operación.'); o.status='cancelada'; return {data:null,error:null};},
    set_order_method:({p_order,p_method})=>{const o=getO(p_order); if(!o||o.payer_id!==ME) return err('Solo quien paga puede cambiar el método.'); if(!methodsOf(o.receiver_id).includes(p_method)) return err('La otra persona no acepta ese método de pago.'); o.payment_method=p_method; return {data:null,error:null};},
    complete_order:({p_order})=>{const o=getO(p_order); const conf=o&&(o.payer_id||o.buyer_id); const comp=o&&(conf===o.buyer_id?o.seller_id:o.buyer_id); if(!o||ME!==comp) return err('Solo la otra persona puede marcar la operación como completada.');
      const it=db.items.find(i=>i.id===o.item_id); it.owner_id=o.buyer_id; it.listing='exhibicion';
      if(o.kind==='intercambio'){ const of=db.items.find(i=>i.id===o.offered_item_id); of.owner_id=o.seller_id; of.listing='exhibicion'; }
      o.status='completada'; recalc(); return {data:null,error:null};},
    review_verification:({p_id,p_approve})=>{const v=db.verifications.find(x=>x.id===p_id); const paths=[v.id_path,v.selfie_path].filter(Boolean); v.status=p_approve?'aprobada':'rechazada'; v.id_path=null; v.selfie_path=null; if(p_approve) db.profiles.find(p=>p.id===v.user_id).verified=true; window.__removed=(window.__removed||[]).concat(paths); return {data:paths,error:null};},
    start_auction:({p_item,p_start,p_hours})=>{const it=db.items.find(i=>i.id===p_item); if(!it||it.owner_id!==ME) return err('Solo el dueño puede subastar su artículo.'); if(!(p_start>0)) return err('El precio inicial debe ser mayor a cero.');
      db.auctions=db.auctions.filter(a=>a.item_id!==p_item); db.auctions.push({item_id:p_item,seller_id:ME,start_price:p_start,min_increment:Math.max(1,Math.round(p_start*0.05)),current_bid:null,current_bidder:null,bid_count:0,ends_at:new Date(Date.now()+p_hours*3600e3).toISOString(),status:'activa',winner_id:null,created_at:''}); return {data:null,error:null};},
    place_bid:({p_item,p_amount})=>{const a=db.auctions.find(x=>x.item_id===p_item); if(!a) return err('Esta subasta no existe.'); if(a.status!=='activa'||new Date(a.ends_at)<=Date.now()) return err('Esta subasta ya terminó.'); if(a.seller_id===ME) return err('No puedes pujar en tu propia subasta.'); if(a.current_bidder===ME) return err('Ya llevas la puja más alta.');
      const min=a.current_bid==null?a.start_price:a.current_bid+a.min_increment; if(p_amount<min) return err('La puja mínima es $'+min+'.');
      db.bids.push({id:'b'+Math.random().toString(36).slice(2,6),item_id:p_item,bidder_id:ME,amount:p_amount,created_at:new Date().toISOString()});
      Object.assign(a,{current_bid:p_amount,current_bidder:ME,bid_count:a.bid_count+1}); return {data:{current_bid:p_amount},error:null};},
    cancel_auction:({p_item})=>{const a=db.auctions.find(x=>x.item_id===p_item); if(!a||a.seller_id!==ME) return err('Solo el dueño puede cancelarla.'); if(a.bid_count>0) return err('Ya hay pujas: no se puede cancelar.'); a.status='cancelada'; db.items.find(i=>i.id===p_item).listing='exhibicion'; return {data:null,error:null};},
    finalize_expired_auctions:()=>{ let n=0; db.auctions.filter(a=>a.status==='activa'&&new Date(a.ends_at)<=Date.now()).forEach(a=>{a.status='finalizada'; n++;}); return {data:n,error:null}; }
  };

  // Búsqueda de precio en línea simulada. El nombre decide qué responde:
  //  "sinprecio" = no hay precios confiables | "falla" = error del servicio | "limite" = límite diario
  function httpError(status, message){ return {data:null,error:{name:'FunctionsHttpError',message:'Edge Function returned a non-2xx status code',context:{status,json:async()=>({ok:false,message})}}}; }
  async function estimatePrice(body){
    window.__invoked=(window.__invoked||0)+1; window.__lastBody=body;
    await new Promise(r=>setTimeout(r,120));
    const nm=norm(body.name);
    if(nm.includes('falla')) return httpError(502,'No se pudo consultar internet en este momento. Intenta de nuevo o pon el precio a mano.');
    if(nm.includes('limite')) return httpError(429,'Ya hiciste 20 búsquedas de precio hoy (el límite es 20). Mañana puedes seguir, o pon el precio a mano.');
    const id='est-'+(db.estimates.length+1);
    const none=nm.includes('sinprecio');
    const row={id,user_id:ME,name:body.name,query_norm:nm,categories:body.categories,typical:none?null:500};
    db.estimates.push(row);
    const est=none?{id,name:body.name,categories:body.categories,found:false,confidence:'baja',basis:null,currency:'MXN',low:null,typical:null,high:null,sample_size:0,max_over:20,max_allowed:null,units_estimate:null,units_note:'',sources:[],observations:[],search_entry_html:'',message:'No encontramos precios confiables de este artículo. Puedes poner el precio a mano (quedará marcado como sin verificar).',from_cache:false,daily_remaining:10}
      :{id,name:body.name,categories:body.categories,found:true,confidence:'media',basis:'vendido',currency:'MXN',low:450,typical:500,high:600,sample_size:3,max_over:20,max_allowed:520,units_estimate:100,units_note:'Edición limitada según tcgplayer.com',
        sources:[{title:'ebay.com',uri:'https://vertexaisearch.cloud.google.com/r/1'}],
        observations:[{price_mxn:480,price_original:26,currency:'USD',kind:'vendido',source:'ebay.com',url:'https://www.ebay.com/itm/1',date:'2026-02'},{price_mxn:500,price_original:27,currency:'USD',kind:'vendido',source:'ebay.com',url:'https://www.ebay.com/itm/2',date:'2026-03'},{price_mxn:520,price_original:28,currency:'USD',kind:'vendido',source:'tcgplayer.com',url:'',date:''}],
        search_entry_html:'<div style="padding:10px;font-family:sans-serif;color:#111">Google Search Suggestions chip</div>',message:'ok',from_cache:false,daily_remaining:9};
    return {data:{ok:true,estimate:est},error:null};
  }

  const sessionNow = () => (LOGGED && !sessionStorage.getItem('cq_out')) ? {user:{id:ME,email:'roy@gmail.com',app_metadata:{provider:(qsStr.includes('oauth')?'google':'email')}}} : null;
  if(qsStr.includes('oauth')) db.profiles[0].created_at=new Date().toISOString();
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  window.supabase={createClient(){return{
    auth:{getSession:async()=>({data:{session:sessionNow()}}),onAuthStateChange(){return{data:{subscription:{}}}},signOut:async()=>{sessionStorage.setItem('cq_out','1');return{};},
      signInWithPassword:async()=>({error:{message:'Email not confirmed'}}),
      signInWithOAuth:async(o)=>{window.__oauth=o;return{data:{},error:null};},
      resend:async(o)=>{window.__resend=o;return{error:null};},
      signUp:async(o)=>{window.__signup=o;return{data:{user:{id:'u9',identities:[{}]},session:null},error:null};}},
    from:qb,
    rpc:async(name,args)=>{ window.__rpc=(window.__rpc||[]).concat([name]); return rpc[name](args||{}); },
    functions:{invoke:async(name,opts)=>{ if(name!=='estimate-price') return httpError(404,'no existe'); return estimatePrice((opts&&opts.body)||{}); }},
    channel(name){ const ch={on(){return ch;},subscribe(cb){ window.__channel=name; if(cb) setTimeout(()=>cb('CHANNEL_ERROR'),0); return ch; }}; return ch; },
    removeChannel(){ window.__channelClosed=true; },
    storage:{from(bucket){return{upload:async(path)=>{window.__uploads=(window.__uploads||[]).concat([bucket+'/'+path]);return{error:null};},getPublicUrl:(p)=>({data:{publicUrl:`${BASE}/storage/v1/object/public/${bucket}/${p}`}}),remove:async(paths)=>{window.__removed=(window.__removed||[]).concat(paths);return{}},createSignedUrl:async()=>({data:{signedUrl:png}})};}}
  };}};
})();
