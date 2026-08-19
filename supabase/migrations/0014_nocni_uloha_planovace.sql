-- =============================================================================
-- M3 - noční úloha plánovače
--
-- Odděleno od 0013 schválně. `pg_cron` je jen spouštěč: plánovač sám je čistý
-- PostgreSQL a funguje i bez něj - stačí zavolat public.zaloz_zakazky().
-- Kdyby rozšíření na cílovém serveru nebylo, vynechá se tenhle jediný soubor
-- a úloha se pověsí na cokoli jiného, co umí spustit jeden SQL příkaz denně.
--
-- Na Supabase se rozšíření zapíná v Dashboardu (Database → Extensions).
-- Když je zapnuté odtamtud, je `create extension` níž prázdná operace.
-- =============================================================================

create extension if not exists pg_cron;

-- -----------------------------------------------------------------------------
-- Úloha
--
-- Pojmenovaná schválně: cron.schedule() se stejným jménem existující úlohu
-- přepíše místo aby založil druhou. Migrace tak jde pustit opakovaně, aniž by
-- se plánovač spouštěl dvakrát za noc.
--
-- Ve tři ráno, kdy nikdo nepracuje - zakládání zakázek sahá na tytéž řádky,
-- které přes den čte plán. Časová zóna je serverová (na Supabase UTC), ale
-- u čtrnáctidenního okna je posun o dvě hodiny bez významu.
--
-- Volání je bez parametru, okno tedy zůstává na výchozích 14 dnech
-- (NAVRH.md kap. 1.3). Změna okna je změna jednoho čísla tady.
-- -----------------------------------------------------------------------------

select cron.schedule(
  'senco-udrzba-planovac',
  '0 3 * * *',
  $$select public.zaloz_zakazky();$$
);

-- Kontrola po ruce: `select * from cron.job;` ukáže naplánované úlohy,
-- `select * from cron.job_run_details order by start_time desc limit 10;`
-- jak dopadly poslední běhy.
