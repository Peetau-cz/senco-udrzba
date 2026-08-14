-- =============================================================================
-- Šablona údržby pro oblast CNC (modul M2).
--
-- Zdroj: docs/Harmonogram_udrzby_CNC_stroju.xlsx, sloupce "Interval" a
-- "Úkon údržby". Navazuje na supabase/seed_cnc.sql, který z téhož souboru
-- založil typy a stroje.
--
-- PROČ JEDNA ŠABLONA, A NE PĚT
-- Tabulka má pět strojů (frézka, soustruh, vysekávačka, ohraňovák, licí stroj)
-- a u každého tentýž seznam šestnácti úkonů - je to pětkrát zkopírovaná stejná
-- matice. Přesně na tohle šablony jsou: zakládá se jedna a přiřadí se všem pěti
-- strojům. Až se údržba jednotlivých strojů začne lišit, garant si pro ten stroj
-- založí vlastní šablonu; do té doby by pět kopií znamenalo pět míst, kde se
-- musí každá změna udělat znovu (viz "Časté chyby" v docs/PRIPRAVA_DAT.md).
--
-- CO Z TABULKY NEVYPLÝVÁ A CO JSEM DOPLNIL
--   1. interval_zaklad = 'od_planu' u všech úkonů. Podle zadavatele je termín
--      vždy k pevně danému datu: zpožděná údržba tedy neposouvá kalendář dál.
--   2. Profese: standardně specialista CNC. Dvě revize elektro jsem přiřadil
--      specialistovi elektro - tabulka to neříká, ale "Revize elektroinstalace
--      a senzorů" k CNC profesi nesedí. Kdyby to tak být nemělo, je to změna
--      profese u dvou řádků v aplikaci.
--   3. Pole na rozepsání (nabizi_poznamku) mají revize a kalibrace, tedy úkony,
--      kde technik něco zjišťuje. Rutinní čištění a mazání ho nemá.
--   4. Tolerance po termínu zůstává nula - v tabulce žádná není a vymýšlet ji
--      by znamenalo tiše měnit, co se bude počítat jako splněné. Doplní garant.
--
-- Skript je idempotentní. Matici zakládá jen tehdy, když šablona ještě žádnou
-- verzi nemá - jinak by přepsal, co garant mezitím zverzoval.
-- =============================================================================

do $$
declare
  v_oblast  uuid;
  v_sablona uuid;
  v_verze   uuid;
  v_cnc     uuid;
  v_elektro uuid;
  v_pocet   integer;
begin
  select id into v_oblast from public.oblast where kod = 'cnc';
  if v_oblast is null then
    raise exception 'Chybí oblast CNC. Spusťte nejdřív supabase/seed.sql';
  end if;

  select id into v_cnc from public.role where kod = 'specialista_cnc';
  select id into v_elektro from public.role where kod = 'specialista_elektro';

  if v_cnc is null then
    raise exception 'Chybí role specialista_cnc. Spusťte nejdřív supabase/seed.sql';
  end if;

  -- Kdyby role elektro v číselníku nebyla, ať skript nespadne - úkony připadnou
  -- CNC a garant je přehodí.
  v_elektro := coalesce(v_elektro, v_cnc);

  insert into public.sablona (oblast_id, kod, nazev, popis)
  values (
    v_oblast,
    'cnc_zakladni',
    'Základní údržba CNC strojů',
    'Společná matice pro všechny stroje z harmonogramu CNC. Zdroj: '
      || 'docs/Harmonogram_udrzby_CNC_stroju.xlsx.'
  )
  on conflict (kod) do update
    set nazev = excluded.nazev,
        popis = excluded.popis
  returning id into v_sablona;

  if exists (select 1 from public.sablona_verze where sablona_id = v_sablona) then
    raise notice 'Šablona cnc_zakladni už nějakou verzi má - matice se nepřepisuje.';
  else
    v_verze := public.zaloz_navrh_verze(v_sablona);

    insert into public.sablona_ukon (
      sablona_verze_id, poradi, nazev,
      interval_typ, interval_hodnota, interval_zaklad,
      profese_role_id, nabizi_poznamku
    )
    values
      -- Týdenní ---------------------------------------------------------------
      (v_verze,  1, 'Vyčištění pracovního prostoru a stolu', 'tydny',  1, 'od_planu', v_cnc,     false),
      (v_verze,  2, 'Kontrola hladiny chladicí kapaliny',    'tydny',  1, 'od_planu', v_cnc,     false),
      (v_verze,  3, 'Mazání vedení a pohyblivých částí',     'tydny',  1, 'od_planu', v_cnc,     false),
      (v_verze,  4, 'Kontrola tlaku vzduchu a filtru',       'tydny',  1, 'od_planu', v_cnc,     false),
      -- Měsíční ---------------------------------------------------------------
      (v_verze,  5, 'Kontrola dotažení šroubových spojů',    'mesice', 1, 'od_planu', v_cnc,     false),
      (v_verze,  6, 'Kontrola olejového systému',            'mesice', 1, 'od_planu', v_cnc,     false),
      (v_verze,  7, 'Vyčištění filtrů ventilace a chlazení', 'mesice', 1, 'od_planu', v_cnc,     false),
      (v_verze,  8, 'Kontrola funkce bezpečnostních prvků',  'mesice', 1, 'od_planu', v_cnc,     false),
      -- Čtvrtletní: v kalendářních jednotkách jsou to tři měsíce ---------------
      (v_verze,  9, 'Kalibrace os a kontrola přesnosti',     'mesice', 3, 'od_planu', v_cnc,     true),
      (v_verze, 10, 'Kontrola ložisek a vůlí',               'mesice', 3, 'od_planu', v_cnc,     false),
      (v_verze, 11, 'Revize elektrických připojení',         'mesice', 3, 'od_planu', v_elektro, true),
      (v_verze, 12, 'Kontrola mazacího systému',             'mesice', 3, 'od_planu', v_cnc,     false),
      -- Roční -----------------------------------------------------------------
      (v_verze, 13, 'Kompletní revize stroje',               'roky',   1, 'od_planu', v_cnc,     true),
      (v_verze, 14, 'Výměna olejů a filtrů',                 'roky',   1, 'od_planu', v_cnc,     false),
      (v_verze, 15, 'Kontrola a případná výměna těsnění',    'roky',   1, 'od_planu', v_cnc,     false),
      (v_verze, 16, 'Revize elektroinstalace a senzorů',     'roky',   1, 'od_planu', v_elektro, true);

    perform public.aktivuj_verzi(v_verze);
    raise notice 'Založena a aktivována verze 1 šablony cnc_zakladni (16 úkonů).';
  end if;

  -- Přiřazení strojům ---------------------------------------------------------
  -- Všem pěti strojům z harmonogramu. Přidá jen chybějící, takže opakované
  -- spuštění nic nemění a ručně odebraný stroj se vrátí až s ním.
  insert into public.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id)
  select z.id, v_sablona, z.oblast_id
  from public.zarizeni z
  join public.typ_zarizeni t on t.id = z.typ_zarizeni_id
  where z.oblast_id = v_oblast
    and t.kod in ('frezka', 'soustruh', 'vysekavacka', 'ohranovak', 'lici_stroj')
  on conflict (zarizeni_id, sablona_id) do nothing;

  select count(*) into v_pocet from public.zarizeni_sablona where sablona_id = v_sablona;
  raise notice 'Šablonu cnc_zakladni používá % zařízení.', v_pocet;
end;
$$;
