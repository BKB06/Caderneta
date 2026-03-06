-- =============================================================
-- Caderneta de Apostas — Migração: Categorias de Esportes
-- Executar com: /opt/lampp/bin/mysql -u root < migrate_categories.sql
-- =============================================================

USE caderneta_apostas;

-- 1. Criar tabela de categorias
CREATE TABLE IF NOT EXISTS categorias (
    id           VARCHAR(64)   NOT NULL,
    profile_id   VARCHAR(64)   NOT NULL,
    name         VARCHAR(100)  NOT NULL,
    icon         VARCHAR(10)   DEFAULT '🏅',
    sort_order   INT           NOT NULL DEFAULT 0,
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    CONSTRAINT fk_categorias_perfil
        FOREIGN KEY (profile_id) REFERENCES perfis(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_categorias_profile ON categorias (profile_id, sort_order);

-- 2. Adicionar coluna category na tabela apostas
ALTER TABLE apostas
    ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT NULL COMMENT 'Categoria/esporte da aposta';

CREATE INDEX idx_apostas_category ON apostas (category);
