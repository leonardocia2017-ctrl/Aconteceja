# Recuperação operacional — 14/10/2026

Leitura do registro central e da reserva: tentativa `amazonas-1791925600753`, owner `chat-aconteceja-amazonas-1791925600753`, estado UNKNOWN sem metricool_id; reserva ACTIVE. A resposta persistida é INVALID_ARGUMENT por data `2026-10-13T18:15:00` sem offset. Horário original já vencido.

A nova consulta ao conector Metricool para 30/09–22/10/2026, com extendedRange, não apresentou registro identificável desta tentativa. A resposta não oferece prova de completude nem confirmação positiva de rejeição. Não serve para declarar REJECTED, liberar a reserva ou publicar novamente.

Próxima operação: obter confirmação correlacionada do provedor de aceitação com ID ou rejeição definitiva sem aceitação; preservar a resposta real e sua referência. Usar recover ou reject com readback atual. Em caso de aceitação, reconciliar ID/status/URL. Em rejeição comprovada, gravar e reler REJECTED e executar release. Não alterar a reserva antes disso.

O MGApp mantém evidência legada de publicação do ID 391970200 e URL pública correspondente; não reenviar. Os novos recibos de histórico/readback não existem retroativamente nos registros antigos.

Esta correção não efetua publicação social, não altera o registro Drive e não libera a reserva pendente. A rota ativa permanece chatgpt_metricool_connector; não habilitar REST em paralelo.
