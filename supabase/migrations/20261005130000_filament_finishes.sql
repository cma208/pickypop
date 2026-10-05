-- El acabado del filamento era texto libre, y decide si desgasta la boquilla.
--
-- `filament_skus.finish` era un `text` sin catálogo: cada quien lo escribía
-- como le salía, y "seda", "Seda" y "silk" eran tres acabados distintos. Peor:
-- el acabado determina si el filamento es abrasivo, y eso decide si hace falta
-- una boquilla de acero. Un dato que cambia qué pieza compras no puede vivir
-- en un campo de texto suelto.
--
-- Lo abrasivo no depende solo del acabado: un PLA con fibra de carbono lo es
-- por el material, y un PLA luminoso lo es por el acabado. Un filamento es
-- abrasivo si lo es cualquiera de los dos, y esa cuenta se hace en un solo
-- sitio, al final de este archivo.

create table public.filament_finishes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- Desgasta la boquilla: conviene una de acero endurecido.
  abrasive boolean not null default false,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

comment on table public.filament_finishes is
  'Acabados de filamento del taller. El acabado decide, junto con el material, si el filamento es abrasivo.';

select app.apply_workspace_rls('filament_finishes');
select app.add_updated_at_trigger('filament_finishes');

-- --------------------------------------------------------- los habituales
--
-- Se siembran para cada taller que ya exista. Los abrasivos están marcados:
-- la fibra de carbono y la madera llevan partícula dura, y el luminoso lleva
-- fósforo, que raya. La seda y el mate NO son abrasivos, aunque se crea.

insert into public.filament_finishes (workspace_id, name, abrasive, note)
select w.id, f.name, f.abrasive, f.note
from public.workspaces w
cross join (values
  ('Básico', false, null),
  ('Mate', false, null),
  ('Seda', false, 'Brillo satinado. No es abrasivo, aunque lo parezca.'),
  ('Translúcido', false, null),
  ('Madera', true, 'Lleva partícula de madera: desgasta la boquilla.'),
  ('Fibra de carbono', true, 'Muy abrasivo. Boquilla de acero endurecido.'),
  ('Metálico', true, 'Lleva partícula metálica: desgasta la boquilla.'),
  ('Luminoso', true, 'El fósforo que brilla en la oscuridad raya la boquilla.')
) as f(name, abrasive, note)
on conflict (workspace_id, name) do nothing;

-- ------------------------------------------------- enlazar lo que ya había
--
-- Nada se pierde: cualquier texto que alguien hubiera escrito se convierte en
-- un acabado del taller, marcado como no abrasivo porque no hay forma de
-- saberlo. Queda para revisar a mano.

insert into public.filament_finishes (workspace_id, name, abrasive, note)
select distinct s.workspace_id, btrim(s.finish), false,
       'Venía del campo de texto libre. Revisar si es abrasivo.'
from public.filament_skus s
where s.finish is not null and btrim(s.finish) <> ''
on conflict (workspace_id, name) do nothing;

alter table public.filament_skus
  add column finish_id uuid references public.filament_finishes (id) on delete restrict;

comment on column public.filament_skus.finish is
  'OBSOLETO: lo reemplaza finish_id. Se conserva hasta que nada lo lea.';

update public.filament_skus s
set finish_id = f.id
from public.filament_finishes f
where f.workspace_id = s.workspace_id
  and f.name = btrim(s.finish);

create index filament_skus_finish_idx on public.filament_skus (finish_id);

-- --------------------------------------------- si desgasta o no la boquilla
--
-- Una sola respuesta para todo el sistema. Si cada pantalla hiciera su propia
-- cuenta, tarde o temprano una se olvidaría del material o del acabado, y el
-- aviso de la boquilla de acero dejaría de salir justo donde hace falta.

create view public.filament_sku_details with (security_invoker = true) as
select
  s.id as filament_sku_id,
  s.workspace_id,
  s.brand_id,
  b.name as brand_name,
  s.material_id,
  m.code as material_code,
  s.finish_id,
  f.name as finish_name,
  s.color_name,
  s.color_hex,
  s.net_weight_g,
  s.active,
  m.hygroscopic,
  coalesce(m.abrasive, false) or coalesce(f.abrasive, false) as abrasive,
  case
    when coalesce(m.abrasive, false) and coalesce(f.abrasive, false)
      then 'el material y el acabado'
    when coalesce(m.abrasive, false) then 'el material'
    when coalesce(f.abrasive, false) then 'el acabado'
  end as abrasive_because
from public.filament_skus s
join public.materials m on m.id = s.material_id
left join public.brands b on b.id = s.brand_id
left join public.filament_finishes f on f.id = s.finish_id;

comment on view public.filament_sku_details is
  'Cada filamento con su marca, material y acabado resueltos, y si desgasta la boquilla y por qué.';
