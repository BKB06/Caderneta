-- =============================================================
-- Caderneta de Apostas — Migração: Cashout + Void
-- Executar com: /opt/lampp/bin/mysql -u root < migrate_cashout.sql
-- =============================================================

USE caderneta_apostas;

-- 1. Alterar ENUM de status para incluir 'void' e 'cashout'
ALTER TABLE apostas
    MODIFY COLUMN status ENUM('pending','win','loss','void','cashout') NOT NULL DEFAULT 'pending';

-- 2. Adicionar coluna cashout_value para armazenar o valor do cashout
ALTER TABLE apostas
    ADD COLUMN IF NOT EXISTS cashout_value DECIMAL(12,2) DEFAULT NULL COMMENT 'Valor recebido no cashout';
