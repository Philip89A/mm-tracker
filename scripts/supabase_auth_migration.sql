-- Schritt 1: Multi-User-Umbau mit Row Level Security
-- Im Supabase SQL Editor ausführen: Dashboard -> SQL Editor -> New query -> einfügen -> Run
--
-- WICHTIG: Das löscht alle bisherigen Testdaten in mm_store unwiderruflich
-- (du trägst deine echten Werte danach ohnehin neu ein). Wenn du sie doch
-- behalten willst, sag Bescheid BEVOR du das ausführst.

truncate table mm_store;

-- Alte, offene Policy entfernen (falls noch vorhanden)
drop policy if exists "anon full access" on mm_store;

-- user_id-Spalte: verweist auf den eingeloggten Auth-User, füllt sich
-- beim Insert automatisch selbst (default auth.uid())
alter table mm_store add column if not exists user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;

-- Primärschlüssel von "key" auf "(user_id, key)" umstellen, damit jeder
-- Nutzer eigene Zeilen pro Datentyp (baseline, trips, ...) hat
alter table mm_store drop constraint if exists mm_store_pkey;
alter table mm_store add primary key (user_id, key);

-- RLS aktivieren und NUR eingeloggten Nutzern Zugriff auf ihre eigenen
-- Zeilen erlauben. Kein Zugriff für anon (nicht eingeloggt), keine Ausnahmen.
alter table mm_store enable row level security;

create policy "select own rows" on mm_store
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "insert own rows" on mm_store
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "update own rows" on mm_store
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own rows" on mm_store
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Defense in depth: dem anon-Grant explizit alle Rechte entziehen, damit
-- selbst bei einer künftigen Fehlkonfiguration der Policies kein anonymer
-- Zugriff möglich ist.
revoke all on mm_store from anon;

-- Verifikation (Ergebnis sollte "true" zeigen):
select tablename, rowsecurity from pg_tables where tablename = 'mm_store';
