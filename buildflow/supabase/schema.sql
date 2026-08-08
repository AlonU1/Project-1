-- ============================================================
-- BuildFlow — סכמת סנכרון ל-Supabase
-- מריצים פעם אחת: Supabase Dashboard → SQL Editor → New query →
-- הדבקה → Run. בטוח להרצה חוזרת (idempotent).
--
-- כל טבלאות BuildFlow מאוחסנות במאגר שורות גנרי אחד (bf_rows)
-- עם קידומת bf_ — אפס התנגשות עם טבלאות קיימות בפרויקט.
-- ============================================================

-- מאגר השורות המסונכרן
create table if not exists public.bf_rows (
  tbl        text not null,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tbl, id)
);

create index if not exists bf_rows_updated_idx on public.bf_rows (updated_at);

-- אבטחה: פתוח ל-anon (רמת דמו!). כשנוסיף התחברות אמיתית —
-- הפוליסות האלה יוחלפו בפוליסות לפי משתמש.
alter table public.bf_rows enable row level security;

drop policy if exists bf_rows_demo_all on public.bf_rows;
create policy bf_rows_demo_all on public.bf_rows
  for all using (true) with check (true);

-- Realtime — כדי שמכשיר אחד יראה שינויים של אחר מיידית
do $$
begin
  alter publication supabase_realtime add table public.bf_rows;
exception
  when duplicate_object then null;
end $$;

-- אחסון תמונות ותוכניות — bucket ציבורי נפרד
insert into storage.buckets (id, name, public)
values ('buildflow', 'buildflow', true)
on conflict (id) do nothing;

drop policy if exists bf_storage_read on storage.objects;
create policy bf_storage_read on storage.objects
  for select using (bucket_id = 'buildflow');

drop policy if exists bf_storage_insert on storage.objects;
create policy bf_storage_insert on storage.objects
  for insert with check (bucket_id = 'buildflow');

drop policy if exists bf_storage_update on storage.objects;
create policy bf_storage_update on storage.objects
  for update using (bucket_id = 'buildflow');

-- סיום. אמור להופיע "Success. No rows returned".
