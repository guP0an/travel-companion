-- 丸玩 · 为现有线上项目增加账本凭证
-- Supabase Dashboard -> SQL Editor -> New query，整段运行一次。

alter table public.expenses
  add column if not exists receipt_paths text[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do update set public = false;

drop policy if exists "expense receipts own read" on storage.objects;
create policy "expense receipts own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "expense receipts own write" on storage.objects;
create policy "expense receipts own write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "expense receipts own delete" on storage.objects;
create policy "expense receipts own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
