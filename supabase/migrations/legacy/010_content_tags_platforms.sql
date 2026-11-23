-- 010_content_tags_platforms: phân tích hashtag (mã SP / tuyến / concept / nhân sự), follows,
-- và hạ tầng cho YouTube / TikTok / Instagram. Chạy trên project fb-traffic, SAU 009. Chạy lại vẫn an toàn.

-- ---------- Nền tảng: thêm youtube, tiktok ----------
alter table accounts drop constraint if exists accounts_platform_check;
alter table accounts add constraint accounts_platform_check check (platform in ('facebook', 'instagram', 'youtube', 'tiktok'));
alter table accounts add column if not exists followers_count bigint;          -- tổng người theo dõi hiện tại
alter table accounts add column if not exists staff_code text;                  -- (sau này) kênh thuộc nhân sự nào

-- ---------- Bài đăng: các trường tách từ hashtag (tính lúc đồng bộ) ----------
alter table posts add column if not exists platform      text not null default 'facebook';
alter table posts add column if not exists product_codes text[] not null default '{}';  -- CHỈ mã có trên Sapo hoặc đã khai báo R&D
alter table posts add column if not exists unknown_codes text[] not null default '{}';  -- tag dạng mã nhưng chưa ai khai báo
alter table posts add column if not exists content_line  text;   -- 'A1'…'A5' từ #a1…#a5
alter table posts add column if not exists concept       text check (concept in ('old', 'new'));  -- #C = cũ, #M = mới
alter table posts add column if not exists staff_code    text;   -- 'K301' từ #K301
create index if not exists posts_product_codes_idx on posts using gin (product_codes);
create index if not exists posts_unknown_codes_idx on posts using gin (unknown_codes);
create index if not exists posts_created_idx on posts (created_time desc);

-- ---------- Cài đặt chung dạng key/value (quy ước hashtag, bảng chữ cái loại hàng…) ----------
create table if not exists app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;

insert into app_settings (key, value) values
  ('hashtag_rules', '{
     "staff_pattern": "^k[0-9]{3}$",
     "line_pattern": "^a[1-5]$",
     "concept": {"c": "old", "m": "new"}
   }'::jsonb),
  ('category_prefix', '{
     "M": "Mặt dây", "D": "Dây chuyền", "N": "Nhẫn", "L": "Lắc", "K": "Kiềng",
     "B": "Bông tai", "C": "Charm", "Q": "Đá quý"
   }'::jsonb)
on conflict (key) do nothing;

-- ---------- product_report dùng mã đã nhận diện (thay regex cũ, tránh nhầm #K301 là mã SP) ----------
create or replace function product_codes(tags text[])
returns text[] language sql stable set search_path = public as $$
  select coalesce(array_agg(distinct upper(t)), '{}')
  from unnest(tags) t
  where t ~ '^[a-z]{1,4}[0-9]{3,}$'
    and (exists (select 1 from products p where p.product_code = upper(t))
         or exists (select 1 from rnd_products r where r.code = upper(t) or r.sapo_code = upper(t)))
$$;

notify pgrst, 'reload schema';
