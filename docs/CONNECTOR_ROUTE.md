# Rota de publicação pelo conector
A rota ativa é chatgpt_metricool_connector, executada pelo Giro Horário existente. A API REST não é pré-requisito desta rota. Os conectores só estão disponíveis no ambiente ChatGPT; o Node valida as transições, sem chamar os conectores nem publicar sozinho.

## Reserva antes de escrever
Leia .aconteceja/connector-lock.json na main com github_fetch_file e guarde seu blob SHA. Gere owner e attemptId únicos. Se state não for IDLE, não escreva nem envie: reconcilie a tentativa existente. Use a etapa claim do protocolo para gerar ACTIVE e grave pelo github_update_file com o SHA lido. Um conflito invalida a tentativa; não releia e sobrescreva uma reserva ocupada. Releia e compare owner/attemptId e conteúdo. Não há expiração automática: uma execução interrompida pode ter enviado.
O controle depende de todos os escritores respeitarem a reserva. O JSON do Drive e seu readback não garantem exclusão contra escritores externos. A rota REST via CLI fica bloqueada enquanto .aconteceja/routes.json indicar connector.

## Validação das etapas
Materialize src/services/connector-protocol.js da main e execute Node local com arquivos JSON temporários:
node src/services/connector-protocol.js claim input.json output.json
node src/services/connector-protocol.js ready input.json output.json
node src/services/connector-protocol.js verify input.json output.json
node src/services/connector-protocol.js sending input.json output.json
node src/services/connector-protocol.js accepted input.json output.json
node src/services/connector-protocol.js unknown input.json output.json
node src/services/connector-protocol.js reconcile input.json output.json

Claim recebe lock, owner e attemptId. Verify recebe expected e actual e exige igualdade integral.
As demais etapas recebem registry, manifest, history, media, lock, owner, attemptId e now (ISO).
Manifest exige identidade factual, equivalências legadas, fingerprint, título, legenda, alt, fontes e validações explícitas, formato POST/STORY, data futura com offset, IDs revisados.
History: rows, from, to, complete:true, hasMore:false, includesPublished:true, includesDrafts:true, includesPending:true e completionEvidence. Esses campos são comprovantes da consulta/revisão; nunca inventá-los. Exigir cobertura de 14 dias anteriores e 7 seguintes e da data de publicação. Um array sem metadados não comprova completude: completar pela revisão/exportação do Planner ou bloquear. Revisar todo ID, inclusive drafts e Stories sem texto.
Media: drive_id, sha256, archiveReadbackSha, mime:image/jpeg, width:1080, height:1350 para POST ou 1920 para STORY. Arquivar pela conta de usuário no Drive conectado e comparar os bytes baixados com os locais antes de declarar archiveReadbackSha.

## Envio único
1. Reserve o escritor. Leia o registro atual e o histórico completo; valide a pauta e mídia.
2. Rode ready. Grave apenas output.registry no MESMO arquivo Drive, preservando seus demais campos. Antes de atualizar, compare leitura fresca com o snapshot. Releia o conteúdo completo e rode verify.
3. Reconsulte histórico e reserva, rode sending, grave output.registry e confirme verify. Se qualquer operação falhar ou o horário vencer, não envie.
4. Apenas após sending e readback íntegro, chame createScheduledPost UMA vez, marca 7125091, providers instagram, autoPublish:true, draft:false, mídia real e publicationDate em America/Sao_Paulo no info e date. Use mediaFiles com arquivo suportado; não invente URL nem torne a pasta pública.
5. Rode accepted com response id/data.id/metricoolId real. Se erro ambíguo ou sem ID, use unknown. Grave e confirme readback. Sem ID, não declarar aceitação nem reenviar. Se a escrita após envio falhar, manter reserva ocupada e reconciliar a tentativa; SENDING também impede retry.
6. Para status, rode reconcile com observed retornado pelo provedor para o MESMO ID. PUBLISHED exige providers instagram com status PUBLISHED. Ausência da listagem nunca comprova publicação. Preservar evidência/URL. ID conhecido e recibo persistido permitem devolver reserva a IDLE; UNKNOWN ou falha de persistência exigem reconciliação antes de liberar.
7. Aviso único por ID/status: registrar notified_at após entrega confirmada. Aviso de resultado incerto não é aviso de publicação.
O rascunho de teste 391069292 nunca deve ser promovido automaticamente. Não reenviar a notícia 391073818 já publicada. REEL permanece bloqueado neste protocolo até implementação de validação de vídeo.

## Limite de cobertura
Os testes validam as regras e o tratamento de evidências. Não comprovam publicação operacional nova. A tarefa executa as operações dos conectores entre as etapas Node; GitHub Actions não acessa esses conectores. O preflight REST antigo continua independente e pode falhar por ausência de secrets ou cota de conta de serviço.
