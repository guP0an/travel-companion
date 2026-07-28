-- 丸玩 · 打卡照片云存储（Supabase Storage）
-- 在 Supabase 控制台 → SQL Editor 整段粘贴运行一次。
-- 也可在 Dashboard → Storage → New bucket 手动建：名字 checkin-photos，勾选 Public。

-- 1) 建公共桶（公开读，便于直接用 publicUrl 显示照片）
insert into storage.buckets (id, name, public)
values ('checkin-photos', 'checkin-photos', true)
on conflict (id) do nothing;

-- 2) 任何人可读（照片是公开 URL）
drop policy if exists "checkin photos public read" on storage.objects;
create policy "checkin photos public read" on storage.objects
  for select using (bucket_id = 'checkin-photos');

-- 3) 登录用户只能写自己 uid 开头的目录（路径形如 <uid>/xxx.jpg）
drop policy if exists "checkin photos own write" on storage.objects;
create policy "checkin photos own write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'checkin-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "checkin photos own delete" on storage.objects;
create policy "checkin photos own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'checkin-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 账本凭证使用私有桶，只允许当前用户通过签名链接查看自己的图片。
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
