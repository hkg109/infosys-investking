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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  company_id VARCHAR(20) NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  quantity BIGINT NOT NULL CHECK (quantity > 0),
  price BIGINT NOT NULL CHECK (price > 0),
  total_price BIGINT NOT NULL CHECK (total_price > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transactions_user_created_idx ON transactions(game_id, user_id, created_at DESC);

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

CREATE TABLE IF NOT EXISTS event_effects (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  company_id VARCHAR(20) NOT NULL REFERENCES companies(id),
  change_rate INTEGER NOT NULL CHECK (change_rate BETWEEN -99 AND 1000),
  PRIMARY KEY (event_id, company_id)
);

CREATE TABLE IF NOT EXISTS game_events (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id),
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  applied_at TIMESTAMPTZ,
  PRIMARY KEY (game_id, round_number),
  UNIQUE (game_id, event_id)
);

CREATE TABLE IF NOT EXISTS stock_price_changes (
  game_id UUID NOT NULL,
  round_number INTEGER NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id),
  company_id VARCHAR(20) NOT NULL REFERENCES companies(id),
  previous_price BIGINT NOT NULL CHECK (previous_price > 0),
  new_price BIGINT NOT NULL CHECK (new_price > 0),
  change_rate INTEGER NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, round_number, company_id),
  FOREIGN KEY (game_id, round_number) REFERENCES game_events(game_id, round_number) ON DELETE CASCADE
);

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
