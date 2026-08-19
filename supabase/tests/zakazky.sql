-- =============================================================================
-- Ověření zakázek a checklistu (modul M3, migrace 0011).
--
-- Těžiště je na neměnnosti uzavřené zakázky. „Historii nebude možné mazat"
-- (zadání ř. 155) je jen půlka věci - historie, kterou lze zpětně přepsat, je
-- stejně bezcenná jako smazaná. Drží to tři triggery a ty se nedají ověřit
-- ničím jiným než pokusem o zápis.
--
-- Spuštění: v SQL editoru Supabase nebo přes psql, pod rolí postgres.
-- Předpoklad: proběhly migrace 0006-0011 a seed.sql (kvůli oblastem a rolím).
--
-- Pozn.: pod rolí postgres se neuplatní RLS ani sloupcová práva - ta se ověřují
-- zvenčí přes `npm run overit:rls`. Tenhle skript zkouší, co drží databáze
-- i vůči vlastníkovi: omezení a triggery.
--
-- Skript nic nemění - celý běží v transakci, která se na konci vrací.
-- Při neúspěchu vyhodí výjimku s popisem, co neplatí.
-- =============================================================================

begin;

do $$
declare
  v_oblast   uuid;
  v_profese  uuid;
  v_typ      uuid;
  v_stroj    uuid;
  v_sablona  uuid;
  v_verze    uuid;
  v_plan     uuid;
  v_zakazka  uuid;
  v_druha    uuid;
  v_ukon     uuid;
  v_pocet    integer;
  v_kontrol  integer := 0;
begin
  select id into v_oblast  from public.oblast where kod = 'cnc';
  select id into v_profese from public.role   where kod = 'specialista_cnc';

  if v_oblast is null or v_profese is null then
    raise exception 'Chybí číselníky. Spusťte nejdřív supabase/seed.sql';
  end if;

  -- Příprava: vlastní stroj, šablona s jedním úkonem, plán --------------------
  insert into public.typ_zarizeni (oblast_id, kod, nazev)
  values (v_oblast, 'test_typ_zakazky', 'Testovací typ pro zakázky')
  returning id into v_typ;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_oblast, v_typ, 'Testovací stroj pro zakázky', 'TEST-ZAK-1')
  returning id into v_stroj;

  insert into public.sablona (oblast_id, kod, nazev)
  values (v_oblast, 'test_zakazky', 'Testovací šablona pro zakázky')
  returning id into v_sablona;

  v_verze := public.zaloz_navrh_verze(v_sablona);

  insert into public.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
    interval_zaklad, profese_role_id
  ) values (v_verze, 1, 'Kontrola vřetena', 'tydny', 1, 'od_planu', v_profese);

  perform public.aktivuj_verzi(v_verze);

  insert into public.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id)
  values (v_stroj, v_sablona, v_oblast);

  select id into v_plan from public.plan_udrzby where zarizeni_id = v_stroj;

  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, date '2026-09-01')
  returning id into v_zakazka;

  insert into public.zakazka_ukon (
    zakazka_id, plan_udrzby_id, poradi, nazev_snapshot, kontrolni_body,
    vyzaduje_hodnotu, jednotka_snapshot
  ) values (
    v_zakazka, v_plan, 1, 'Kontrola vřetena',
    '[{"nazev": "1000 ot.", "typ": "hodnota"}, {"nazev": "Kryt dotažen", "typ": "ano_ne"}]'::jsonb,
    true, 'mm/s'
  ) returning id into v_ukon;

  -- 1. Odpověď špatného druhu neprojde ----------------------------------------
  -- Číslo u otázky ano/ne je nesmysl, který by se v historii nedal vyložit.
  begin
    update public.zakazka_ukon
    set kontrolni_body =
      '[{"nazev": "1000 ot.", "typ": "hodnota", "hodnota": 4.2},
        {"nazev": "Kryt dotažen", "typ": "ano_ne", "hodnota": 1}]'::jsonb
    where id = v_ukon;
    raise exception 'Číselná odpověď u otázky ano/ne prošla.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- 2. Správně vyplněné body projdou ------------------------------------------
  update public.zakazka_ukon
  set kontrolni_body =
    '[{"nazev": "1000 ot.", "typ": "hodnota", "hodnota": 4.2},
      {"nazev": "Kryt dotažen", "typ": "ano_ne", "ano": true}]'::jsonb
  where id = v_ukon;
  v_kontrol := v_kontrol + 1;

  -- 3. Zadání bodů nejde při vyplňování změnit --------------------------------
  -- Bez toho by šlo obejít zamrazenou matici: přepsat otázku a odpovědět na ni.
  begin
    update public.zakazka_ukon
    set kontrolni_body =
      '[{"nazev": "Jiná otázka", "typ": "hodnota", "hodnota": 4.2},
        {"nazev": "Kryt dotažen", "typ": "ano_ne", "ano": true}]'::jsonb
    where id = v_ukon;
    raise exception 'Technik přepsal zadání kontrolního bodu.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- 4. „Nelze provést" bez důvodu neprojde ------------------------------------
  begin
    update public.zakazka_ukon
    set stav = 'nelze_provest', potvrzeno_at = now(), poznamka = null
    where id = v_ukon;
    raise exception 'Krok označený jako neproveditelný prošel bez důvodu.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- 5. Splněné měření bez naměřené hodnoty neprojde ---------------------------
  begin
    update public.zakazka_ukon
    set stav = 'splneno', potvrzeno_at = now(), hodnota = null
    where id = v_ukon;
    raise exception 'Splněné měření prošlo bez naměřené hodnoty.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- 6. Potvrzení musí sedět se stavem -----------------------------------------
  begin
    update public.zakazka_ukon
    set stav = 'splneno', potvrzeno_at = null, hodnota = 4.2
    where id = v_ukon;
    raise exception 'Splněný krok prošel bez času potvrzení.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- Krok se řádně odklikne.
  update public.zakazka_ukon
  set stav = 'splneno', potvrzeno_at = now(), hodnota = 4.2
  where id = v_ukon;

  -- 7. Skupina stroj + termín + profese je jedinečná --------------------------
  -- Dvě zakázky pro tutéž profesi, stroj a den by znamenaly dvě cesty ke stroji
  -- za totéž.
  begin
    insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
    values (v_stroj, v_verze, v_profese, date '2026-09-01');
    raise exception 'Druhá zakázka pro tentýž stroj, den a profesi prošla.';
  exception
    when unique_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- Zakázka se dokončí.
  update public.zakazka
  set stav = 'dokonceno', dokonceno_at = now()
  where id = v_zakazka;

  -- 8. Dokončenou zakázku nelze měnit -----------------------------------------
  begin
    update public.zakazka set poznamka = 'dodatečná úprava' where id = v_zakazka;
    raise exception 'Dokončená zakázka se dala přepsat.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- 9. Checklist dokončené zakázky nelze měnit --------------------------------
  begin
    update public.zakazka_ukon set hodnota = 9.9 where id = v_ukon;
    raise exception 'Krok dokončené zakázky se dal přepsat.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- 10. K dokončené zakázce nelze přidat fotku --------------------------------
  begin
    insert into public.zakazka_foto (zakazka_ukon_id, storage_path)
    values (v_ukon, 'test/dodatecna.jpg');
    raise exception 'K dokončené zakázce šlo přidat fotku.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- 11. Zakázku nelze smazat --------------------------------------------------
  begin
    delete from public.zakazka where id = v_zakazka;
    raise exception 'Zakázka šla smazat i s celou historií údržby.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- 12. Zrušená zakázka je uzavřená taky --------------------------------------
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, date '2026-09-08')
  returning id into v_druha;

  update public.zakazka set stav = 'zruseno' where id = v_druha;

  begin
    update public.zakazka set poznamka = 'oživení' where id = v_druha;
    raise exception 'Zrušená zakázka se dala měnit.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- 13. Po zrušení jde na tentýž den naplánovat znovu -------------------------
  -- Proto je index jedinečnosti částečný.
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, date '2026-09-08');

  select count(*) into v_pocet
  from public.zakazka where zarizeni_id = v_stroj and planovany_termin = date '2026-09-08';
  if v_pocet <> 2 then
    raise exception 'Po zrušení nešlo naplánovat znovu, zakázek je %.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  raise notice 'Test zakázek prošel: všech % kontrol v pořádku.', v_kontrol;
end;
$$;

rollback;
