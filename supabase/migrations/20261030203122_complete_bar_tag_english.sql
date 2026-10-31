UPDATE public.bar_tag_definitions
SET label_en = 'Open 24 hours', category_en = 'Amenities'
WHERE key = 'open_24_hours'
  AND (nullif(trim(label_en), '') IS NULL OR nullif(trim(category_en), '') IS NULL);
