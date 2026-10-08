-- The keys that make a payment or a movement happen once are never changed.
--
-- `purchase_payment_requests` and `item_movement_requests` remember with
-- which key each purchase payment and each manual movement of a supply was
-- asked, so a retry after a lost answer gets the first answer back instead of
-- paying or moving the stock again. They got the day-to-day rules, so any
-- operator could update a row (point a key at another payment) and the owner
-- could delete one: the next retry with that key would write the money or the
-- stock a second time (review of the tercera pasada).
--
-- Like the ledgers they stand beside, they are read and appended to. Without
-- the privilege the API says «permission denied» out loud. The functions that
-- write them only insert. Removing a whole workshop still takes them along:
-- that delete is the foreign key's, not the caller's.

revoke update, delete, truncate on public.purchase_payment_requests from anon, authenticated, service_role;
revoke update, delete, truncate on public.item_movement_requests from anon, authenticated, service_role;
