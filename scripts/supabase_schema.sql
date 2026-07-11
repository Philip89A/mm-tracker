-- Einmalig im Supabase SQL Editor ausführen (Dashboard -> SQL Editor -> New query)

create table if not exists mm_store (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table mm_store enable row level security;

-- Kein Login: der anon key darf hier lesen/schreiben. Das ist bewusst offen,
-- weil die App komplett ohne Auth läuft (siehe Sicherheitshinweis im Chat).
create policy "anon full access" on mm_store
  for all
  to anon
  using (true)
  with check (true);
