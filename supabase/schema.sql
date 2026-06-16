-- ============================================================
--  Схема БД для приложения «Кроссворды и сканворды» (Supabase / Postgres)
--  Запусти этот файл в Supabase → SQL Editor → New query.
-- ============================================================

-- ---------- Словарь (источник для генерации) ----------
create table if not exists public.words (
  id          bigint generated always as identity primary key,
  answer      text not null,
  clue        text not null,
  theme       text,
  length      int  generated always as (char_length(answer)) stored,
  difficulty  text default 'medium',
  created_at  timestamptz default now()
);
create index if not exists words_theme_idx  on public.words (theme);
create index if not exists words_length_idx on public.words (length);

-- ---------- Готовые пазлы (генерятся офлайн, раздаются клиенту) ----------
create table if not exists public.puzzles (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('crossword','scanword')),
  theme       text,
  difficulty  text,
  data        jsonb not null,            -- сетка, слова, вопросы
  created_at  timestamptz default now()
);
create index if not exists puzzles_type_idx  on public.puzzles (type);
create index if not exists puzzles_theme_idx on public.puzzles (theme);

-- ---------- Профили пользователей ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text,
  created_at  timestamptz default now()
);

-- ---------- Прогресс по пазлам (синхронизация между устройствами) ----------
create table if not exists public.progress (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  puzzle_id   uuid not null references public.puzzles (id) on delete cascade,
  filled      jsonb not null default '{}'::jsonb,   -- введённые буквы
  solved      boolean not null default false,
  updated_at  timestamptz default now(),
  unique (user_id, puzzle_id)
);
create index if not exists progress_user_idx on public.progress (user_id);

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.words    enable row level security;
alter table public.puzzles  enable row level security;
alter table public.profiles enable row level security;
alter table public.progress enable row level security;

-- словарь и пазлы — читают все (анонимно), пишет только сервисная роль (скрипт генерации)
drop policy if exists "words readable"   on public.words;
create policy "words readable"   on public.words   for select using (true);
drop policy if exists "puzzles readable" on public.puzzles;
create policy "puzzles readable" on public.puzzles for select using (true);

-- профиль — только свой
drop policy if exists "own profile select" on public.profiles;
create policy "own profile select" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own profile upsert" on public.profiles;
create policy "own profile upsert" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- прогресс — только свой
drop policy if exists "own progress all" on public.progress;
create policy "own progress all" on public.progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
--  Автосоздание профиля при регистрации
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();
