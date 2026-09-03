-- Add a 24-hour opening option to the bar tag catalog.

INSERT INTO public.bar_tag_definitions (key, label_zh, category, sort_order)
VALUES ('open_24_hours', '24小时营业', '设施', 75)
ON CONFLICT (key) DO UPDATE SET
  label_zh = EXCLUDED.label_zh,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order;
