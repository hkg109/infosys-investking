CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  nickname VARCHAR(30) NOT NULL UNIQUE CHECK (length(nickname) > 0),
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('WAITING', 'RUNNING', 'PAUSED', 'FINISHED')),
  phase TEXT NOT NULL CHECK (phase IN ('WAITING', 'TRADING', 'RESULT', 'PAUSED', 'FINISHED')),
  phase_before_pause TEXT CHECK (phase_before_pause IN ('TRADING', 'RESULT')),
  current_round INTEGER NOT NULL DEFAULT 0 CHECK (current_round >= 0),
  total_rounds INTEGER NOT NULL CHECK (total_rounds > 0),
  round_duration_ms INTEGER NOT NULL CHECK (round_duration_ms > 1),
  trading_duration_ms INTEGER NOT NULL CHECK (trading_duration_ms > 0 AND trading_duration_ms < round_duration_ms),
  started_at TIMESTAMPTZ,
  round_started_at TIMESTAMPTZ,
  phase_ends_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  paused_remaining_ms INTEGER CHECK (paused_remaining_ms >= 0),
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  initial_price BIGINT NOT NULL CHECK (initial_price > 0),
  current_price BIGINT NOT NULL CHECK (current_price > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS companies_active_idx ON companies(is_active, id);

INSERT INTO companies (id, name, description, initial_price, current_price) VALUES
  ('A', 'A 엔터', '엔터테인먼트 기업', 10000, 10000),
  ('B', 'B IT', '정보기술 기업', 10000, 10000),
  ('C', 'C 화학', '화학 기업', 10000, 10000),
  ('D', 'D 뷰티', '뷰티 기업', 10000, 10000),
  ('E', 'E 엔터', '엔터테인먼트 기업', 10000, 10000),
  ('F', 'F IT', '정보기술 기업', 10000, 10000),
  ('G', 'G 엔터', '엔터테인먼트 기업', 10000, 10000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS wallets (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cash BIGINT NOT NULL CHECK (cash >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, user_id)
);

CREATE TABLE IF NOT EXISTS portfolios (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id VARCHAR(20) NOT NULL REFERENCES companies(id),
  quantity BIGINT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, user_id, company_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL UNIQUE,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number > 0),
  company_id VARCHAR(20) NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  quantity BIGINT NOT NULL CHECK (quantity > 0),
  price BIGINT NOT NULL CHECK (price > 0),
  total_price BIGINT NOT NULL CHECK (total_price > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS round_number INTEGER NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'transactions'::regclass AND conname = 'transactions_round_number_check'
  ) THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_round_number_check CHECK (round_number > 0);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS transactions_user_created_idx ON transactions(game_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_user_round_idx
  ON transactions(game_id, user_id, round_number, created_at, id);

-- A durable order intent is saved before execution so another device can recover it.
CREATE TABLE IF NOT EXISTS order_intents (
  order_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id VARCHAR(20) NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'FILLED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_order_per_user ON order_intents(user_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY,
  title VARCHAR(100) NOT NULL CHECK (length(trim(title)) > 0),
  news TEXT NOT NULL CHECK (length(trim(news)) > 0),
  result TEXT NOT NULL CHECK (length(trim(result)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- QA stage 29 standardizes the intraday headline prefix. This migration is
-- intentionally idempotent so existing installations are repaired on start.
UPDATE events
SET title = regexp_replace(title, '^\[장중\]', '[속보]'), updated_at = NOW()
WHERE title LIKE '[장중]%';

CREATE TABLE IF NOT EXISTS event_effects (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  company_id VARCHAR(20) NOT NULL REFERENCES companies(id),
  change_rate INTEGER NOT NULL CHECK (change_rate BETWEEN -99 AND 1000),
  PRIMARY KEY (event_id, company_id)
);

CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id),
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  display_order INTEGER NOT NULL DEFAULT 1 CHECK (display_order > 0),
  trigger_phase TEXT NOT NULL DEFAULT 'CLOSE' CHECK (trigger_phase IN ('INTRADAY', 'CLOSE')),
  trigger_offset_ms INTEGER,
  preannounce_ms INTEGER NOT NULL DEFAULT 0 CHECK (preannounce_ms >= 0),
  news_reveal_offset_ms INTEGER NOT NULL DEFAULT 0 CHECK (news_reveal_offset_ms >= 0),
  scheduled_at TIMESTAMPTZ,
  warning_sent_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  UNIQUE (game_id, event_id),
  UNIQUE (game_id, round_number, display_order),
  CHECK (
    (trigger_phase = 'INTRADAY' AND trigger_offset_ms > 0 AND preannounce_ms < trigger_offset_ms)
    OR (trigger_phase = 'CLOSE' AND trigger_offset_ms IS NULL AND preannounce_ms = 0)
  )
);

CREATE TABLE IF NOT EXISTS event_schedule_states (
  game_id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('MANUAL', 'RANDOM')),
  configured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_price_changes (
  game_event_id UUID NOT NULL REFERENCES game_events(id) ON DELETE CASCADE,
  game_id UUID NOT NULL,
  round_number INTEGER NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id),
  company_id VARCHAR(20) NOT NULL REFERENCES companies(id),
  previous_price BIGINT NOT NULL CHECK (previous_price > 0),
  new_price BIGINT NOT NULL CHECK (new_price > 0),
  change_rate INTEGER NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_event_id, company_id)
);

-- Upgrade the original one-event-per-round schema without deleting assignments or price history.
ALTER TABLE game_events ADD COLUMN IF NOT EXISTS id UUID;
ALTER TABLE game_events ADD COLUMN IF NOT EXISTS display_order INTEGER;
ALTER TABLE game_events ADD COLUMN IF NOT EXISTS trigger_phase TEXT;
ALTER TABLE game_events ADD COLUMN IF NOT EXISTS trigger_offset_ms INTEGER;
ALTER TABLE game_events ADD COLUMN IF NOT EXISTS preannounce_ms INTEGER;
ALTER TABLE game_events ADD COLUMN IF NOT EXISTS news_reveal_offset_ms INTEGER;
ALTER TABLE game_events ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE game_events ADD COLUMN IF NOT EXISTS warning_sent_at TIMESTAMPTZ;
UPDATE game_events SET
  id = COALESCE(id, md5(game_id::text || ':' || round_number::text || ':' || event_id::text)::uuid),
  display_order = COALESCE(display_order, 1),
  trigger_phase = COALESCE(trigger_phase, 'CLOSE'),
  preannounce_ms = COALESCE(preannounce_ms, 0),
  news_reveal_offset_ms = COALESCE(news_reveal_offset_ms,
    CASE WHEN trigger_phase = 'INTRADAY'
      THEN GREATEST(0, trigger_offset_ms - GREATEST(COALESCE(preannounce_ms, 0), 1000))
      ELSE 0 END);
ALTER TABLE game_events ALTER COLUMN id SET NOT NULL;
ALTER TABLE game_events ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE game_events ALTER COLUMN trigger_phase SET NOT NULL;
ALTER TABLE game_events ALTER COLUMN preannounce_ms SET NOT NULL;
ALTER TABLE game_events ALTER COLUMN news_reveal_offset_ms SET NOT NULL;
ALTER TABLE game_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE game_events ALTER COLUMN display_order SET DEFAULT 1;
ALTER TABLE game_events ALTER COLUMN trigger_phase SET DEFAULT 'CLOSE';
ALTER TABLE game_events ALTER COLUMN preannounce_ms SET DEFAULT 0;
ALTER TABLE game_events ALTER COLUMN news_reveal_offset_ms SET DEFAULT 0;
ALTER TABLE stock_price_changes DROP CONSTRAINT IF EXISTS stock_price_changes_game_event_id_fkey;
ALTER TABLE stock_price_changes DROP CONSTRAINT IF EXISTS stock_price_changes_game_event_fkey;
ALTER TABLE stock_price_changes DROP CONSTRAINT IF EXISTS stock_price_changes_game_id_round_number_fkey;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'game_events'::regclass AND contype = 'p'
      AND pg_get_constraintdef(oid) <> 'PRIMARY KEY (id)'
  ) THEN
    ALTER TABLE game_events DROP CONSTRAINT game_events_pkey;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game_events'::regclass AND contype = 'p') THEN
    ALTER TABLE game_events ADD CONSTRAINT game_events_pkey PRIMARY KEY (id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS game_events_round_order_idx
  ON game_events(game_id, round_number, display_order);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game_events'::regclass AND conname = 'game_events_trigger_policy_check') THEN
    ALTER TABLE game_events ADD CONSTRAINT game_events_trigger_policy_check CHECK (
      (trigger_phase = 'INTRADAY' AND trigger_offset_ms > 0 AND preannounce_ms < trigger_offset_ms)
      OR (trigger_phase = 'CLOSE' AND trigger_offset_ms IS NULL AND preannounce_ms = 0)
    );
  END IF;
END $$;

ALTER TABLE stock_price_changes ADD COLUMN IF NOT EXISTS game_event_id UUID;
UPDATE stock_price_changes spc SET game_event_id = ge.id
FROM game_events ge
WHERE spc.game_event_id IS NULL AND ge.game_id = spc.game_id
  AND ge.round_number = spc.round_number AND ge.event_id = spc.event_id;
ALTER TABLE stock_price_changes ALTER COLUMN game_event_id SET NOT NULL;
ALTER TABLE stock_price_changes DROP CONSTRAINT IF EXISTS stock_price_changes_pkey;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'stock_price_changes'::regclass AND contype = 'p') THEN
    ALTER TABLE stock_price_changes ADD CONSTRAINT stock_price_changes_pkey PRIMARY KEY (game_event_id, company_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'stock_price_changes'::regclass AND conname = 'stock_price_changes_game_event_fkey') THEN
    ALTER TABLE stock_price_changes ADD CONSTRAINT stock_price_changes_game_event_fkey
      FOREIGN KEY (game_event_id) REFERENCES game_events(id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS game_events_due_idx
  ON game_events(game_id, round_number, trigger_phase, applied_at, scheduled_at);

CREATE OR REPLACE FUNCTION fill_stock_price_change_game_event_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.game_event_id IS NULL THEN
    SELECT id INTO NEW.game_event_id FROM game_events
    WHERE game_id = NEW.game_id AND round_number = NEW.round_number AND event_id = NEW.event_id
    ORDER BY display_order LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stock_price_changes_fill_game_event_id ON stock_price_changes;
CREATE TRIGGER stock_price_changes_fill_game_event_id
BEFORE INSERT ON stock_price_changes
FOR EACH ROW EXECUTE FUNCTION fill_stock_price_change_game_event_id();

CREATE TABLE IF NOT EXISTS stock_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  company_id VARCHAR(20) NOT NULL REFERENCES companies(id),
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('OPEN', 'INTRADAY_EVENT', 'CLOSE')),
  price BIGINT NOT NULL CHECK (price > 0),
  opening_price BIGINT NOT NULL CHECK (opening_price > 0),
  closing_price BIGINT CHECK (closing_price > 0),
  change_rate NUMERIC(12, 4) NOT NULL DEFAULT 0,
  source_event_id UUID REFERENCES events(id),
  game_event_id UUID REFERENCES game_events(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (snapshot_type = 'INTRADAY_EVENT' AND source_event_id IS NOT NULL AND game_event_id IS NOT NULL)
    OR (snapshot_type IN ('OPEN', 'CLOSE') AND source_event_id IS NULL AND game_event_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_price_history_boundary_idx
  ON stock_price_history(game_id, round_number, company_id, snapshot_type)
  WHERE snapshot_type IN ('OPEN', 'CLOSE');
CREATE UNIQUE INDEX IF NOT EXISTS stock_price_history_event_idx
  ON stock_price_history(game_event_id, company_id)
  WHERE snapshot_type = 'INTRADAY_EVENT';
CREATE INDEX IF NOT EXISTS stock_price_history_company_idx
  ON stock_price_history(game_id, company_id, round_number, recorded_at, id);

CREATE TABLE IF NOT EXISTS ranking_states (
  game_id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ranking_snapshots (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank > 0),
  cash NUMERIC(30, 0) NOT NULL CHECK (cash >= 0),
  stock_value NUMERIC(30, 0) NOT NULL CHECK (stock_value >= 0),
  total_assets NUMERIC(30, 0) NOT NULL CHECK (total_assets >= 0),
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, user_id)
);
CREATE INDEX IF NOT EXISTS ranking_snapshots_order_idx
  ON ranking_snapshots(game_id, is_final, rank, user_id);

-- Legacy mission tables are retained for non-destructive upgrades. The mission
-- API, assignment engine and rewards were retired in QA stage 17.
CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  mission_type TEXT NOT NULL CHECK (mission_type IN (
    'DIVERSIFIED_HOLDINGS', 'CASH_RATIO', 'CONSECUTIVE_HOLDING',
    'CONTRARIAN_PROFIT', 'TRADE_BOTH_SIDES'
  )),
  target_value INTEGER NOT NULL CHECK (target_value > 0),
  reward_points INTEGER NOT NULL CHECK (reward_points BETWEEN 1 AND 1000000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS missions_active_idx ON missions(is_active, created_at, id);

CREATE TABLE IF NOT EXISTS game_missions (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES missions(id),
  progress NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (progress >= 0),
  progress_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'COMPLETED')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  PRIMARY KEY (game_id, user_id),
  CHECK (
    (status = 'ASSIGNED' AND completed_at IS NULL AND rewarded_at IS NULL)
    OR (status = 'COMPLETED' AND completed_at IS NOT NULL AND rewarded_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS game_missions_mission_idx ON game_missions(mission_id, game_id);

CREATE TABLE IF NOT EXISTS user_reward_wallets (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points BIGINT NOT NULL DEFAULT 0 CHECK (points >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, user_id)
);

-- Private intelligence purchases are paid from the participant investment wallet.
CREATE TABLE IF NOT EXISTS intelligence_clues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL CHECK (length(trim(title)) > 0),
  summary TEXT NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 500),
  content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 5000),
  price INTEGER NOT NULL CHECK (price BETWEEN 1 AND 1000000),
  available_round INTEGER NOT NULL CHECK (available_round BETWEEN 1 AND 1000),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS intelligence_clues_catalog_idx
  ON intelligence_clues(is_active, available_round, created_at, id);
ALTER TABLE intelligence_clues ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS intelligence_clues_event_idx ON intelligence_clues(event_id);
CREATE TABLE IF NOT EXISTS intelligence_purchases (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clue_id UUID NOT NULL REFERENCES intelligence_clues(id),
  title VARCHAR(100) NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price BETWEEN 1 AND 1000000),
  available_round INTEGER NOT NULL CHECK (available_round BETWEEN 1 AND 1000),
  paid_points INTEGER CHECK (paid_points BETWEEN 1 AND 1000000),
  paid_cash BIGINT NOT NULL CHECK (paid_cash BETWEEN 1 AND 1000000),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, user_id, clue_id)
);

-- Preserve purchases created by the former mission-point shop while moving new
-- purchases to cash. These statements are intentionally idempotent because the
-- migration runner executes this complete schema for existing installations.
ALTER TABLE intelligence_purchases ADD COLUMN IF NOT EXISTS paid_cash BIGINT;
ALTER TABLE intelligence_purchases ALTER COLUMN paid_points DROP NOT NULL;
UPDATE intelligence_purchases
SET paid_cash = COALESCE(paid_cash, paid_points::BIGINT, price::BIGINT)
WHERE paid_cash IS NULL;
ALTER TABLE intelligence_purchases ALTER COLUMN paid_cash SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'intelligence_purchases'::regclass
      AND conname = 'intelligence_purchases_paid_cash_check'
  ) THEN
    ALTER TABLE intelligence_purchases
      ADD CONSTRAINT intelligence_purchases_paid_cash_check
      CHECK (paid_cash BETWEEN 1 AND 1000000);
  END IF;
END $$;

-- QA stage 22: normalize unsold active clues to the event price once. Purchase
-- snapshots are intentionally excluded, and administrators may change prices
-- again after this migration without a later schema run overwriting them.
CREATE TABLE IF NOT EXISTS app_schema_migrations (
  migration_key TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app_schema_migrations
    WHERE migration_key = '2026-09-27-link-intelligence-events'
  ) THEN
    UPDATE intelligence_clues clue SET event_id = event.id, updated_at = NOW()
    FROM (VALUES
      ('지난해 겨울방학 대학생 소비·학습 패턴 보고서','겨울 계절학기와 자격증 준비 열풍'),
      ('신입생 OT 기간 대학가 소비 기록서','신입생 OT와 새터 시즌'),
      ('지난해 개강 시즌 대학가 소비 분석 보고서','새 학기의 시작'),
      ('대학가 도로 공사 상권 영향 보고서','대학가 상권을 덮친 대규모 도로 공사'),
      ('지난해 대학 축제 소비·e스포츠 이용 분석 보고서','대학 축제와 e스포츠 대회의 열기'),
      ('지난해 기말고사 기간 대학생 스트레스 소비 분석 보고서','기말고사 기간'),
      ('지난해 장마 기간 대학가 소비 기록서','장마와 함께 찾아온 폭우'),
      ('지난해 폭염 기간 대학생 실내 소비 분석서','기록적인 폭염과 실내 피서 열풍'),
      ('두리안 막걸리 사전 시음·소비자 행동 평가서','대학가 이색 신제품, 두리안 막걸리 출시'),
      ('모빌리티 배터리 안전점검 보고서','배터리 안전사고 이후 강화된 규제'),
      ('대학가 결제 환경 변화에 따른 소비자 행동 보고서','대학가 QR결제 시스템의 도입'),
      ('지난해 겨울 한파 소비 패턴 보고서','갑작스러운 한파와 첫눈'),
      ('중앙도서관 난방설비 비공개 점검표','[속보] 심야 학습공간 운영안 긴급 변경'),
      ('웰컴키트 최종 검수 메모','[속보] 신입생 웰컴키트 공급 계약 재검토'),
      ('학생증 앱 모의해킹 요약본','[속보] 학생증 앱 보안 점검 결과 발표'),
      ('도로 지하관로 압력 이상 보고','[속보] 대학가 도로 공정 긴급 브리핑'),
      ('축제 협찬계약 비공개 부속조항','[속보] 축제 핵심 협찬 계약 조건 공개'),
      ('시험기간 변압기 부하 측정치','[속보] 시험기간 24시간 운영 계획 변경'),
      ('QR결제 API 이상 트래픽 보고서','[속보] QR결제 수수료 협상 결과 발표'),
      ('태양광 인버터 긴급 리콜 명단','[속보] 폭염 전력 수급 대책 최종 발표'),
      ('개강 셔틀 노사협상 회의록','[속보] 개강 셔틀 운행안 최종 조정'),
      ('배터리·충전기 인증 사전 판정표','[속보] 모빌리티 안전 인증 결과 공개'),
      ('e스포츠 결승장 소방점검 기록','[속보] e스포츠 결승 운영 심사 결과'),
      ('연말 물류창고 보험사 긴급점검서','[속보] 연말 공동배송 계약 긴급 점검')
    ) mapping(clue_title,event_title)
    JOIN events event ON event.title = mapping.event_title
    WHERE clue.title = mapping.clue_title AND clue.event_id IS NULL;
    INSERT INTO app_schema_migrations(migration_key)
    VALUES ('2026-09-27-link-intelligence-events');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game_events'::regclass AND conname = 'game_events_news_reveal_policy_check') THEN
    ALTER TABLE game_events ADD CONSTRAINT game_events_news_reveal_policy_check CHECK (
      news_reveal_offset_ms >= 0 AND (
        (trigger_phase = 'INTRADAY' AND news_reveal_offset_ms < trigger_offset_ms)
        OR (trigger_phase = 'CLOSE' AND trigger_offset_ms IS NULL)
      )
    );
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app_schema_migrations
    WHERE migration_key = '2026-09-27-intelligence-price-100000'
  ) THEN
    UPDATE intelligence_clues AS clue
    SET price = 100000, updated_at = NOW()
    WHERE clue.is_active
      AND NOT EXISTS (
        SELECT 1 FROM intelligence_purchases AS purchase
        WHERE purchase.clue_id = clue.id
      );
    INSERT INTO app_schema_migrations(migration_key)
    VALUES ('2026-09-27-intelligence-price-100000');
  END IF;
END $$;

-- Administrative corrections are not trades. Keep their original before/after values.
CREATE TABLE IF NOT EXISTS asset_adjustments (
  request_id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input JSONB NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS asset_adjustments_user_idx ON asset_adjustments(game_id,user_id,created_at DESC);
