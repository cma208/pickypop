-- Los datos para que alguien le pague al taller en una cuenta (decisión del
-- dueño, 2026-10-12).
--
-- Hasta aquí una cuenta decía dónde está el dinero, no cómo llegar a ella.
-- Ninguna pantalla le muestra todavía estos datos a un cliente, pero se van a
-- necesitar (el resumen de una cotización, el mensaje para cobrar un adelanto)
-- y se guardan desde ya, vacíos mientras nadie los escriba:
--
-- * `holder_name`: a nombre de quién está. Es lo que el cliente ve en su app
--   antes de confirmar un Yape o una transferencia.
-- * `account_number`: el número de cuenta, como lo da el banco. El largo y los
--   guiones cambian de un banco a otro (BCP 191-12345678-0-12, BBVA de 18
--   dígitos, Scotiabank de 10), así que se guarda tal cual, con guiones solo
--   entre dígitos.
-- * `interbank_number`: el CCI, que en el Perú es siempre de 20 dígitos. Se
--   guarda sin separadores. Una billetera también puede tenerlo: Ligo da uno.
-- * `phone`: el celular de Yape o Plin, 9 dígitos que empiezan con 9, sin el
--   +51. Un banco también puede tenerlo: Yape cobra en la cuenta del BCP y
--   Plin en la de Interbank, BBVA o Scotiabank.
--
-- Qué tiene sentido según el tipo: una caja no recibe pagos de nadie, así que
-- no lleva ninguno, y una billetera no tiene número de cuenta.

alter table public.accounts
  add column holder_name text,
  add column account_number text,
  add column interbank_number text,
  add column phone text;

alter table public.accounts
  add constraint accounts_holder_name_format
    check (holder_name is null or (holder_name = btrim(holder_name) and length(holder_name) between 1 and 120)),
  add constraint accounts_account_number_format
    check (
      account_number is null
      or (account_number ~ '^[0-9]+(-[0-9]+)*$' and length(replace(account_number, '-', '')) between 6 and 20)
    ),
  add constraint accounts_interbank_number_format
    check (interbank_number is null or interbank_number ~ '^[0-9]{20}$'),
  add constraint accounts_phone_format
    check (phone is null or phone ~ '^9[0-9]{8}$'),
  add constraint accounts_payment_details_fit_kind
    check (
      case kind
        when 'cash' then holder_name is null and account_number is null and interbank_number is null and phone is null
        when 'wallet' then account_number is null
        else true
      end
    );

comment on column public.accounts.holder_name is
  'A nombre de quién está la cuenta: lo que el cliente ve antes de confirmar el pago. Una caja no lleva.';
comment on column public.accounts.account_number is
  'Número de cuenta como lo da el banco, con guiones solo entre dígitos (6 a 20 dígitos). Solo un banco.';
comment on column public.accounts.interbank_number is
  'CCI: 20 dígitos, sin separadores. Un banco o una billetera que lo dé (Ligo).';
comment on column public.accounts.phone is
  'Celular de Yape o Plin: 9 dígitos que empiezan con 9, sin el +51. Un banco o una billetera.';
