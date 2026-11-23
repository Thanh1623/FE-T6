-- 009_confirm_handoff: R&D xác nhận kết quả + chuyển mẫu WIN sang Sao Biển
-- Chạy trên project fb-traffic, SAU 008. Chạy lại nhiều lần vẫn an toàn.

-- Kết quả R&D xác nhận (hệ thống chỉ đề xuất trong product_evaluations; số liệu chụp lại lúc xác nhận)
alter table rnd_products add column if not exists confirmed_result   text check (confirmed_result in ('win', 'win_traffic', 'fail'));
alter table rnd_products add column if not exists confirmed_note     text;
alter table rnd_products add column if not exists confirmed_by       uuid references profiles(id);
alter table rnd_products add column if not exists confirmed_at       timestamptz;
alter table rnd_products add column if not exists confirmed_snapshot jsonb;   -- {suggested, metrics, checks, window...}

-- ---------- Chuyển giao sang Sao Biển ----------
-- status: pending (chờ tiếp nhận) → received → developing → done; hoặc returned (trả lại R&D)
create table if not exists handoffs (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references rnd_products(id) on delete cascade,
  result        text not null check (result in ('win', 'win_traffic')),
  snapshot      jsonb not null,               -- số liệu thị trường lúc chuyển
  source_url    text not null,                -- link kho Source quay chế tác (chụp lại lúc chuyển)
  rnd_note      text,
  status        text not null default 'pending' check (status in ('pending', 'received', 'developing', 'done', 'returned')),
  assignee_id   uuid references profiles(id), -- người Sao Biển tiếp nhận
  saobien_note  text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  received_at   timestamptz,
  done_at       timestamptz,
  updated_at    timestamptz not null default now()
);
-- Mỗi mẫu chỉ 1 lần chuyển đang mở (đã trả lại thì được chuyển lần nữa)
create unique index if not exists handoffs_one_open on handoffs (product_id) where status <> 'returned';
create index if not exists handoffs_status_idx on handoffs (status, created_at desc);
alter table handoffs enable row level security;

create table if not exists handoff_events (
  id          bigint generated always as identity primary key,
  handoff_id  uuid not null references handoffs(id) on delete cascade,
  actor_id    uuid references profiles(id),
  action      text not null,       -- created / received / developing / done / returned / cancelled / note
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists handoff_events_idx on handoff_events (handoff_id, created_at);
alter table handoff_events enable row level security;

notify pgrst, 'reload schema';
