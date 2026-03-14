ALTER TABLE ganhos_casino
  ADD COLUMN IF NOT EXISTS is_free    TINYINT(1)   NOT NULL DEFAULT 0
    COMMENT '1 = rodadas grátis, 0 = sessão normal',
  ADD COLUMN IF NOT EXISTS free_spins INT           DEFAULT NULL
    COMMENT 'Número de rodadas grátis',
  ADD COLUMN IF NOT EXISTS spin_bet   DECIMAL(8,2)  DEFAULT NULL
    COMMENT 'Valor apostado por rodada grátis';
