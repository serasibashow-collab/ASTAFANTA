create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.players (
  id bigint primary key,
  role text not null check (role in ('P','D','C','A')),
  mantra_role text,
  name text not null,
  team text not null,
  quote_a integer,
  quote_i integer,
  quote_diff integer,
  fvm integer,
  status text not null default 'available' check (status in ('available','sold'))
);

create table if not exists public.participants (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null unique,
  login_name text not null unique,
  is_admin boolean not null default false,
  budget_remaining integer not null default 500 check (budget_remaining >= 0)
);

create table if not exists public.league_state (
  id smallint primary key default 1 check (id = 1),
  phase text not null default 'P' check (phase in ('P','D','C','A')),
  updated_at timestamptz not null default now()
);
insert into public.league_state (id, phase) values (1, 'P') on conflict (id) do nothing;

create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null references public.players(id),
  status text not null default 'live' check (status in ('live','confirmed','cancelled')),
  current_price integer not null default 0 check (current_price >= 0),
  highest_bidder_id uuid references public.participants(id),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create unique index if not exists only_one_live_auction on public.auctions ((1)) where status = 'live';
create index if not exists auctions_player_idx on public.auctions(player_id);

create table if not exists public.bids (
  id bigint generated always as identity primary key,
  auction_id uuid not null references public.auctions(id) on delete cascade,
  bidder_id uuid not null references public.participants(id),
  amount integer not null check (amount >= 1),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists bids_auction_created_idx on public.bids(auction_id, created_at desc);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  player_id bigint not null unique references public.players(id),
  participant_id uuid not null references public.participants(id),
  price integer not null check (price >= 1),
  auction_id uuid not null unique references public.auctions(id),
  purchased_at timestamptz not null default now()
);
create index if not exists purchases_participant_idx on public.purchases(participant_id);

alter table public.players enable row level security;
alter table public.participants enable row level security;
alter table public.league_state enable row level security;
alter table public.auctions enable row level security;
alter table public.bids enable row level security;
alter table public.purchases enable row level security;

revoke all on public.players, public.participants, public.league_state, public.auctions, public.bids, public.purchases from anon;
revoke all on public.players, public.participants, public.league_state, public.auctions, public.bids, public.purchases from authenticated;
grant select on public.players, public.participants, public.league_state, public.auctions, public.bids, public.purchases to authenticated;

drop policy if exists authenticated_read_players on public.players;
create policy authenticated_read_players on public.players for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists authenticated_read_participants on public.participants;
create policy authenticated_read_participants on public.participants for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists authenticated_read_state on public.league_state;
create policy authenticated_read_state on public.league_state for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists authenticated_read_auctions on public.auctions;
create policy authenticated_read_auctions on public.auctions for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists authenticated_read_bids on public.bids;
create policy authenticated_read_bids on public.bids for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists authenticated_read_purchases on public.purchases;
create policy authenticated_read_purchases on public.purchases for select to authenticated using ((select auth.uid()) is not null);

create or replace function private.require_participant()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.participants p where p.id = v_uid) then
    raise exception 'Utente non autorizzato';
  end if;
  return v_uid;
end;
$$;

create or replace function private.require_admin()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.participants p where p.id = v_uid and p.is_admin) then
    raise exception 'Operazione riservata all''admin';
  end if;
  return v_uid;
end;
$$;

create or replace function private.role_limit(p_role text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_role when 'P' then 3 when 'D' then 8 when 'C' then 8 when 'A' then 6 else 0 end;
$$;

create or replace function private.start_auction_impl(p_player_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players%rowtype;
  v_phase text;
  v_auction public.auctions%rowtype;
begin
  perform private.require_admin();
  if exists (select 1 from public.auctions where status = 'live') then raise exception 'C''è già un''asta attiva'; end if;

  select * into v_player from public.players where id = p_player_id for update;
  if not found then raise exception 'Giocatore non trovato'; end if;
  if v_player.status <> 'available' then raise exception 'Giocatore già assegnato'; end if;

  select phase into v_phase from public.league_state where id = 1;
  if v_player.role <> v_phase then raise exception 'Il giocatore non appartiene alla fase corrente'; end if;

  insert into public.auctions(player_id, ends_at) values (p_player_id, now() + interval '10 seconds') returning * into v_auction;
  return to_jsonb(v_auction);
end;
$$;

create or replace function private.place_bid_impl(p_amount integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_auction public.auctions%rowtype;
  v_player public.players%rowtype;
  v_participant public.participants%rowtype;
  v_role_count integer;
  v_total_count integer;
  v_remaining_after integer;
  v_max_bid integer;
  v_amount integer;
begin
  v_uid := private.require_participant();
  select * into v_auction from public.auctions where status = 'live' order by created_at desc limit 1 for update;
  if not found then raise exception 'Nessuna asta attiva'; end if;
  if now() >= v_auction.ends_at then raise exception 'Tempo scaduto'; end if;
  if v_auction.highest_bidder_id = v_uid then raise exception 'Sei già il miglior offerente'; end if;

  select * into v_player from public.players where id = v_auction.player_id;
  select * into v_participant from public.participants where id = v_uid for update;

  select count(*) into v_role_count
  from public.purchases pu join public.players pl on pl.id = pu.player_id
  where pu.participant_id = v_uid and pl.role = v_player.role;
  if v_role_count >= private.role_limit(v_player.role) then raise exception 'Hai già completato gli slot per questo ruolo'; end if;

  select count(*) into v_total_count from public.purchases where participant_id = v_uid;
  v_remaining_after := 25 - (v_total_count + 1);
  v_max_bid := v_participant.budget_remaining - v_remaining_after;
  if v_max_bid < 1 then raise exception 'Budget insufficiente per completare la rosa'; end if;

  if p_amount is null then v_amount := v_auction.current_price + 1; else v_amount := p_amount; end if;
  if v_amount <= v_auction.current_price then raise exception 'L''offerta deve superare quella attuale'; end if;
  if v_amount > v_max_bid then raise exception 'Offerta massima consentita: % crediti', v_max_bid; end if;

  update public.auctions
    set current_price = v_amount, highest_bidder_id = v_uid, ends_at = now() + interval '10 seconds'
    where id = v_auction.id
    returning * into v_auction;
  insert into public.bids(auction_id, bidder_id, amount) values (v_auction.id, v_uid, v_amount);
  return to_jsonb(v_auction);
end;
$$;

create or replace function private.confirm_auction_impl(p_auction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auction public.auctions%rowtype;
  v_player public.players%rowtype;
  v_participant public.participants%rowtype;
  v_role_count integer;
  v_total_count integer;
  v_remaining_after integer;
  v_max_bid integer;
  v_purchase public.purchases%rowtype;
begin
  perform private.require_admin();
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found or v_auction.status <> 'live' then raise exception 'Asta non valida'; end if;
  if now() < v_auction.ends_at then raise exception 'Il timer non è ancora scaduto'; end if;
  if v_auction.highest_bidder_id is null or v_auction.current_price < 1 then raise exception 'Non c''è un''offerta da confermare'; end if;

  select * into v_player from public.players where id = v_auction.player_id for update;
  if v_player.status <> 'available' then raise exception 'Giocatore non più disponibile'; end if;
  select * into v_participant from public.participants where id = v_auction.highest_bidder_id for update;

  select count(*) into v_role_count
  from public.purchases pu join public.players pl on pl.id = pu.player_id
  where pu.participant_id = v_participant.id and pl.role = v_player.role;
  if v_role_count >= private.role_limit(v_player.role) then raise exception 'Il vincitore non ha slot disponibili nel ruolo'; end if;

  select count(*) into v_total_count from public.purchases where participant_id = v_participant.id;
  v_remaining_after := 25 - (v_total_count + 1);
  v_max_bid := v_participant.budget_remaining - v_remaining_after;
  if v_auction.current_price > v_max_bid then raise exception 'Budget del vincitore non più sufficiente'; end if;

  insert into public.purchases(player_id, participant_id, price, auction_id)
  values (v_player.id, v_participant.id, v_auction.current_price, v_auction.id)
  returning * into v_purchase;
  update public.participants set budget_remaining = budget_remaining - v_auction.current_price where id = v_participant.id;
  update public.players set status = 'sold' where id = v_player.id;
  update public.auctions set status = 'confirmed', confirmed_at = now() where id = v_auction.id;
  return to_jsonb(v_purchase);
end;
$$;

create or replace function private.reopen_auction_impl(p_auction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_auction public.auctions%rowtype;
begin
  perform private.require_admin();
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found or v_auction.status <> 'live' then raise exception 'Asta non valida'; end if;
  update public.auctions set ends_at = now() + interval '10 seconds' where id = p_auction_id returning * into v_auction;
  return to_jsonb(v_auction);
end;
$$;

create or replace function private.cancel_auction_impl(p_auction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  update public.auctions set status = 'cancelled' where id = p_auction_id and status = 'live';
  if not found then raise exception 'Asta non valida'; end if;
end;
$$;

create or replace function private.set_phase_impl(p_phase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_phase not in ('P','D','C','A') then raise exception 'Fase non valida'; end if;
  if exists (select 1 from public.auctions where status = 'live') then raise exception 'Chiudi prima l''asta attiva'; end if;
  update public.league_state set phase = p_phase, updated_at = now() where id = 1;
end;
$$;

create or replace function private.undo_purchase_impl(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_purchase public.purchases%rowtype;
begin
  perform private.require_admin();
  if exists (select 1 from public.auctions where status = 'live') then raise exception 'Chiudi prima l''asta attiva'; end if;
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'Acquisto non trovato'; end if;
  update public.participants set budget_remaining = budget_remaining + v_purchase.price where id = v_purchase.participant_id;
  update public.players set status = 'available' where id = v_purchase.player_id;
  update public.auctions set status = 'cancelled' where id = v_purchase.auction_id;
  delete from public.purchases where id = p_purchase_id;
end;
$$;

create or replace function public.start_auction(p_player_id bigint) returns jsonb language sql security invoker set search_path = '' as $$ select private.start_auction_impl(p_player_id); $$;
create or replace function public.place_bid(p_amount integer default null) returns jsonb language sql security invoker set search_path = '' as $$ select private.place_bid_impl(p_amount); $$;
create or replace function public.confirm_auction(p_auction_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.confirm_auction_impl(p_auction_id); $$;
create or replace function public.reopen_auction(p_auction_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.reopen_auction_impl(p_auction_id); $$;
create or replace function public.cancel_auction(p_auction_id uuid) returns void language sql security invoker set search_path = '' as $$ select private.cancel_auction_impl(p_auction_id); $$;
create or replace function public.set_phase(p_phase text) returns void language sql security invoker set search_path = '' as $$ select private.set_phase_impl(p_phase); $$;
create or replace function public.undo_purchase(p_purchase_id uuid) returns void language sql security invoker set search_path = '' as $$ select private.undo_purchase_impl(p_purchase_id); $$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.start_auction_impl(bigint) to authenticated;
grant execute on function private.place_bid_impl(integer) to authenticated;
grant execute on function private.confirm_auction_impl(uuid) to authenticated;
grant execute on function private.reopen_auction_impl(uuid) to authenticated;
grant execute on function private.cancel_auction_impl(uuid) to authenticated;
grant execute on function private.set_phase_impl(text) to authenticated;
grant execute on function private.undo_purchase_impl(uuid) to authenticated;

revoke execute on function public.start_auction(bigint) from public, anon;
revoke execute on function public.place_bid(integer) from public, anon;
revoke execute on function public.confirm_auction(uuid) from public, anon;
revoke execute on function public.reopen_auction(uuid) from public, anon;
revoke execute on function public.cancel_auction(uuid) from public, anon;
revoke execute on function public.set_phase(text) from public, anon;
revoke execute on function public.undo_purchase(uuid) from public, anon;
grant execute on function public.start_auction(bigint), public.place_bid(integer), public.confirm_auction(uuid), public.reopen_auction(uuid), public.cancel_auction(uuid), public.set_phase(text), public.undo_purchase(uuid) to authenticated;

-- Realtime sulle tabelle che devono aggiornarsi sui 10 dispositivi.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='auctions') then alter publication supabase_realtime add table public.auctions; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bids') then alter publication supabase_realtime add table public.bids; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='purchases') then alter publication supabase_realtime add table public.purchases; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='participants') then alter publication supabase_realtime add table public.participants; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='league_state') then alter publication supabase_realtime add table public.league_state; end if;
end $$;
