-- Supplies had nowhere to keep what they cost.
--
-- Filament carries its cost on each spool, but sweets, bags and spare parts
-- only had a cost if someone had already registered a purchase. Quoting a
-- product with sweets inside therefore guessed, or counted zero.
--
-- A standard cost fixes the floor ("a kilo of sweets runs about S/ 15"), and
-- a view prefers the real purchase cost whenever there is one.

alter table public.inventory_items
  add column standard_cost numeric(12, 4)
    check (standard_cost is null or standard_cost >= 0);

comment on column public.inventory_items.standard_cost is
  'Expected cost per unit, used while there is no purchase history.';

-- Cost per unit of each supply: the latest purchase if there is one, the
-- standard cost otherwise.
create view public.inventory_item_costs with (security_invoker = true) as
select
  i.id as inventory_item_id,
  i.workspace_id,
  i.name,
  i.unit,
  i.standard_cost,
  last_purchase.unit_cost as last_purchase_cost,
  coalesce(last_purchase.unit_cost, i.standard_cost) as cost_per_unit,
  case
    when last_purchase.unit_cost is not null then 'purchase'
    when i.standard_cost is not null then 'standard'
    else 'unknown'
  end as cost_source
from public.inventory_items i
left join lateral (
  select
    case
      when l.quantity > 0
        then round((l.unit_price * l.quantity + l.allocated_extra_cost) / l.quantity, 4)
    end as unit_cost
  from public.purchase_lines l
  join public.purchases p on p.id = l.purchase_id
  where l.inventory_item_id = i.id
  order by p.purchased_at desc, l.created_at desc
  limit 1
) as last_purchase on true;

comment on view public.inventory_item_costs is
  'What a supply costs per unit, and whether that came from a real purchase.';
