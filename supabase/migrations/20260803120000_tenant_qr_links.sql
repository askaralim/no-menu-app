-- Permanent venue QR links for POS read-only download.
-- Source snapshot: taplist-web/config/qr-links.json (30 entries).
-- Codes are permanent: never reuse; no POS regenerate RPC.
-- Apply on an environment that already contains these tenants (e.g. production).

CREATE TABLE IF NOT EXISTS public.tenant_qr_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  qr_code text NOT NULL,
  tenant_slug text NOT NULL,
  placement text NOT NULL DEFAULT 'venue',
  version integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  label text,
  image_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_qr_links_qr_code_format CHECK (qr_code ~ '^[A-Z2-7]{8}$'),
  CONSTRAINT tenant_qr_links_qr_code_unique UNIQUE (qr_code),
  CONSTRAINT tenant_qr_links_version_positive CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_qr_links_tenant_placement_enabled_uidx
  ON public.tenant_qr_links (tenant_id, placement)
  WHERE enabled;

ALTER TABLE public.tenant_qr_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_qr_links FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read-only RPC for POS (owner / staff / super_admin of the tenant)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_tenant_qr(
  p_tenant_id uuid,
  p_placement text DEFAULT 'venue'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_placement text;
  v_row public.tenant_qr_links%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  IF NOT public.taplist_can_view_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'Forbidden: not a member of this tenant';
  END IF;

  v_placement := lower(trim(coalesce(p_placement, 'venue')));
  IF v_placement = '' THEN
    v_placement := 'venue';
  END IF;

  SELECT *
  INTO v_row
  FROM public.tenant_qr_links q
  WHERE q.tenant_id = p_tenant_id
    AND q.placement = v_placement
    AND q.enabled = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'qr_code', v_row.qr_code,
    'short_url', 'https://nomenuapp.com/q/' || v_row.qr_code,
    'image_path', v_row.image_path,
    'placement', v_row.placement,
    'version', v_row.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_tenant_qr(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_qr(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Import existing permanent codes (conflict / missing tenant = hard fail)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_conflict text;
  v_missing text;
  v_count integer;
BEGIN
  SELECT string_agg(missing_id::text, ', ' ORDER BY missing_id::text)
  INTO v_missing
  FROM (
    SELECT unnest(ARRAY['00234890-ee30-4985-992d-98ab8ce1d5de'::uuid, '13b6f277-ab0d-4c19-ba8a-d97a5af9f51d'::uuid, '1ad70c94-b4b7-4fc4-bab3-7c58f19fda10'::uuid, '1cff208a-4424-4867-966d-a7839ac59f6f'::uuid, '26597d55-8a12-4185-b3ef-cb9a3ac1773a'::uuid, '27c1beca-c912-4f4a-bee5-3ccf0e5d981f'::uuid, '283206e3-22d9-4a54-b8a5-70694b1ec062'::uuid, '2c191730-69f6-4031-8256-91aa59e5bc52'::uuid, '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'::uuid, '44a4429c-fb70-47a5-923b-370fce8f167e'::uuid, '487685c5-99f1-463c-9e19-9eeea1cf6699'::uuid, '494bcf1f-8346-480f-a396-204b104c9313'::uuid, '4d1da7d9-8b21-4706-b535-355b9ff79388'::uuid, '4fd2c4f1-ad4a-4fbe-b7c8-e279ca0c55bb'::uuid, '57d005da-1193-4bd2-955a-ef6b9653516d'::uuid, '6ddcffa2-6d35-4bf2-a723-bbe35cc55065'::uuid, '7aa1147c-5c8b-4c68-bc11-56ce34608689'::uuid, '7cce9b27-acd5-4bdc-a302-153c8245a1c1'::uuid, '81a90487-39c9-46bb-b221-68ff631275d6'::uuid, '82bf1237-e90c-4379-a2bc-a6dad2726b93'::uuid, '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'::uuid, '865af2b3-6cc0-4be0-ac14-c0f93a781907'::uuid, 'a4f4002f-fccd-41dd-bbc5-153d30fc5385'::uuid, 'a7c25410-3fcd-46b6-a11e-7fe1c0ed5d53'::uuid, 'b4c33fea-51e3-426d-9dfa-b13947153ac2'::uuid, 'c3af90db-9734-4750-927c-38f6b37fb3e0'::uuid, 'ca86eec7-641e-46e8-b95a-fda668ef072f'::uuid, 'd897a73b-37fb-4c57-af0f-79d8759173cb'::uuid, 'da21ab4e-93f7-49ca-8318-15fcbae24a93'::uuid, 'de4207d0-d3c8-455a-8450-0d5b3e846ff0'::uuid]) AS missing_id
  ) s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tenants t WHERE t.id = s.missing_id
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_qr_links import: missing tenants in public.tenants: %', v_missing;
  END IF;

  SELECT q.qr_code
  INTO v_conflict
  FROM public.tenant_qr_links q
  WHERE q.qr_code IN ('R6N3V7DX', 'JTKYQM4W', 'L7WYX2KW', 'K7M4Q2ZT', 'QZ3MI73Q', 'KFRNVQB7', 'CAZXYZB3', 'H5BC45YV', 'IEFGFYBB', 'EEJDZHQX', '62LC4NPU', 'NMIJEJL7', 'MYYCUEQQ', 'GGYBZWOS', 'VZRDE4PS', '63DHV5UV', 'UFZRGLTL', '2NKB2JP5', '7PNTLOK5', 'FNYJXSXQ', 'VVUROT25', '64YDJDL7', 'PYNSLXVO', 'LFCCKZWU', 'Z4I3HEW7', 'LDDXRHOR', 'MZCBI42S', 'EF7UONQI', 'SZEQYSW3', 'IIHSRXF5')
    AND NOT EXISTS (
      SELECT 1
      FROM (
        VALUES
  ('R6N3V7DX', '4d1da7d9-8b21-4706-b535-355b9ff79388'::uuid, '062', 'venue', 1, true, '2062', '4d1da7d9-8b21-4706-b535-355b9ff79388/qr/no-menu-qr-062-R6N3V7DX.png'),
  ('JTKYQM4W', 'a4f4002f-fccd-41dd-bbc5-153d30fc5385'::uuid, 'ask', 'venue', 1, true, '問·ASK', 'a4f4002f-fccd-41dd-bbc5-153d30fc5385/qr/no-menu-qr-ask-JTKYQM4W.png'),
  ('L7WYX2KW', '26597d55-8a12-4185-b3ef-cb9a3ac1773a'::uuid, 'beer-garret', 'venue', 1, true, '亭子间 Beer Garret', '26597d55-8a12-4185-b3ef-cb9a3ac1773a/qr/no-menu-qr-beer-garret-L7WYX2KW.png'),
  ('K7M4Q2ZT', '27c1beca-c912-4f4a-bee5-3ccf0e5d981f'::uuid, 'beer-wave', 'venue', 1, true, '造浪 BEER WAVE', '27c1beca-c912-4f4a-bee5-3ccf0e5d981f/qr/no-menu-qr-beer-wave-K7M4Q2ZT.png'),
  ('QZ3MI73Q', '44a4429c-fb70-47a5-923b-370fce8f167e'::uuid, 'breno', 'venue', 1, true, 'Breno', '44a4429c-fb70-47a5-923b-370fce8f167e/qr/no-menu-qr-breno-QZ3MI73Q.png'),
  ('KFRNVQB7', '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'::uuid, 'catfish', 'venue', 1, true, 'Catfish', '831db2a1-ee47-4d88-9c0b-3e19a5668d6d/qr/no-menu-qr-catfish-KFRNVQB7.png'),
  ('CAZXYZB3', '13b6f277-ab0d-4c19-ba8a-d97a5af9f51d'::uuid, 'come-out', 'venue', 1, true, 'COME OUT', '13b6f277-ab0d-4c19-ba8a-d97a5af9f51d/qr/no-menu-qr-come-out-CAZXYZB3.png'),
  ('H5BC45YV', '57d005da-1193-4bd2-955a-ef6b9653516d'::uuid, 'cozy-sea', 'venue', 1, true, '懒海 · 苏州河', '57d005da-1193-4bd2-955a-ef6b9653516d/qr/no-menu-qr-cozy-sea-H5BC45YV.png'),
  ('IEFGFYBB', '7aa1147c-5c8b-4c68-bc11-56ce34608689'::uuid, 'cozysea-1', 'venue', 1, true, '懒海 · 瑞金二路', '7aa1147c-5c8b-4c68-bc11-56ce34608689/qr/no-menu-qr-cozysea-1-IEFGFYBB.png'),
  ('EEJDZHQX', '2c191730-69f6-4031-8256-91aa59e5bc52'::uuid, 'drunken-night', 'venue', 1, true, '酒宵 Drunken Night', '2c191730-69f6-4031-8256-91aa59e5bc52/qr/no-menu-qr-drunken-night-EEJDZHQX.png'),
  ('62LC4NPU', 'de4207d0-d3c8-455a-8450-0d5b3e846ff0'::uuid, 'empty-cup', 'venue', 1, true, 'Empty Cup 空杯', 'de4207d0-d3c8-455a-8450-0d5b3e846ff0/qr/no-menu-qr-empty-cup-62LC4NPU.png'),
  ('NMIJEJL7', 'c3af90db-9734-4750-927c-38f6b37fb3e0'::uuid, 'farside', 'venue', 1, true, 'Farside 月之暗面', 'c3af90db-9734-4750-927c-38f6b37fb3e0/qr/no-menu-qr-farside-NMIJEJL7.png'),
  ('MYYCUEQQ', '82bf1237-e90c-4379-a2bc-a6dad2726b93'::uuid, 'finebar', 'venue', 1, true, 'Fine Bar', '82bf1237-e90c-4379-a2bc-a6dad2726b93/qr/no-menu-qr-finebar-MYYCUEQQ.png'),
  ('GGYBZWOS', '283206e3-22d9-4a54-b8a5-70694b1ec062'::uuid, 'geer', 'venue', 1, true, 'GEER 嗝 · 武夷路', '283206e3-22d9-4a54-b8a5-70694b1ec062/qr/no-menu-qr-geer-GGYBZWOS.png'),
  ('VZRDE4PS', '7cce9b27-acd5-4bdc-a302-153c8245a1c1'::uuid, 'geer2', 'venue', 1, true, 'GEER 嗝 · 浦东', '7cce9b27-acd5-4bdc-a302-153c8245a1c1/qr/no-menu-qr-geer2-VZRDE4PS.png'),
  ('63DHV5UV', '487685c5-99f1-463c-9e19-9eeea1cf6699'::uuid, 'juye', 'venue', 1, true, '聚野', '487685c5-99f1-463c-9e19-9eeea1cf6699/qr/no-menu-qr-juye-63DHV5UV.png'),
  ('UFZRGLTL', 'da21ab4e-93f7-49ca-8318-15fcbae24a93'::uuid, 'lanpigu', 'venue', 1, true, '蓝啤古', 'da21ab4e-93f7-49ca-8318-15fcbae24a93/qr/no-menu-qr-lanpigu-UFZRGLTL.png'),
  ('2NKB2JP5', '494bcf1f-8346-480f-a396-204b104c9313'::uuid, 'liquids-tag', 'venue', 1, true, 'Liquid''s Tag', '494bcf1f-8346-480f-a396-204b104c9313/qr/no-menu-qr-liquids-tag-2NKB2JP5.png'),
  ('7PNTLOK5', '81a90487-39c9-46bb-b221-68ff631275d6'::uuid, 'midnightswim', 'venue', 1, true, '夜游', '81a90487-39c9-46bb-b221-68ff631275d6/qr/no-menu-qr-midnightswim-7PNTLOK5.png'),
  ('FNYJXSXQ', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'::uuid, 'much-beer', 'venue', 1, true, 'Much Beer', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787/qr/no-menu-qr-much-beer-FNYJXSXQ.png'),
  ('VVUROT25', '6ddcffa2-6d35-4bf2-a723-bbe35cc55065'::uuid, 'no1', 'venue', 1, true, 'No.1', '6ddcffa2-6d35-4bf2-a723-bbe35cc55065/qr/no-menu-qr-no1-VVUROT25.png'),
  ('64YDJDL7', '1cff208a-4424-4867-966d-a7839ac59f6f'::uuid, 'origin4', 'venue', 1, true, 'Origin4', '1cff208a-4424-4867-966d-a7839ac59f6f/qr/no-menu-qr-origin4-64YDJDL7.png'),
  ('PYNSLXVO', 'd897a73b-37fb-4c57-af0f-79d8759173cb'::uuid, 'qiao-pi', 'venue', 1, true, '撬啤', 'd897a73b-37fb-4c57-af0f-79d8759173cb/qr/no-menu-qr-qiao-pi-PYNSLXVO.png'),
  ('LFCCKZWU', 'ca86eec7-641e-46e8-b95a-fda668ef072f'::uuid, 'shan-qiu', 'venue', 1, true, '山丘 Mountain Taproom', 'ca86eec7-641e-46e8-b95a-fda668ef072f/qr/no-menu-qr-shan-qiu-LFCCKZWU.png'),
  ('Z4I3HEW7', '00234890-ee30-4985-992d-98ab8ce1d5de'::uuid, 'shanque', 'venue', 1, true, '山雀', '00234890-ee30-4985-992d-98ab8ce1d5de/qr/no-menu-qr-shanque-Z4I3HEW7.png'),
  ('LDDXRHOR', 'a7c25410-3fcd-46b6-a11e-7fe1c0ed5d53'::uuid, 'start', 'venue', 1, true, 'Start', 'a7c25410-3fcd-46b6-a11e-7fe1c0ed5d53/qr/no-menu-qr-start-LDDXRHOR.png'),
  ('MZCBI42S', '4fd2c4f1-ad4a-4fbe-b7c8-e279ca0c55bb'::uuid, 'tiechui', 'venue', 1, true, '铁锤妹妹', '4fd2c4f1-ad4a-4fbe-b7c8-e279ca0c55bb/qr/no-menu-qr-tiechui-MZCBI42S.png'),
  ('EF7UONQI', 'b4c33fea-51e3-426d-9dfa-b13947153ac2'::uuid, 'yuzhong', 'venue', 1, true, '与众', 'b4c33fea-51e3-426d-9dfa-b13947153ac2/qr/no-menu-qr-yuzhong-EF7UONQI.png'),
  ('SZEQYSW3', '865af2b3-6cc0-4be0-ac14-c0f93a781907'::uuid, 'wu-er-taproom', 'venue', 1, true, 'Taproom Wu 晤尔', '865af2b3-6cc0-4be0-ac14-c0f93a781907/qr/no-menu-qr-wu-er-taproom-SZEQYSW3.png'),
  ('IIHSRXF5', '1ad70c94-b4b7-4fc4-bab3-7c58f19fda10'::uuid, 'tune-to', 'venue', 1, true, '吞吐 TuneTo', '1ad70c94-b4b7-4fc4-bab3-7c58f19fda10/qr/no-menu-qr-tune-to-IIHSRXF5.png')
      ) AS expected(
        qr_code, tenant_id, tenant_slug, placement, version, enabled, label, image_path
      )
      WHERE expected.qr_code = q.qr_code
        AND expected.tenant_id = q.tenant_id
        AND expected.placement = q.placement
        AND expected.image_path = q.image_path
        AND expected.enabled = q.enabled
        AND expected.version = q.version
    )
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_qr_links import conflict: qr_code % already exists with different binding', v_conflict;
  END IF;

  INSERT INTO public.tenant_qr_links (
    qr_code, tenant_id, tenant_slug, placement, version, enabled, label, image_path
  )
  VALUES
  ('R6N3V7DX', '4d1da7d9-8b21-4706-b535-355b9ff79388'::uuid, '062', 'venue', 1, true, '2062', '4d1da7d9-8b21-4706-b535-355b9ff79388/qr/no-menu-qr-062-R6N3V7DX.png'),
  ('JTKYQM4W', 'a4f4002f-fccd-41dd-bbc5-153d30fc5385'::uuid, 'ask', 'venue', 1, true, '問·ASK', 'a4f4002f-fccd-41dd-bbc5-153d30fc5385/qr/no-menu-qr-ask-JTKYQM4W.png'),
  ('L7WYX2KW', '26597d55-8a12-4185-b3ef-cb9a3ac1773a'::uuid, 'beer-garret', 'venue', 1, true, '亭子间 Beer Garret', '26597d55-8a12-4185-b3ef-cb9a3ac1773a/qr/no-menu-qr-beer-garret-L7WYX2KW.png'),
  ('K7M4Q2ZT', '27c1beca-c912-4f4a-bee5-3ccf0e5d981f'::uuid, 'beer-wave', 'venue', 1, true, '造浪 BEER WAVE', '27c1beca-c912-4f4a-bee5-3ccf0e5d981f/qr/no-menu-qr-beer-wave-K7M4Q2ZT.png'),
  ('QZ3MI73Q', '44a4429c-fb70-47a5-923b-370fce8f167e'::uuid, 'breno', 'venue', 1, true, 'Breno', '44a4429c-fb70-47a5-923b-370fce8f167e/qr/no-menu-qr-breno-QZ3MI73Q.png'),
  ('KFRNVQB7', '831db2a1-ee47-4d88-9c0b-3e19a5668d6d'::uuid, 'catfish', 'venue', 1, true, 'Catfish', '831db2a1-ee47-4d88-9c0b-3e19a5668d6d/qr/no-menu-qr-catfish-KFRNVQB7.png'),
  ('CAZXYZB3', '13b6f277-ab0d-4c19-ba8a-d97a5af9f51d'::uuid, 'come-out', 'venue', 1, true, 'COME OUT', '13b6f277-ab0d-4c19-ba8a-d97a5af9f51d/qr/no-menu-qr-come-out-CAZXYZB3.png'),
  ('H5BC45YV', '57d005da-1193-4bd2-955a-ef6b9653516d'::uuid, 'cozy-sea', 'venue', 1, true, '懒海 · 苏州河', '57d005da-1193-4bd2-955a-ef6b9653516d/qr/no-menu-qr-cozy-sea-H5BC45YV.png'),
  ('IEFGFYBB', '7aa1147c-5c8b-4c68-bc11-56ce34608689'::uuid, 'cozysea-1', 'venue', 1, true, '懒海 · 瑞金二路', '7aa1147c-5c8b-4c68-bc11-56ce34608689/qr/no-menu-qr-cozysea-1-IEFGFYBB.png'),
  ('EEJDZHQX', '2c191730-69f6-4031-8256-91aa59e5bc52'::uuid, 'drunken-night', 'venue', 1, true, '酒宵 Drunken Night', '2c191730-69f6-4031-8256-91aa59e5bc52/qr/no-menu-qr-drunken-night-EEJDZHQX.png'),
  ('62LC4NPU', 'de4207d0-d3c8-455a-8450-0d5b3e846ff0'::uuid, 'empty-cup', 'venue', 1, true, 'Empty Cup 空杯', 'de4207d0-d3c8-455a-8450-0d5b3e846ff0/qr/no-menu-qr-empty-cup-62LC4NPU.png'),
  ('NMIJEJL7', 'c3af90db-9734-4750-927c-38f6b37fb3e0'::uuid, 'farside', 'venue', 1, true, 'Farside 月之暗面', 'c3af90db-9734-4750-927c-38f6b37fb3e0/qr/no-menu-qr-farside-NMIJEJL7.png'),
  ('MYYCUEQQ', '82bf1237-e90c-4379-a2bc-a6dad2726b93'::uuid, 'finebar', 'venue', 1, true, 'Fine Bar', '82bf1237-e90c-4379-a2bc-a6dad2726b93/qr/no-menu-qr-finebar-MYYCUEQQ.png'),
  ('GGYBZWOS', '283206e3-22d9-4a54-b8a5-70694b1ec062'::uuid, 'geer', 'venue', 1, true, 'GEER 嗝 · 武夷路', '283206e3-22d9-4a54-b8a5-70694b1ec062/qr/no-menu-qr-geer-GGYBZWOS.png'),
  ('VZRDE4PS', '7cce9b27-acd5-4bdc-a302-153c8245a1c1'::uuid, 'geer2', 'venue', 1, true, 'GEER 嗝 · 浦东', '7cce9b27-acd5-4bdc-a302-153c8245a1c1/qr/no-menu-qr-geer2-VZRDE4PS.png'),
  ('63DHV5UV', '487685c5-99f1-463c-9e19-9eeea1cf6699'::uuid, 'juye', 'venue', 1, true, '聚野', '487685c5-99f1-463c-9e19-9eeea1cf6699/qr/no-menu-qr-juye-63DHV5UV.png'),
  ('UFZRGLTL', 'da21ab4e-93f7-49ca-8318-15fcbae24a93'::uuid, 'lanpigu', 'venue', 1, true, '蓝啤古', 'da21ab4e-93f7-49ca-8318-15fcbae24a93/qr/no-menu-qr-lanpigu-UFZRGLTL.png'),
  ('2NKB2JP5', '494bcf1f-8346-480f-a396-204b104c9313'::uuid, 'liquids-tag', 'venue', 1, true, 'Liquid''s Tag', '494bcf1f-8346-480f-a396-204b104c9313/qr/no-menu-qr-liquids-tag-2NKB2JP5.png'),
  ('7PNTLOK5', '81a90487-39c9-46bb-b221-68ff631275d6'::uuid, 'midnightswim', 'venue', 1, true, '夜游', '81a90487-39c9-46bb-b221-68ff631275d6/qr/no-menu-qr-midnightswim-7PNTLOK5.png'),
  ('FNYJXSXQ', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'::uuid, 'much-beer', 'venue', 1, true, 'Much Beer', '3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787/qr/no-menu-qr-much-beer-FNYJXSXQ.png'),
  ('VVUROT25', '6ddcffa2-6d35-4bf2-a723-bbe35cc55065'::uuid, 'no1', 'venue', 1, true, 'No.1', '6ddcffa2-6d35-4bf2-a723-bbe35cc55065/qr/no-menu-qr-no1-VVUROT25.png'),
  ('64YDJDL7', '1cff208a-4424-4867-966d-a7839ac59f6f'::uuid, 'origin4', 'venue', 1, true, 'Origin4', '1cff208a-4424-4867-966d-a7839ac59f6f/qr/no-menu-qr-origin4-64YDJDL7.png'),
  ('PYNSLXVO', 'd897a73b-37fb-4c57-af0f-79d8759173cb'::uuid, 'qiao-pi', 'venue', 1, true, '撬啤', 'd897a73b-37fb-4c57-af0f-79d8759173cb/qr/no-menu-qr-qiao-pi-PYNSLXVO.png'),
  ('LFCCKZWU', 'ca86eec7-641e-46e8-b95a-fda668ef072f'::uuid, 'shan-qiu', 'venue', 1, true, '山丘 Mountain Taproom', 'ca86eec7-641e-46e8-b95a-fda668ef072f/qr/no-menu-qr-shan-qiu-LFCCKZWU.png'),
  ('Z4I3HEW7', '00234890-ee30-4985-992d-98ab8ce1d5de'::uuid, 'shanque', 'venue', 1, true, '山雀', '00234890-ee30-4985-992d-98ab8ce1d5de/qr/no-menu-qr-shanque-Z4I3HEW7.png'),
  ('LDDXRHOR', 'a7c25410-3fcd-46b6-a11e-7fe1c0ed5d53'::uuid, 'start', 'venue', 1, true, 'Start', 'a7c25410-3fcd-46b6-a11e-7fe1c0ed5d53/qr/no-menu-qr-start-LDDXRHOR.png'),
  ('MZCBI42S', '4fd2c4f1-ad4a-4fbe-b7c8-e279ca0c55bb'::uuid, 'tiechui', 'venue', 1, true, '铁锤妹妹', '4fd2c4f1-ad4a-4fbe-b7c8-e279ca0c55bb/qr/no-menu-qr-tiechui-MZCBI42S.png'),
  ('EF7UONQI', 'b4c33fea-51e3-426d-9dfa-b13947153ac2'::uuid, 'yuzhong', 'venue', 1, true, '与众', 'b4c33fea-51e3-426d-9dfa-b13947153ac2/qr/no-menu-qr-yuzhong-EF7UONQI.png'),
  ('SZEQYSW3', '865af2b3-6cc0-4be0-ac14-c0f93a781907'::uuid, 'wu-er-taproom', 'venue', 1, true, 'Taproom Wu 晤尔', '865af2b3-6cc0-4be0-ac14-c0f93a781907/qr/no-menu-qr-wu-er-taproom-SZEQYSW3.png'),
  ('IIHSRXF5', '1ad70c94-b4b7-4fc4-bab3-7c58f19fda10'::uuid, 'tune-to', 'venue', 1, true, '吞吐 TuneTo', '1ad70c94-b4b7-4fc4-bab3-7c58f19fda10/qr/no-menu-qr-tune-to-IIHSRXF5.png')
  ON CONFLICT (qr_code) DO NOTHING;

  SELECT count(*)::integer INTO v_count
  FROM public.tenant_qr_links
  WHERE qr_code IN ('R6N3V7DX', 'JTKYQM4W', 'L7WYX2KW', 'K7M4Q2ZT', 'QZ3MI73Q', 'KFRNVQB7', 'CAZXYZB3', 'H5BC45YV', 'IEFGFYBB', 'EEJDZHQX', '62LC4NPU', 'NMIJEJL7', 'MYYCUEQQ', 'GGYBZWOS', 'VZRDE4PS', '63DHV5UV', 'UFZRGLTL', '2NKB2JP5', '7PNTLOK5', 'FNYJXSXQ', 'VVUROT25', '64YDJDL7', 'PYNSLXVO', 'LFCCKZWU', 'Z4I3HEW7', 'LDDXRHOR', 'MZCBI42S', 'EF7UONQI', 'SZEQYSW3', 'IIHSRXF5');

  IF v_count <> 30 THEN
    RAISE EXCEPTION 'tenant_qr_links import assertion failed: expected 30 rows for seed codes, found %', v_count;
  END IF;
END;
$$;
