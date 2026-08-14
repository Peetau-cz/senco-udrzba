-- =============================================================================
-- M2 - výchozím základem intervalu je plánovaný termín
--
-- Rozhodnutí P2 z docs/NAVRH.md kap. 0 původně počítalo s plovoucím plánem:
-- další termín se počítá od skutečného provedení, takže zpožděná údržba posune
-- i všechny další. To odpovídá běžné praxi údržby.
--
-- Zadavatel ale při vkládání harmonogramu CNC upřesnil, že v SENCU je termín
-- vždy k pevně danému datu - kalendář se drží a zpoždění ho neposouvá. Nechat
-- opačnou výchozí hodnotu by znamenalo, že ji garanti musí přepínat u každého
-- úkonu zvlášť, a jednou na to zapomenou.
--
-- Obojí zůstává nastavitelné na úkonu, mění se jen to, co je předvyplněné.
-- Existující řádky se NEMĚNÍ: default platí pro nově vkládané, ne zpětně, a
-- přepisovat obsah aktivovaných verzí by stejně zarazil zámek z migrace 0006
-- (a právem - je to obsah, na který se odkazují provedené údržby).
-- =============================================================================

alter table public.sablona_ukon
  alter column interval_zaklad set default 'od_planu';

comment on column public.sablona_ukon.interval_zaklad is
  'Od čeho se počítá další termín. Výchozí od_planu: v SENCU je termín k pevně danému datu.';
