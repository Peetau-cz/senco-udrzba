-- =============================================================================
-- M3 - úložiště fotodokumentace k zakázkám
--
-- TŘETÍ MIGRACE ZÁVISLÁ NA SUPABASE, po 0002 a 0004. Schéma zakázek v 0011 je
-- čistý PostgreSQL; tenhle soubor stojí na Supabase Storage, protože úložiště
-- souborů žádný standard v PostgreSQL nemá. Přechod jinam znamená nahradit
-- tento soubor a zdroj souborů v aplikaci, nikoli sahat na tabulky.
-- Viz docs/PORTABILITA.md, pravidlo 2.
--
-- Vlastní nádoba, ne sdílená s M1. Fotka z checklistu a návod ke stroji mají
-- jiný životní cyklus i jiná pravidla přístupu: návod smí nahrát jen garant
-- a leží u stroje natrvalo, fotka z údržby patří konkrétní zakázce, nahrává ji
-- údržbář a po uzavření zakázky ji nesmí měnit nikdo. Jedna nádoba by ta dvě
-- pravidla musela rozplétat podle tvaru cesty.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Nádoba na fotky
--
-- Záměrně NEVEŘEJNÁ, stejně jako `zarizeni` - fotka z výroby nemá být volně
-- na internetu. Aplikace k nim vydává dočasně platné odkazy.
--
-- Povolené jsou jen formáty, které prohlížeč umí zobrazit. HEIC z iPadu mezi
-- nimi schválně není: Safari ho při odeslání přes formulářové pole samo
-- převádí na JPEG, takže technika to neomezí, a přijmout ho by znamenalo mít
-- v historii fotky, které se nikomu nezobrazí.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zakazky',
  'zakazky',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Politiky
--
-- Cesta k souboru je `<id zakazky>/<nahodny nazev>`. První složka je tedy klíč
-- k zakázce a přes ni k zařízení a oblasti - podle ní se rozhoduje o přístupu.
-- Není to id kroku, i když fotka visí na kroku: pro oprávnění je rozhodující
-- zakázka a mělčí cesta znamená v politice jeden join místo dvou.
--
-- Porovnává se text s textem (`k.id::text`), ne uuid s uuid. Kdyby někdo nahrál
-- soubor do složky, která uuid vůbec není, přetypování by skončilo chybou;
-- takhle prostě nic nenajde a přístup se odepře.
-- -----------------------------------------------------------------------------

drop policy if exists zakazky_fotky_select on storage.objects;
drop policy if exists zakazky_fotky_insert on storage.objects;
drop policy if exists zakazky_fotky_update on storage.objects;
drop policy if exists zakazky_fotky_delete on storage.objects;

-- Číst smí každý, kdo vidí zařízení. Fotky jsou součást historie údržby a tu
-- podle zadání (ř. 147) čte i management, který sám údržbu neprovádí.
create policy zakazky_fotky_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'zakazky'
    and exists (
      select 1
      from public.zakazka k
      join public.zarizeni z on z.id = k.zarizeni_id
      where k.id::text = (storage.foldername(name))[1]
        and public.ma_pristup_k_oblasti(z.oblast_id)
    )
  );

-- Nahrávat, přepisovat a mazat smí ten, kdo údržbu provádí - a jen dokud je
-- zakázka otevřená. Podmínka na stav je tu schválně podruhé: tabulku
-- zakazka_foto hlídá trigger z migrace 0011, ale bez tohohle by šlo nahrát
-- soubor k uzavřené zakázce přímo do úložiště. Řádek by k němu nevznikl a
-- v nádobě by ležel soubor, ke kterému se aplikace nikdy nedostane.
create policy zakazky_fotky_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'zakazky'
    and exists (
      select 1
      from public.zakazka k
      join public.zarizeni z on z.id = k.zarizeni_id
      where k.id::text = (storage.foldername(name))[1]
        and k.stav in ('naplanovano', 'probiha')
        and public.provadi_udrzbu_v_oblasti(z.oblast_id)
    )
  );

create policy zakazky_fotky_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'zakazky'
    and exists (
      select 1
      from public.zakazka k
      join public.zarizeni z on z.id = k.zarizeni_id
      where k.id::text = (storage.foldername(name))[1]
        and k.stav in ('naplanovano', 'probiha')
        and public.provadi_udrzbu_v_oblasti(z.oblast_id)
    )
  );

create policy zakazky_fotky_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'zakazky'
    and exists (
      select 1
      from public.zakazka k
      join public.zarizeni z on z.id = k.zarizeni_id
      where k.id::text = (storage.foldername(name))[1]
        and k.stav in ('naplanovano', 'probiha')
        and public.provadi_udrzbu_v_oblasti(z.oblast_id)
    )
  );

-- -----------------------------------------------------------------------------
-- Úklid po smazané fotce
--
-- Zakázka se smazat nedá a zařízení pod ní drží `on delete restrict`, takže
-- osiřelá složka nevznikne. Co vzniknout může, je osiřelý soubor: technik
-- omylem nahranou fotku během práce smaže a řádek v zakazka_foto zmizí, ale
-- soubor by v nádobě zůstal ležet.
--
-- Aplikace ho maže taky (src/lib/storage), tohle je druhý zámek pro případ,
-- že řádek smaže něco jiného - kaskáda, oprava dat, jiný klient. Mazání
-- souboru, který tam už není, nic nestojí.
--
-- SECURITY DEFINER proto, že úklid probíhá jménem systému; politiky výše by
-- se v tu chvíli neměly čeho chytit, řádek už neexistuje.
-- -----------------------------------------------------------------------------

create or replace function public.uklid_fotek_zakazky()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
begin
  delete from storage.objects
  where bucket_id = 'zakazky'
    and name = old.storage_path;

  return old;
end;
$$;

-- `drop if exists` před vytvořením schválně. Zbytek tohohle souboru je psaný
-- tak, aby šel pustit opakovaně - nádoba se upsertuje, politiky se nejdřív
-- zahazují, funkce je `create or replace`. Samotné `create trigger` je jediné,
-- co idempotentní není, a druhý běh migrace by na něm spadl s 42710.
drop trigger if exists zakazka_foto_uklid on public.zakazka_foto;

create trigger zakazka_foto_uklid
  after delete on public.zakazka_foto
  for each row execute function public.uklid_fotek_zakazky();
