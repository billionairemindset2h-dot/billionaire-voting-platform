-- Keep public visibility separate from is_active, which controls voting.
-- Existing events remain visible after this migration.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;
