-- =====================================================================
--  COLLECTION QUEST - Esquema completo para Supabase (PostgreSQL) v2
--  Pégalo completo en: Supabase > SQL Editor > New query > Run
--  Se puede ejecutar más de una vez, y también sobre la base que ya
--  tienes (agrega lo nuevo sin borrar tus datos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TIPOS
-- ---------------------------------------------------------------------
do $$ begin create type public.rarity_tier as enum ('comun', 'rara', 'epica', 'mitica', 'legendaria');
exception when duplicate_object then null; end $$;

do $$ begin create type public.listing_type as enum ('venta', 'intercambio', 'exhibicion');
exception when duplicate_object then null; end $$;

do $$ begin create type public.user_role as enum ('usuario', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin create type public.item_category as enum
  ('comic', 'manga', 'carta', 'vinilo', 'figura', 'videojuego', 'arte', 'moneda', 'estampilla');
exception when duplicate_object then null; end $$;

do $$ begin create type public.payment_method as enum ('efectivo', 'transferencia', 'enlace');
exception when duplicate_object then null; end $$;

do $$ begin create type public.order_kind as enum ('compra', 'intercambio');
exception when duplicate_object then null; end $$;

do $$ begin create type public.order_status as enum
  ('pendiente', 'aceptada', 'confirmada', 'completada', 'rechazada', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin create type public.friend_status as enum ('pendiente', 'aceptada');
exception when duplicate_object then null; end $$;

do $$ begin create type public.verify_status as enum ('pendiente', 'aprobada', 'rechazada');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2) TEXTO PARA BUSCAR: sin acentos, sin mayúsculas, sin comas ni puntos
--    "Cámión, Rojo." y "camion rojo" quedan iguales.
-- ---------------------------------------------------------------------
create or replace function public.norm_text(t text)
returns text
language sql immutable as $$
  select btrim(regexp_replace(
           translate(lower(coalesce(t, '')), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿāăąćĉċčďēĕėęěĝğġģĥĩīĭįĵķĺļľńņňōŏőŕŗřśŝşšţťũūŭůűųŵŷźżžøđłħ', 'aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzzodlh'),
           '[^a-z0-9]+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------
-- 3) TABLAS PRINCIPALES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  avatar_url  text,
  banner_url  text,
  bio         text not null default '' check (char_length(bio) <= 300),
  contact     text not null default '' check (char_length(contact) <= 120),
  points      int  not null default 0,
  level       int  not null default 1,
  role        public.user_role not null default 'usuario',
  verified    boolean not null default false,
  search_text text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.profiles add column if not exists banner_url  text;
alter table public.profiles add column if not exists role        public.user_role not null default 'usuario';
alter table public.profiles add column if not exists verified    boolean not null default false;
alter table public.profiles add column if not exists search_text text not null default '';

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 400),
  value       numeric(12,2) not null check (value >= 0),
  category    public.item_category not null,
  listing     public.listing_type not null default 'exhibicion',
  rarity      public.rarity_tier  not null default 'comun',   -- la calcula el trigger
  points      int not null default 0,                           -- la calcula el trigger
  image_url   text,
  search_text text not null default '',
  created_at  timestamptz not null default now()
);

alter table public.items add column if not exists search_text text not null default '';

-- Base que ya existía: los artículos viejos quedan como "carta" (puedes editarlos).
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'items' and column_name = 'category') then
    alter table public.items add column category public.item_category not null default 'carta';
    alter table public.items alter column category drop default;
  end if;
end $$;

create index if not exists items_owner_idx    on public.items (owner_id);
create index if not exists items_listing_idx  on public.items (listing);
create index if not exists items_rarity_idx   on public.items (rarity);
create index if not exists items_category_idx on public.items (category);
create index if not exists items_created_idx  on public.items (created_at desc);
create index if not exists profiles_points_idx on public.profiles (points desc);

-- ---------------------------------------------------------------------
-- 4) REGLAS DE RAREZA, PUNTOS Y NIVEL
--       comun       menos de 500
--       rara        500   a 2,499
--       epica       2,500 a 9,999
--       mitica      10,000 a 49,999
--       legendaria  50,000 o más
--    Puntos: 10 / 25 / 60 / 150 / 400
--    Nivel:  1 + floor( raiz( puntos / 25 ) )
-- ---------------------------------------------------------------------
create or replace function public.rarity_for_value(v numeric)
returns public.rarity_tier
language sql immutable as $$
  select case
    when v >= 50000 then 'legendaria'::public.rarity_tier
    when v >= 10000 then 'mitica'::public.rarity_tier
    when v >= 2500  then 'epica'::public.rarity_tier
    when v >= 500   then 'rara'::public.rarity_tier
    else 'comun'::public.rarity_tier
  end
$$;

create or replace function public.points_for_rarity(r public.rarity_tier)
returns int
language sql immutable as $$
  select case r
    when 'legendaria' then 400
    when 'mitica'     then 150
    when 'epica'      then 60
    when 'rara'       then 25
    else 10
  end
$$;

create or replace function public.level_for_points(p int)
returns int
language sql immutable as $$
  select 1 + floor(sqrt(greatest(p, 0) / 25.0))::int
$$;

-- Antes de guardar un artículo: foto obligatoria, rareza, puntos y texto de búsqueda.
create or replace function public.items_set_rarity()
returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' and (new.image_url is null or btrim(new.image_url) = '') then
    raise exception 'La foto del artículo es obligatoria.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.image_url is not null and (new.image_url is null or btrim(new.image_url) = '') then
    raise exception 'La foto del artículo es obligatoria.' using errcode = '23514';
  end if;

  new.rarity := public.rarity_for_value(new.value);
  new.points := public.points_for_rarity(new.rarity);
  new.search_text := public.norm_text(
    new.name || ' ' || coalesce(new.description, '') || ' ' ||
    new.category::text || ' ' || new.category::text || 's');
  return new;
end $$;

drop trigger if exists trg_items_set_rarity on public.items;
create trigger trg_items_set_rarity
  before insert or update on public.items
  for each row execute function public.items_set_rarity();

-- Texto de búsqueda de los perfiles (usuario + "sobre mí").
create or replace function public.profiles_set_search()
returns trigger
language plpgsql as $$
begin
  new.search_text := public.norm_text(new.username || ' ' || coalesce(new.bio, ''));
  return new;
end $$;

drop trigger if exists trg_profiles_set_search on public.profiles;
create trigger trg_profiles_set_search
  before insert or update on public.profiles
  for each row execute function public.profiles_set_search();

-- Después de guardar/borrar/cambiar de dueño: recalcula puntos y nivel.
create or replace function public.recalc_profile(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare total int;
begin
  select coalesce(sum(points), 0) into total from public.items where owner_id = p_id;
  update public.profiles
     set points = total,
         level  = public.level_for_points(total)
   where id = p_id;
end $$;

create or replace function public.items_after_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_profile(old.owner_id);
    return old;
  end if;
  perform public.recalc_profile(new.owner_id);
  if tg_op = 'UPDATE' and old.owner_id <> new.owner_id then
    perform public.recalc_profile(old.owner_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_items_after_change on public.items;
create trigger trg_items_after_change
  after insert or update or delete on public.items
  for each row execute function public.items_after_change();

-- Rellena el texto de búsqueda de lo que ya existía.
update public.profiles set bio = bio;
update public.items    set name = name;

-- ---------------------------------------------------------------------
-- 5) ALTA DE USUARIOS: perfil automático y correos válidos
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
begin
  base := coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
                   split_part(new.email, '@', 1));
  base := regexp_replace(lower(base), '[^a-z0-9_]', '', 'g');
  if char_length(base) < 3 then base := 'coleccionista'; end if;
  base := left(base, 20);

  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := base || floor(random() * 9000 + 1000)::int::text;
  end loop;

  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Correos temporales/desechables que no se aceptan.
create table if not exists public.blocked_email_domains (domain text primary key);
alter table public.blocked_email_domains enable row level security;  -- sin políticas: nadie la lee desde el navegador

insert into public.blocked_email_domains (domain) values
  ('mailinator.com'), ('guerrillamail.com'), ('guerrillamail.net'), ('10minutemail.com'),
  ('tempmail.com'), ('temp-mail.org'), ('yopmail.com'), ('trashmail.com'), ('getnada.com'),
  ('sharklasers.com'), ('maildrop.cc'), ('dispostable.com'), ('throwawaymail.com'),
  ('fakeinbox.com'), ('mintemail.com'), ('mohmal.com'), ('emailondeck.com'), ('spamgourmet.com'),
  ('tempr.email'), ('moakt.com'), ('mailnesia.com'), ('burnermail.io'), ('discard.email'),
  ('tempinbox.com'), ('mytemp.email'), ('tmpmail.org'), ('tmpmail.net'), ('mail.tm'),
  ('inboxkitten.com'), ('anonbox.net'), ('33mail.com'), ('guerrillamailblock.com'),
  ('grr.la'), ('spam4.me'), ('trashmail.net'), ('wegwerfmail.de'), ('example.com')
on conflict do nothing;

create or replace function public.check_email_domain()
returns trigger
language plpgsql security definer set search_path = public as $$
declare dom text;
begin
  if new.email is null then return new; end if;
  if new.email !~* '^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$' then
    raise exception 'Correo no válido.';
  end if;
  dom := lower(split_part(new.email, '@', 2));
  if exists (select 1 from public.blocked_email_domains b
             where dom = b.domain or dom like '%.' || b.domain) then
    raise exception 'No se aceptan correos temporales.';
  end if;
  return new;
end $$;

drop trigger if exists trg_check_email_domain on auth.users;
create trigger trg_check_email_domain
  before insert on auth.users
  for each row execute function public.check_email_domain();

-- ---------------------------------------------------------------------
-- 6) ROLES
--    Para hacerte admin, ejecuta UNA vez:
--       update public.profiles set role = 'admin' where username = 'tu_usuario';
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- ---------------------------------------------------------------------
-- 7) AMIGOS
-- ---------------------------------------------------------------------
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       public.friend_status not null default 'pendiente',
  created_at   timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

-- Una sola relación por pareja (sin importar quién la pidió).
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

create or replace function public.friend_count(p_user uuid)
returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.friendships
   where status = 'aceptada' and p_user in (requester_id, addressee_id)
$$;

-- ---------------------------------------------------------------------
-- 8) DATOS DE COBRO, VENTAS E INTERCAMBIOS
--    Aquí NO se guardan números de tarjeta ni se procesan pagos:
--    el dinero va directo entre las dos personas.
-- ---------------------------------------------------------------------
create table if not exists public.payment_profiles (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  transfer_info text not null default '' check (char_length(transfer_info) <= 300),
  payment_link  text not null default '' check (payment_link = '' or payment_link ~ '^https://[^ ]+$'),
  updated_at    timestamptz not null default now()
);

create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  kind              public.order_kind not null,
  item_id           uuid references public.items (id) on delete set null,
  item_name         text not null,
  item_image_url    text,
  seller_id         uuid not null references public.profiles (id) on delete cascade,
  buyer_id          uuid not null references public.profiles (id) on delete cascade,
  amount            numeric(12,2),
  payment_method    public.payment_method,
  offered_item_id   uuid references public.items (id) on delete set null,
  offered_item_name text,
  note              text not null default '' check (char_length(note) <= 300),
  status            public.order_status not null default 'pendiente',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (seller_id <> buyer_id),
  check (kind = 'intercambio' or payment_method is not null)
);

-- Una persona no puede tener dos solicitudes abiertas por el mismo artículo.
create unique index if not exists orders_open_idx
  on public.orders (buyer_id, item_id)
  where status in ('pendiente', 'aceptada', 'confirmada');
create index if not exists orders_seller_idx on public.orders (seller_id);
create index if not exists orders_buyer_idx  on public.orders (buyer_id);

-- Qué métodos de pago acepta una persona (efectivo siempre).
create or replace function public.seller_methods(p_seller uuid)
returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    'efectivo',
    case when exists (select 1 from public.payment_profiles
                      where user_id = p_seller and btrim(transfer_info) <> '') then 'transferencia' end,
    case when exists (select 1 from public.payment_profiles
                      where user_id = p_seller and btrim(payment_link) <> '') then 'enlace' end
  ], null)
$$;

-- Crear solicitud de compra o de intercambio.
create or replace function public.create_order(
  p_item uuid,
  p_method public.payment_method default null,
  p_offered uuid default null,
  p_note text default ''
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  it public.items;
  off public.items;
  new_id uuid;
begin
  if me is null then raise exception 'Inicia sesión para continuar.'; end if;
  select * into it from public.items where id = p_item;
  if not found then raise exception 'Ese artículo ya no existe.'; end if;
  if it.owner_id = me then raise exception 'No puedes comprar ni intercambiar tus propios artículos.'; end if;
  if exists (select 1 from public.orders
             where buyer_id = me and item_id = p_item
               and status in ('pendiente', 'aceptada', 'confirmada')) then
    raise exception 'Ya tienes una solicitud en curso para este artículo.';
  end if;
  p_note := left(btrim(coalesce(p_note, '')), 300);

  if it.listing = 'venta' then
    if p_method is null then raise exception 'Elige un método de pago.'; end if;
    if not (p_method::text = any (public.seller_methods(it.owner_id))) then
      raise exception 'El vendedor no acepta ese método de pago.';
    end if;
    insert into public.orders (kind, item_id, item_name, item_image_url, seller_id, buyer_id,
                               amount, payment_method, note)
    values ('compra', it.id, it.name, it.image_url, it.owner_id, me, it.value, p_method, p_note)
    returning id into new_id;

  elsif it.listing = 'intercambio' then
    if p_offered is null then raise exception 'Elige qué artículo vas a ofrecer.'; end if;
    select * into off from public.items where id = p_offered and owner_id = me;
    if not found then raise exception 'Ese artículo no es tuyo.'; end if;
    insert into public.orders (kind, item_id, item_name, item_image_url, seller_id, buyer_id,
                               offered_item_id, offered_item_name, note)
    values ('intercambio', it.id, it.name, it.image_url, it.owner_id, me,
            off.id, off.name, p_note)
    returning id into new_id;

  else
    raise exception 'Este artículo es solo de exhibición.';
  end if;
  return new_id;
end $$;

-- El vendedor acepta o rechaza.
create or replace function public.respond_order(p_order uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'No encontramos esa operación.'; end if;
  if o.seller_id <> auth.uid() then raise exception 'Solo quien vende puede responder.'; end if;
  if o.status <> 'pendiente' then raise exception 'Esta solicitud ya fue respondida.'; end if;
  if p_accept and not exists (select 1 from public.items where id = o.item_id and owner_id = o.seller_id) then
    raise exception 'Ese artículo ya no está disponible.';
  end if;
  update public.orders
     set status = (case when p_accept then 'aceptada' else 'rechazada' end)::public.order_status,
         updated_at = now()
   where id = p_order;
end $$;

-- El comprador confirma que ya pagó (o que está listo para el intercambio).
create or replace function public.confirm_order(p_order uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'No encontramos esa operación.'; end if;
  if o.buyer_id <> auth.uid() then raise exception 'Solo quien compra puede confirmar.'; end if;
  if o.status <> 'aceptada' then raise exception 'Primero tiene que aceptarla quien vende.'; end if;
  update public.orders set status = 'confirmada', updated_at = now() where id = p_order;
end $$;

-- Cualquiera de los dos cancela mientras no esté terminada.
create or replace function public.cancel_order(p_order uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'No encontramos esa operación.'; end if;
  if auth.uid() not in (o.seller_id, o.buyer_id) then raise exception 'Esta operación no es tuya.'; end if;
  if o.status not in ('pendiente', 'aceptada', 'confirmada') then
    raise exception 'Esta operación ya no se puede cancelar.';
  end if;
  update public.orders set status = 'cancelada', updated_at = now() where id = p_order;
end $$;

-- El vendedor confirma que recibió el pago / se hizo el intercambio.
-- Aquí cambian de dueño los artículos y se recalculan puntos y niveles.
create or replace function public.complete_order(p_order uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'No encontramos esa operación.'; end if;
  if o.seller_id <> auth.uid() then raise exception 'Solo quien vende puede completarla.'; end if;
  if o.status <> 'confirmada' then raise exception 'El comprador todavía no la confirma.'; end if;
  if not exists (select 1 from public.items where id = o.item_id and owner_id = o.seller_id) then
    raise exception 'Ese artículo ya no es tuyo.';
  end if;
  if o.kind = 'intercambio' and not exists (
       select 1 from public.items where id = o.offered_item_id and owner_id = o.buyer_id) then
    raise exception 'El artículo ofrecido ya no está disponible.';
  end if;

  update public.items set owner_id = o.buyer_id, listing = 'exhibicion' where id = o.item_id;
  if o.kind = 'intercambio' then
    update public.items set owner_id = o.seller_id, listing = 'exhibicion' where id = o.offered_item_id;
  end if;

  update public.orders set status = 'completada', updated_at = now() where id = p_order;

  -- Las demás solicitudes abiertas sobre esos artículos se cancelan.
  update public.orders
     set status = 'cancelada', updated_at = now()
   where id <> p_order
     and status in ('pendiente', 'aceptada', 'confirmada')
     and (item_id in (o.item_id, o.offered_item_id)
          or offered_item_id in (o.item_id, o.offered_item_id));
end $$;

-- ---------------------------------------------------------------------
-- 9) VERIFICACIÓN DE PERFIL CON IDENTIFICACIÓN OFICIAL
--    Las fotos van a un bucket PRIVADO. Cuando un admin revisa la
--    solicitud, las fotos se borran. No se guarda ningún número de la ID.
-- ---------------------------------------------------------------------
create table if not exists public.verifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  id_path       text,
  selfie_path   text,
  status        public.verify_status not null default 'pendiente',
  reject_reason text,
  reviewed_by   uuid references public.profiles (id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);

create unique index if not exists verifications_one_pending_idx
  on public.verifications (user_id) where status = 'pendiente';

create or replace function public.review_verification(
  p_id uuid, p_approve boolean, p_reason text default ''
)
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v public.verifications;
  paths text[];
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede revisar verificaciones.';
  end if;
  select * into v from public.verifications where id = p_id for update;
  if not found then raise exception 'No encontramos esa solicitud.'; end if;
  if v.status <> 'pendiente' then raise exception 'Esa solicitud ya fue revisada.'; end if;

  paths := array_remove(array[v.id_path, v.selfie_path], null);

  update public.verifications
     set status = (case when p_approve then 'aprobada' else 'rechazada' end)::public.verify_status,
         reject_reason = case when p_approve then null else left(btrim(coalesce(p_reason, '')), 200) end,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         id_path = null,
         selfie_path = null
   where id = p_id;

  if p_approve then
    update public.profiles set verified = true where id = v.user_id;
  end if;
  return paths;   -- el navegador del admin borra estos archivos del Storage
end $$;

-- ---------------------------------------------------------------------
-- 10) SEGURIDAD (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.items            enable row level security;
alter table public.friendships      enable row level security;
alter table public.payment_profiles enable row level security;
alter table public.orders           enable row level security;
alter table public.verifications    enable row level security;

-- Perfiles: todos los ven; cada quien edita el suyo (sin tocar puntos, nivel, rol ni verificado).
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

revoke update on public.profiles from anon, authenticated;
grant  update (username, avatar_url, banner_url, bio, contact) on public.profiles to authenticated;

-- Artículos: galería pública; cada quien maneja lo suyo; el admin puede moderar.
drop policy if exists items_select_all on public.items;
create policy items_select_all on public.items for select using (true);

drop policy if exists items_insert_own on public.items;
create policy items_insert_own on public.items
  for insert to authenticated with check (auth.uid() = owner_id);

drop policy if exists items_update_own on public.items;
create policy items_update_own on public.items
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists items_delete_own on public.items;
create policy items_delete_own on public.items
  for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists items_delete_admin on public.items;
create policy items_delete_admin on public.items
  for delete to authenticated using (public.is_admin());

-- Amigos: solo los dos involucrados ven la relación.
revoke all on public.friendships from anon;
revoke update on public.friendships from authenticated;
grant  update (status) on public.friendships to authenticated;

drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select to authenticated using (auth.uid() in (requester_id, addressee_id));

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pendiente');

drop policy if exists friendships_accept on public.friendships;
create policy friendships_accept on public.friendships
  for update to authenticated
  using (addressee_id = auth.uid() and status = 'pendiente')
  with check (addressee_id = auth.uid() and status = 'aceptada');

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete to authenticated using (auth.uid() in (requester_id, addressee_id));

-- Datos de cobro: solo su dueño, y el comprador cuando el vendedor ya aceptó.
revoke all on public.payment_profiles from anon;

drop policy if exists payprof_select on public.payment_profiles;
create policy payprof_select on public.payment_profiles
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.orders o
                    where o.seller_id = payment_profiles.user_id
                      and o.buyer_id = auth.uid()
                      and o.status in ('aceptada', 'confirmada')));

drop policy if exists payprof_insert on public.payment_profiles;
create policy payprof_insert on public.payment_profiles
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists payprof_update on public.payment_profiles;
create policy payprof_update on public.payment_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Operaciones: solo se leen (las dos partes). Todo cambio pasa por las funciones de arriba.
revoke all on public.orders from anon;
revoke insert, update, delete, truncate on public.orders from authenticated;

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated using (auth.uid() in (seller_id, buyer_id));

-- Verificaciones: las ve su dueño y los admins; el usuario solo crea (o cancela la pendiente).
revoke all on public.verifications from anon;
revoke update, truncate on public.verifications from authenticated;

drop policy if exists verif_select on public.verifications;
create policy verif_select on public.verifications
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists verif_insert on public.verifications;
create policy verif_insert on public.verifications
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pendiente' and reviewed_by is null);

drop policy if exists verif_delete on public.verifications;
create policy verif_delete on public.verifications
  for delete to authenticated using (user_id = auth.uid() and status = 'pendiente');

-- Las funciones de operaciones y verificación solo las usa gente con sesión.
revoke all on function public.create_order(uuid, public.payment_method, uuid, text) from public, anon;
revoke all on function public.respond_order(uuid, boolean)   from public, anon;
revoke all on function public.confirm_order(uuid)            from public, anon;
revoke all on function public.cancel_order(uuid)             from public, anon;
revoke all on function public.complete_order(uuid)           from public, anon;
revoke all on function public.review_verification(uuid, boolean, text) from public, anon;
grant execute on function public.create_order(uuid, public.payment_method, uuid, text) to authenticated;
grant execute on function public.respond_order(uuid, boolean)   to authenticated;
grant execute on function public.confirm_order(uuid)            to authenticated;
grant execute on function public.cancel_order(uuid)             to authenticated;
grant execute on function public.complete_order(uuid)           to authenticated;
grant execute on function public.review_verification(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- 11) STORAGE
--    avatars, items y banners: públicos (cada usuario escribe en su carpeta).
--    verifications: PRIVADO (solo su dueño y los admins).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',       'avatars',       true,  2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('items',         'items',         true,  5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('banners',       'banners',       true,  3145728, array['image/jpeg', 'image/png', 'image/webp']),
  ('verifications', 'verifications', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cq_images_read on storage.objects;
create policy cq_images_read on storage.objects
  for select using (bucket_id in ('avatars', 'items', 'banners'));

drop policy if exists cq_images_insert_own on storage.objects;
create policy cq_images_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id in ('avatars', 'items', 'banners')
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cq_images_update_own on storage.objects;
create policy cq_images_update_own on storage.objects
  for update to authenticated
  using (bucket_id in ('avatars', 'items', 'banners')
         and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cq_images_delete_own on storage.objects;
create policy cq_images_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars', 'items', 'banners')
         and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cq_images_delete_admin on storage.objects;
create policy cq_images_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars', 'items', 'banners') and public.is_admin());

drop policy if exists cq_verif_insert on storage.objects;
create policy cq_verif_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verifications' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cq_verif_select on storage.objects;
create policy cq_verif_select on storage.objects
  for select to authenticated
  using (bucket_id = 'verifications'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists cq_verif_delete on storage.objects;
create policy cq_verif_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'verifications'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------
-- OPCIONAL: la tabla "products" y el tipo "item_rarity" son de la primera
-- versión del proyecto y la app ya no los usa (usa "items"). Si quieres
-- limpiar tu base, quita los guiones de las dos líneas y ejecútalas:
-- ---------------------------------------------------------------------
-- drop table if exists public.products;
-- drop type  if exists public.item_rarity;
