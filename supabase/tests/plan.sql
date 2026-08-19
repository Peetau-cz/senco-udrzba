-- =============================================================================
-- Ověření plánu údržby (modul M3, migrace 0010).
--
-- Celá migrace stojí na jedné otázce: přežije plán vydání nové verze šablony?
-- Do teď na ni nešlo odpovědět, protože úkon neměl identitu, která by verze
-- přečkala. Většina kontrol níž je právě o tom - a o tom, že vydání verze
-- nesmí sáhnout na termíny, které zadal garant.
--
-- Spuštění: v SQL editoru Supabase nebo přes psql, pod rolí postgres.
-- Předpoklad: proběhly migrace 0006-0010 a seed.sql (kvůli oblastem a rolím).
--
-- Skript nic nemění - celý běží v transakci, která se na konci vrací.
-- Při neúspěchu vyhodí výjimku s popisem, co neplatí.
-- =============================================================================

begin;

do $$
declare
  v_oblast    uuid;
  v_profese   uuid;
  v_typ       uuid;
  v_sablona   uuid;
  v_stroj     uuid;
  v_verze1    uuid;
  v_verze2    uuid;
  v_klic_a    uuid;
  v_klic_b    uuid;
  v_klic_novy uuid;
  v_navrh     uuid;
  v_pocet     integer;
  v_termin    date;
  v_aktivni   boolean;
  v_kontrol   integer := 0;
begin
  select id into v_oblast  from public.oblast where kod = 'cnc';
  select id into v_profese from public.role   where kod = 'specialista_cnc';

  if v_oblast is null or v_profese is null then
    raise exception 'Chybí číselníky. Spusťte nejdřív supabase/seed.sql';
  end if;

  -- Vlastní typ i stroj, ať test nesahá na data z harmonogramu ----------------
  insert into public.typ_zarizeni (oblast_id, kod, nazev)
  values (v_oblast, 'test_typ_plan', 'Testovací typ pro plán')
  returning id into v_typ;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_oblast, v_typ, 'Testovací stroj pro plán', 'TEST-PLAN-1')
  returning id into v_stroj;

  insert into public.sablona (oblast_id, kod, nazev)
  values (v_oblast, 'test_plan', 'Testovací šablona pro plán')
  returning id into v_sablona;

  -- 1. Přiřazení bez platné verze plán nezaloží -------------------------------
  -- Matice zatím neexistuje, není podle čeho plánovat.
  insert into public.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id)
  values (v_stroj, v_sablona, v_oblast);

  select count(*) into v_pocet from public.plan_udrzby where zarizeni_id = v_stroj;
  if v_pocet <> 0 then
    raise exception 'Šablona bez platné verze založila % řádků plánu.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 2. Aktivace první verze plán založí ---------------------------------------
  v_verze1 := public.zaloz_navrh_verze(v_sablona);

  insert into public.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
    interval_zaklad, profese_role_id, nabizi_poznamku
  ) values
    (v_verze1, 1, 'Úkon A', 'tydny',  1, 'od_planu', v_profese, true),
    (v_verze1, 2, 'Úkon B', 'mesice', 1, 'od_planu', v_profese, false);

  select klic into v_klic_a from public.sablona_ukon
  where sablona_verze_id = v_verze1 and nazev = 'Úkon A';
  select klic into v_klic_b from public.sablona_ukon
  where sablona_verze_id = v_verze1 and nazev = 'Úkon B';

  perform public.aktivuj_verzi(v_verze1);

  select count(*) into v_pocet from public.plan_udrzby where zarizeni_id = v_stroj;
  if v_pocet <> 2 then
    raise exception 'Po aktivaci verze mají být 2 řádky plánu, je jich %.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 3. Nový řádek plánu je bez termínu ----------------------------------------
  -- Rozhodnutí uživatele: první termín zadává garant, nedopočítává se.
  select count(*) into v_pocet
  from public.plan_udrzby where zarizeni_id = v_stroj and dalsi_termin is null;
  if v_pocet <> 2 then
    raise exception 'Plán si domyslel termín, který měl zadat garant.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- Garant termíny doplní.
  update public.plan_udrzby set dalsi_termin = date '2026-09-01'
  where zarizeni_id = v_stroj and ukon_klic = v_klic_a;
  update public.plan_udrzby set dalsi_termin = date '2026-10-15'
  where zarizeni_id = v_stroj and ukon_klic = v_klic_b;

  -- 4. Kopie do návrhu přenese stálý klíč -------------------------------------
  -- Tohle je ta věc, kvůli které migrace 0010 vznikla.
  v_verze2 := public.zaloz_navrh_verze(v_sablona);

  select count(*) into v_pocet
  from public.sablona_ukon where sablona_verze_id = v_verze2 and klic in (v_klic_a, v_klic_b);
  if v_pocet <> 2 then
    raise exception 'Nová verze nepřenesla stálé klíče úkonů, přenesla jich %.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 5. Kopie přenese i nabizi_poznamku ----------------------------------------
  -- Chyba z M2: sloupec přibyl v 0008, ale výčet v zaloz_navrh_verze zůstal.
  if not (select nabizi_poznamku from public.sablona_ukon
          where sablona_verze_id = v_verze2 and klic = v_klic_a) then
    raise exception 'Nová verze ztratila nastavení pole na rozepsání.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- Garant přejmenuje úkon A, vyhodí úkon B a přidá úkon C.
  update public.sablona_ukon set nazev = 'Úkon A po přejmenování'
  where sablona_verze_id = v_verze2 and klic = v_klic_a;

  delete from public.sablona_ukon where sablona_verze_id = v_verze2 and klic = v_klic_b;

  insert into public.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
    interval_zaklad, profese_role_id
  ) values (v_verze2, 3, 'Úkon C', 'roky', 1, 'od_planu', v_profese)
  returning klic into v_klic_novy;

  perform public.aktivuj_verzi(v_verze2);

  -- 6. Přejmenovaný úkon si nechal svůj termín --------------------------------
  select dalsi_termin into v_termin
  from public.plan_udrzby where zarizeni_id = v_stroj and ukon_klic = v_klic_a;
  if v_termin <> date '2026-09-01' then
    raise exception 'Vydání verze posunulo termín zadaný garantem na %.', v_termin;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 7. Vyřazený úkon se přestal plánovat, ale řádek zůstal --------------------
  select aktivni, dalsi_termin into v_aktivni, v_termin
  from public.plan_udrzby where zarizeni_id = v_stroj and ukon_klic = v_klic_b;
  if v_aktivni is null then
    raise exception 'Řádek plánu vyřazeného úkonu zmizel i s poslední údržbou.';
  end if;
  if v_aktivni then
    raise exception 'Úkon vyřazený z matice se pořád plánuje.';
  end if;
  if v_termin <> date '2026-10-15' then
    raise exception 'Vyřazení úkonu smazalo termín, který by se hodil při návratu.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 8. Nový úkon dostal řádek, zase bez termínu -------------------------------
  select count(*) into v_pocet
  from public.plan_udrzby
  where zarizeni_id = v_stroj and ukon_klic = v_klic_novy and dalsi_termin is null and aktivni;
  if v_pocet <> 1 then
    raise exception 'Úkon přidaný v nové verzi nedostal řádek plánu k doplnění termínu.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 9. Vrácení úkonu do matice ho oživí i s termínem --------------------------
  perform public.zaloz_navrh_verze(v_sablona);

  insert into public.sablona_ukon (
    sablona_verze_id, klic, poradi, nazev, interval_typ, interval_hodnota,
    interval_zaklad, profese_role_id
  )
  select id, v_klic_b, 9, 'Úkon B zpátky', 'mesice', 1, 'od_planu', v_profese
  from public.sablona_verze where sablona_id = v_sablona and stav = 'navrh';

  perform public.aktivuj_verzi(
    (select id from public.sablona_verze where sablona_id = v_sablona and stav = 'navrh')
  );

  select aktivni, dalsi_termin into v_aktivni, v_termin
  from public.plan_udrzby where zarizeni_id = v_stroj and ukon_klic = v_klic_b;
  if not v_aktivni or v_termin <> date '2026-10-15' then
    raise exception 'Vrácený úkon se neoživil s původním termínem.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 10. Odebrání šablony stroji plán smaže ------------------------------------
  delete from public.zarizeni_sablona where zarizeni_id = v_stroj and sablona_id = v_sablona;

  select count(*) into v_pocet from public.plan_udrzby where zarizeni_id = v_stroj;
  if v_pocet <> 0 then
    raise exception 'Po odebrání šablony zbylo % řádků plánu bez přiřazení.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 11. Dva úkony téže linie v jedné matici neprojdou --------------------------
  -- Jinak by na jeden úkon vznikly dva plány. Zkouší se v návrhu: do aktivované
  -- verze by zápis nepustil už zámek z migrace 0006, a to je jiná kontrola.
  v_navrh := public.zaloz_navrh_verze(v_sablona);

  begin
    insert into public.sablona_ukon (
      sablona_verze_id, klic, poradi, nazev, interval_typ, interval_hodnota,
      interval_zaklad, profese_role_id
    ) values (v_navrh, v_klic_a, 98, 'Dvojník', 'dny', 1, 'od_planu', v_profese);
    raise exception 'Dva úkony se stejným klíčem v jedné verzi prošly.';
  exception
    when unique_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  raise notice 'Test plánu prošel: všech % kontrol v pořádku.', v_kontrol;
end;
$$;

rollback;
