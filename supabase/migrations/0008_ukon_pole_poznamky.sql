-- =============================================================================
-- M2 - volitelné pole pro poznámku u úkonu
--
-- Každý úkon se v checklistu potvrzuje ano/ne - to je jeho podstata a neplyne
-- z žádného sloupce, technik prostě odškrtne, že krok proběhl a je v pořádku.
-- Nad rámec toho ale někdy potřebuje místo, kde se rozepíše: co bylo divné,
-- co doporučuje sledovat, proč odpověděl „ne".
--
-- Sloupec proto neurčuje, JESTLI se úkon potvrzuje, ale jestli k němu technik
-- dostane textové pole navíc.
--
-- Prefix `nabizi_` schválně, ne `vyzaduje_` jako u foto a hodnoty: to pole je
-- nabídka, ne povinnost. Vyžadovat rozepsání u každé údržby by vedlo k tomu,
-- že se tam bude psát „ok", aby to šlo odeslat.
-- =============================================================================

alter table public.sablona_ukon
  add column nabizi_poznamku boolean not null default false;

comment on column public.sablona_ukon.nabizi_poznamku is
  'Dostane technik u tohoto úkonu pole na volný text? Potvrzení ano/ne má úkon vždy.';
