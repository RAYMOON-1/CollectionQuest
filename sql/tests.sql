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
  ord uuid; ord2 uuid; ord3 uuid; fr uuid; ver uuid;
  it_f uuid; it_g uuid; it_h uuid; it_i uuid; it_j uuid; it_k uuid; au1 uuid; au2 uuid; au3 uuid;
  au record; cnt int;
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
  insert into auth.users (id, email)                     values (u3, 'jefa@cq.test');
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
  values (u1, 'Vinilo para cambiar', 3000, 'vinilo', 'intercambio', img) returning id into it_d;   -- mismo valor que it_c

  assert public.seller_methods(u2) = array['efectivo'], 'T41 sin datos de cobro solo acepta efectivo';

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  set local role authenticated;

  ok := false;
  begin insert into public.payment_profiles (user_id, payment_link) values (u2, 'http://inseguro.com/pagar');
  exception when check_violation then ok := true; end;
  assert ok, 'T42 el enlace de pago debe ser https';

  ok := false;
  begin insert into public.payment_profiles (user_id, transfer_clabe, transfer_holder, transfer_alias, transfer_bank)
        values (u2, '002010077777777772', 'Titular Dos', 'dos.mx', 'Banco X');   -- dígito verificador malo
  exception when check_violation then ok := true; end;
  assert ok, 'T42b la CLABE con dígito verificador malo se rechaza';

  ok := false;
  begin insert into public.payment_profiles (user_id, transfer_clabe, transfer_holder, transfer_alias, transfer_bank)
        values (u2, '002010077777777771', 'Titular Dos', '', 'Banco X');         -- falta el alias
  exception when check_violation then ok := true; end;
  assert ok, 'T42c si hay CLABE tambien se piden titular, alias y banco';

  insert into public.payment_profiles (user_id, transfer_clabe, transfer_holder, transfer_alias, transfer_bank)
  values (u2, '002010077777777771', 'Titular Dos', 'dos.mx', 'Banco X');
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
  select transfer_holder into txt from public.payment_profiles where user_id = u2;
  assert txt = 'Titular Dos', 'T57 despues de aceptar, el comprador ve los datos de cobro';
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
  assert prof.points = 10 + 10 + 60 + 25, 'T62 puntos del comprador recalculados';

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


  ---------------------------------------------------------------------
  -- PERFIL: color del aro del avatar
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set avatar_color = '#ff5fcf' where id = u1;
  get diagnostics n = row_count;
  assert n = 1, 'T89 puede cambiar el color de su aro';
  ok := false;
  begin update public.profiles set avatar_color = 'rojo' where id = u1;
  exception when check_violation then ok := true; end;
  assert ok, 'T90 el color debe ser un hexadecimal';
  ok := false;
  begin update public.profiles set avatar_color = '#12345' where id = u1;
  exception when check_violation then ok := true; end;
  assert ok, 'T91 el color debe tener 6 digitos';
  update public.profiles set avatar_color = '#00ff99' where id = u2;
  get diagnostics n = row_count;
  assert n = 0, 'T92 no puede cambiar el color de otra persona';
  reset role;

  ---------------------------------------------------------------------
  -- CORREOS: se rechazan los inventados y se aceptan los normales
  ---------------------------------------------------------------------
  foreach txt in array array['yomilala1234567890@gmail.com', 'aaaaaaa@gmail.com', 'prueba1@gmail.com',
                              'test@gmail.com', 'qwerty@gmail.com', 'abc123@gmail.com'] loop
    ok := false;
    begin insert into auth.users (id, email) values (gen_random_uuid(), txt);
    exception when raise_exception then ok := true; end;
    assert ok, 'T93 debe rechazar el correo de prueba ' || txt;
  end loop;
  insert into auth.users (id, email) values (gen_random_uuid(), 'maria.lopez@gmail.com');
  insert into auth.users (id, email) values (gen_random_uuid(), 'juan_perez92@hotmail.com');

  -- cuentas que nunca confirmaron el correo se limpian
  insert into auth.users (id, email, created_at, email_confirmed_at) values (gen_random_uuid(), 'viejo@gmail.com', now() - interval '3 days', null);
  insert into auth.users (id, email, created_at, email_confirmed_at) values (gen_random_uuid(), 'confirmado@gmail.com', now() - interval '3 days', now());
  insert into auth.users (id, email, created_at, email_confirmed_at) values (gen_random_uuid(), 'reciente@gmail.com', now(), null);
  assert public.cleanup_unconfirmed_users() = 1, 'T94 borra solo la cuenta vieja sin confirmar';
  select count(*) into cnt from auth.users where email in ('viejo@gmail.com', 'confirmado@gmail.com', 'reciente@gmail.com');
  assert cnt = 2, 'T95 las demas cuentas se quedan';
  select count(*) into cnt from public.profiles where username in ('viejo');
  assert cnt = 0, 'T96 el usuario reservado por la cuenta falsa se libera';

  ---------------------------------------------------------------------
  -- CLABE
  ---------------------------------------------------------------------
  assert public.clabe_valid('002010077777777771') = true,  'T97 CLABE valida';
  assert public.clabe_valid('002010077777777772') = false, 'T98 CLABE con digito malo';
  assert public.clabe_valid('12345') = false and public.clabe_valid(null) = false and public.clabe_valid('00201007777777777a') = false, 'T99 CLABE incompleta o con letras';

  ---------------------------------------------------------------------
  -- INTERCAMBIOS: misma cantidad = solo confirmar; si no, se paga la diferencia
  ---------------------------------------------------------------------
  insert into public.items (owner_id, name, value, category, listing, image_url) values (u2, 'Pieza cara de u2', 3000, 'carta', 'intercambio', img) returning id into it_f;
  insert into public.items (owner_id, name, value, category, listing, image_url) values (u1, 'Pieza barata de u1', 400, 'carta', 'exhibicion', img) returning id into it_g;
  insert into public.items (owner_id, name, value, category, listing, image_url) values (u2, 'Pieza barata de u2', 400, 'vinilo', 'intercambio', img) returning id into it_h;
  insert into public.items (owner_id, name, value, category, listing, image_url) values (u1, 'Pieza cara de u1', 3000, 'vinilo', 'exhibicion', img) returning id into it_i;
  insert into public.items (owner_id, name, value, category, listing, image_url) values (u2, 'Pieza igual de u2', 500, 'arte', 'intercambio', img) returning id into it_j;
  insert into public.items (owner_id, name, value, category, listing, image_url) values (u1, 'Pieza igual de u1', 500, 'arte', 'exhibicion', img) returning id into it_k;

  -- (a) pides algo que vale MAS: tu pagas la diferencia
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin perform public.create_order(it_f, null, it_g, '');
  exception when raise_exception then ok := true; end;
  assert ok, 'T100 con diferencia hay que elegir como se paga';
  ok := false;
  begin perform public.create_order(it_f, 'enlace', it_g, '');
  exception when raise_exception then ok := true; end;
  assert ok, 'T101 el metodo debe ser uno que acepte quien cobra';
  ord := public.create_order(it_f, 'transferencia', it_g, '');
  select * into o from public.orders where id = ord;
  assert o.amount = 2600 and o.payer_id = u1 and o.receiver_id = u2 and o.payment_method = 'transferencia', 'T102 la diferencia es 2600 y la paga el comprador';

  select count(*) into n from public.payment_profiles where user_id = u2;
  assert n = 0, 'T103 todavia no ve los datos de cobro';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.respond_order(ord, true);
  ok := false;
  begin perform public.confirm_order(ord);
  exception when raise_exception then ok := true; end;
  assert ok, 'T104 quien cobra no confirma el pago';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  select count(*) into n from public.payment_profiles where user_id = u2;
  assert n = 1, 'T105 ya aceptada, quien paga ve los datos de cobro';
  perform public.confirm_order(ord);
  ok := false;
  begin perform public.complete_order(ord);
  exception when raise_exception then ok := true; end;
  assert ok, 'T106 quien paga no completa';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.complete_order(ord);
  reset role;
  assert (select owner_id from public.items where id = it_f) = u1 and (select owner_id from public.items where id = it_g) = u2, 'T107 se intercambian los dos articulos';

  -- (b) ofreces algo que vale MAS: la diferencia te la paga la otra persona
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin perform public.create_order(it_h, 'transferencia', it_i, '');   -- u1 no tiene datos de transferencia para recibir
  exception when raise_exception then ok := true; end;
  assert ok, 'T108 para recibir la diferencia debes tener ese metodo';
  ord := public.create_order(it_h, 'efectivo', it_i, '');
  select * into o from public.orders where id = ord;
  assert o.amount = 2600 and o.payer_id = u2 and o.receiver_id = u1, 'T109 la diferencia la paga el dueño de la pieza';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.respond_order(ord, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  ok := false;
  begin perform public.confirm_order(ord);
  exception when raise_exception then ok := true; end;
  assert ok, 'T110 el comprador (que cobra) no confirma el pago';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.confirm_order(ord);
  ok := false;
  begin perform public.complete_order(ord);
  exception when raise_exception then ok := true; end;
  assert ok, 'T111 quien paga no completa';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform public.complete_order(ord);
  reset role;
  assert (select owner_id from public.items where id = it_h) = u1 and (select owner_id from public.items where id = it_i) = u2, 'T112 se intercambian los dos articulos (caso 2)';

  -- (c) mismo valor: solo se confirma
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ord := public.create_order(it_j, null, it_k, '');
  select * into o from public.orders where id = ord;
  assert o.amount is null and o.payer_id is null and o.payment_method is null, 'T113 mismo valor: no hay pago';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.respond_order(ord, true);
  ok := false;
  begin perform public.confirm_order(ord);
  exception when raise_exception then ok := true; end;
  assert ok, 'T114 el dueño de la pieza no confirma primero';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform public.confirm_order(ord);
  ok := false;
  begin perform public.complete_order(ord);
  exception when raise_exception then ok := true; end;
  assert ok, 'T115 el comprador no completa';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.complete_order(ord);
  reset role;
  assert (select owner_id from public.items where id = it_j) = u1 and (select owner_id from public.items where id = it_k) = u2, 'T116 se intercambian los dos articulos (caso 3)';

  ---------------------------------------------------------------------
  -- SUBASTAS
  ---------------------------------------------------------------------
  insert into public.items (owner_id, name, value, category, listing, image_url) values (u2, 'Cuadro en subasta', 3000, 'arte', 'subasta', img) returning id into au1;

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin perform public.start_auction(au1, 100, 2);
  exception when raise_exception then ok := true; end;
  assert ok, 'T117 solo el dueño abre la subasta';

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.start_auction(au1, 100, 0);   exception when raise_exception then ok := true; end;
  assert ok, 'T118 la duracion minima es 1 hora';
  ok := false; begin perform public.start_auction(au1, 0, 2);     exception when raise_exception then ok := true; end;
  assert ok, 'T119 el precio inicial debe ser mayor a cero';
  ok := false; begin perform public.start_auction(au1, 100, 200); exception when raise_exception then ok := true; end;
  assert ok, 'T120 la duracion maxima es 7 dias';
  perform public.start_auction(au1, 100, 2);
  ok := false; begin perform public.start_auction(au1, 100, 2);   exception when raise_exception then ok := true; end;
  assert ok, 'T121 no se abre dos veces';
  ok := false; begin perform public.place_bid(au1, 200);          exception when raise_exception then ok := true; end;
  assert ok, 'T122 el dueño no puja en su subasta';

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.place_bid(au1, 50);           exception when raise_exception then ok := true; end;
  assert ok, 'T123 no se puede pujar menos que el precio inicial';
  perform public.place_bid(au1, 100);
  ok := false; begin perform public.place_bid(au1, 500);          exception when raise_exception then ok := true; end;
  assert ok, 'T124 quien lleva la puja mas alta no se supera a si mismo';

  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.place_bid(au1, 102);          exception when raise_exception then ok := true; end;
  assert ok, 'T125 hay que superar la puja por el incremento minimo (5)';
  perform public.place_bid(au1, 105);
  select * into au from public.auctions where item_id = au1;
  assert au.current_bid = 105 and au.current_bidder = u4 and au.bid_count = 2, 'T126 la subasta guarda la puja mas alta';
  select count(*) into cnt from public.bids where item_id = au1;
  assert cnt = 2, 'T127 queda el historial de pujas';

  -- anti ultimo segundo: pujar en los ultimos 2 minutos alarga la subasta
  reset role;
  update public.auctions set ends_at = now() + interval '30 seconds' where item_id = au1;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.place_bid(au1, 110);
  select * into au from public.auctions where item_id = au1;
  assert au.ends_at > now() + interval '100 seconds', 'T128 la puja de ultimo momento alarga la subasta';

  -- no se puede cambiar ni borrar el articulo con pujas
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  ok := false; begin update public.items set name = 'Otro nombre' where id = au1; exception when raise_exception then ok := true; end;
  assert ok, 'T129 no se edita un articulo en subasta';
  ok := false; begin delete from public.items where id = au1;                     exception when raise_exception then ok := true; end;
  assert ok, 'T130 no se borra un articulo con pujas';
  ok := false; begin perform public.cancel_auction(au1);                          exception when raise_exception then ok := true; end;
  assert ok, 'T131 no se cancela con pujas';

  -- termina la subasta: el ganador recibe una operacion de compra ya aceptada
  reset role;
  update public.auctions set ends_at = now() - interval '1 second' where item_id = au1;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false; begin perform public.place_bid(au1, 999); exception when raise_exception then ok := true; end;
  assert ok, 'T132 no se puja despues de que termina';
  assert public.finalize_expired_auctions() >= 1, 'T133 se cierra la subasta vencida';
  reset role;
  select * into au from public.auctions where item_id = au1;
  assert au.status = 'finalizada' and au.winner_id = u1, 'T134 gana quien tenia la puja mas alta';
  select * into o from public.orders where item_id = au1;
  assert o.buyer_id = u1 and o.seller_id = u2 and o.amount = 110 and o.status = 'aceptada' and o.is_auction and o.payer_id = u1,
         'T135 se crea la operacion de pago por 110';
  assert (select listing::text from public.items where id = au1) = 'exhibicion', 'T136 el articulo sale de la subasta';

  -- el ganador elige como pagar
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false; begin perform public.set_order_method(o.id, 'enlace'); exception when raise_exception then ok := true; end;
  assert ok, 'T137 no puede elegir un metodo que el vendedor no acepta';
  perform public.set_order_method(o.id, 'transferencia');
  assert (select payment_method::text from public.orders where id = o.id) = 'transferencia', 'T138 el ganador cambia el metodo de pago';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.set_order_method(o.id, 'efectivo'); exception when raise_exception then ok := true; end;
  assert ok, 'T139 el vendedor no cambia el metodo del comprador';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform public.confirm_order(o.id);
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.complete_order(o.id);
  reset role;
  assert (select owner_id from public.items where id = au1) = u1, 'T140 el ganador recibe el articulo';

  -- sin pujas: termina sin ganador
  insert into public.items (owner_id, name, value, category, listing, image_url) values (u2, 'Subasta sin pujas', 100, 'moneda', 'subasta', img) returning id into au2;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.start_auction(au2, 50, 1);
  reset role;
  update public.auctions set ends_at = now() - interval '1 second' where item_id = au2;
  perform public.finalize_expired_auctions();
  select * into au from public.auctions where item_id = au2;
  assert au.status = 'finalizada' and au.winner_id is null, 'T141 sin pujas no hay ganador';
  assert not exists (select 1 from public.orders where item_id = au2), 'T142 sin ganador no hay operacion';
  assert (select listing::text from public.items where id = au2) = 'exhibicion', 'T143 el articulo vuelve a exhibicion';

  -- volver a subastar y cancelar sin pujas
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false; begin perform public.start_auction(au2, 50, 1); exception when raise_exception then ok := true; end;
  assert ok, 'T144 hay que marcar el articulo como subasta otra vez';
  update public.items set listing = 'subasta' where id = au2;
  perform public.start_auction(au2, 60, 1);
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  ok := false; begin perform public.cancel_auction(au2); exception when raise_exception then ok := true; end;
  assert ok, 'T145 otra persona no cancela tu subasta';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform public.cancel_auction(au2);
  reset role;
  assert (select status from public.auctions where item_id = au2) = 'cancelada', 'T146 se cancela sin pujas';
  assert (select listing::text from public.items where id = au2) = 'exhibicion', 'T147 al cancelar vuelve a exhibicion';

  -- visitantes: ven las subastas pero no pueden pujar ni limpiar cuentas
  set local role anon;
  perform 1 from public.auctions; perform 1 from public.bids;
  ok := false; begin perform public.place_bid(au2, 100); exception when insufficient_privilege then ok := true; end;
  assert ok, 'T148 un visitante no puja';
  ok := false; begin perform public.cleanup_unconfirmed_users(); exception when insufficient_privilege then ok := true; end;
  assert ok, 'T149 un visitante no limpia cuentas';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false; begin perform public.cleanup_unconfirmed_users(); exception when insufficient_privilege then ok := true; end;
  assert ok, 'T150 un usuario normal no limpia cuentas';
  ok := false; begin insert into public.bids (item_id, bidder_id, amount) values (au2, u1, 10); exception when insufficient_privilege then ok := true; end;
  assert ok, 'T151 no se pueden meter pujas directo a la tabla';
  reset role;

  raise notice 'TODAS LAS PRUEBAS PASARON (151 de 151)';
end $$;

rollback;
