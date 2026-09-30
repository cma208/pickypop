-- Catalogue: products, variants, production recipes and price tiers.
--
-- A product is a group of pieces, not a single plate: the bottle comes out of
-- one plate and its caps out of another. The recipe holds that grouping plus
-- the two times that matter for costing: the setup paid once per batch and the
-- minutes spent on every finished unit.

create type public.product_status as enum ('draft', 'published', 'archived');

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  category text,
  tags text[] not null default '{}',
  status public.product_status not null default 'draft',
  -- Whether the public catalogue bot may show it.
  bot_visible boolean not null default false,
  -- Free-form data sheet: dimensions, finish, care, "personalizable"...
  specs jsonb not null default '{}'::jsonb,
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  product_id uuid not null references public.catalog_products (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- Colour, size, filling... whatever distinguishes this variant.
  options jsonb not null default '{}'::jsonb,
  sku_code text,
  /* Price for a single unit. Quantity discounts live in price_tiers. */
  list_price numeric(12, 2) check (list_price is null or list_price >= 0),
  -- Smallest order accepted for this variant, when there is one.
  min_order_units integer check (min_order_units is null or min_order_units > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, product_id, name)
);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  product_id uuid not null references public.catalog_products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete cascade,
  storage_path text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- recipes

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  version integer not null default 1 check (version > 0),
  valid_from date not null default current_date,
  -- Paid once per batch: slicing, arranging the plate, loading filament.
  setup_minutes numeric(8, 2) not null default 0 check (setup_minutes >= 0),
  -- Paid for every finished unit: assembly, filling, packing. For the potion
  -- bottles this is about 5 minutes, since there is nothing to clean up.
  minutes_per_unit numeric(8, 2) not null default 0 check (minutes_per_unit >= 0),
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, version)
);

comment on column public.recipes.setup_minutes is
  'Preparation time for the whole batch, spread across its units.';
comment on column public.recipes.minutes_per_unit is
  'Handling time per finished product, the part that does not get cheaper in bulk.';

create table public.recipe_plates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  label text,                                  -- 'Botella', 'Tapas'
  plate_index integer not null default 1 check (plate_index > 0),
  -- Finished units one run of this plate contributes. Nine caps per run means
  -- ten bottles need two runs, and the eight spare caps are stock.
  units_per_run numeric(10, 3) not null check (units_per_run > 0),
  print_time_s integer not null check (print_time_s > 0),
  source_file_name text,
  thumbnail_path text,
  -- Raw data read from slice_info.config, kept for traceability.
  slicer_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, plate_index)
);

create table public.recipe_plate_filaments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  recipe_plate_id uuid not null references public.recipe_plates (id) on delete cascade,
  slot integer not null check (slot > 0),      -- AMS slot as the slicer reports it
  material_id uuid references public.materials (id) on delete set null,
  color_hex text check (color_hex is null or color_hex ~* '^#[0-9a-f]{6}$'),
  -- Which spool product it should come from, once matched.
  filament_sku_id uuid references public.filament_skus (id) on delete set null,
  -- Grams for ONE run, purge already included by the slicer.
  grams numeric(10, 2) not null check (grams >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_plate_id, slot)
);

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  -- In the item's own unit: 66 g of sweets, 1 bag.
  quantity_per_unit numeric(12, 3) not null check (quantity_per_unit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, inventory_item_id)
);

-- --------------------------------------------------------- price tiers

create table public.price_tiers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  -- Cheapest price that applies from this quantity upwards.
  min_quantity integer not null check (min_quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  valid_from date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, min_quantity, valid_from)
);

comment on table public.price_tiers is
  'Unit price by quantity. Making one unit from scratch is dear because a whole plate of caps is printed for it, so single sales should come out of stock.';

-- Price for a quantity: the highest tier whose minimum is reached, falling
-- back to the variant list price.
create or replace function app.price_for_quantity(
  target_variant uuid,
  quantity integer,
  on_date date default current_date
)
returns numeric
language sql
stable
as $$
  select coalesce(
    (
      select t.unit_price
      from public.price_tiers t
      where t.variant_id = target_variant
        and t.min_quantity <= quantity
        and t.valid_from <= on_date
      order by t.min_quantity desc, t.valid_from desc
      limit 1
    ),
    (select v.list_price from public.product_variants v where v.id = target_variant)
  );
$$;

grant execute on function app.price_for_quantity(uuid, integer, date) to authenticated;

-- Colours a variant can actually be made in today: the recipe's materials that
-- still have stock. The bot uses this to answer "¿en qué colores hay?".
create view public.variant_available_colors with (security_invoker = true) as
select distinct
  v.id as variant_id,
  v.workspace_id,
  k.id as filament_sku_id,
  k.color_name,
  k.color_hex,
  s.available_g
from public.product_variants v
join public.recipes r on r.variant_id = v.id and r.active
join public.recipe_plates p on p.recipe_id = r.id
join public.recipe_plate_filaments f on f.recipe_plate_id = p.id
join public.filament_skus k on k.material_id = f.material_id and k.workspace_id = v.workspace_id and k.active
join public.filament_sku_stock s on s.filament_sku_id = k.id
where s.available_g > 0;

select app.apply_workspace_rls('catalog_products');
select app.apply_workspace_rls('product_variants');
select app.apply_workspace_rls('product_media');
select app.apply_workspace_rls('recipes');
select app.apply_workspace_rls('recipe_plates');
select app.apply_workspace_rls('recipe_plate_filaments');
select app.apply_workspace_rls('recipe_items');
select app.apply_workspace_rls('price_tiers');

select app.add_updated_at_trigger('catalog_products');
select app.add_updated_at_trigger('product_variants');
select app.add_updated_at_trigger('recipes');
select app.add_updated_at_trigger('recipe_plates');
select app.add_updated_at_trigger('recipe_plate_filaments');
select app.add_updated_at_trigger('recipe_items');
select app.add_updated_at_trigger('price_tiers');
