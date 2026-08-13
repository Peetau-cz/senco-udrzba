-- =============================================================================
-- M1 - úložiště souborů ke kartě zařízení (fotky, návody, certifikáty)
--
-- DRUHÁ MIGRACE ZÁVISLÁ NA SUPABASE, hned po 0002. Schéma v 0003 je čistý
-- PostgreSQL; tenhle soubor stojí na Supabase Storage, protože úložiště souborů
-- žádný standard v PostgreSQL nemá. Přechod jinam znamená nahradit tento soubor
-- a zdroj souborů v aplikaci, nikoli sahat na tabulky. Viz docs/PORTABILITA.md.
--
-- Zásada R1 platí i tady: kdo na soubor smí, rozhoduje databáze. Politiky nad
-- storage.objects se ptají stejných funkcí jako politiky nad zarizeni, takže
-- oprávnění nemůže mezi kartou a přílohou uklouznout.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Nádoba na soubory
--
-- Záměrně NEVEŘEJNÁ. Návod ke stroji ani fotka výrobního štítku nemá být volně
-- na internetu - aplikace k nim vydává dočasně platné odkazy.
--
-- Omezení velikosti a typů je tu druhý zámek. První je v aplikaci
-- (src/lib/zarizeni/soubory.ts), ale ten jde obejít voláním API napřímo.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zarizeni',
  'zarizeni',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Politiky
--
-- Cesta k souboru je `<id zarizeni>/<nahodny nazev>`. První složka je tedy klíč
-- k zařízení a přes něj k oblasti - podle ní se rozhoduje o přístupu.
--
-- Porovnává se text s textem (`z.id::text`), ne uuid s uuid. Kdyby někdo nahrál
-- soubor do složky, která uuid vůbec není, přetypování by skončilo chybou;
-- takhle prostě nic nenajde a přístup se odepře.
-- -----------------------------------------------------------------------------

drop policy if exists zarizeni_soubory_select on storage.objects;
drop policy if exists zarizeni_soubory_insert on storage.objects;
drop policy if exists zarizeni_soubory_update on storage.objects;
drop policy if exists zarizeni_soubory_delete on storage.objects;

-- Číst smí každý, kdo vidí zařízení - tedy i údržbář, který podle návodu pracuje.
create policy zarizeni_soubory_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'zarizeni'
    and exists (
      select 1
      from public.zarizeni z
      where z.id::text = (storage.foldername(name))[1]
        and public.ma_pristup_k_oblasti(z.oblast_id)
    )
  );

-- Nahrávat, přepisovat a mazat smí jen ten, kdo smí měnit samotnou kartu.
create policy zarizeni_soubory_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'zarizeni'
    and exists (
      select 1
      from public.zarizeni z
      where z.id::text = (storage.foldername(name))[1]
        and public.spravuje_zarizeni_v_oblasti(z.oblast_id)
    )
  );

create policy zarizeni_soubory_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'zarizeni'
    and exists (
      select 1
      from public.zarizeni z
      where z.id::text = (storage.foldername(name))[1]
        and public.spravuje_zarizeni_v_oblasti(z.oblast_id)
    )
  );

create policy zarizeni_soubory_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'zarizeni'
    and exists (
      select 1
      from public.zarizeni z
      where z.id::text = (storage.foldername(name))[1]
        and public.spravuje_zarizeni_v_oblasti(z.oblast_id)
    )
  );

-- -----------------------------------------------------------------------------
-- Úklid po smazaném zařízení
--
-- Řádky v zarizeni_soubor mizí kaskádou, ale samotné soubory v úložišti by
-- zůstaly ležet. Trigger je označí ke smazání tím, že je odstraní ze
-- storage.objects; fyzický úklid pak dělá Supabase.
--
-- SECURITY DEFINER proto, že mazání v úložišti probíhá jménem systému - v tu
-- chvíli už zařízení neexistuje a politiky výše by neměly čeho se chytit.
-- -----------------------------------------------------------------------------

create or replace function public.uklid_souboru_zarizeni()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
begin
  delete from storage.objects
  where bucket_id = 'zarizeni'
    and (storage.foldername(name))[1] = old.id::text;

  return old;
end;
$$;

create trigger zarizeni_uklid_souboru
  after delete on public.zarizeni
  for each row execute function public.uklid_souboru_zarizeni();
