-- =============================================================================
-- M5 - úložiště fotek provozního deníku
--
-- ČTVRTÁ MIGRACE ZÁVISLÁ NA SUPABASE, po 0002, 0004 a 0012. Schéma deníku
-- v 0020 je čistý PostgreSQL; tenhle soubor stojí na Supabase Storage, protože
-- úložiště souborů žádný standard v PostgreSQL nemá. Viz docs/PORTABILITA.md,
-- pravidlo 2.
--
-- Vlastní nádoba, ne sdílená se zakázkami. Fotka ze zakázky se řídí stavem
-- zakázky, fotka z deníku oknem na opravu zápisu - jedna nádoba by ta dvě
-- pravidla musela rozplétat podle tvaru cesty. Stejná úvaha jako u 0012.
--
-- Úklid smazaných souborů NEDĚLÁ trigger. Supabase nad storage.objects přímé
-- DML nedovolí a trigger by celou operaci shodil - celé je to rozepsané
-- v migraci 0016. Maže aplikace přes `src/lib/storage/`, a to PŘED smazáním
-- řádku v denik_foto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Jedna autorita pro okno na opravu
--
-- Pravidlo „autor do 24 hodin, vedoucí údržby a administrátor kdykoli" platí
-- pro řádek v deníku i pro soubor v úložišti. Migrace 0020 ho měla zapsané
-- v triggerech, tahle migrace ho potřebuje ještě ve třech politikách nad
-- storage.objects - a pět kopií téhož výrazu je přesně ta druhá pravda, která
-- se při první změně okna rozejde.
--
-- Funkce je proto jediné místo, kde je pravidlo napsané. Triggery níž se
-- překlápějí na ni a jejich vlastní podmínky slouží už jen k tomu, aby uměly
-- říct PROČ to nejde - cizí zápis je jiná věta než starý zápis.
--
-- Bez SECURITY DEFINER schválně: RLS nad provozni_denik se má uplatnit. Na
-- zápis, který uživatel nevidí, nemá co sahat ani v úložišti.
-- -----------------------------------------------------------------------------

create or replace function public.muze_menit_zapis_deniku(p_zaznam uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.provozni_denik d
    where d.id = p_zaznam
      and public.provadi_udrzbu_v_oblasti(d.oblast_id)
      and (
        public.ma_roli('administrator')
        or public.ma_roli('vedouci_udrzby')
        or (
          d.zapsal_id = public.aktualni_uzivatel()
          and now() - d.vytvoreno_at <= interval '24 hours'
        )
      )
  );
$$;

comment on function public.muze_menit_zapis_deniku is
  'Smí přihlášený uživatel sáhnout na zápis v deníku? Autor do 24 h, vedoucí údržby a administrátor kdykoli.';

-- -----------------------------------------------------------------------------
-- Triggery ze 0020 se překlápějí na společné pravidlo
-- -----------------------------------------------------------------------------

create or replace function public.zamkni_zapis_deniku()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Zápis v provozním deníku se nemaže - historie zařízení musí zůstat úplná.'
      using errcode = '23514';
  end if;

  if public.muze_menit_zapis_deniku(old.id) then
    return new;
  end if;

  -- Rozhodnuto je výš. Tady se jen hledá srozumitelná věta.
  if old.zapsal_id is distinct from public.aktualni_uzivatel() then
    raise exception 'Cizí zápis v deníku opravit nelze. Požádejte vedoucího údržby.'
      using errcode = '42501';
  end if;

  raise exception 'Zápis je starší než 24 hodin, opravit ho už může jen vedoucí údržby.'
    using errcode = '42501';
end;
$$;

create or replace function public.zamkni_fotky_deniku()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_zaznam uuid;
  v_zapsal uuid;
  v_je     boolean := false;
begin
  if tg_op = 'DELETE' then
    v_zaznam := old.zaznam_id;
  else
    v_zaznam := new.zaznam_id;
  end if;

  select zapsal_id, true into v_zapsal, v_je
  from public.provozni_denik
  where id = v_zaznam;

  -- Zápis neexistuje: smazat ho nejde, takže sem vede leda úklid schématu
  -- a tam bránit nemá smysl. Stejná úvaha jako u zakázek v migraci 0011.
  if v_je and not public.muze_menit_zapis_deniku(v_zaznam) then
    if v_zapsal is distinct from public.aktualni_uzivatel() then
      raise exception 'K cizímu zápisu v deníku fotky přidávat ani mazat nelze.'
        using errcode = '42501';
    end if;

    raise exception 'Zápis je starší než 24 hodin, fotodokumentaci už mění jen vedoucí údržby.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Nádoba na fotky
--
-- Neveřejná, stejně jako `zarizeni` a `zakazky` - fotka z výroby nemá být volně
-- na internetu. Aplikace k nim vydává dočasně platné odkazy.
--
-- Povolené jsou jen formáty, které prohlížeč umí zobrazit. HEIC z iPadu mezi
-- nimi schválně není, důvod je rozepsaný v 0012.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'denik',
  'denik',
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
-- Cesta k souboru je `<id zápisu>/<náhodný název>`. První složka je klíč
-- k zápisu a přes něj k oblasti i k oknu na opravu.
--
-- Porovnává se text s textem (`d.id::text`), ne uuid s uuid: kdyby někdo nahrál
-- soubor do složky, která uuid vůbec není, přetypování by skončilo chybou.
-- Takhle prostě nic nenajde a přístup se odepře.
--
-- Podmínka na okno je tu schválně podruhé - řádek v denik_foto hlídá trigger
-- ze 0020, ale bez tohohle by šlo nahrát soubor k dávno uzavřenému zápisu
-- přímo do úložiště. Řádek by k němu nevznikl a v nádobě by ležel soubor,
-- ke kterému se aplikace nikdy nedostane.
-- -----------------------------------------------------------------------------

drop policy if exists denik_fotky_select on storage.objects;
drop policy if exists denik_fotky_insert on storage.objects;
drop policy if exists denik_fotky_update on storage.objects;
drop policy if exists denik_fotky_delete on storage.objects;

-- Číst smí každý, kdo vidí oblast. Fotky jsou součást historie zařízení a tu
-- podle zadání (ř. 147-154) čte i management, který sám do deníku nezapisuje.
create policy denik_fotky_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'denik'
    and exists (
      select 1 from public.provozni_denik d
      where d.id::text = (storage.foldername(name))[1]
        and public.ma_pristup_k_oblasti(d.oblast_id)
    )
  );

create policy denik_fotky_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'denik'
    and exists (
      select 1 from public.provozni_denik d
      where d.id::text = (storage.foldername(name))[1]
        and public.muze_menit_zapis_deniku(d.id)
    )
  );

create policy denik_fotky_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'denik'
    and exists (
      select 1 from public.provozni_denik d
      where d.id::text = (storage.foldername(name))[1]
        and public.muze_menit_zapis_deniku(d.id)
    )
  );

create policy denik_fotky_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'denik'
    and exists (
      select 1 from public.provozni_denik d
      where d.id::text = (storage.foldername(name))[1]
        and public.muze_menit_zapis_deniku(d.id)
    )
  );

grant execute on function public.muze_menit_zapis_deniku(uuid) to authenticated;
