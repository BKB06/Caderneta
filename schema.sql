-- =============================================================
-- Caderneta de Apostas — Schema Corrigido e Otimizado
-- MySQL 5.7+ / MariaDB 10.2+
-- Executar com: mysql -u root < schema.sql
-- =============================================================

-- Criar base de dados (caso não exista)
CREATE DATABASE IF NOT EXISTS caderneta_apostas
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE caderneta_apostas;

-- =============================================================
-- 1. TABELA: perfis
-- Armazena os perfis de utilizador (multi-perfil).
-- =============================================================
DROP TABLE IF EXISTS dados_extras;
DROP TABLE IF EXISTS fluxo_caixa;
DROP TABLE IF EXISTS apostas;
DROP TABLE IF EXISTS perfis;

CREATE TABLE perfis (
    id           VARCHAR(64)   NOT NULL,
    name         VARCHAR(100)  NOT NULL DEFAULT 'Perfil Principal',
    banca_base   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================
-- 2. TABELA: apostas
-- Registra cada aposta individual vinculada a um perfil.
-- =============================================================
CREATE TABLE apostas (
    id           VARCHAR(64)   NOT NULL,
    profile_id   VARCHAR(64)   NOT NULL,
    date         VARCHAR(10)   NOT NULL COMMENT 'Formato DD/MM/AAAA — ver nota abaixo',
    event        VARCHAR(500)  NOT NULL,
    odds         DECIMAL(8,3)  NOT NULL,
    stake        DECIMAL(12,2) NOT NULL,
    book         VARCHAR(100)  NOT NULL DEFAULT '',
    ai           VARCHAR(100)  DEFAULT NULL,
    status       ENUM('pending','win','loss') NOT NULL DEFAULT 'pending',
    is_freebet   TINYINT(1)    NOT NULL DEFAULT 0,
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    -- Integridade referencial: apagar perfil → apagar suas apostas
    CONSTRAINT fk_apostas_perfil
        FOREIGN KEY (profile_id) REFERENCES perfis(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    -- Validações básicas (MySQL 8.0.16+ / MariaDB 10.2.1+)
    CONSTRAINT chk_apostas_odds  CHECK (odds > 1.0),
    CONSTRAINT chk_apostas_stake CHECK (stake > 0)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices para consultas frequentes
CREATE INDEX idx_apostas_profile_date   ON apostas (profile_id, date DESC);
CREATE INDEX idx_apostas_profile_status ON apostas (profile_id, status);
CREATE INDEX idx_apostas_book           ON apostas (book);


-- =============================================================
-- 3. TABELA: fluxo_caixa
-- Depósitos e saques vinculados a um perfil.
-- =============================================================
CREATE TABLE fluxo_caixa (
    id           VARCHAR(64)   NOT NULL,
    profile_id   VARCHAR(64)   NOT NULL,
    date         VARCHAR(10)   NOT NULL COMMENT 'Formato DD/MM/AAAA',
    type         ENUM('deposit','withdraw') NOT NULL,
    amount       DECIMAL(12,2) NOT NULL,
    note         VARCHAR(500)  DEFAULT '',
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_fluxo_perfil
        FOREIGN KEY (profile_id) REFERENCES perfis(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_fluxo_amount CHECK (amount > 0)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_fluxo_profile_date ON fluxo_caixa (profile_id, date DESC);
CREATE INDEX idx_fluxo_type         ON fluxo_caixa (type);


-- =============================================================
-- 4. TABELA: dados_extras
-- Configurações, metas, anotações por perfil.
-- Mantida como tabela única para compatibilidade com o JS atual,
-- mas com FK e defaults adequados.
-- =============================================================
CREATE TABLE dados_extras (
    profile_id    VARCHAR(64)  NOT NULL,
    settings_json JSON         DEFAULT NULL COMMENT 'Preferências de exibição (JSON)',
    goals_json    JSON         DEFAULT NULL COMMENT 'Metas semanais/mensais (JSON)',
    notes         TEXT         DEFAULT NULL COMMENT 'Anotações livres do utilizador',
    bankroll      DECIMAL(12,2) DEFAULT NULL COMMENT 'Banca base definida pelo utilizador',
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (profile_id),

    CONSTRAINT fk_dados_extras_perfil
        FOREIGN KEY (profile_id) REFERENCES perfis(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================
-- NOTA SOBRE O CAMPO `date` (VARCHAR vs DATE nativo)
-- =============================================================
-- O frontend (app.js) armazena datas no formato brasileiro DD/MM/AAAA
-- como string. Para migrar para DATE nativo no futuro:
--
--   1. Adicionar coluna:  ALTER TABLE apostas ADD COLUMN bet_date DATE AFTER date;
--   2. Migrar dados:      UPDATE apostas SET bet_date = STR_TO_DATE(date, '%d/%m/%Y');
--   3. Dropar antiga:     ALTER TABLE apostas DROP COLUMN date;
--   4. Renomear:          ALTER TABLE apostas CHANGE bet_date date DATE NOT NULL;
--   5. Ajustar o PHP para converter: $dateForDb = DateTime::createFromFormat('d/m/Y', $aposta['date'])->format('Y-m-d');
--   6. Ajustar o JS para reconverter na leitura.
--
-- Isso permitirá ORDER BY date correto, range queries e funções MONTH()/YEAR().
-- =============================================================
