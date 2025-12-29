-- 示例数据（可选）
-- 执行此文件可以插入一些测试数据

-- 插入分类
insert into public.categories (name, sort_order, enabled) values
  ('威士忌', 1, true),
  ('鸡尾酒', 2, true),
  ('啤酒', 3, true),
  ('红酒', 4, true)
on conflict do nothing;

-- 获取分类 ID（需要根据实际情况调整）
-- 插入酒品（需要先获取分类 ID）
-- 注意：以下示例需要根据实际插入的分类 ID 进行调整

-- 示例：插入威士忌类酒品
-- insert into public.drinks (category_id, name, price, sort_order, enabled)
-- select 
--   c.id,
--   '麦卡伦 12年',
--   88.00,
--   1,
--   true
-- from public.categories c
-- where c.name = '威士忌'
-- limit 1;

-- 更多示例数据可以根据需要添加

