-- =====================================================================
--  COLLECTION QUEST - Esquema completo para Supabase (PostgreSQL)
--  Pégalo completo en: Supabase > SQL Editor > New query > Run
--  Se puede ejecutar más de una vez sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TIPOS
-- ---------------------------------------------------------------------
do $$ begin
  create type public.rarity_tier as enum ('comun', 'rara', 'epica', 'mitica', 'legendaria');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.listing_type as enum ('venta', 'intercambio', 'exhibicion');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2) TABLAS
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique
              check (username ~ '^[a-z0-9_]{3,24}$'),
  avatar_url  text,
  bio         text not null default '' check (char_length(bio) <= 300),
  contact     text not null default '' check (char_length(contact) <= 120),
  points      int  not null default 0,
  level       int  not null default 1,
  created_at  timestamptz not null default now()
);

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 400),
  value       numeric(12,2) not null check (value >= 0),
  listing     public.listing_type not null default 'exhibicion',
  rarity      public.rarity_tier  not null default 'comun',   -- la calcula el trigger
  points      int not null default 0,                           -- la calcula el trigger
  image_url   text,
  created_at  timestamptz not null default now()
);

create index if not exists items_owner_idx   on public.items (owner_id);
create index if not exists items_listing_idx on public.items (listing);
create index if not exists items_rarity_idx  on public.items (rarity);
create index if not exists items_created_idx on public.items (created_at desc);

-- ---------------------------------------------------------------------
-- 3) REGLAS DE RAREZA, PUNTOS Y NIVEL
--    Rareza segun el valor declarado del articulo:
--       comun       menos de 500
--       rara        500   a 2,499
--       epica       2,500 a 9,999
--       mitica      10,000 a 49,999
--       legendaria  50,000 o mas
--    Puntos por rareza: 10 / 25 / 60 / 150 / 400
--    Nivel del usuario: 1 + floor( raiz( puntos / 25 ) )
--       0 pts = nivel 1 | 25 = 2 | 100 = 3 | 225 = 4 | 400 = 5 ...
--    Si quieres cambiar los umbrales, edita estas funciones
--    (y los mismos numeros en assets/js/config.js para la vista previa).
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

-- Antes de guardar un articulo: el sistema decide la rareza y los puntos.
-- (Aunque alguien intente mandar otra rareza desde el navegador, se sobreescribe.)
create or replace function public.items_set_rarity()
returns trigger
language plpgsql as $$
begin
  new.rarity := public.rarity_for_value(new.value);
  new.points := public.points_for_rarity(new.rarity);
  return new;
end $$;

drop trigger if exists trg_items_set_rarity on public.items;
create trigger trg_items_set_rarity
  before insert or update on public.items
  for each row execute function public.items_set_rarity();

-- Despues de guardar/borrar un articulo: recalcula puntos y nivel del dueño.
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
  return new;
end $$;

drop trigger if exists trg_items_after_change on public.items;
create trigger trg_items_after_change
  after insert or update or delete on public.items
  for each row execute function public.items_after_change();

-- ---------------------------------------------------------------------
-- 4) PERFIL AUTOMATICO AL REGISTRARSE
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

-- ---------------------------------------------------------------------
-- 5) SEGURIDAD (RLS)
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.items    enable row level security;

-- Perfiles: todos los ven, cada quien edita solo el suyo.
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Un usuario NO puede tocar sus puntos ni su nivel: solo estas columnas.
revoke update on public.profiles from anon, authenticated;
grant  update (username, avatar_url, bio, contact) on public.profiles to authenticated;

-- Articulos: la galeria es publica, cada quien maneja solo los suyos.
drop policy if exists items_select_all on public.items;
create policy items_select_all on public.items
  for select using (true);

drop policy if exists items_insert_own on public.items;
create policy items_insert_own on public.items
  for insert to authenticated with check (auth.uid() = owner_id);

drop policy if exists items_update_own on public.items;
create policy items_update_own on public.items
  for update to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists items_delete_own on public.items;
create policy items_delete_own on public.items
  for delete to authenticated using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------
-- 6) STORAGE (fotos de articulos y avatares)
--    Cada usuario solo escribe dentro de su carpeta: <user_id>/archivo.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('items',   'items',   true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cq_images_read on storage.objects;
create policy cq_images_read on storage.objects
  for select using (bucket_id in ('avatars', 'items'));

drop policy if exists cq_images_insert_own on storage.objects;
create policy cq_images_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id in ('avatars', 'items')
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cq_images_update_own on storage.objects;
create policy cq_images_update_own on storage.objects
  for update to authenticated
  using (bucket_id in ('avatars', 'items')
         and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists cq_images_delete_own on storage.objects;
create policy cq_images_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars', 'items')
         and (storage.foldername(name))[1] = auth.uid()::text);
