alter table public.registrations
  add column if not exists email_notification_status text,
  add column if not exists email_notification_sent_at timestamptz;
