-- ============================================================
-- DOCE JARDIM — Um cadastro por suco (preço sem leite + com leite)
-- ============================================================
-- Rode UMA vez no SQL Editor do Supabase (projeto do Doce Jardim).
-- Tudo roda junto: se algo falhar, nada é alterado.
-- ============================================================
BEGIN;

ALTER TABLE produto ADD COLUMN IF NOT EXISTS preco_com_leite NUMERIC;

CREATE TEMP TABLE mapa(agua bigint, leite bigint) ON COMMIT DROP;
INSERT INTO mapa VALUES (944,967),(945,968),(946,969),(947,970),(1113,1037),(949,971),(957,979),(950,972),(1006,1007),(951,973),(952,974),(954,976),(956,978),(955,977);

-- 1) O preço do "SUCO C/ LEITE" vira o "preço com leite" do suco
UPDATE produto a SET preco_com_leite = l.preco
FROM mapa m JOIN produto l ON l.id = m.leite
WHERE a.id = m.agua;

-- 2) Vendas antigas: item "c/ leite" passa a apontar para o suco, marcado com_leite
UPDATE vendas v SET itens = to_jsonb(novo.arr::text)
FROM (
  SELECT v2.id,
         jsonb_agg(CASE WHEN m.leite IS NOT NULL
                        THEN e || jsonb_build_object('id', m.agua, 'com_leite', true)
                        ELSE e END ORDER BY ord) AS arr
  FROM vendas v2
  CROSS JOIN LATERAL jsonb_array_elements((v2.itens #>> '{}')::jsonb) WITH ORDINALITY AS t(e, ord)
  LEFT JOIN mapa m ON m.leite = (e->>'id')::bigint
  WHERE jsonb_typeof(v2.itens) = 'string'
    AND v2.itens::text ~ 'id\\?":(967|968|969|970|1037|971|979|972|1007|973|974|976|978|977)[,}]'
  GROUP BY v2.id
) novo
WHERE v.id = novo.id;

-- 3) Comandas abertas nas mesas
UPDATE mesas ms SET pedido_atual = novo.arr::text
FROM (
  SELECT ms2.id,
         jsonb_agg(CASE WHEN m.leite IS NOT NULL
                        THEN e || jsonb_build_object('id', m.agua, 'com_leite', true)
                        ELSE e END ORDER BY ord) AS arr
  FROM mesas ms2
  CROSS JOIN LATERAL jsonb_array_elements(ms2.pedido_atual::jsonb) WITH ORDINALITY AS t(e, ord)
  LEFT JOIN mapa m ON m.leite = (e->>'id')::bigint
  WHERE ms2.pedido_atual ~ 'id":(967|968|969|970|1037|971|979|972|1007|973|974|976|978|977)[,}]'
  GROUP BY ms2.id
) novo
WHERE ms.id = novo.id;

-- 4) Compras antigas desses sucos passam para a polpa
UPDATE compras_itens ci SET produto_id = p.produto_base_id
FROM mapa m JOIN produto p ON p.id = m.agua
WHERE ci.produto_id IN (m.agua, m.leite);

-- 5) Exclui os 14 cadastros duplicados "SUCO C/ LEITE ..."
DELETE FROM produto WHERE id IN (SELECT leite FROM mapa);

COMMIT;

-- Conferência: deve listar 14 sucos com os dois preços
SELECT nome, preco AS sem_leite, preco_com_leite AS com_leite
FROM produto WHERE preco_com_leite IS NOT NULL ORDER BY nome;
