DO $$
DECLARE
  affected_rows integer;
BEGIN
  WITH expected(tenant_id, tenant_slug, qr_code, version, image_url) AS (
    VALUES
    ('a4f4002f-fccd-41dd-bbc5-153d30fc5385'::uuid, 'ask', 'JTKYQM4W', 1, 'https://img.nomenuapp.com/prod/tenants/a4f4002f-fccd-41dd-bbc5-153d30fc5385/qr/weapp/release/no-menu-weapp-v1-JTKYQM4W.jpg'),
    ('ba7a8470-4079-47ae-b3a0-166b7aeec17e'::uuid, 'beer-barrel-bj', '5DFTODOO', 1, 'https://img.nomenuapp.com/prod/tenants/ba7a8470-4079-47ae-b3a0-166b7aeec17e/qr/weapp/release/no-menu-weapp-v1-5DFTODOO.jpg'),
    ('26597d55-8a12-4185-b3ef-cb9a3ac1773a'::uuid, 'beer-garret', 'L7WYX2KW', 1, 'https://img.nomenuapp.com/prod/tenants/26597d55-8a12-4185-b3ef-cb9a3ac1773a/qr/weapp/release/no-menu-weapp-v1-L7WYX2KW.jpg'),
    ('27c1beca-c912-4f4a-bee5-3ccf0e5d981f'::uuid, 'beer-wave', 'K7M4Q2ZT', 1, 'https://img.nomenuapp.com/prod/tenants/27c1beca-c912-4f4a-bee5-3ccf0e5d981f/qr/weapp/release/no-menu-weapp-v1-K7M4Q2ZT.jpg'),
    ('c953fa59-932b-45a9-99de-6148433d7c9f'::uuid, 'binzhou-chunmu', 'OXSA4ZCW', 1, 'https://img.nomenuapp.com/prod/tenants/c953fa59-932b-45a9-99de-6148433d7c9f/qr/weapp/release/no-menu-weapp-v1-OXSA4ZCW.jpg'),
    ('ba609189-e551-4511-8fa4-6bc51fcb1198'::uuid, 'bj-hammer-sanlitun', 'VAJQXTVL', 1, 'https://img.nomenuapp.com/prod/tenants/ba609189-e551-4511-8fa4-6bc51fcb1198/qr/weapp/release/no-menu-weapp-v1-VAJQXTVL.jpg'),
    ('44a4429c-fb70-47a5-923b-370fce8f167e'::uuid, 'breno', 'QZ3MI73Q', 1, 'https://img.nomenuapp.com/prod/tenants/44a4429c-fb70-47a5-923b-370fce8f167e/qr/weapp/release/no-menu-weapp-v1-QZ3MI73Q.jpg'),
    ('831db2a1-ee47-4d88-9c0b-3e19a5668d6d'::uuid, 'catfish', 'KFRNVQB7', 1, 'https://img.nomenuapp.com/prod/tenants/831db2a1-ee47-4d88-9c0b-3e19a5668d6d/qr/weapp/release/no-menu-weapp-v1-KFRNVQB7.jpg'),
    ('3e036295-a0d2-42aa-8656-564c7c238049'::uuid, 'cc-yang-song', '7KZ3OH3D', 1, 'https://img.nomenuapp.com/prod/tenants/3e036295-a0d2-42aa-8656-564c7c238049/qr/weapp/release/no-menu-weapp-v1-7KZ3OH3D.jpg'),
    ('13b6f277-ab0d-4c19-ba8a-d97a5af9f51d'::uuid, 'come-out', 'CAZXYZB3', 1, 'https://img.nomenuapp.com/prod/tenants/13b6f277-ab0d-4c19-ba8a-d97a5af9f51d/qr/weapp/release/no-menu-weapp-v1-CAZXYZB3.jpg'),
    ('57d005da-1193-4bd2-955a-ef6b9653516d'::uuid, 'cozy-sea', 'H5BC45YV', 1, 'https://img.nomenuapp.com/prod/tenants/57d005da-1193-4bd2-955a-ef6b9653516d/qr/weapp/release/no-menu-weapp-v1-H5BC45YV.jpg'),
    ('7aa1147c-5c8b-4c68-bc11-56ce34608689'::uuid, 'cozysea-1', 'IEFGFYBB', 1, 'https://img.nomenuapp.com/prod/tenants/7aa1147c-5c8b-4c68-bc11-56ce34608689/qr/weapp/release/no-menu-weapp-v1-IEFGFYBB.jpg'),
    ('13996d91-6fc0-4758-9a45-974845d3db57'::uuid, 'doubar', 'KFM5WJPW', 1, 'https://img.nomenuapp.com/prod/tenants/13996d91-6fc0-4758-9a45-974845d3db57/qr/weapp/release/no-menu-weapp-v1-KFM5WJPW.jpg'),
    ('2c191730-69f6-4031-8256-91aa59e5bc52'::uuid, 'drunken-night', 'EEJDZHQX', 1, 'https://img.nomenuapp.com/prod/tenants/2c191730-69f6-4031-8256-91aa59e5bc52/qr/weapp/release/no-menu-weapp-v1-EEJDZHQX.jpg'),
    ('de4207d0-d3c8-455a-8450-0d5b3e846ff0'::uuid, 'empty-cup', '62LC4NPU', 1, 'https://img.nomenuapp.com/prod/tenants/de4207d0-d3c8-455a-8450-0d5b3e846ff0/qr/weapp/release/no-menu-weapp-v1-62LC4NPU.jpg'),
    ('c3af90db-9734-4750-927c-38f6b37fb3e0'::uuid, 'farside', 'NMIJEJL7', 1, 'https://img.nomenuapp.com/prod/tenants/c3af90db-9734-4750-927c-38f6b37fb3e0/qr/weapp/release/no-menu-weapp-v1-NMIJEJL7.jpg'),
    ('82bf1237-e90c-4379-a2bc-a6dad2726b93'::uuid, 'finebar', 'MYYCUEQQ', 1, 'https://img.nomenuapp.com/prod/tenants/82bf1237-e90c-4379-a2bc-a6dad2726b93/qr/weapp/release/no-menu-weapp-v1-MYYCUEQQ.jpg'),
    ('283206e3-22d9-4a54-b8a5-70694b1ec062'::uuid, 'geer', 'GGYBZWOS', 1, 'https://img.nomenuapp.com/prod/tenants/283206e3-22d9-4a54-b8a5-70694b1ec062/qr/weapp/release/no-menu-weapp-v1-GGYBZWOS.jpg'),
    ('7cce9b27-acd5-4bdc-a302-153c8245a1c1'::uuid, 'geer2', 'VZRDE4PS', 1, 'https://img.nomenuapp.com/prod/tenants/7cce9b27-acd5-4bdc-a302-153c8245a1c1/qr/weapp/release/no-menu-weapp-v1-VZRDE4PS.jpg'),
    ('a3b98b53-024d-48b6-8bfd-542b5dcb96e3'::uuid, 'js-nj-papoo', 'FASIUKLR', 1, 'https://img.nomenuapp.com/prod/tenants/a3b98b53-024d-48b6-8bfd-542b5dcb96e3/qr/weapp/release/no-menu-weapp-v1-FASIUKLR.jpg'),
    ('487685c5-99f1-463c-9e19-9eeea1cf6699'::uuid, 'juye', '63DHV5UV', 1, 'https://img.nomenuapp.com/prod/tenants/487685c5-99f1-463c-9e19-9eeea1cf6699/qr/weapp/release/no-menu-weapp-v1-63DHV5UV.jpg'),
    ('494bcf1f-8346-480f-a396-204b104c9313'::uuid, 'liquids-tag', '2NKB2JP5', 1, 'https://img.nomenuapp.com/prod/tenants/494bcf1f-8346-480f-a396-204b104c9313/qr/weapp/release/no-menu-weapp-v1-2NKB2JP5.jpg'),
    ('81a90487-39c9-46bb-b221-68ff631275d6'::uuid, 'midnightswim', '7PNTLOK5', 1, 'https://img.nomenuapp.com/prod/tenants/81a90487-39c9-46bb-b221-68ff631275d6/qr/weapp/release/no-menu-weapp-v1-7PNTLOK5.jpg'),
    ('3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787'::uuid, 'much-beer', 'FNYJXSXQ', 1, 'https://img.nomenuapp.com/prod/tenants/3d6cb427-a8c3-4583-a7c4-5a3ad9f5f787/qr/weapp/release/no-menu-weapp-v1-FNYJXSXQ.jpg'),
    ('6ddcffa2-6d35-4bf2-a723-bbe35cc55065'::uuid, 'no1', 'VVUROT25', 1, 'https://img.nomenuapp.com/prod/tenants/6ddcffa2-6d35-4bf2-a723-bbe35cc55065/qr/weapp/release/no-menu-weapp-v1-VVUROT25.jpg'),
    ('1cff208a-4424-4867-966d-a7839ac59f6f'::uuid, 'origin4', '64YDJDL7', 1, 'https://img.nomenuapp.com/prod/tenants/1cff208a-4424-4867-966d-a7839ac59f6f/qr/weapp/release/no-menu-weapp-v1-64YDJDL7.jpg'),
    ('a01e03f3-89de-4716-9d53-62545efda2c3'::uuid, 'qd-lieflat-huali', 'CJBVEPHJ', 1, 'https://img.nomenuapp.com/prod/tenants/a01e03f3-89de-4716-9d53-62545efda2c3/qr/weapp/release/no-menu-weapp-v1-CJBVEPHJ.jpg'),
    ('d897a73b-37fb-4c57-af0f-79d8759173cb'::uuid, 'qiao-pi', 'PYNSLXVO', 1, 'https://img.nomenuapp.com/prod/tenants/d897a73b-37fb-4c57-af0f-79d8759173cb/qr/weapp/release/no-menu-weapp-v1-PYNSLXVO.jpg'),
    ('349c2cfd-b0e7-4429-9ba3-3790bd3ebb3e'::uuid, 'qingdao-wuya', 'T6OIAXI7', 1, 'https://img.nomenuapp.com/prod/tenants/349c2cfd-b0e7-4429-9ba3-3790bd3ebb3e/qr/weapp/release/no-menu-weapp-v1-T6OIAXI7.jpg'),
    ('183db14f-5288-4cd0-bc3f-dae531003faf'::uuid, 'sc-cd-pnk', '3MHXLE4C', 1, 'https://img.nomenuapp.com/prod/tenants/183db14f-5288-4cd0-bc3f-dae531003faf/qr/weapp/release/no-menu-weapp-v1-3MHXLE4C.jpg'),
    ('5953cf41-88df-4bca-8475-47a7f6e029c0'::uuid, 'sd-lx-water', 'VFQCOPG3', 1, 'https://img.nomenuapp.com/prod/tenants/5953cf41-88df-4bca-8475-47a7f6e029c0/qr/weapp/release/no-menu-weapp-v1-VFQCOPG3.jpg'),
    ('26470864-0131-48cf-9df4-b631e406a774'::uuid, 'sd-qd-yizi', '2W5QLHIF', 1, 'https://img.nomenuapp.com/prod/tenants/26470864-0131-48cf-9df4-b631e406a774/qr/weapp/release/no-menu-weapp-v1-2W5QLHIF.jpg'),
    ('fa4b4a67-1147-48e1-8577-b06045728e45'::uuid, 'sh-52hz', 'JUMNTYYA', 1, 'https://img.nomenuapp.com/prod/tenants/fa4b4a67-1147-48e1-8577-b06045728e45/qr/weapp/release/no-menu-weapp-v1-JUMNTYYA.jpg'),
    ('6c76b014-4deb-4f61-83e2-f53db97e1035'::uuid, 'sh-a-place', 'S7PRIQNX', 1, 'https://img.nomenuapp.com/prod/tenants/6c76b014-4deb-4f61-83e2-f53db97e1035/qr/weapp/release/no-menu-weapp-v1-S7PRIQNX.jpg'),
    ('827294c2-0126-46b7-bca1-31f93ead5380'::uuid, 'sh-dundun', 'L2M3KZY4', 1, 'https://img.nomenuapp.com/prod/tenants/827294c2-0126-46b7-bca1-31f93ead5380/qr/weapp/release/no-menu-weapp-v1-L2M3KZY4.jpg'),
    ('76f5d12f-0cba-4448-8589-2784eefe078d'::uuid, 'sh-major', 'AGSH3YNG', 1, 'https://img.nomenuapp.com/prod/tenants/76f5d12f-0cba-4448-8589-2784eefe078d/qr/weapp/release/no-menu-weapp-v1-AGSH3YNG.jpg'),
    ('56f4b065-040d-46b4-bfab-86491d4aa283'::uuid, 'sh-north-bank', 'P2362OY7', 1, 'https://img.nomenuapp.com/prod/tenants/56f4b065-040d-46b4-bfab-86491d4aa283/qr/weapp/release/no-menu-weapp-v1-P2362OY7.jpg'),
    ('08f98bec-8d02-4ebc-85ab-f870080f4ea6'::uuid, 'sh-spark-lab', 'AWH45QIU', 1, 'https://img.nomenuapp.com/prod/tenants/08f98bec-8d02-4ebc-85ab-f870080f4ea6/qr/weapp/release/no-menu-weapp-v1-AWH45QIU.jpg'),
    ('4daa2912-3268-4396-bfcc-8a4c2a406dc6'::uuid, 'sh-yh', 'CD6ZEWBV', 1, 'https://img.nomenuapp.com/prod/tenants/4daa2912-3268-4396-bfcc-8a4c2a406dc6/qr/weapp/release/no-menu-weapp-v1-CD6ZEWBV.jpg'),
    ('af37e235-ff22-4d12-bf7d-65dd5d64bfa7'::uuid, 'sh-zaopishi', 'WDRGVUZN', 1, 'https://img.nomenuapp.com/prod/tenants/af37e235-ff22-4d12-bf7d-65dd5d64bfa7/qr/weapp/release/no-menu-weapp-v1-WDRGVUZN.jpg'),
    ('ca86eec7-641e-46e8-b95a-fda668ef072f'::uuid, 'shan-qiu', 'LFCCKZWU', 1, 'https://img.nomenuapp.com/prod/tenants/ca86eec7-641e-46e8-b95a-fda668ef072f/qr/weapp/release/no-menu-weapp-v1-LFCCKZWU.jpg'),
    ('00234890-ee30-4985-992d-98ab8ce1d5de'::uuid, 'shanque', 'Z4I3HEW7', 1, 'https://img.nomenuapp.com/prod/tenants/00234890-ee30-4985-992d-98ab8ce1d5de/qr/weapp/release/no-menu-weapp-v1-Z4I3HEW7.jpg'),
    ('a7c25410-3fcd-46b6-a11e-7fe1c0ed5d53'::uuid, 'start', 'LDDXRHOR', 1, 'https://img.nomenuapp.com/prod/tenants/a7c25410-3fcd-46b6-a11e-7fe1c0ed5d53/qr/weapp/release/no-menu-weapp-v1-LDDXRHOR.jpg'),
    ('26448c39-f7c1-448f-b6da-63b7c80a1ca3'::uuid, 'sx-xa-drygoods', '2S5SKOPO', 1, 'https://img.nomenuapp.com/prod/tenants/26448c39-f7c1-448f-b6da-63b7c80a1ca3/qr/weapp/release/no-menu-weapp-v1-2S5SKOPO.jpg'),
    ('d044f26a-e6a9-4912-b8ed-b2c8023f00d0'::uuid, 'sy-niu-peng', 'M5YLM5GI', 1, 'https://img.nomenuapp.com/prod/tenants/d044f26a-e6a9-4912-b8ed-b2c8023f00d0/qr/weapp/release/no-menu-weapp-v1-M5YLM5GI.jpg'),
    ('e8369bd1-250e-494d-93da-06d2fce04fa2'::uuid, 'sy-pu-tong', 'RT3TBFLE', 1, 'https://img.nomenuapp.com/prod/tenants/e8369bd1-250e-494d-93da-06d2fce04fa2/qr/weapp/release/no-menu-weapp-v1-RT3TBFLE.jpg'),
    ('4fd2c4f1-ad4a-4fbe-b7c8-e279ca0c55bb'::uuid, 'tiechui', 'MZCBI42S', 1, 'https://img.nomenuapp.com/prod/tenants/4fd2c4f1-ad4a-4fbe-b7c8-e279ca0c55bb/qr/weapp/release/no-menu-weapp-v1-MZCBI42S.jpg'),
    ('163e02a6-0939-4927-851e-84798d875389'::uuid, 'tj-jellys-craft-beer', 'C3EDOTH3', 1, 'https://img.nomenuapp.com/prod/tenants/163e02a6-0939-4927-851e-84798d875389/qr/weapp/release/no-menu-weapp-v1-C3EDOTH3.jpg'),
    ('1ad70c94-b4b7-4fc4-bab3-7c58f19fda10'::uuid, 'tune-to', 'IIHSRXF5', 1, 'https://img.nomenuapp.com/prod/tenants/1ad70c94-b4b7-4fc4-bab3-7c58f19fda10/qr/weapp/release/no-menu-weapp-v1-IIHSRXF5.jpg'),
    ('777ca3a8-279c-4f36-9ea6-efceda376995'::uuid, 'we-cheers', 'GEEG7VAV', 1, 'https://img.nomenuapp.com/prod/tenants/777ca3a8-279c-4f36-9ea6-efceda376995/qr/weapp/release/no-menu-weapp-v1-GEEG7VAV.jpg'),
    ('865af2b3-6cc0-4be0-ac14-c0f93a781907'::uuid, 'wu-er-taproom', 'SZEQYSW3', 1, 'https://img.nomenuapp.com/prod/tenants/865af2b3-6cc0-4be0-ac14-c0f93a781907/qr/weapp/release/no-menu-weapp-v1-SZEQYSW3.jpg'),
    ('b4c33fea-51e3-426d-9dfa-b13947153ac2'::uuid, 'yuzhong', 'EF7UONQI', 1, 'https://img.nomenuapp.com/prod/tenants/b4c33fea-51e3-426d-9dfa-b13947153ac2/qr/weapp/release/no-menu-weapp-v1-EF7UONQI.jpg')
  )
  UPDATE public.tenant_qr_links AS q
  SET mini_program_code_url = expected.image_url
  FROM expected
  WHERE q.tenant_id = expected.tenant_id
    AND q.tenant_slug = expected.tenant_slug
    AND q.qr_code = expected.qr_code
    AND q.version = expected.version
    AND q.placement = 'venue'
    AND q.enabled = true
    AND (
      q.mini_program_code_url IS NULL
      OR q.mini_program_code_url = expected.image_url
    );

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 52 THEN
    RAISE EXCEPTION 'Expected exactly 52 venue QR rows, updated %', affected_rows;
  END IF;
END;
$$;
