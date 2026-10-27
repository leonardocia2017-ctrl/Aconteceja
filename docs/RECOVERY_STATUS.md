# Recuperação operacional — atualização de 27/10/2026

## Estado confirmado
- Amazonas: `amazonas-1791925600753`, owner `chat-aconteceja-amazonas-1791925600753`, UNKNOWN, sem metricool_id, retry_allowed:false.
- Quarentena preservada. Hash da identidade editorial recalculado e correspondente ao registro central e à reserva: `09cd275e85d0e9014ea2ed3c57f0842d3b6ec024b356b20d7487d2b42a7af4ca`.
- MGApp: ID 391970200, PUBLISHED e URL correspondente persistidos. O commit dd82b8a encerrou a reserva anterior; não comprova publicação nova.
- A atualização de evidências de 27/10 usou reserva temporária AUDITING, exclusivamente para metadados. A reserva deve retornar a IDLE após readback, preservando lastCompleted e quarantinedAttempts; nenhum envio social foi iniciado.

## Evidência do suporte
O commit 47ebbd1 adicionou audit/support-amazonas-20261018.json. A resposta de Bruno (assistente de IA da Metricool) interpreta o erro de data e informa encaminhamento à equipe técnica; não contém logs técnicos nem confirmação definitiva de rejeição.
Em 27/10 essa observação histórica foi incorporada ao mesmo registro central Drive, com origem e data de importação explícitas. Não foi tratada como nova resposta técnica nem como evidência de reject.
Busca Gmail após 13/10 por Metricool ou pela referência local não retornou mensagens. Isso não comprova inexistência de resposta em outros canais.

## Logs ainda necessários
1. Referência técnica correlacionada à solicitação original e marca 7125091.
2. Payload e data efetivamente recebidos: o manifesto salvo contém 2026-10-13T18:15:00-03:00; o erro cita 2026-10-13T18:15:00. A origem da perda de offset não está comprovada.
3. Confirmação positiva de aceitação com ID real ou rejeição definitiva sem aceitação/criação.
4. Se aceita, status final por ID e URL pública Instagram correspondente.

Quando houver prova positiva, aguardar IDLE e executar resume com owner/attemptId originais. Usar recover ou reject com evidência real, persistir/reler e reconciliar/liberar conforme CONNECTOR_ROUTE.md. Essas operações não reenviam o Amazonas.

## Bloqueio operacional novo
Em 27/10, metricool_getbrandsettings retornou INVALID_ARGUMENT: "This brand doesn't have any social network connected yet." para a marca 7125091.
Reconexão: https://app.metricool.com/brands/connections?blogId=7125091
Não foi tentada nova publicação. Acesso e histórico completo precisam ser verificados novamente após reconexão.

## Nova pauta independente
Seguir CONNECTOR_ROUTE.md: reserva única com SHA, registro e quarentena íntegros, novidade editorial, histórico completo de publicados/rascunhos/pendentes (14 dias anteriores e 7 seguintes), fontes e mídia real arquivada/releitura, manifesto com data futura e offset.
Persistir e reler READY, SENDING e DISPATCHING antes de uma única chamada. ID confirma aceitação; publicação exige o mesmo ID, provedor Instagram PUBLISHED e URL pública correspondente.
A rota continua chatgpt_metricool_connector. REST e REEL permanecem bloqueados. Não inventar completude, recibos antigos ou conclusão do provedor.

Evidências desta atualização e minuta de solicitação técnica não enviada: [audit/amazonas-readiness-20261027.json](../audit/amazonas-readiness-20261027.json).
