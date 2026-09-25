-- =============================================================================
-- 0005: pohledy (docs/NASAZENI.md, kolo R2)
--
-- Přepis pohledů z PostgreSQL (větev `supabase`): v_dnesni_plan, v_po_terminu
-- a v_plneni_matice z 0018, v_pripravenost_zarizeni z 0019, v_historie_zarizeni
-- z 0023. Stejná jména a sloupce - dotazy v src/lib/plneni, zarizeni a denik
-- se mění jen v tom, čím se volají.
--
-- `security_invoker = true` tu nemá obdobu, protože ji nepotřebuje: řádková
-- omezení SQL Serveru se uplatní vždy podle toho, KDO čte, i když čte přes
-- pohled. Specialista CNC tedy přes pohled celý podnik neuvidí - ověří test
-- práv v R3, protože porušení není vidět na číslech.
--
-- Počty jsou count() (int), ne count_big(): bigint chodí z ovladače jako text.
-- „Dnes" je dbo.dnes() v pražském čase (na Supabase byl current_date v UTC).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Dnešní plán a restance (dřív 0018)
--
-- Zakázka, ne jednotlivý úkon: zakázka je jedna cesta technika ke stroji.
-- Tolerance se do restancí schválně nepromítá - technik restanci vidí od
-- prvního dne po termínu; tolerance je věc výkazu plnění.
-- -----------------------------------------------------------------------------

create view dbo.v_dnesni_plan
as
select
  k.id                   as zakazka_id,
  k.zarizeni_id,
  z.oblast_id,
  z.nazev                as zarizeni_nazev,
  z.inventarni_cislo,
  k.planovany_termin,
  k.stav,
  k.prirazeno_uzivateli_id,
  k.profese_role_id,
  r.nazev                as profese_nazev,
  isnull(u.kroku, 0)     as kroku,
  isnull(u.vyrizeno, 0)  as vyrizeno
from dbo.zakazka k
join dbo.zarizeni z on z.id = k.zarizeni_id
join dbo.[role] r   on r.id = k.profese_role_id
outer apply (
  select count(*) as kroku,
         sum(iif(uk.stav <> N'nesplneno', 1, 0)) as vyrizeno
  from dbo.zakazka_ukon uk
  where uk.zakazka_id = k.id
) u
where k.stav in (N'naplanovano', N'probiha')
  and k.planovany_termin = dbo.dnes();
GO

create view dbo.v_po_terminu
as
select
  k.id                   as zakazka_id,
  k.zarizeni_id,
  z.oblast_id,
  z.nazev                as zarizeni_nazev,
  z.inventarni_cislo,
  k.planovany_termin,
  k.stav,
  k.prirazeno_uzivateli_id,
  k.profese_role_id,
  r.nazev                as profese_nazev,
  datediff(day, k.planovany_termin, dbo.dnes()) as dnu_zpozdeni,
  isnull(u.kroku, 0)     as kroku,
  isnull(u.vyrizeno, 0)  as vyrizeno
from dbo.zakazka k
join dbo.zarizeni z on z.id = k.zarizeni_id
join dbo.[role] r   on r.id = k.profese_role_id
outer apply (
  select count(*) as kroku,
         sum(iif(uk.stav <> N'nesplneno', 1, 0)) as vyrizeno
  from dbo.zakazka_ukon uk
  where uk.zakazka_id = k.id
) u
where k.stav in (N'naplanovano', N'probiha')
  and k.planovany_termin < dbo.dnes();
GO

-- -----------------------------------------------------------------------------
-- Plnění matice (dřív 0018, pravidla viz paměť „Výpočet plnění matice")
--
-- Jeden řádek na oblast a měsíc, počítá se po KROCÍCH. Období podle
-- plánovaného termínu. Splněno = krok 'splneno' potvrzený nejpozději v termínu
-- plus tolerance, den potvrzení v pražském čase. 'nelze_provest' se ze
-- jmenovatele vyřazuje. Zrušené zakázky a budoucí termíny se nepočítají.
-- -----------------------------------------------------------------------------

create view dbo.v_plneni_matice
as
select
  x.oblast_id,
  x.obdobi,
  sum(iif(x.stav <> N'nelze_provest', 1, 0))                 as celkem,
  sum(iif(x.stav = N'splneno' and x.vcas = 1, 1, 0))         as splneno,
  sum(iif(x.stav <> N'nelze_provest'
          and not (x.stav = N'splneno' and x.vcas = 1), 1, 0)) as po_terminu,
  sum(iif(x.stav = N'nelze_provest', 1, 0))                  as neprovedeno
from (
  select
    z.oblast_id,
    datefromparts(year(k.planovany_termin), month(k.planovany_termin), 1) as obdobi,
    u.stav,
    iif(u.potvrzeno_at is not null
        and cast(u.potvrzeno_at at time zone 'UTC' at time zone 'Central Europe Standard Time' as date)
            <= dateadd(day, u.tolerance_dny_snapshot, k.planovany_termin), 1, 0) as vcas
  from dbo.zakazka_ukon u
  join dbo.zakazka k  on k.id = u.zakazka_id
  join dbo.zarizeni z on z.id = k.zarizeni_id
  where k.stav <> N'zruseno'
    and k.planovany_termin <= dbo.dnes()
) x
group by x.oblast_id, x.obdobi;
GO

-- -----------------------------------------------------------------------------
-- Připravenost plánu stroje (dřív 0019)
--
-- Jen stroje v provozu (rozhodnutí 20. 8. 2026). Pořadí větví je pořadí
-- naléhavosti. OUTER APPLY místo dvou joinů: stroj může mít víc šablon a přímý
-- join by řádky plánu vynásobil.
-- -----------------------------------------------------------------------------

create view dbo.v_pripravenost_zarizeni
as
select
  z.id           as zarizeni_id,
  z.oblast_id,
  sab.pocet      as sablon,
  pl.celkem      as ukonu_celkem,
  pl.bez_terminu as ukonu_bez_terminu,
  case
    when sab.pocet = 0      then N'bez_sablony'
    when pl.celkem = 0      then N'bez_ukonu'
    when pl.bez_terminu > 0 then N'bez_terminu'
    else N'ok'
  end as stav_planu
from dbo.zarizeni z
outer apply (
  select count(*) as pocet
  from dbo.zarizeni_sablona zs
  where zs.zarizeni_id = z.id
) sab
outer apply (
  select count(*) as celkem,
         isnull(sum(iif(p.dalsi_termin is null, 1, 0)), 0) as bez_terminu
  from dbo.plan_udrzby p
  -- Neaktivní úkon garant z matice vyřadil; chybějící termín u něj nevadí.
  where p.zarizeni_id = z.id and p.aktivni = 1
) pl
where z.stav = N'v_provozu';
GO

-- -----------------------------------------------------------------------------
-- Historie zařízení (dřív 0023)
--
-- Jediné místo, kde se potkává plán a deník - a jen při čtení (R4). Jen
-- DOKONČENÉ zakázky: otevřená patří do plánu, zrušená se nestala. Zásah
-- z deníku nemá checklist, proto NULL místo nuly. Pořadí určuje dotaz.
-- -----------------------------------------------------------------------------

create view dbo.v_historie_zarizeni
as
select
  N'udrzba'          as puvod,
  k.id               as zaznam_id,
  k.zarizeni_id,
  z.oblast_id,
  k.dokonceno_at     as kdy,
  s.nazev            as nazev,
  k.poznamka         as popis,
  k.dokoncil_id      as provedl_id,
  cast(null as uniqueidentifier) as zapsal_id,
  cast(null as int)  as doba_trvani_min,
  u.celkem           as ukonu_celkem,
  u.splneno          as ukonu_splneno,
  u.neprovedeno      as ukonu_neprovedeno,
  f.pocet            as fotek
from dbo.zakazka k
join dbo.zarizeni z      on z.id = k.zarizeni_id
join dbo.sablona_verze v on v.id = k.sablona_verze_id
join dbo.sablona s       on s.id = v.sablona_id
outer apply (
  select count(*) as celkem,
         isnull(sum(iif(uk.stav = N'splneno', 1, 0)), 0)       as splneno,
         isnull(sum(iif(uk.stav = N'nelze_provest', 1, 0)), 0) as neprovedeno
  from dbo.zakazka_ukon uk
  where uk.zakazka_id = k.id
) u
outer apply (
  select count(*) as pocet
  from dbo.zakazka_foto zf
  join dbo.zakazka_ukon uk on uk.id = zf.zakazka_ukon_id
  where uk.zakazka_id = k.id
) f
where k.stav = N'dokonceno'

union all

select
  N'denik'           as puvod,
  d.id               as zaznam_id,
  d.zarizeni_id,
  d.oblast_id,
  d.provedeno_at     as kdy,
  dz.nazev           as nazev,
  d.popis            as popis,
  d.provedl_id,
  d.zapsal_id,
  d.doba_trvani_min,
  cast(null as int)  as ukonu_celkem,
  cast(null as int)  as ukonu_splneno,
  cast(null as int)  as ukonu_neprovedeno,
  fd.pocet           as fotek
from dbo.provozni_denik d
join dbo.druh_zasahu dz on dz.id = d.druh_zasahu_id
outer apply (
  select count(*) as pocet
  from dbo.denik_foto df
  where df.zaznam_id = d.id
) fd;
GO

-- -----------------------------------------------------------------------------
-- Role a oblasti osob (náhrada politik uzivatel_role_select / uzivatel_oblast_select
-- z PostgreSQL 0001)
--
-- Tabulky uzivatel_role a uzivatel_oblast nemají řádkový filtr: čtou je pomocné
-- funkce oprávnění (ma_roli, ma_pristup_k_oblasti), které volají predikáty
-- všech ostatních tabulek, a filtr nad nimi by se zacyklil (predikát -> ma_roli
-- -> tatáž tabulka -> predikát). Aplikace proto na tabulky nemá právo (R3)
-- a čte přes tyhle pohledy se stejným pravidlem jako dřív: vlastní řádky,
-- administrátor, vedoucí údržby a management všechny. Zapisuje procedurami
-- nastav_role_osoby a nastav_oblasti_osoby (0004).
-- -----------------------------------------------------------------------------

create view dbo.v_uzivatel_role
as
select ur.uzivatel_id, ur.role_id
from dbo.uzivatel_role ur
where is_member(N'db_owner') = 1
   or ur.uzivatel_id = dbo.aktualni_uzivatel()
   or dbo.ma_roli(N'administrator') = 1
   or dbo.ma_roli(N'vedouci_udrzby') = 1
   or dbo.ma_roli(N'management') = 1;
GO

create view dbo.v_uzivatel_oblast
as
select uo.uzivatel_id, uo.oblast_id, uo.vztah
from dbo.uzivatel_oblast uo
where is_member(N'db_owner') = 1
   or uo.uzivatel_id = dbo.aktualni_uzivatel()
   or dbo.ma_roli(N'administrator') = 1
   or dbo.ma_roli(N'vedouci_udrzby') = 1
   or dbo.ma_roli(N'management') = 1;
GO
