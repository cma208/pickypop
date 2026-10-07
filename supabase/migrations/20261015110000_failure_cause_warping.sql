-- Una causa de falla más: «Warping / deformación».
--
-- Es la causa real de las placas dobles y de las piezas que se despegan de una
-- esquina, y no estaba entre las ocho: el recorrido desde cero tuvo que
-- anotar «Adhesión» para una falla que no lo era, y las estadísticas de causas
-- se llenan de lo que haya a mano (H34).
--
-- Va sola en su migración: un valor nuevo de `enum` no se puede usar en la
-- misma transacción que lo creó. Se pone antes de «other» para que «otra
-- causa» siga siendo la última donde se ordene por el enum.

alter type public.print_failure_cause add value if not exists 'warping' before 'other';
