-- Inventory: filament catalogue, purchases, spools and stock movements.
--
-- Two ideas hold this together:
--   1. A SKU describes a product (brand + material + finish + colour + size);
--      a spool is the physical object, and each spool carries its own cost.
--      The same SKU can therefore have a S/ 50 spool and a S/ 75 one.
--   2. Stock is never stored as an editable number: it is always the sum of
--      its movements.

create type public.spool_status as enum ('sealed', 'open', 'in_use', 'empty', 'discarded');
create type public.inventory_item_kind as enum ('supply', 'packaging', 'spare_part', 'finished_good');
create type public.stock_movement_type as enum (
  'purchase', 'consumption', 'waste', 'adjustment', 'maintenance', 'reservation', 'release'
);
create type public.cost_allocation as enum ('by_amount', 'by_weight');

-- ------------------------------------------------------------- catalogues

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  contact text,
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  code text not null check (length(btrim(code)) > 0), -- PLA, PETG, TPU...
  density_g_cm3 numeric(5, 3) check (density_g_cm3 is null or density_g_cm3 > 0),
  hygroscopic boolean not null default false,
  abrasive boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, code)
);

create table public.filament_skus (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete restrict,
  material_id uuid not null references public.materials (id) on delete restrict,
  finish text,                       -- Basic, Matte, Silk, CF...
  color_name text not null,
  color_hex text check (color_hex is null or color_hex ~* '^#[0-9a-f]{6}$'),
  diameter_mm numeric(4, 2) not null default 1.75 check (diameter_mm > 0),
  net_weight_g numeric(10, 2) not null default 1000 check (net_weight_g > 0),
  spool_tare_g numeric(10, 2) check (spool_tare_g is null or spool_tare_g >= 0),
  is_refill boolean not null default false,
  -- Bambu profile id read from a sliced file (GFA00, GFA01...). Together with
  -- the colour it lets the app guess which spool a plate used.
  tray_info_idx text,
  min_stock_g numeric(10, 2) not null default 0 check (min_stock_g >= 0),
  -- What it would cost to buy this again today; used when quoting with the
  -- 'replacement' valuation method.
  replacement_cost_per_kg numeric(12, 2) check (replacement_cost_per_kg is null or replacement_cost_per_kg >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index filament_skus_identity_idx on public.filament_skus (
  workspace_id, brand_id, material_id, coalesce(finish, ''), color_name, net_weight_g, diameter_mm
);
create index filament_skus_tray_idx on public.filament_skus (workspace_id, tray_info_idx);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind public.inventory_item_kind not null,
  name text not null check (length(btrim(name)) > 0),
  unit text not null default 'unidad',
  min_stock numeric(12, 3) not null default 0 check (min_stock >= 0),
  -- Sweets and other perishables: the earliest expiry still in stock.
  perishable boolean not null default false,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, kind, name)
);

-- ---------------------------------------------------------------- purchases

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  supplier_id uuid references public.suppliers (id) on delete set null,
  purchased_at date not null default current_date,
  document_ref text,
  shipping_cost numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  other_costs numeric(12, 2) not null default 0 check (other_costs >= 0),
  allocation public.cost_allocation not null default 'by_amount',
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  filament_sku_id uuid references public.filament_skus (id) on delete restrict,
  inventory_item_id uuid references public.inventory_items (id) on delete restrict,
  description text,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  -- Share of shipping and other costs that landed on this line.
  allocated_extra_cost numeric(12, 2) not null default 0 check (allocated_extra_cost >= 0),
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_lines_one_target check (
    num_nonnulls(filament_sku_id, inventory_item_id) = 1
  )
);

create index purchase_lines_purchase_idx on public.purchase_lines (purchase_id);

-- ------------------------------------------------------------------- spools

create table public.spools (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  filament_sku_id uuid not null references public.filament_skus (id) on delete restrict,
  purchase_line_id uuid references public.purchase_lines (id) on delete set null,
  code text,                          -- label or QR printed for the shelf
  initial_weight_g numeric(10, 2) not null check (initial_weight_g > 0),
  -- Price paid for this very spool, shipping already spread over it.
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  cost_per_gram numeric(12, 6) generated always as (unit_cost / initial_weight_g) stored,
  status public.spool_status not null default 'sealed',
  location text,                      -- 'AMS 1', 'estante A'...
  opened_at timestamptz,
  last_dried_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, code)
);

create index spools_sku_idx on public.spools (workspace_id, filament_sku_id, status);

-- --------------------------------------------------------------- movements

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  type public.stock_movement_type not null,
  spool_id uuid references public.spools (id) on delete cascade,
  inventory_item_id uuid references public.inventory_items (id) on delete cascade,
  -- Grams for spools, units for items. Signed: positive adds, negative removes.
  quantity numeric(12, 3) not null check (quantity <> 0),
  unit_cost numeric(12, 6),
  -- What caused it: 'purchase', 'print_job', 'maintenance_log', 'order'...
  source_type text,
  source_id uuid,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint stock_movements_one_target check (
    num_nonnulls(spool_id, inventory_item_id) = 1
  )
);

create index stock_movements_spool_idx on public.stock_movements (spool_id, occurred_at);
create index stock_movements_item_idx on public.stock_movements (inventory_item_id, occurred_at);
create index stock_movements_source_idx on public.stock_movements (source_type, source_id);

comment on table public.stock_movements is
  'The only source of truth for stock. Reservations do not change what is on hand, only what is available.';

-- ------------------------------------------------------------------- views

create view public.spool_balances with (security_invoker = true) as
select
  s.id as spool_id,
  s.workspace_id,
  s.filament_sku_id,
  s.status,
  s.initial_weight_g,
  s.cost_per_gram,
  coalesce(sum(m.quantity) filter (where m.type not in ('reservation', 'release')), 0) as on_hand_g,
  coalesce(sum(m.quantity) filter (where m.type in ('reservation', 'release')), 0) as reserved_g,
  coalesce(sum(m.quantity) filter (where m.type not in ('reservation', 'release')), 0)
    - coalesce(sum(m.quantity) filter (where m.type in ('reservation', 'release')), 0) as available_g
from public.spools s
left join public.stock_movements m on m.spool_id = s.id
group by s.id;

comment on view public.spool_balances is
  'Grams left per spool. The purchase movement is what puts the filament in.';

create view public.filament_sku_stock with (security_invoker = true) as
select
  k.id as filament_sku_id,
  k.workspace_id,
  k.min_stock_g,
  coalesce(sum(b.on_hand_g), 0) as on_hand_g,
  coalesce(sum(b.reserved_g), 0) as reserved_g,
  coalesce(sum(b.available_g), 0) as available_g,
  case
    when coalesce(sum(b.on_hand_g), 0) > 0
      then round(sum(b.on_hand_g * b.cost_per_gram) / sum(b.on_hand_g), 6)
  end as weighted_cost_per_gram,
  coalesce(sum(b.available_g), 0) < k.min_stock_g as below_minimum
from public.filament_skus k
left join public.spool_balances b on b.filament_sku_id = k.id and b.on_hand_g > 0
group by k.id;

comment on view public.filament_sku_stock is
  'Stock per product, with the weighted cost of what is actually on the shelf.';

create view public.inventory_balances with (security_invoker = true) as
select
  i.id as inventory_item_id,
  i.workspace_id,
  i.kind,
  i.name,
  i.unit,
  i.min_stock,
  coalesce(sum(m.quantity) filter (where m.type not in ('reservation', 'release')), 0) as on_hand,
  coalesce(sum(m.quantity) filter (where m.type in ('reservation', 'release')), 0) as reserved,
  coalesce(sum(m.quantity) filter (where m.type not in ('reservation', 'release')), 0)
    - coalesce(sum(m.quantity) filter (where m.type in ('reservation', 'release')), 0) as available
from public.inventory_items i
left join public.stock_movements m on m.inventory_item_id = i.id
group by i.id;

-- ------------------------------------------------------------ access rules

select app.apply_workspace_rls('suppliers');
select app.apply_workspace_rls('brands');
select app.apply_workspace_rls('materials');
select app.apply_workspace_rls('filament_skus');
select app.apply_workspace_rls('inventory_items');
select app.apply_workspace_rls('purchases');
select app.apply_workspace_rls('purchase_lines');
select app.apply_workspace_rls('spools');
select app.apply_workspace_rls('stock_movements');

select app.add_updated_at_trigger('suppliers');
select app.add_updated_at_trigger('brands');
select app.add_updated_at_trigger('materials');
select app.add_updated_at_trigger('filament_skus');
select app.add_updated_at_trigger('inventory_items');
select app.add_updated_at_trigger('purchases');
select app.add_updated_at_trigger('purchase_lines');
select app.add_updated_at_trigger('spools');
