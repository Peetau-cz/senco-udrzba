-- =============================================================================
-- M1 - změna schématu vlastních parametrů za provozu
--
-- Migrace 0003 zavedla parametry a jejich kontrolu. Chybí v ní ale odpověď na
-- otázku, co se stane s už uloženými stroji, když garant parametr ze schématu
-- odebere: jejich hodnoty by v `parametry` zůstaly ležet, neviditelné v kartě,
-- a při nejbližší úpravě stroje by ho kontrola odmítla uložit se zprávou o
-- parametru, který schéma nezná.
--
-- Čistý PostgreSQL, žádná závislost na Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Kontrola parametrů podruhé
--
-- Proti 0003 přibyla jediná věc: úklid po změně schématu smí uložit i zařízení,
-- kterému nově povinný parametr chybí. Bez toho by nešlo v jednom kroku parametr
-- odebrat a jiný označit za povinný - úklid by narazil na vlastní kontrolu a
-- garant by dostal chybu o stroji, kterého se vůbec nedotkl. Chybějící povinný
-- údaj se doplní při první úpravě toho stroje.
--
-- Kontrola neznámých parametrů a typů hodnot platí pořád a bez výjimky.
-- -----------------------------------------------------------------------------

create or replace function public.zkontroluj_parametry_zarizeni()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_schema   jsonb;
  v_klic     text;
  v_hodnota  jsonb;
  v_definice jsonb;
  v_typ      text;
  v_popisek  text;
  v_uklid    boolean := coalesce(current_setting('app.uklid_parametru', true), '') = 'ano';
begin
  select schema_parametru into v_schema
  from public.typ_zarizeni
  where id = new.typ_zarizeni_id;

  v_schema := coalesce(v_schema, '{}'::jsonb);

  -- 1. Nic navíc: parametr, který schéma nezná, je překlep nebo pozůstatek po
  --    změně typu. Tiše uložený by se v kartě nikdy neukázal.
  for v_klic, v_hodnota in select * from jsonb_each(new.parametry) loop
    v_definice := v_schema -> v_klic;

    if v_definice is null then
      raise exception 'Parametr "%" není v schématu typu zařízení.', v_klic
        using errcode = '23514';
    end if;

    continue when jsonb_typeof(v_hodnota) = 'null';

    v_typ := v_definice ->> 'typ';
    v_popisek := coalesce(v_definice ->> 'popisek', v_klic);

    if v_typ = 'cislo' and jsonb_typeof(v_hodnota) <> 'number' then
      raise exception 'Parametr "%" musí být číslo.', v_popisek using errcode = '23514';
    elsif v_typ = 'text' and jsonb_typeof(v_hodnota) <> 'string' then
      raise exception 'Parametr "%" musí být text.', v_popisek using errcode = '23514';
    elsif v_typ = 'ano_ne' and jsonb_typeof(v_hodnota) <> 'boolean' then
      raise exception 'Parametr "%" musí být ano/ne.', v_popisek using errcode = '23514';
    elsif v_typ = 'vyber' and (
      jsonb_typeof(v_hodnota) <> 'string'
      or not jsonb_exists(v_definice -> 'moznosti', v_hodnota #>> '{}')
    ) then
      raise exception 'Parametr "%" má hodnotu mimo povolený seznam.', v_popisek
        using errcode = '23514';
    end if;
  end loop;

  -- 2. Nic nechybí. Přeskakuje se jen při úklidu po změně schématu, viz hlavička.
  if not v_uklid then
    for v_klic, v_definice in select * from jsonb_each(v_schema) loop
      if coalesce((v_definice ->> 'povinne')::boolean, false) then
        v_hodnota := new.parametry -> v_klic;
        if v_hodnota is null
           or jsonb_typeof(v_hodnota) = 'null'
           or (jsonb_typeof(v_hodnota) = 'string' and btrim(v_hodnota #>> '{}') = '')
        then
          raise exception 'Parametr "%" je povinný.', coalesce(v_definice ->> 'popisek', v_klic)
            using errcode = '23514';
        end if;
      end if;
    end loop;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Úklid hodnot po odebrání parametru ze schématu
--
-- Běží jen když se schéma opravdu změnilo a jen u strojů, které nějakou osiřelou
-- hodnotu skutečně mají - jinak by každé přejmenování typu přepisovalo celou
-- evidenci a zaplavilo auditní log.
-- -----------------------------------------------------------------------------

create or replace function public.uklid_parametru_po_zmene_schematu()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.schema_parametru is not distinct from old.schema_parametru then
    return new;
  end if;

  perform set_config('app.uklid_parametru', 'ano', true);

  update public.zarizeni z
  set parametry = (
    select coalesce(jsonb_object_agg(p.klic, p.hodnota), '{}'::jsonb)
    from jsonb_each(z.parametry) as p(klic, hodnota)
    where jsonb_exists(new.schema_parametru, p.klic)
  )
  where z.typ_zarizeni_id = new.id
    and exists (
      select 1
      from jsonb_each(z.parametry) as p(klic, hodnota)
      where not jsonb_exists(new.schema_parametru, p.klic)
    );

  perform set_config('app.uklid_parametru', 'ne', true);

  return new;
end;
$$;

comment on function public.uklid_parametru_po_zmene_schematu is
  'Po odebrání parametru ze schématu smaže jeho hodnoty ze zařízení daného typu.';

create trigger typ_zarizeni_uklid_parametru
  after update of schema_parametru on public.typ_zarizeni
  for each row execute function public.uklid_parametru_po_zmene_schematu();
