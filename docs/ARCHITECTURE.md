# Arquitetura — Acontece Já

Fluxo: coleta → seleção/deduplicação → edição → geração de PNG/JPG → publicação → logs.

## Coleta
A coleta usa feeds RSS configurados em `src/sources.js`. Cada item mantém título, URL original, veículo e data. O pipeline ignora itens antigos, remove duplicatas por URL/título normalizado e ordena por recência + peso editorial da fonte.

Falha em uma fonte não interrompe as demais.

## Regra operacional
Nunca registrar uma publicação como concluída sem confirmação/ID retornado pelo serviço de publicação.

O sistema começa em `DRY_RUN=true`. Antes de publicação automática, a seleção editorial e a mídia precisam ser validadas.
