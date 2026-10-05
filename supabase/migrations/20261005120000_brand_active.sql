-- Brands and materials could not be retired.
--
-- A filament SKU references its brand and its material with `on delete
-- restrict`, so a brand or material that already has a spool behind it can
-- never be deleted. That is the right rule for the data, but it left the
-- workshop with no way to stop offering a brand it no longer buys or a
-- material it dropped: they stayed in every list forever.
--
-- Both tables get the same `active` flag the sales channels already use.
-- Deactivating keeps the history intact and only hides the row from pickers.
-- Existing rows stay active, so nothing changes until someone turns one off.

alter table public.brands
  add column active boolean not null default true;

alter table public.materials
  add column active boolean not null default true;
