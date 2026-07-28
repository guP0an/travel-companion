alter table public.expenses
  add column if not exists itinerary_id uuid references public.itineraries (id) on delete set null;

create index if not exists expenses_user_itinerary_idx
  on public.expenses (user_id, itinerary_id, created_at desc);
