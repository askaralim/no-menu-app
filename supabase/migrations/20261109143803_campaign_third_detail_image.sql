ALTER TABLE public.campaign_events
  DROP CONSTRAINT campaign_events_detail_images_check,
  ADD CONSTRAINT campaign_events_detail_images_check
    CHECK (coalesce(cardinality(detail_image_urls), 0) <= 3);
