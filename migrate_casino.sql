-- =============================================================
-- Caderneta de Apostas — Migração: Cassino + IA Múltipla
-- Executar com: /opt/lampp/bin/mysql -u root < migrate_casino.sql
-- =============================================================

USE caderneta_apostas;

-- =============================================================
-- 1. TABELA: ganhos_casino
-- Registra ganhos/perdas em jogos de cassino (slots, roleta, etc.)
-- =============================================================
CREATE TABLE IF NOT EXISTS ganhos_casino (
    id           VARCHAR(64)   NOT NULL,
    profile_id   VARCHAR(64)   NOT NULL,
    date         VARCHAR(10)   NOT NULL COMMENT 'Formato DD/MM/AAAA',
    game         VARCHAR(200)  NOT NULL COMMENT 'Nome do jogo (ex: Fortune Tiger, Mines)',
    platform     VARCHAR(100)  NOT NULL DEFAULT '' COMMENT 'Plataforma/casa (ex: Blaze, Bet365)',
    bet_amount   DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Valor apostado na sessão',
    win_amount   DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Valor ganho (retorno total)',
    ais          VARCHAR(500)  DEFAULT NULL COMMENT 'IAs que sugeriram, separadas por vírgula',
    note         VARCHAR(500)  DEFAULT '' COMMENT 'Observação livre',
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_casino_perfil
        FOREIGN KEY (profile_id) REFERENCES perfis(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_casino_profile_date ON ganhos_casino (profile_id, date DESC);
CREATE INDEX idx_casino_platform     ON ganhos_casino (platform);

-- =============================================================
-- 2. Alterar tabela apostas: campo ai passa a suportar múltiplas IAs
--    (armazenadas como CSV: "Grok,Claude,Gemini")
--    A coluna já é VARCHAR(100), vamos aumentar para 500
-- =============================================================
ALTER TABLE apostas
    MODIFY COLUMN ai VARCHAR(500) DEFAULT NULL COMMENT 'IAs que sugeriram, separadas por vírgula';
