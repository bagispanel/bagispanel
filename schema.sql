-- bagışpanel · PostgreSQL 16 veri modeli (prototipten türetildi)
-- Çok kiracılı (SaaS): her tabloda org_id var, hiçbir sorgu org_id olmadan çalışmaz.
BEGIN;

CREATE TYPE org_kind    AS ENUM ('genel','kurban','su_kuyusu','videolu');
CREATE TYPE don_status  AS ENUM ('bekleyen','onayli','iptal');
CREATE TYPE pay_method  AS ENUM ('nakit','havale_eft','kart_online');
CREATE TYPE partner_kind AS ENUM ('sirket','yabanci_sirket','dernek','vakif');
CREATE TYPE user_role   AS ENUM ('sahip','yonetici','operator','gorunum');

-- Kiracı (dernek / vakıf) ve kullanıcılar
CREATE TABLE orgs (
  id bigserial PRIMARY KEY, name text NOT NULL, slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, email text NOT NULL,
  name text NOT NULL, role user_role NOT NULL DEFAULT 'operator', pass_hash text,
  UNIQUE (org_id, email));

-- Ayar tabloları
CREATE TABLE countries (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, name text NOT NULL,
  UNIQUE (org_id, name));
CREATE TABLE partners (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, kind partner_kind NOT NULL,
  name text NOT NULL, tax_office text, tax_no text, reg_no text,        -- tüzük/dernek/vakıf resmi no
  country text, contact_name text, contact_phone text, contact_email text, address text,
  details jsonb NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, name));
CREATE TABLE bank_accounts (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, bank text NOT NULL,
  account_name text NOT NULL, iban text NOT NULL, currency char(3) NOT NULL DEFAULT 'TRY',
  active boolean NOT NULL DEFAULT true, UNIQUE (org_id, iban));
CREATE TABLE sms_templates (
  org_id bigint NOT NULL REFERENCES orgs, key text NOT NULL, title text NOT NULL, body text NOT NULL,
  PRIMARY KEY (org_id, key));                                            -- kabul, kesim, video, kuyu, dig ...
CREATE TABLE settings (
  org_id bigint PRIMARY KEY REFERENCES orgs,
  pdf_names_per_list int NOT NULL DEFAULT 50 CHECK (pdf_names_per_list BETWEEN 5 AND 500),
  list_prefix text NOT NULL DEFAULT 'VL-');

-- Bağış türleri
CREATE TABLE donation_types (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs,
  category text NOT NULL, name text NOT NULL, kind org_kind NOT NULL DEFAULT 'genel',
  unit_capacity int,                  -- büyükbaş 7, kuyu hisseli: pay sayısı
  price numeric(14,2),                -- sabit tutar (videolu, kurban hissesi, kuyu payı)
  well_cfg jsonb,                     -- {tip, bicim: Tam fiyat|Hisseli|Katılım|Fon, fiyat, pay, ad, web}
  has_video boolean NOT NULL DEFAULT false, has_certificate boolean NOT NULL DEFAULT false,
  show_on_web boolean NOT NULL DEFAULT true, active boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, category, name),
  CHECK (kind <> 'su_kuyusu' OR well_cfg IS NOT NULL));

-- Numaralandırma: seri -> sayaç (ülkeye göre ayrı olabilir); türler seriye bağlanır
CREATE TABLE number_series (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, name text NOT NULL,
  prefix text NOT NULL DEFAULT '', per_country boolean NOT NULL DEFAULT false,
  UNIQUE (org_id, name));
CREATE TABLE number_counters (
  series_id bigint NOT NULL REFERENCES number_series, country text NOT NULL DEFAULT '',
  next_no int NOT NULL DEFAULT 1 CHECK (next_no >= 1), PRIMARY KEY (series_id, country));
CREATE TABLE type_series (
  donation_type_id bigint PRIMARY KEY REFERENCES donation_types,
  series_id bigint NOT NULL REFERENCES number_series);                  -- tulumba hisseli + tam aynı seri olabilir

-- Bağışçılar
CREATE TABLE donors (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs,
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[0-9]{8,15}$'),
  name text NOT NULL, email text, city text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone_e164));

-- Bağışlar (site, CRM, dış sistem, içe aktarma hepsi buraya)
CREATE TABLE donations (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs,
  no text NOT NULL, donor_id bigint NOT NULL REFERENCES donors,
  type_id bigint NOT NULL REFERENCES donation_types,
  qty int NOT NULL DEFAULT 1 CHECK (qty >= 1),
  amount numeric(14,2) NOT NULL CHECK (amount > 0), currency char(3) NOT NULL DEFAULT 'TRY',
  rate numeric(14,6) NOT NULL DEFAULT 1, amount_try numeric(14,2) NOT NULL,   -- kur kayda işlenir, değişmez
  status don_status NOT NULL DEFAULT 'bekleyen',
  pay_method pay_method NOT NULL DEFAULT 'nakit',
  bank_account_id bigint REFERENCES bank_accounts,
  on_behalf_name text, on_behalf_phone text, note text,
  each_named boolean NOT NULL DEFAULT false, solo boolean NOT NULL DEFAULT false,
  animal text, group_unit_id bigint,
  source text NOT NULL DEFAULT 'crm', external_id text,                 -- site/dış CRM kimliği (mükerrer önler)
  receipt_file text, cancel_reason text, approved_at timestamptz, created_by bigint REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, no),
  CHECK (pay_method <> 'havale_eft' OR bank_account_id IS NOT NULL OR status = 'iptal'));
CREATE UNIQUE INDEX donations_ext ON donations (org_id, source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX donations_status ON donations (org_id, status, created_at DESC);
-- toplu isimli bağışlar (her adet farklı kişi adına)
CREATE TABLE donation_names (
  id bigserial PRIMARY KEY, donation_id bigint NOT NULL REFERENCES donations ON DELETE CASCADE,
  pos int NOT NULL, name text NOT NULL, phone_e164 text);

-- Organizasyon birimleri: kurban / kuyu / videolu bağış satırı
CREATE TABLE units (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs,
  type_id bigint NOT NULL REFERENCES donation_types, kind org_kind NOT NULL CHECK (kind <> 'genel'),
  title text NOT NULL, capacity int NOT NULL DEFAULT 1,
  step smallint NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 4),         -- 0 hazırlanıyor … 4 video kontrolü
  code text, country text, partner_id bigint REFERENCES partners,
  animal text, solo boolean NOT NULL DEFAULT false,
  well_no int, well_series_id bigint REFERENCES number_series, well_counter text, -- kuyu no
  well_target numeric(14,2), well_carry numeric(14,2) NOT NULL DEFAULT 0, well_location point, well_owner_name text,
  video_file text, video_uploaded_at timestamptz, video_checked boolean NOT NULL DEFAULT false,
  list_id bigint, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code));
-- bir sayaçta aynı kuyu numarası iki kez verilemez
CREATE UNIQUE INDEX units_wellno ON units (well_series_id, well_counter, well_no) WHERE well_no IS NOT NULL;
CREATE INDEX units_stage ON units (org_id, kind, step);
ALTER TABLE donations ADD CONSTRAINT donations_group_fk FOREIGN KEY (group_unit_id) REFERENCES units;
CREATE TABLE unit_events (                                              -- her aşamanın tarihi (giriş, ülke, kesim, video…)
  id bigserial PRIMARY KEY, unit_id bigint NOT NULL REFERENCES units ON DELETE CASCADE,
  step smallint NOT NULL, at timestamptz NOT NULL DEFAULT now(), by_user bigint REFERENCES users);
CREATE TABLE shares (                                                    -- hissedar / adına yapılan kişi
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs,
  unit_id bigint NOT NULL REFERENCES units ON DELETE CASCADE, donation_id bigint REFERENCES donations,
  owner_no text NOT NULL, name text NOT NULL, phone_e164 text,
  donor_id bigint REFERENCES donors, amount numeric(14,2),
  video_sent_at timestamptz, UNIQUE (org_id, owner_no));

-- PDF listeleri: numara bir kez verilir, değişmez, tekrar kullanılmaz
CREATE TABLE pdf_lists (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, no text NOT NULL,
  country text, partner_id bigint REFERENCES partners, type_id bigint REFERENCES donation_types,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (org_id, no));
ALTER TABLE units ADD CONSTRAINT units_list_fk FOREIGN KEY (list_id) REFERENCES pdf_lists;
CREATE TABLE pdf_list_counter (org_id bigint PRIMARY KEY REFERENCES orgs, next_no int NOT NULL DEFAULT 1);

-- SMS
CREATE TABLE sms_log (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, to_phone text NOT NULL,
  to_name text, body text NOT NULL, template_key text, status text NOT NULL DEFAULT 'kuyrukta',
  provider_id text, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());

-- Entegrasyon: dış site / başka CRM içe aktarma / webhook
CREATE TABLE api_keys (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, label text NOT NULL,
  key_hash text NOT NULL UNIQUE, scopes text[] NOT NULL DEFAULT '{donations:write}',
  last_used_at timestamptz, revoked boolean NOT NULL DEFAULT false);
CREATE TABLE webhooks (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, url text NOT NULL,
  events text[] NOT NULL, secret text NOT NULL, active boolean NOT NULL DEFAULT true);
CREATE TABLE import_batches (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, source text NOT NULL,
  file_name text, rows_total int, rows_ok int, rows_failed int, report jsonb,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, user_id bigint REFERENCES users,
  action text NOT NULL, entity text NOT NULL, entity_id bigint, detail jsonb,
  at timestamptz NOT NULL DEFAULT now());

-- ===== SaaS: planlar ve web sitesi yönetimi (ayrı panel) =====
CREATE TABLE plans (
  id bigserial PRIMARY KEY, name text NOT NULL UNIQUE, monthly_price numeric(12,2) NOT NULL DEFAULT 0,
  limits jsonb NOT NULL DEFAULT '{}');                                  -- {users, sms, sites, storage_mb}
ALTER TABLE orgs ADD COLUMN plan_id bigint REFERENCES plans,
                 ADD COLUMN status text NOT NULL DEFAULT 'aktif' CHECK (status IN ('deneme','aktif','askida'));
CREATE TABLE sites (                                                     -- her dernek bir veya daha fazla site
  id bigserial PRIMARY KEY, org_id bigint NOT NULL REFERENCES orgs, name text NOT NULL,
  theme text NOT NULL DEFAULT 'varsayilan', settings jsonb NOT NULL DEFAULT '{}',   -- renk, logo, iletişim, sosyal
  published boolean NOT NULL DEFAULT false, UNIQUE (org_id, name));
CREATE TABLE site_domains (
  id bigserial PRIMARY KEY, site_id bigint NOT NULL REFERENCES sites ON DELETE CASCADE,
  domain text NOT NULL UNIQUE, is_primary boolean NOT NULL DEFAULT false, verified boolean NOT NULL DEFAULT false);
CREATE TABLE site_pages (
  id bigserial PRIMARY KEY, site_id bigint NOT NULL REFERENCES sites ON DELETE CASCADE,
  slug text NOT NULL, title text NOT NULL, blocks jsonb NOT NULL DEFAULT '[]',      -- sayfa blokları
  seo jsonb NOT NULL DEFAULT '{}', published boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug));
CREATE TABLE site_menus (
  id bigserial PRIMARY KEY, site_id bigint NOT NULL REFERENCES sites ON DELETE CASCADE,
  place text NOT NULL, items jsonb NOT NULL DEFAULT '[]', UNIQUE (site_id, place));
CREATE TABLE site_media (
  id bigserial PRIMARY KEY, site_id bigint NOT NULL REFERENCES sites ON DELETE CASCADE,
  path text NOT NULL, kind text NOT NULL, size_bytes bigint, created_at timestamptz NOT NULL DEFAULT now());
-- sitede hangi bağış türü hangi sayfada/formda görünür (CRM'deki "show_on_web" ile birlikte çalışır)
CREATE TABLE site_donation_forms (
  id bigserial PRIMARY KEY, site_id bigint NOT NULL REFERENCES sites ON DELETE CASCADE,
  type_id bigint NOT NULL REFERENCES donation_types, sort int NOT NULL DEFAULT 0,
  title text, image_id bigint REFERENCES site_media, UNIQUE (site_id, type_id));
-- siteden gelen bağış CRM'e donations.source = 'site:<site_id>' olarak düşer.

COMMIT;
