-- This is a reproducible schema reference for the dedicated Cole's Auto Detailing project.
-- Supabase project tubskesvgngmmgcicowq has already received two migrations:
-- initial_site_and_business_tables; isolate_staff_check_from_public_rpc.
-- Do not rerun this file against that already-initialized production database.

create extension if not exists pgcrypto;
create schema if not exists private;

create table public.staff_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create function private.is_staff() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_users where user_id=(select auth.uid()));
$$;
revoke all on function private.is_staff() from public;
grant usage on schema private to anon,authenticated;
grant execute on function private.is_staff() to anon,authenticated;

create table public.business_settings (
 id boolean primary key default true check(id),
 business_name text not null default 'Cole''s Auto Detailing',
 tagline text not null default 'Clean rides. Clear windows. Quality work.',
 phone text not null default '(832) 877-5556',
 service_area text not null default 'Alvin and surrounding communities',
 payment_url text check(payment_url is null or payment_url ~ '^https://'),
 google_review_url text check(google_review_url is null or google_review_url ~ '^https://'),
 updated_at timestamptz not null default now()
);
insert into public.business_settings(id) values(true);
create table public.services (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(title) between 2 and 100),
 description text not null default '',
 price_from numeric(10,2) check(price_from is null or price_from>=0),
 visible boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now()
);
insert into public.services(title,description,sort_order) values
 ('Exterior car wash','Fresh exterior washing for cars and trucks.',10),
 ('Interior & exterior clean','Interior cleaning plus an exterior wash.',20),
 ('Residential window cleaning','Home window washing for clearer views.',30);
create table public.gallery (
 id uuid primary key default gen_random_uuid(),
 image_path text not null check(char_length(image_path) between 3 and 500),
 caption text not null default '',
 visible boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now()
);
create table public.leads (
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(trim(name)) between 2 and 120),
 phone text not null check(char_length(trim(phone)) between 7 and 30),
 email text check(email is null or char_length(email)<=200),
 service_text text not null check(char_length(trim(service_text)) between 2 and 120),
 preferred_date date,
 details text check(details is null or char_length(details)<=1500),
 status text not null default 'new' check(status in ('new','contacted','quoted','booked','closed')),
 created_at timestamptz not null default now()
);
create table public.customers (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name))>0),
 phone text,email text,address text,notes text,
 created_at timestamptz not null default now()
);
create table public.jobs (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id) on delete restrict,
 lead_id uuid references public.leads(id) on delete set null,
 service_id uuid references public.services(id) on delete set null,
 service_description text,scheduled_for timestamptz,
 status text not null default 'requested'
   check(status in ('requested','quoted','scheduled','in_progress','completed','paid','cancelled')),
 price numeric(10,2) check(price is null or price>=0),
 amount_paid numeric(10,2) not null default 0 check(amount_paid>=0),
 payment_method text,notes text,
 recurring_interval_days integer check(recurring_interval_days is null or recurring_interval_days between 1 and 365),
 created_at timestamptz not null default now()
);
create index on public.jobs(customer_id);
create index on public.jobs(scheduled_for);
create index on public.leads(created_at desc);
create table public.expenses (
 id uuid primary key default gen_random_uuid(),
 description text not null,
 amount numeric(10,2) not null check(amount>=0),
 spent_on date not null default current_date,
 created_at timestamptz not null default now()
);

alter table public.staff_users enable row level security;
alter table public.business_settings enable row level security;
alter table public.services enable row level security;
alter table public.gallery enable row level security;
alter table public.leads enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.expenses enable row level security;

create policy "staff read own membership" on public.staff_users for select to authenticated using(user_id=(select auth.uid()));
create policy "public read business settings" on public.business_settings for select to anon,authenticated using(true);
create policy "staff edit business settings" on public.business_settings for all to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy "public read visible services" on public.services for select to anon,authenticated using(visible or (select private.is_staff()));
create policy "staff edit services" on public.services for all to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy "public read visible gallery" on public.gallery for select to anon,authenticated using(visible or (select private.is_staff()));
create policy "staff edit gallery" on public.gallery for all to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy "visitor submit inquiry" on public.leads for insert to anon with check(status='new');
create policy "staff manage inquiries" on public.leads for all to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy "staff manage customers" on public.customers for all to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy "staff manage jobs" on public.jobs for all to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy "staff manage expenses" on public.expenses for all to authenticated using((select private.is_staff())) with check((select private.is_staff()));

revoke all on public.staff_users,public.business_settings,public.services,public.gallery,public.leads,public.customers,public.jobs,public.expenses from anon,authenticated;
grant select on public.business_settings,public.services,public.gallery to anon;
grant select,insert,update,delete on public.business_settings,public.services,public.gallery,public.leads,public.customers,public.jobs,public.expenses to authenticated;
grant select on public.staff_users to authenticated;
grant insert(name,phone,email,service_text,preferred_date,details) on public.leads to anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('coles-gallery','coles-gallery',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy "staff upload gallery image" on storage.objects for insert to authenticated
 with check(bucket_id='coles-gallery' and (select private.is_staff()));
create policy "staff update gallery image" on storage.objects for update to authenticated
 using(bucket_id='coles-gallery' and (select private.is_staff()))
 with check(bucket_id='coles-gallery' and (select private.is_staff()));
create policy "staff delete gallery image" on storage.objects for delete to authenticated
 using(bucket_id='coles-gallery' and (select private.is_staff()));
create policy "staff browse gallery image" on storage.objects for select to authenticated
 using(bucket_id='coles-gallery' and (select private.is_staff()));
