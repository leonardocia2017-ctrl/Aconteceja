# Execução automática

O workflow `.github/workflows/pipeline.yml` executa validação, testes e o pipeline em `DRY_RUN=true`.

- Pode ser disparado manualmente.
- Está programado para uma execução por hora.
- A mídia gerada é preservada como artifact por 3 dias para inspeção.
- Nenhuma publicação social é feita nesta fase.
- O workflow usa `permissions: contents: read` e não recebe credenciais de publicação.

## Próxima etapa
Após validação dos cards e da seleção editorial, adicionar armazenamento persistente/URL pública para a mídia e integrar o publicador. Credenciais devem entrar somente por GitHub Secrets, nunca no repositório.


Última verificação do gatilho: pipeline seguro configurado na branch main.
