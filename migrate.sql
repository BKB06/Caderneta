-- =============================================================
-- Caderneta de Apostas — Migração Incremental (sem perder dados)
-- Executar com: /opt/lampp/bin/mysql -u root < migrate.sql
-- =============================================================

USE caderneta_apostas;

-- 1. Adicionar colunas que faltam na tabela perfis
ALTER TABLE perfis
    ADD COLUMN IF NOT EXISTS banca_base   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Renomear isFreebet → is_freebet (se existir a coluna antiga)
--    E adicionar colunas de timestamp
SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'caderneta_apostas'
      AND TABLE_NAME = 'apostas'
      AND COLUMN_NAME = 'isFreebet'
);

SET @sql = IF(@col_exists > 0,
    'ALTER TABLE apostas CHANGE COLUMN isFreebet is_freebet TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT "Coluna is_freebet já existe ou isFreebet não encontrada"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Adicionar timestamps se não existirem
ALTER TABLE apostas
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 3. Alterar tipo de 'status' para ENUM (se ainda for VARCHAR)
--    NOTA: só funciona se todos os valores existentes forem 'pending','win' ou 'loss'
--    Caso contrário, limpar antes: UPDATE apostas SET status='pending' WHERE status NOT IN ('pending','win','loss');
-- ALTER TABLE apostas MODIFY COLUMN status ENUM('pending','win','loss') NOT NULL DEFAULT 'pending';

-- 4. Adicionar timestamps na fluxo_caixa
ALTER TABLE fluxo_caixa
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 5. Adicionar updated_at na dados_extras
ALTER TABLE dados_extras
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 6. FOREIGN KEYS (só adiciona se não existirem)
--    O InnoDB é obrigatório — verificar engine primeiro:
--    ALTER TABLE apostas ENGINE=InnoDB;
--    ALTER TABLE fluxo_caixa ENGINE=InnoDB;
--    ALTER TABLE dados_extras ENGINE=InnoDB;
--    ALTER TABLE perfis ENGINE=InnoDB;

-- FK apostas → perfis
SET @fk_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = 'caderneta_apostas'
      AND TABLE_NAME = 'apostas'
      AND CONSTRAINT_NAME = 'fk_apostas_perfil'
);
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE apostas ADD CONSTRAINT fk_apostas_perfil FOREIGN KEY (profile_id) REFERENCES perfis(id) ON DELETE CASCADE ON UPDATE CASCADE',
    'SELECT "FK fk_apostas_perfil já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK fluxo_caixa → perfis
SET @fk_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = 'caderneta_apostas'
      AND TABLE_NAME = 'fluxo_caixa'
      AND CONSTRAINT_NAME = 'fk_fluxo_perfil'
);
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE fluxo_caixa ADD CONSTRAINT fk_fluxo_perfil FOREIGN KEY (profile_id) REFERENCES perfis(id) ON DELETE CASCADE ON UPDATE CASCADE',
    'SELECT "FK fk_fluxo_perfil já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- FK dados_extras → perfis
SET @fk_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = 'caderneta_apostas'
      AND TABLE_NAME = 'dados_extras'
      AND CONSTRAINT_NAME = 'fk_dados_extras_perfil'
);
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE dados_extras ADD CONSTRAINT fk_dados_extras_perfil FOREIGN KEY (profile_id) REFERENCES perfis(id) ON DELETE CASCADE ON UPDATE CASCADE',
    'SELECT "FK fk_dados_extras_perfil já existe"'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 7. ÍNDICES (só adiciona se não existirem)
CREATE INDEX IF NOT EXISTS idx_apostas_profile_date   ON apostas (profile_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_apostas_profile_status ON apostas (profile_id, status);
CREATE INDEX IF NOT EXISTS idx_apostas_book           ON apostas (book);
CREATE INDEX IF NOT EXISTS idx_fluxo_profile_date     ON fluxo_caixa (profile_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_fluxo_type             ON fluxo_caixa (type);

SELECT '✅ Migração concluída com sucesso!' AS resultado;
