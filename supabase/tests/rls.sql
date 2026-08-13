-- =============================================================================
-- Ověření Row Level Security pro modul M0.
--
-- Tohle je nejdůležitější test celého M0: kontroluje, že oprávnění drží
-- v databázi, tedy i mimo uživatelské rozhraní.
--
-- Spuštění: v SQL editoru Supabase nebo přes psql, pod rolí postgres.
-- Předpoklad: proběhla migrace, seed.sql i npm run seed:users.
--
-- Skript nic nemění - případné zápisy probíhají v podblocích, které se vracejí.
-- Při neúspěchu vyhodí výjimku s popisem, co neplatí.
-- =============================================================================

begin;

do $$
declare
  v_cnc            uuid;
  v_vedouci        uuid;
  v_management     uuid;
  v_udrzbar        uuid;
  v_oblast_cnc     uuid;
  v_oblast_strojni uuid;
  v_typ_cnc        uuid;
  v_typ_strojni    uuid;
  v_pocet          integer;
  v_proslo         boolean;
begin
  select id into v_cnc        from auth.users where email = 'cnc@senco.test';
  select id into v_vedouci    from auth.users where email = 'vedouci@senco.test';
  select id into v_management from auth.users where email = 'management@senco.test';
  select id into v_udrzbar    from auth.users where email = 'udrzbar@senco.test';

  if v_cnc is null or v_vedouci is null or v_management is null or v_udrzbar is null then
    raise exception 'Chybí testovací uživatelé. Spusťte nejdřív: npm run seed:users';
  end if;

  select id into v_oblast_cnc     from public.oblast where kod = 'cnc';
  select id into v_oblast_strojni from public.oblast where kod = 'strojni';

  -- ---------------------------------------------------------------------------
  -- 1. Specialista CNC vidí pouze svou oblast (zadání ř. 52)
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cnc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_pocet from public.oblast;
  if v_pocet <> 1 then
    raise exception 'Specialista CNC vidí % oblastí, očekává se 1. RLS na oblasti nedrží.', v_pocet;
  end if;

  select count(*) into v_pocet from public.oblast where kod = 'cnc';
  if v_pocet <> 1 then
    raise exception 'Specialista CNC nevidí vlastní oblast cnc.';
  end if;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 2. Vedoucí údržby vidí všech pět oblastí (zadání ř. 51)
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_vedouci, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_pocet from public.oblast;
  if v_pocet <> 5 then
    raise exception 'Vedoucí údržby vidí % oblastí, očekává se 5.', v_pocet;
  end if;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 3. Management vidí vše, ale nesmí nic zapsat (zadání ř. 49)
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_management, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_pocet from public.oblast;
  if v_pocet <> 5 then
    raise exception 'Management vidí % oblastí, očekává se 5.', v_pocet;
  end if;

  v_proslo := false;
  begin
    insert into public.umisteni (kod, nazev) values ('TEST-RLS', 'Pokusné umístění');
    v_proslo := true;
  exception
    when insufficient_privilege or others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Management dokázal zapsat do umisteni. Politika umisteni_zapis nedrží.';
  end if;

  -- ---------------------------------------------------------------------------
  -- 4. Auditní log je nemazatelný (zadání ř. 162, zásada R5)
  --    RLS by to nezajistila - drží to odebrané právo DELETE.
  -- ---------------------------------------------------------------------------
  v_proslo := false;
  begin
    delete from public.audit_log where true;
    v_proslo := true;
  exception
    when insufficient_privilege or others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Podařilo se smazat z audit_log. Neměnnost auditu nedrží.';
  end if;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 5. Specialista CNC nevidí cizí role
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cnc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_pocet from public.uzivatel_role where uzivatel_id <> v_cnc;
  if v_pocet <> 0 then
    raise exception 'Specialista CNC vidí % cizích vazeb v uzivatel_role, očekává se 0.', v_pocet;
  end if;

  execute 'reset role';

  -- ===========================================================================
  -- Modul M1 - evidence zařízení
  -- ===========================================================================

  select t.id into v_typ_cnc
  from public.typ_zarizeni t
  where t.oblast_id = v_oblast_cnc
  limit 1;

  if v_typ_cnc is null then
    raise exception 'Chybí typy zařízení pro CNC. Spusťte nejdřív supabase/seed_cnc.sql';
  end if;

  -- Typ v cizí oblasti si test založí sám; seed pro strojní zatím není.
  insert into public.typ_zarizeni (oblast_id, kod, nazev)
  values (v_oblast_strojni, 'test_rls_strojni', 'Testovací typ')
  returning id into v_typ_strojni;

  -- ---------------------------------------------------------------------------
  -- 6. Garant oblasti smí založit zařízení ve své oblasti
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cnc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_proslo := false;
  begin
    insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev)
    values (v_oblast_cnc, v_typ_cnc, 'RLS test - stroj v CNC');
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if not v_proslo then
    raise exception 'Specialista CNC nedokázal založit zařízení ve vlastní oblasti. Politika zarizeni_insert je příliš přísná.';
  end if;

  -- ---------------------------------------------------------------------------
  -- 7. ...ale ne v cizí oblasti (zadání ř. 52)
  -- ---------------------------------------------------------------------------
  v_proslo := false;
  begin
    insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev)
    values (v_oblast_strojni, v_typ_strojni, 'RLS test - stroj ve strojní');
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Specialista CNC založil zařízení ve strojní oblasti. Politika zarizeni_insert nedrží.';
  end if;

  -- ---------------------------------------------------------------------------
  -- 8. Vlastní parametry se ověřují proti schématu typu
  --    (trigger zkontroluj_parametry_zarizeni z migrace 0003)
  -- ---------------------------------------------------------------------------
  v_proslo := false;
  begin
    insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, parametry)
    values (v_oblast_cnc, v_typ_cnc, 'RLS test - vymyšlený parametr',
            '{"neexistujici_parametr": 1}'::jsonb);
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Prošel parametr, který schéma typu nezná. Trigger nad parametry nedrží.';
  end if;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 9. Údržbář údržbu provádí, ale karty strojů nezakládá (matice kap. 3.1)
  --    Pozor: podle seedu JE garantem strojní oblasti. Samotné garantství proto
  --    stačit nesmí - o právu na evidenci rozhoduje i role.
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_udrzbar, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_proslo := false;
  begin
    insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev)
    values (v_oblast_strojni, v_typ_strojni, 'RLS test - údržbář zakládá');
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Údržbář založil zařízení. Politika zarizeni_insert nectí matici oprávnění.';
  end if;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 10. Specialista CNC nevidí zařízení cizí oblasti
  -- ---------------------------------------------------------------------------
  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev)
  values (v_oblast_strojni, v_typ_strojni, 'RLS test - cizí stroj');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_cnc, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_pocet
  from public.zarizeni
  where oblast_id <> v_oblast_cnc;

  if v_pocet <> 0 then
    raise exception 'Specialista CNC vidí % zařízení z cizích oblastí, očekává se 0.', v_pocet;
  end if;

  execute 'reset role';

  raise notice 'RLS test prošel: všech 10 kontrol v pořádku.';
end;
$$;

rollback;
