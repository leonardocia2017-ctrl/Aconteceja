# Rota permanente

O Giro Horário é o único responsável editorial. Pode delegar o envio ao workflow `production-route.yml` na main, fornecendo um manifesto já validado em `queue/`. Não existe outro agendamento de publicação nesta rota.

O executor lê o mesmo registro Drive, verifica histórico do Metricool (14 dias anteriores e 7 seguintes), preserva os dados, arquiva a mídia no Drive, grava READY e SENDING com readback, envia uma única vez e registra ID/estado. Timeout, erro de envio ou resposta sem ID ficam UNKNOWN, exigindo reconciliação antes de qualquer nova tentativa. PUBLISHED exige status explícito do Instagram. O grupo de concorrência serializa estes jobs GitHub; o JSON do Drive não garante exclusão mútua com escritores externos. O Giro deve aguardar a execução delegada e não enviar diretamente em paralelo.

## Manifesto

Campos exigidos: `entities` (array), `event`, `eventDate` (data do acontecimento), `development` (fato novo), `factFingerprint`, `equivalentPautaIds` (IDs legados do mesmo fato; incluir o ID determinístico), `reviewedMetricoolIds` (todos os IDs revisados editorialmente, incluindo drafts e Stories sem texto), `title`, `caption`, `alt`, `format` (POST/STORY), `publicationDate` ISO com offset futuro, `mediaPath` (JPG real no repositório), `sources` (objetos com url, primary e independentOrganization), `highRisk`, `state: VALIDATED`, `editorialValidation: true`, `mediaLegibilityValidated: true`.

Imagem: JPG 1080x1350 para POST ou 1080x1920 para STORY. REEL permanece bloqueado até implementação de validação de vídeo. A ponte existente disponibiliza o JPG na branch media e valida seus bytes; a cópia permanente fica na pasta Drive autorizada. Fontes/novidade/legibilidade precisam ser checadas pelo Giro, não por RSS automático.

## Configuração e limites

Reutiliza OIDC e secrets METRICOOL_TOKEN/METRICOOL_USER_ID existentes. A conta de serviço precisa poder ler e editar o registro e criar arquivos na pasta indicada. Não alterar compartilhamento para público como solução de autorização. A implementação deve ser validada em execução antes de ser considerada operacional: OIDC para Google Cloud não comprova permissão no Drive, e o endpoint REST Metricool pode depender do acesso API da conta. Não reenviar automaticamente em caso de erro.

Notificações continuam a cargo do Giro e devem ser registradas uma vez por ID/status. Um ID significa solicitação aceita, não publicação concluída. Receipts do GitHub são evidência auxiliar, nunca substituem o registro central. A antiga função publishPost bloqueia envios reais sem esse protocolo, inclusive smoke tests legados.
