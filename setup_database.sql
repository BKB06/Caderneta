-- =============================================================
-- Caderneta de Apostas - Full database setup (fresh install)
-- MySQL 8.0+ / MariaDB 10.3+
-- =============================================================

DROP DATABASE IF EXISTS caderneta_apostas;

CREATE DATABASE caderneta_apostas
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE caderneta_apostas;

-- Drop in dependency order
DROP TABLE IF EXISTS ganhos_casino;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS dados_extras;
DROP TABLE IF EXISTS fluxo_caixa;
DROP TABLE IF EXISTS apostas;
DROP TABLE IF EXISTS perfis;

-- =============================================================
-- perfis
-- =============================================================
CREATE TABLE perfis (
    id           VARCHAR(64)   NOT NULL,
    name         VARCHAR(100)  NOT NULL DEFAULT 'Perfil Principal',
    banca_base   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- apostas
-- =============================================================
CREATE TABLE apostas (
    id             VARCHAR(64)   NOT NULL,
    profile_id     VARCHAR(64)   NOT NULL,
    date           VARCHAR(10)   NOT NULL COMMENT 'DD/MM/YYYY',
    event          VARCHAR(500)  NOT NULL,
    odds           DECIMAL(8,3)  NOT NULL,
    stake          DECIMAL(12,2) NOT NULL,
    book           VARCHAR(100)  NOT NULL DEFAULT '',
    ai             VARCHAR(500)  DEFAULT NULL COMMENT 'CSV list of AIs',
    status         ENUM('pending','win','loss','void','cashout') NOT NULL DEFAULT 'pending',
    is_freebet     TINYINT(1)    NOT NULL DEFAULT 0,
    is_boost       TINYINT(1)    NOT NULL DEFAULT 0,
    category       VARCHAR(100)  DEFAULT NULL,
    cashout_value  DECIMAL(12,2) DEFAULT NULL,
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_apostas_perfil
      FOREIGN KEY (profile_id) REFERENCES perfis(id)
      ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT chk_apostas_odds  CHECK (odds > 1.0),
    CONSTRAINT chk_apostas_stake CHECK (stake > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_apostas_profile_date   ON apostas (profile_id, date DESC);
CREATE INDEX idx_apostas_profile_status ON apostas (profile_id, status);
CREATE INDEX idx_apostas_book           ON apostas (book);
CREATE INDEX idx_apostas_boost          ON apostas (is_boost);
CREATE INDEX idx_apostas_category       ON apostas (category);

-- =============================================================
-- fluxo_caixa
-- =============================================================
CREATE TABLE fluxo_caixa (
    id           VARCHAR(64)   NOT NULL,
    profile_id   VARCHAR(64)   NOT NULL,
    date         VARCHAR(10)   NOT NULL COMMENT 'DD/MM/YYYY',
    type         ENUM('deposit','withdraw') NOT NULL,
    amount       DECIMAL(12,2) NOT NULL,
    note         VARCHAR(500)  DEFAULT '',
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_fluxo_perfil
      FOREIGN KEY (profile_id) REFERENCES perfis(id)
      ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT chk_fluxo_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_fluxo_profile_date ON fluxo_caixa (profile_id, date DESC);
CREATE INDEX idx_fluxo_type         ON fluxo_caixa (type);

-- =============================================================
-- dados_extras
-- =============================================================
CREATE TABLE dados_extras (
    profile_id    VARCHAR(64)   NOT NULL,
    settings_json JSON          DEFAULT NULL,
    goals_json    JSON          DEFAULT NULL,
    notes         TEXT          DEFAULT NULL,
    bankroll      DECIMAL(12,2) DEFAULT NULL,
    updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (profile_id),
    CONSTRAINT fk_dados_extras_perfil
      FOREIGN KEY (profile_id) REFERENCES perfis(id)
      ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- categorias
-- =============================================================
CREATE TABLE categorias (
    id           VARCHAR(64)   NOT NULL,
    profile_id   VARCHAR(64)   NOT NULL,
    name         VARCHAR(100)  NOT NULL,
    icon         VARCHAR(10)   DEFAULT '*',
    sort_order   INT           NOT NULL DEFAULT 0,
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_categorias_perfil
      FOREIGN KEY (profile_id) REFERENCES perfis(id)
      ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_categorias_profile ON categorias (profile_id, sort_order);

-- =============================================================
-- ganhos_casino
-- =============================================================
CREATE TABLE ganhos_casino (
    id           VARCHAR(64)   NOT NULL,
    profile_id   VARCHAR(64)   NOT NULL,
    date         VARCHAR(10)   NOT NULL COMMENT 'DD/MM/YYYY',
    game         VARCHAR(200)  NOT NULL,
    platform     VARCHAR(100)  NOT NULL DEFAULT '',
    bet_amount   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    win_amount   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    is_free      TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '1 free spins session, 0 normal',
    free_spins   INT           DEFAULT NULL,
    spin_bet     DECIMAL(8,2)  DEFAULT NULL,
    ais          VARCHAR(500)  DEFAULT NULL,
    note         VARCHAR(500)  DEFAULT '',
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_casino_perfil
      FOREIGN KEY (profile_id) REFERENCES perfis(id)
      ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_casino_profile_date ON ganhos_casino (profile_id, date DESC);
CREATE INDEX idx_casino_platform     ON ganhos_casino (platform);

SELECT 'OK - database created successfully' AS result;
