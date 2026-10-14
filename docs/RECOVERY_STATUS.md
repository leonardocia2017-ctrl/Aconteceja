# Recuperação operacional — 14/10/2026

Leitura do registro central e da reserva: tentativa `amazonas-1791925600753`, owner `chat-aconteceja-amazonas-1791925600753`, estado UNKNOWN sem metricool_id; reserva ACTIVE. A resposta persistida é INVALID_ARGUMENT por data `2026-10-13T18:15:00` sem offset. Horário original já vencido.

A nova consulta ao conector Metricool para 30/09–22/10/2026, com extendedRange, não apresentou registro identificável desta tentativa. A resposta não oferece prova de completude nem confirmação positiva de rejeição. Não serve para declarar REJECTED, liberar a reserva ou publicar novamente.

Próxima operação: obter confirmação correlacionada do provedor de aceitação com ID ou rejeição definitiva sem aceitação; preservar a resposta real e sua referência. Usar recover ou reject com readback atual. Em caso de aceitação, reconciliar ID/status/URL. Em rejeição comprovada, gravar e reler REJECTED e executar release. Não alterar a reserva antes disso.

O MGApp mantém evidência legada de publicação do ID 391970200 e URL pública correspondente; não reenviar. Os novos recibos de histórico/readback não existem retroativamente nos registros antigos.

Esta correção não efetua publicação social, não altera o registro Drive e não libera a reserva pendente. A rota ativa permanece chatgpt_metricool_connector; não habilitar REST em paralelo.

## Alternativa operacional sem declaração de rejeição

As métricas de Stories de 13/10 a 14/10 retornaram apenas o Story MEC Enem, ID Instagram 4006971798725366194. A aba Postagens excluídas do Planner mostrou que não há itens excluídos. Essas consultas não provam rejeição do Amazonas.

A resposta síncrona INVALID_ARGUMENT já persistida permite colocar a tentativa em quarentena auditável, mantendo UNKNOWN e bloqueando reenvio desse fato. A reserva pode ficar IDLE com quarantinedAttempts para receber exclusivamente novas pautas independentes. O caso de suporte segue pendente; a resposta técnica futura deve ser reconciliada após retomar a reserva com resume, sem criar novo post para o Amazonas.
