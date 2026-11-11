-- Fill only country codes that are deterministic from reviewed company data.
-- Keep unknown companies unresolved rather than inferring from their names.

SET lock_timeout = '1s';

WITH country_mapping(country, country_en, country_code) AS (
  VALUES
    ('中国', 'China', 'CN'),
    ('美国', 'United States', 'US'),
    ('澳大利亚', 'Australia', 'AU'),
    ('俄罗斯', 'Russia', 'RU'),
    ('斯洛文尼亚', 'Slovenia', 'SI'),
    ('比利时', 'Belgium', 'BE'),
    ('芬兰', 'Finland', 'FI'),
    ('英国', 'England', 'GB'),
    ('英国', '英国', 'GB')
)
UPDATE public.drink_companies AS company
SET country_code = mapping.country_code
FROM country_mapping AS mapping
WHERE nullif(trim(company.country_code), '') IS NULL
  AND trim(company.country) = mapping.country
  AND trim(company.country_en) = mapping.country_en;

-- 行空酒造 is a Qingdao brewery. Its linked product already records Qingdao,
-- and the brewery identity is corroborated by public brewery records.
UPDATE public.drink_companies
SET country_code = 'CN'
WHERE id = '741d9e24-799d-4542-a1da-26db4f87f9a5'::uuid
  AND nullif(trim(country_code), '') IS NULL;

RESET lock_timeout;
