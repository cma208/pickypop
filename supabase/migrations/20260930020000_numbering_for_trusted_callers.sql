-- Document numbering could not be used by anything other than a signed-in
-- member, which left seeds, migrations and server-side tasks unable to reserve
-- a number. Now a caller without a session (postgres, service_role) is trusted,
-- while a signed-in person still has to belong to the workshop.
--
-- Anonymous visitors are unaffected: the function is only granted to
-- authenticated.

create or replace function app.next_document_number(p_workspace uuid, p_doc_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_number integer;
  v_prefix text;
begin
  if auth.uid() is not null and not app.is_member(p_workspace) then
    raise exception 'not a member of workspace %', p_workspace using errcode = 'insufficient_privilege';
  end if;

  insert into public.document_counters as c (workspace_id, doc_kind, year, last_number)
  values (p_workspace, p_doc_kind, v_year, 1)
  on conflict (workspace_id, doc_kind, year)
  do update set last_number = c.last_number + 1
  returning c.last_number into v_number;

  v_prefix := case p_doc_kind
                when 'quote' then 'COT'
                when 'order' then 'ORD'
                else upper(left(p_doc_kind, 3))
              end;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_number::text, 4, '0'));
end;
$$;
