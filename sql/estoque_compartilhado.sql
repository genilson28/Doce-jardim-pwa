-- ============================================================
-- DOCE JARDIM — Estoque compartilhado (ex.: sucos que baixam da polpa)
-- ============================================================
-- Rode uma vez no Editor SQL do Supabase (Dashboard > SQL Editor).
--
-- produto_base_id : de qual produto este baixa o estoque (NULL = estoque próprio)
-- qtd_base        : quantas unidades da base saem a cada 1 vendido (padrão 1)
-- somente_estoque : item só de estoque (ex.: polpa) — não aparece no PDV/mesas
-- ============================================================

ALTER TABLE produto
    ADD COLUMN IF NOT EXISTS produto_base_id BIGINT REFERENCES produto(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS qtd_base        INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS somente_estoque BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produto_qtd_base_positiva') THEN
        ALTER TABLE produto ADD CONSTRAINT produto_qtd_base_positiva CHECK (qtd_base > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produto_base_nao_propria') THEN
        ALTER TABLE produto ADD CONSTRAINT produto_base_nao_propria CHECK (produto_base_id IS NULL OR produto_base_id <> id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_produto_base ON produto(produto_base_id);
