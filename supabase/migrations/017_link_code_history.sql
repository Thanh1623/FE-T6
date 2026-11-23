-- 017: Gắn SKU cho mẫu R&D — giữ "lịch sử mã" thay vì nhận luôn kết luận cũ.
-- Chạy trên project fb-traffic, SAU 016. Chạy lại vẫn an toàn.
--
-- Trước: gắn mã D0008 cho mẫu mới → link_code() chuyển MỌI kết luận / phiên test / bàn giao của mẫu tự động D0008
--        (kể cả FAIL từ tháng trước) sang mẫu mới → mẫu mới hiện như đã duyệt dù chưa test.
-- Sau:  chỉ chuyển dữ liệu phát sinh TỪ NGÀY SƯU TẦM của mẫu R&D (VD video đăng trước khi kịp gắn mã).
--        Dữ liệu cũ hơn ở lại mẫu tự động, mẫu này bỏ mã và thành "lịch sử mã" (archived_code, merged_into).

alter table rnd.products
  add column if not exists archived_code text,                                                  -- mã cũ của mẫu lưu trữ
  add column if not exists merged_into   uuid references rnd.products(id) on delete set null;   -- mẫu R&D đã nhận mã
create index if not exists products_merged_idx on rnd.products (merged_into) where merged_into is not null;

create or replace function rnd.link_code(p_id uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o record;
  v_from timestamptz;
begin
  select id, stage into o from rnd.products where code = p_code and id <> p_id;
  if o.id is not null then
    if o.stage is not null then raise exception 'Mã % đã gắn với một mẫu R&D khác', p_code; end if;

    -- Mốc = 0h ngày sưu tầm (giờ VN) của mẫu R&D — giống trafficFrom() bên app
    select (date_trunc('day', created_at at time zone 'Asia/Ho_Chi_Minh')) at time zone 'Asia/Ho_Chi_Minh'
      into v_from from rnd.products where id = p_id;

    update rnd.test_sessions  set product_id = p_id where product_id = o.id and created_at >= v_from;
    update rnd.decisions      set product_id = p_id where product_id = o.id and decided_at >= v_from;
    update rnd.handoffs       set product_id = p_id where product_id = o.id and created_at >= v_from;
    update rnd.product_events set product_id = p_id where product_id = o.id and created_at >= v_from;
    update rnd.evaluations    set product_id = p_id where product_id = o.id;   -- app chấm lại theo mốc sưu tầm
    update rnd.products t set
      sapo_code = coalesce(t.sapo_code, x.sapo_code), source_url = coalesce(t.source_url, x.source_url),
      image_paths = t.image_paths || x.image_paths
    from rnd.products x where t.id = p_id and x.id = o.id;

    if exists (select 1 from rnd.decisions where product_id = o.id)
       or exists (select 1 from rnd.test_sessions where product_id = o.id)
       or exists (select 1 from rnd.handoffs where product_id = o.id) then
      -- Còn kết luận / phiên / bàn giao cũ → giữ làm lịch sử mã (bỏ mã để mẫu R&D nhận)
      update rnd.products set archived_code = p_code, code = null, merged_into = p_id, status = 'ended' where id = o.id;
    else
      update rnd.product_events set product_id = p_id where product_id = o.id;   -- nhật ký cũ (nếu có) vẫn giữ
      delete from rnd.products where id = o.id;
    end if;
  end if;
  update rnd.products set code = p_code where id = p_id;
end $$;

revoke execute on function rnd.link_code(uuid, text) from public, anon, authenticated;
grant execute on function rnd.link_code(uuid, text) to service_role;

notify pgrst, 'reload schema';
