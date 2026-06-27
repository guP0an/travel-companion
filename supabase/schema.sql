-- 丸丸 · Supabase 表结构 + 行级安全(RLS)
-- 在 Supabase 控制台 → SQL Editor 里整段粘贴运行一次即可。
-- 对齐 docs/04-architecture-and-data-model.md §7。

-- 用户资料 / 偏好（越用越懂你的沉淀位）
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text,
  voice_ready boolean default false,
  created_at  timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- 行程（替代 localStorage，跨设备）
create table if not exists public.itineraries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  meta       jsonb not null,          -- ItineraryMeta
  plan       jsonb not null,          -- 完整 Itinerary
  created_at timestamptz default now()
);
alter table public.itineraries enable row level security;
drop policy if exists "own itineraries" on public.itineraries;
create policy "own itineraries" on public.itineraries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists itineraries_user_created_idx
  on public.itineraries (user_id, created_at desc);

-- 账本：消费记录（可关联某趟行程）
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  itinerary_id uuid references public.itineraries (id) on delete set null,
  category     text not null default '其他',
  amount       numeric not null default 0,
  note         text default '',
  spent_at     date,
  created_at   timestamptz default now()
);
alter table public.expenses enable row level security;
drop policy if exists "own expenses" on public.expenses;
create policy "own expenses" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists expenses_user_idx on public.expenses (user_id, created_at desc);

-- 景点打卡：打卡/评分/评论/照片
create table if not exists public.checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  spot       text not null,            -- 城市+景点名，作为 key
  rating     int,                      -- 1-5 星
  review     text default '',
  photos     text[] default '{}',      -- 照片 URL（接 Supabase Storage 后填）
  checked_at timestamptz,              -- 打卡时间
  created_at timestamptz default now(),
  unique (user_id, spot)
);
alter table public.checkins enable row level security;
drop policy if exists "own checkins" on public.checkins;
create policy "own checkins" on public.checkins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 注册时自动建 profile（可选，但推荐）
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
