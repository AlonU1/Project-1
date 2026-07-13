-- הרץ ב-Supabase → SQL Editor
create table if not exists kv (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- הרשאות: לגישה פשוטה ומשותפת (כל מי שיש לו את הקישור והמפתח יכול לקרוא/לכתוב)
alter table kv enable row level security;

create policy "read all"  on kv for select using (true);
create policy "write all" on kv for insert with check (true);
create policy "update all" on kv for update using (true);
create policy "delete all" on kv for delete using (true);
-- הערה: זו הגדרה פתוחה המתאימה לכלי פנימי. לאבטחה אמיתית הוסף Auth והחלף את הפוליסות.
