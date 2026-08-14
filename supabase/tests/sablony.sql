-- =============================================================================
-- Ověření šablon údržby a jejich verzování (modul M2).
--
-- Nejdůležitější je tu rozhodnutí R3: aktivovaná verze musí být neměnná, jinak
-- by úprava šablony zpětně přepsala, co technik odškrtal. Drží to dva triggery
-- z migrace 0006 a právě ty se nedají ověřit ničím jiným než pokusem o zápis.
--
-- Spuštění: v SQL editoru Supabase nebo přes psql, pod rolí postgres.
-- Předpoklad: proběhla migrace 0006 a seed.sql (kvůli oblastem a rolím).
--
-- Skript nic nemění - celý běží v transakci, která se na konci vrací.
-- Při neúspěchu vyhodí výjimku s popisem, co neplatí.
-- =============================================================================

begin;

do $$
declare
  v_oblast   uuid;
  v_profese  uuid;
  v_sablona  uuid;
  v_verze1   uuid;
  v_verze2   uuid;
  v_ukon     uuid;
  v_stav     public.stav_verze;
  v_pocet    integer;
  v_cislo    integer;
  v_proslo   boolean;
  v_kontrol  integer := 0;
begin
  select id into v_oblast from public.oblast where kod = 'cnc';
  select id into v_profese from public.role where kod = 'specialista_cnc';

  if v_oblast is null or v_profese is null then
    raise exception 'Chybí číselníky. Spusťte nejdřív supabase/seed.sql';
  end if;

  -- 1. Založení šablony a prvního návrhu -------------------------------------
  insert into public.sablona (oblast_id, kod, nazev)
  values (v_oblast, 'test_qt250', 'Testovací Mazak QT250')
  returning id into v_sablona;

  v_verze1 := public.zaloz_navrh_verze(v_sablona);

  select cislo_verze, stav into v_cislo, v_stav
  from public.sablona_verze where id = v_verze1;

  if v_cislo <> 1 or v_stav <> 'navrh' then
    raise exception 'První verze má být 1 ve stavu navrh, je % ve stavu %.', v_cislo, v_stav;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 2. Druhé volání nesmí založit další návrh ---------------------------------
  if public.zaloz_navrh_verze(v_sablona) <> v_verze1 then
    raise exception 'Opakované založení návrhu vytvořilo druhý návrh.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 3. Verzi bez úkonů nelze aktivovat ----------------------------------------
  v_proslo := true;
  begin
    perform public.aktivuj_verzi(v_verze1);
  exception when others then
    v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Verze bez jediného úkonu se dala aktivovat.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 4. Měření bez jednotky neprojde -------------------------------------------
  v_proslo := true;
  begin
    insert into public.sablona_ukon (
      sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
      profese_role_id, vyzaduje_hodnotu
    ) values (v_verze1, 99, 'Bez jednotky', 'mesice', 1, v_profese, true);
  exception when others then
    v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Úkon s měřením bez jednotky se uložil.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 4b. Kontrolní body musí mít tvar (migrace 0007) ---------------------------
  v_proslo := true;
  begin
    insert into public.sablona_ukon (
      sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
      profese_role_id, kontrolni_body
    ) values (
      v_verze1, 98, 'Starý tvar bodů', 'mesice', 1, v_profese,
      '["1000 ot.", "3000 ot."]'::jsonb
    );
  exception when others then
    v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Kontrolní body jako holé texty prošly, i když mají mít druh zápisu.';
  end if;
  v_kontrol := v_kontrol + 1;

  v_proslo := true;
  begin
    insert into public.sablona_ukon (
      sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
      profese_role_id, kontrolni_body
    ) values (
      v_verze1, 97, 'Neznámý druh bodu', 'mesice', 1, v_profese,
      '[{"nazev": "Cosi", "typ": "mozna"}]'::jsonb
    );
  exception when others then
    v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Kontrolní bod s neznámým druhem zápisu prošel.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 5. Naplnění matice a aktivace ---------------------------------------------
  insert into public.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
    profese_role_id, vyzaduje_foto, kontrolni_body
  ) values (
    v_verze1, 1, 'Kontrola hladiny oleje', 'mesice', 3, v_profese, true,
    '[{"nazev": "Kryt dotažen", "typ": "ano_ne"}]'::jsonb
  )
  returning id into v_ukon;

  insert into public.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
    profese_role_id, vyzaduje_hodnotu, jednotka, mez_min, mez_max
  ) values (v_verze1, 2, 'Změření vůle vřetena', 'roky', 1, v_profese, true, 'mm', 0, 0.05);

  perform public.aktivuj_verzi(v_verze1);

  select stav into v_stav from public.sablona_verze where id = v_verze1;
  if v_stav <> 'aktivni' then
    raise exception 'Verze po aktivaci není aktivní, je %.', v_stav;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 6. R3: matici aktivované verze už nelze měnit ------------------------------
  v_proslo := true;
  begin
    update public.sablona_ukon set nazev = 'Podvržený text' where id = v_ukon;
  exception when others then
    v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Úkon aktivované verze šel změnit - R3 neplatí.';
  end if;
  v_kontrol := v_kontrol + 1;

  v_proslo := true;
  begin
    delete from public.sablona_ukon where id = v_ukon;
  exception when others then
    v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Úkon aktivované verze šel smazat - R3 neplatí.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 7. R3: ani do aktivované verze samotné se nesmí sáhnout --------------------
  v_proslo := true;
  begin
    update public.sablona_verze set poznamka_ke_zmene = 'zpetna uprava' where id = v_verze1;
  exception when others then
    v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Aktivovaná verze šla změnit - R3 neplatí.';
  end if;
  v_kontrol := v_kontrol + 1;

  v_proslo := true;
  begin
    delete from public.sablona_verze where id = v_verze1;
  exception when others then
    v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Aktivovaná verze šla smazat - R3 neplatí.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 8. Nový návrh zdědí matici platné verze -----------------------------------
  v_verze2 := public.zaloz_navrh_verze(v_sablona);

  select count(*) into v_pocet from public.sablona_ukon where sablona_verze_id = v_verze2;
  if v_pocet <> 2 then
    raise exception 'Nový návrh má % úkonů, očekávají se 2 zkopírované.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 9. Aktivace nové verze archivuje starou -----------------------------------
  update public.sablona_ukon set nazev = 'Kontrola hladiny oleje a filtru'
  where sablona_verze_id = v_verze2 and poradi = 1;

  perform public.aktivuj_verzi(v_verze2);

  select stav into v_stav from public.sablona_verze where id = v_verze1;
  if v_stav <> 'archivovana' then
    raise exception 'Původní verze po nástupu nové není archivovaná, je %.', v_stav;
  end if;
  v_kontrol := v_kontrol + 1;

  select count(*) into v_pocet
  from public.sablona_verze where sablona_id = v_sablona and stav = 'aktivni';
  if v_pocet <> 1 then
    raise exception 'Aktivních verzí je %, očekává se právě jedna.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 10. Historie zůstala nedotčená --------------------------------------------
  -- Tohle je smysl celého R3: verze 1 pořád nese původní text, i když verze 2
  -- ho změnila. Květnová zakázka tedy uvidí květnovou matici.
  if (select nazev from public.sablona_ukon where id = v_ukon) <> 'Kontrola hladiny oleje' then
    raise exception 'Úkon v archivované verzi se změnil - historie ztratila důkazní hodnotu.';
  end if;
  v_kontrol := v_kontrol + 1;

  raise notice 'Test šablon prošel: všech % kontrol v pořádku.', v_kontrol;
end;
$$;

rollback;
