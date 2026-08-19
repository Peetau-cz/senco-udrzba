-- =============================================================================
-- Úklid souborů v úložišti dělá aplikace, ne trigger
--
-- Migrace 0004 a 0012 zakládaly triggery, které po smazaném řádku uklidily
-- i soubor - `delete from storage.objects`. To Supabase nedovolí:
--
--   Direct deletion from storage tables is not allowed. Use the Storage API instead.
--
-- Nad storage.objects je vlastní zámek a maže se výhradně přes Storage API.
-- Trigger tedy nejenže neuklidí, on celou operaci shodí: mazání fotky
-- u kroku checklistu končilo chybou a řádek zůstal.
--
-- U migrace 0004 to nikdy nevyplavalo, protože trigger visí na smazání
-- ZAŘÍZENÍ - a stroje se nemažou, vyřazují se stavem. První smazaný stroj by
-- ale narazil na totéž.
--
-- Náhrada není jiný trigger, žádný fungovat nemůže. Úklid patří do
-- `src/lib/storage/`, což je jediné místo, které o úložišti ví (PORTABILITA.md,
-- pravidlo 5), a aplikace ho tam už dělá: `smazFotku` i `smazSoubor` volají
-- `smazSoubory()` PŘED smazáním řádku. Pořadí je podstatné - kdyby se mazal
-- nejdřív řádek, selhání úložiště by nechalo soubor bez záznamu, o kterém by
-- se nikdo nedozvěděl.
--
-- Co tím zůstává nedořešené: smazání zařízení nebo zakázky by osiřelé soubory
-- nechalo ležet. Zakázku smazat nejde vůbec (migrace 0011) a zařízení smí jen
-- správce a v aplikaci to není nabízené, takže to dnes nikoho nepotká. Až se
-- mazání zařízení objeví v rozhraní, musí si přílohy uklidit samo.
-- =============================================================================

drop trigger if exists zakazka_foto_uklid on public.zakazka_foto;
drop trigger if exists zarizeni_uklid_souboru on public.zarizeni;

drop function if exists public.uklid_fotek_zakazky();
drop function if exists public.uklid_souboru_zarizeni();
