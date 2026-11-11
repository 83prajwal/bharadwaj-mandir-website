create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  netlify_identity_id text not null unique,
  full_name text not null,
  email text not null,
  phone text not null,
  contact_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_designs (
  id uuid primary key,
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  legacy_design_id text,
  design_name text not null,
  design_configuration jsonb not null,
  storage_reference text not null,
  share_token_hash text,
  share_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_designs_customer_updated_idx
  on public.saved_designs (customer_id, updated_at desc);

alter table public.customer_profiles enable row level security;
alter table public.saved_designs enable row level security;

-- Netlify Identity JWTs are verified by the Vercel server and are not Supabase
-- Auth JWTs. Browser roles therefore receive no direct table access in Phase 1.
revoke all on public.customer_profiles, public.saved_designs from anon, authenticated;
grant select, insert, update, delete on public.customer_profiles, public.saved_designs to service_role;
