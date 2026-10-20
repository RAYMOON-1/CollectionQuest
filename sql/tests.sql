-- =====================================================================
--  COLLECTION QUEST - Pruebas automáticas de la base de datos (v2)
--  Ejecuta esto DESPUES de schema.sql, en Supabase > SQL Editor.
--  Todo corre dentro de una transaccion y termina con ROLLBACK:
--  no deja usuarios, artículos ni operaciones de prueba en tu base.
--  Si algo falla, el error dice cuál prueba fue (T01, T02...).
--  Si todo sale bien verás:  NOTICE  TODAS LAS PRUEBAS PASARON
-- =====================================================================
begin;

do $$
declare
  u1 uuid := gen_random_uuid();   -- usuario normal (compra)
  u2 uuid := gen_random_uuid();   -- usuario normal (vende)
  u3 uuid := gen_random_uuid();   -- admin
  u4 uuid := gen_random_uuid();   -- usuario ajeno
  it_a uuid; it_b uuid; it_c uuid; it_d uuid; it_e uuid;
  ord uuid; ord2 uuid; fr uuid; ver uuid;
  n int; ok boolean; txt text; paths text[];
  prof record; it record; o record;
  img text := 'https://x.supabase.co/storage/v1/object/public/items/a.jpg';
begin
  ---------------------------------------------------------------------
  -- BUSQUEDA: sin acentos, sin comas ni puntos
  ---------------------------------------------------------------------
  assert public.norm_text('Cámión, Rojo.')        = 'camion rojo',  'T01 acentos, coma y punto';
  assert public.norm_text('ÑANDÚ  (edición) #1')  = 'nandu edicion 1','T02 mayusculas, parentesis y simbolos';
  assert public.norm_text(null)                   = '',             'T03 null';

  ---------------------------------------------------------------------
  -- RAREZA, PUNTOS Y NIVEL
  ---------------------------------------------------------------------
  assert public.rarity_for_value(499.99)   = 'comun',      'T04';
  assert public.rarity_for_value(500)      = 'rara',       'T05';
  assert public.rarity_for_value(2500)     = 'epica',      'T06';
  assert public.rarity_for_value(10000)    = 'mitica',     'T07';
  assert public.rarity_for_value(50000)    = 'legendaria', 'T08';
  assert public.points_for_rarity('comun') = 10 and public.points_for_rarity('legendaria') = 400, 'T09';
  assert public.level_for_points(24) = 1 and public.level_for_points(25) = 2
     and public.level_for_points(100) = 3 and public.level_for_points(400) = 5, 'T10';

  ---------------------------------------------------------------------
  -- CORREOS VALIDOS Y PERFIL AUTOMATICO
  ---------------------------------------------------------------------
  ok := false;
  begin insert into auth.users (id, email) values (gen_random_uuid(), 'x@mailinator.com');
  exception when raise_exception then ok := true; end;
  assert ok, 'T11 debe rechazar correos temporales';

  ok := false;
  begin insert into auth.users (id, email) values (gen_random_uuid(), 'sub@dominio.yopmail.com');
  exception when raise_exception then ok := true; end;
  assert ok, 'T12 debe rechazar subdominios de correos temporales';

  ok := false;
  begin insert into auth.users (id, email) values (gen_random_uuid(), 'esto-no-es-un-correo');
  exception when raise_exception then ok := true; end;
  assert ok, 'T13 debe rechazar correos mal escritos';

  ok := false;
  begin insert into auth.users (id, email) values (gen_random_uuid(), 'alguien@gmail');
  exception when raise_exception then ok := true; end;
  assert ok, 'T14 debe rechazar dominios sin terminacion';

  insert into auth.users (id, email, raw_user_meta_data) values (u1, 'uno@gmail.com',   '{"username":"Prueba_Uno"}'::jsonb);
  insert into auth.users (id, email, raw_user_meta_data) values (u2, 'dos@outlook.com', '{"username":"prueba_uno"}'::jsonb);
  insert into auth.users (id, email)                     values (u3, 'admin@cq.test');
  insert into auth.users (id, email, raw_user_meta_data) values (u4, 'cuatro@gmail.com','{"username":"ajeno"}'::jsonb);

  select * into prof from public.profiles where id = u1;
  assert prof.username = 'prueba_uno' and prof.points = 0 and prof.level = 1
         and prof.role = 'usuario' and prof.verified = false, 'T15 perfil automatico con valores iniciales';
  select * into prof from public.profiles where id = u2;
  assert prof.username like 'prueba_uno%' and prof.username <> 'prueba_uno', 'T16 usuario repetido recibe sufijo';
  update public.profiles set role = 'admin' where id = u3;

  ---------------------------------------------------------------------
  -- ARTICULOS: foto y categoria obligatorias, rareza automatica
  ---------------------------------------------------------------------
  ok := false;
  begin insert into public.items (owner_id, name, value, category) values (u1, 'Sin foto', 100, 'carta');
  exception when check_violation then ok := true; end;
  assert ok, 'T17 un articulo nuevo sin foto debe rechazarse';

  ok := false;
  begin insert into public.items (owner_id, name, value, image_url) values (u1, 'Sin categoria', 100, img);
  exception when not_null_violation then ok := true; end;
  assert ok, 'T18 un articulo sin categoria debe rechazarse';

  ok := false;
  begin insert into public.items (owner_id, name, value, category, image_url) values (u1, 'Raro', 100, 'trompo', img);
  exception when invalid_text_representation then ok := true; end;
  assert ok, 'T19 una categoria inventada debe rechazarse';

  insert into public.items (owner_id, name, description, value, category, listing, image_url)
  values (u1, 'Cámión de lámina', 'Año 1960, color rojo.', 100, 'figura', 'exhibicion', img) returning id into it_a;
  select * into it from public.items where id = it_a;
  assert it.rarity = 'comun' and it.points = 10, 'T20 valor 100 = comun';
  assert it.search_text like '%camion de lamina%' and it.search_text like '%figuras%', 'T21 texto de busqueda sin acentos';

  insert into public.items (owner_id, name, value, category, rarity, points, image_url)
  values (u1, 'Trampa', 100, 'carta', 'legendaria', 9999, img) returning id into it_e;
  select * into it from public.items where id = it_e;
  assert it.rarity = 'comun' and it.points = 10, 'T22 la rareza enviada por el usuario se ignora';

  ok := false;
  begin update public.items set image_url = null where id = it_a;
  exception when check_violation then ok := true; end;
  assert ok, 'T23 no se puede quitar la foto a un articulo';

  select * into prof from public.profiles where id = u1;
  assert prof.points = 20 and prof.level = 1, 'T24 puntos del perfil = 20';

  ---------------------------------------------------------------------
  -- SEGURIDAD BASICA (usuario autenticado u1)
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  ok := false;
  begin update public.profiles set points = 99999 where id = u1;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T25 no puede editar sus puntos';

  ok := false;
  begin update public.profiles set role = 'admin' where id = u1;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T26 no puede hacerse admin';

  ok := false;
  begin update public.profiles set verified = true where id = u1;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T27 no puede verificarse solo';

  update public.profiles set bio = 'Soy Ñoño, ¡hola!', banner_url = 'https://x/b.jpg' where id = u1;
  get diagnostics n = row_count;
  assert n = 1, 'T28 si puede editar bio y banner';

  select * into prof from public.profiles where id = u1;
  assert prof.search_text like '%nono hola%', 'T29 la busqueda de perfiles ignora acentos y signos';

  update public.profiles set bio = 'hackeado' where id = u2;
  get diagnostics n = row_count;
  assert n = 0, 'T30 no puede editar el perfil de otro';

  ok := false;
  begin insert into public.items (owner_id, name, value, category, image_url) values (u2, 'Ajeno', 100, 'carta', img);
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T31 no puede crear articulos a nombre de otro';

  ---------------------------------------------------------------------
  -- AMIGOS
  ---------------------------------------------------------------------
  insert into public.friendships (requester_id, addressee_id) values (u1, u2) returning id into fr;

  ok := false;
  begin insert into public.friendships (requester_id, addressee_id) values (u1, u2);
  exception when unique_violation then ok := true; end;
  assert ok, 'T32a no se puede duplicar la relacion';

  reset role;   -- el indice unico tambien frena la solicitud en sentido contrario
  ok := false;
  begin insert into public.friendships (requester_id, addressee_id) values (u2, u1);
  exception when unique_violation then ok := true; end;
  assert ok, 'T32b no se puede duplicar la relacion al reves';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  ok := false;
  begin insert into public.friendships (requester_id, addressee_id, status) values (u1, u4, 'aceptada');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T33 no puede crear una amistad ya aceptada';

  ok := false;
  begin insert into public.friendships (requester_id, addressee_id) values (u2, u4);
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T34 no puede mandar solicitudes a nombre de otro';

  ok := false;
  begin insert into public.friendships (requester_id, addressee_id) values (u1, u1);
  exception when check_violation then ok := true; end;
  assert ok, 'T35 no puede agregarse a si mismo';

  update public.friendships set status = 'aceptada' where id = fr;
  get diagnostics n = row_count;
  assert n = 0, 'T36 quien envia no puede aceptar su propia solicitud';

  -- u2 acepta
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  update public.friendships set status = 'aceptada' where id = fr;
  get diagnostics n = row_count;
  assert n = 1, 'T37 quien recibe si puede aceptar';
  assert public.friend_count(u1) = 1 and public.friend_count(u2) = 1, 'T38 cuenta de amigos';

  -- un tercero no ve la relacion
  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  select count(*) into n from public.friendships;
  assert n = 0, 'T39 un tercero no ve amistades ajenas';
  delete from public.friendships where id = fr;
  get diagnostics n = row_count;
  assert n = 0, 'T40 un tercero no puede borrar la amistad';

  ---------------------------------------------------------------------
  -- VENTAS: datos de cobro y compra con metodo de pago
  ---------------------------------------------------------------------
  reset role;
  insert into public.items (owner_id, name, value, category, listing, image_url)
  values (u2, 'Cómic en venta', 700, 'comic', 'venta', img) returning id into it_b;
  insert into public.items (owner_id, name, value, category, listing, image_url)
  values (u2, 'Carta para cambiar', 3000, 'carta', 'intercambio', img) returning id into it_c;
  insert into public.items (owner_id, name, value, category, listing, image_url)
  values (u1, 'Vinilo para cambiar', 400, 'vinilo', 'intercambio', img) returning id into it_d;

  assert public.seller_methods(u2) = array['efectivo'], 'T41 sin datos de cobro solo acepta efectivo';

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  set local role authenticated;

  ok := false;
  begin insert into public.payment_profiles (user_id, payment_link) values (u2, 'http://inseguro.com/pagar');
  exception when check_violation then ok := true; end;
  assert ok, 'T42 el enlace de pago debe ser https';

  insert into public.payment_profiles (user_id, transfer_info) values (u2, 'Banco X, CLABE 000, Titular Dos');
  reset role;
  assert public.seller_methods(u2) = array['efectivo', 'transferencia'], 'T43 ahora acepta transferencia';

  -- u1 compra
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  ok := false;
  begin perform public.create_order(it_a, 'efectivo');
  exception when raise_exception then ok := true; end;
  assert ok, 'T44 no puede comprar su propio articulo';

  ok := false;
  begin perform public.create_order(it_b, 'enlace');
  exception when raise_exception then ok := true; end;
  assert ok, 'T45 no puede usar un metodo que el vendedor no acepta';

  ok := false;
  begin perform public.create_order(it_b, null);
  exception when raise_exception then ok := true; end;
  assert ok, 'T46 debe elegir metodo de pago';

  ok := false;
  begin perform public.create_order(it_a, 'efectivo');  -- exhibicion y propio
  exception when raise_exception then ok := true; end;
  assert ok, 'T47 no se puede comprar algo de exhibicion';

  ord := public.create_order(it_b, 'transferencia', null, 'Hola, lo quiero');
  select * into o from public.orders where id = ord;
  assert o.kind = 'compra' and o.status = 'pendiente' and o.amount = 700 and o.seller_id = u2 and o.buyer_id = u1,
         'T48 se crea la solicitud de compra';

  ok := false;
  begin perform public.create_order(it_b, 'efectivo');
  exception when raise_exception then ok := true; end;
  assert ok, 'T49 no puede abrir dos solicitudes para el mismo articulo';

  ok := false;
  begin insert into public.orders (kind, item_name, seller_id, buyer_id, payment_method) values ('compra', 'x', u2, u1, 'efectivo');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T50 no se pueden crear operaciones directo en la tabla';

  ok := false;
  begin update public.orders set status = 'completada' where id = ord;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T51 no se pueden cambiar operaciones directo en la tabla';

  -- antes de que acepte, el comprador NO ve los datos de cobro
  select count(*) into n from public.payment_profiles where user_id = u2;
  assert n = 0, 'T52 no ve los datos de cobro antes de que el vendedor acepte';

  ok := false;
  begin perform public.respond_order(ord, true);
  exception when raise_exception then ok := true; end;
  assert ok, 'T53 el comprador no puede aceptar su propia compra';

  ok := false;
  begin perform public.confirm_order(ord);
  exception when raise_exception then ok := true; end;
  assert ok, 'T54 no se puede confirmar pago antes de que acepten';

  -- un tercero no ve la operacion
  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  select count(*) into n from public.orders;
  assert n = 0, 'T55 un tercero no ve operaciones ajenas';

  -- u2 acepta
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.respond_order(ord, true);

  ok := false;
  begin perform public.complete_order(ord);
  exception when raise_exception then ok := true; end;
  assert ok, 'T56 no se puede completar sin la confirmacion del comprador';

  -- u1 ya ve datos de cobro y confirma
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  select transfer_info into txt from public.payment_profiles where user_id = u2;
  assert txt like 'Banco X%', 'T57 despues de aceptar, el comprador ve los datos de cobro';
  perform public.confirm_order(ord);

  ok := false;
  begin perform public.complete_order(ord);
  exception when raise_exception then ok := true; end;
  assert ok, 'T58 el comprador no puede completar la venta';

  -- u2 completa: cambia de dueño el articulo
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.complete_order(ord);
  reset role;

  select * into it from public.items where id = it_b;
  assert it.owner_id = u1 and it.listing = 'exhibicion', 'T59 el articulo cambia de dueño y queda en exhibicion';
  select * into o from public.orders where id = ord;
  assert o.status = 'completada', 'T60 la operacion queda completada';
  select * into prof from public.profiles where id = u2;
  assert prof.points = 60, 'T61 puntos del vendedor recalculados (se queda solo con la carta de 3000 = 60)';
  select * into prof from public.profiles where id = u1;
  assert prof.points = 10 + 10 + 10 + 25, 'T62 puntos del comprador recalculados';

  ---------------------------------------------------------------------
  -- INTERCAMBIOS
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  ok := false;
  begin perform public.create_order(it_c, null, it_c, '');   -- ofrece una pieza que es de u2, no de u1
  exception when raise_exception then ok := true; end;
  assert ok, 'T63 no puede ofrecer un articulo que no es suyo';

  ok := false;
  begin perform public.create_order(it_c, null, null, '');
  exception when raise_exception then ok := true; end;
  assert ok, 'T64 debe elegir que ofrece';

  ord2 := public.create_order(it_c, null, it_d, 'Te cambio mi vinilo');
  select * into o from public.orders where id = ord2;
  assert o.kind = 'intercambio' and o.offered_item_id = it_d and o.payment_method is null, 'T65 solicitud de intercambio';

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.respond_order(ord2, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform public.confirm_order(ord2);
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.complete_order(ord2);
  reset role;

  select * into it from public.items where id = it_c;
  assert it.owner_id = u1, 'T66 u1 recibe la carta';
  select * into it from public.items where id = it_d;
  assert it.owner_id = u2, 'T67 u2 recibe el vinilo';

  -- cancelar y rechazar
  update public.items set listing = 'venta' where id = it_d;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ord := public.create_order(it_d, 'efectivo');
  perform public.cancel_order(ord);
  select status into o from public.orders where id = ord;
  assert o.status = 'cancelada', 'T68 se puede cancelar una solicitud pendiente';
  ok := false;
  begin perform public.cancel_order(ord);
  exception when raise_exception then ok := true; end;
  assert ok, 'T69 no se cancela dos veces';
  ord := public.create_order(it_d, 'efectivo');
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.respond_order(ord, false);
  select status into o from public.orders where id = ord;
  assert o.status = 'rechazada', 'T70 el vendedor puede rechazar';
  reset role;

  ---------------------------------------------------------------------
  -- VERIFICACION DE PERFIL (identificacion oficial)
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.verifications (user_id, id_path, selfie_path)
  values (u1, u1 || '/id-1.jpg', u1 || '/selfie-1.jpg') returning id into ver;

  ok := false;
  begin insert into public.verifications (user_id, id_path) values (u1, u1 || '/id-2.jpg');
  exception when unique_violation then ok := true; end;
  assert ok, 'T71 solo una solicitud pendiente a la vez';

  ok := false;
  begin insert into public.verifications (user_id, id_path, status) values (u1, 'x', 'aprobada');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T72 no puede crear una verificacion ya aprobada';

  ok := false;
  begin update public.verifications set status = 'aprobada' where id = ver;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T73 no puede aprobarse solo';

  ok := false;
  begin perform public.review_verification(ver, true, '');
  exception when raise_exception then ok := true; end;
  assert ok, 'T74 un usuario normal no puede revisar verificaciones';

  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  select count(*) into n from public.verifications;
  assert n = 0, 'T75 un tercero no ve las identificaciones de otros';

  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  select count(*) into n from public.verifications;
  assert n = 1, 'T76 el admin si ve las solicitudes';
  paths := public.review_verification(ver, true, '');
  assert array_length(paths, 1) = 2, 'T77 la revision devuelve las rutas para borrar las fotos';
  reset role;

  select * into prof from public.profiles where id = u1;
  assert prof.verified = true, 'T78 el perfil queda verificado';
  select * into o from public.verifications where id = ver;
  assert o.status = 'aprobada' and o.id_path is null and o.selfie_path is null and o.reviewed_by = u3,
         'T79 se borran las rutas de las fotos y queda quien reviso';

  -- rechazo con motivo
  insert into public.verifications (user_id, id_path) values (u4, u4 || '/id.jpg') returning id into ver;
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.review_verification(ver, false, 'La foto salio borrosa');
  reset role;
  select * into prof from public.profiles where id = u4;
  assert prof.verified = false, 'T80 un rechazo no verifica el perfil';
  select * into o from public.verifications where id = ver;
  assert o.status = 'rechazada' and o.reject_reason = 'La foto salio borrosa', 'T81 queda el motivo del rechazo';

  ---------------------------------------------------------------------
  -- ADMIN Y VISITANTES
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.items where id = it_e;
  get diagnostics n = row_count;
  assert n = 1, 'T82 el admin puede moderar (borrar) articulos de otros';
  reset role;

  set local role anon;
  perform 1 from public.items limit 1;
  assert found, 'T83 un visitante ve la galeria publica';
  ok := false;
  begin perform 1 from public.orders;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T84 un visitante no puede leer operaciones';
  ok := false;
  begin perform 1 from public.verifications;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T85 un visitante no puede leer verificaciones';
  ok := false;
  begin perform 1 from public.friendships;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T86 un visitante no puede leer amistades';
  ok := false;
  begin perform 1 from public.payment_profiles;
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T87 un visitante no puede leer datos de cobro';
  ok := false;
  begin perform public.create_order(it_b, 'efectivo');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'T88 un visitante no puede crear operaciones';
  reset role;

  raise notice 'TODAS LAS PRUEBAS PASARON (88 de 88)';
end $$;

rollback;
