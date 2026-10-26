-- Gilmore Cleaning Services: bookings database.
-- Paste this whole file into Supabase > SQL Editor and press Run.
-- Before running, change the owner email on the last line to the email you'll sign in with.

create extension if not exists btree_gist;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  service_key text not null,
  service text not null,
  option_id text not null,
  option_label text not null,
  addons text[] not null default '{}',
  frequency text not null default 'once',
  price_label text not null,
  is_quote boolean not null default false,
  start_at timestamptz not null,
  end_at timestamptz not null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  address text not null,
  notes text,
  status text not null default 'booked' check (status in ('booked', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  -- Two booked appointments can never overlap.
  constraint no_double_booking exclude using gist (tstzrange(start_at, end_at) with &&) where (status = 'booked')
);

-- Who may sign in to the owner page.
create table if not exists public.owners (email text primary key);

alter table public.appointments enable row level security;
alter table public.owners enable row level security;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from owners where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- Customers never read the table directly. Only the signed-in owner can.
drop policy if exists owner_all on public.appointments;
create policy owner_all on public.appointments for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists owner_self on public.owners;
create policy owner_self on public.owners for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Taken time ranges, with no customer details, so the booking calendar can hide them.
create or replace function public.busy_times(p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.start_at, a.end_at from appointments a
  where a.status = 'booked' and a.start_at < p_to and a.end_at > p_from;
$$;

create or replace function public.digits(t text) returns text
language sql immutable as $$ select regexp_replace(coalesce(t, ''), '\D', '', 'g') $$;

-- A customer books. Returns the confirmation code.
create or replace function public.book_appointment(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_ref text := 'GCS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  v_start timestamptz := (p ->> 'start_at')::timestamptz;
  v_end timestamptz := (p ->> 'end_at')::timestamptz;
begin
  if v_start < now() then raise exception 'That time has already passed.'; end if;
  if v_end - v_start > interval '6 hours' or v_end <= v_start then raise exception 'Invalid appointment length.'; end if;
  if length(public.digits(p ->> 'customer_phone')) < 10 then raise exception 'A 10-digit phone number is required.'; end if;
  if coalesce(trim(p ->> 'customer_name'), '') = '' or coalesce(trim(p ->> 'address'), '') = '' then raise exception 'Name and address are required.'; end if;

  insert into appointments (ref, service_key, service, option_id, option_label, addons, frequency, price_label, is_quote,
    start_at, end_at, customer_name, customer_phone, customer_email, address, notes)
  values (v_ref, left(p ->> 'service_key', 40), left(p ->> 'service', 80), left(p ->> 'option_id', 40), left(p ->> 'option_label', 120),
    coalesce(array(select left(x, 80) from jsonb_array_elements_text(coalesce(p -> 'addons', '[]'::jsonb)) x), '{}'),
    left(coalesce(p ->> 'frequency', 'once'), 20), left(p ->> 'price_label', 40), coalesce((p ->> 'is_quote')::boolean, false),
    v_start, v_end, left(p ->> 'customer_name', 120), left(p ->> 'customer_phone', 40), left(nullif(p ->> 'customer_email', ''), 160),
    left(p ->> 'address', 240), left(nullif(p ->> 'notes', ''), 1000));
  return v_ref;
end $$;

-- A customer looks up their own appointments by confirmation code + phone number.
create or replace function public.customer_appointments(p_refs text[], p_phone text)
returns table (ref text, status text, start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.ref, a.status, a.start_at, a.end_at from appointments a
  where a.ref = any (p_refs) and public.digits(a.customer_phone) = public.digits(p_phone);
$$;

create or replace function public.customer_cancel(p_ref text, p_phone text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update appointments set status = 'cancelled', updated_at = now()
  where ref = p_ref and status = 'booked' and public.digits(customer_phone) = public.digits(p_phone);
  return found;
end $$;

create or replace function public.customer_reschedule(p_ref text, p_phone text, p_start timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_start < now() then raise exception 'That time has already passed.'; end if;
  update appointments set end_at = p_start + (end_at - start_at), start_at = p_start, updated_at = now()
  where ref = p_ref and status = 'booked' and public.digits(customer_phone) = public.digits(p_phone);
  return found;
end $$;

revoke all on function public.book_appointment(jsonb), public.busy_times(timestamptz, timestamptz),
  public.customer_appointments(text[], text), public.customer_cancel(text, text),
  public.customer_reschedule(text, text, timestamptz) from public;
grant execute on function public.book_appointment(jsonb), public.busy_times(timestamptz, timestamptz),
  public.customer_appointments(text[], text), public.customer_cancel(text, text),
  public.customer_reschedule(text, text, timestamptz) to anon, authenticated;

-- CHANGE THIS to the email you'll use to sign in to the owner page.
insert into public.owners (email) values ('YOUR-EMAIL@example.com') on conflict do nothing;
