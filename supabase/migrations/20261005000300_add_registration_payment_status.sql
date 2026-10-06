alter table public.registrations
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_verified_at timestamptz;
