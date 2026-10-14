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
node src/services/connector-protocol.js request input.json output.json
node src/services/connector-protocol.js dispatch input.json output.json
node src/services/connector-protocol.js recover input.json output.json
node src/services/connector-protocol.js reject input.json output.json
node src/services/connector-protocol.js accepted input.json output.json
node src/services/connector-protocol.js unknown input.json output.json
node src/services/connector-protocol.js reconcile input.json output.json
node src/services/connector-protocol.js release input.json output.json

Claim recebe lock, owner e attemptId. Verify recebe expected, actual e now (ISO), exige igualdade integral e retorna verified, sha256 do snapshot completo e checked_at. Guarde esse recibo durável. Sending, dispatch e accepted exigem readback com esse recibo relativo ao registro de entrada atual; snapshot alterado invalida o recibo.
Reconcile recebe registry, target:{pauta_id,metricool_id}, observed, lock, owner, attemptId e now (ISO). Exige um único registro correspondente, a mesma reserva e o mesmo ID observado. Não autoriza envio. As demais etapas recebem registry, manifest, history, media, lock, owner, attemptId e now (ISO). Ready preserva o manifesto e o histórico completo no registro para recuperação. Sending exige o mesmo manifesto integral, preserva a nova consulta de histórico e o recibo de leitura de READY. Dispatch preserva o recibo de leitura de SENDING e a requisição exata/hash em CONNECTOR_REQUEST. Accepted preserva o recibo de leitura de DISPATCHING e a resposta bruta em CONNECTOR_RECEIPT. Reconcile preserva a observação bruta em CONNECTOR_OBSERVATION, inclusive quando a URL falha na validação; nesse caso retorna reconciliation_error e publicationConfirmed:false, sem promover o estado. Grave esse resultado mesmo quando não houver confirmação.
Manifest exige identidade factual, equivalências legadas, fingerprint, título, legenda, alt, fontes e validações explícitas, formato POST/STORY, data futura com offset, IDs revisados.
History: rows, from, to, complete:true, hasMore:false, includesPublished:true, includesDrafts:true, includesPending:true e completionEvidence. Esses campos são comprovantes da consulta/revisão; nunca inventá-los. Exigir cobertura de 14 dias anteriores e 7 seguintes e da data de publicação. Um array sem metadados não comprova completude: completar pela revisão/exportação do Planner ou bloquear. Revisar todo ID, inclusive drafts e Stories sem texto.
Media: drive_id, sha256, archiveReadbackSha, mime:image/jpeg, width:1080, height:1350 para POST ou 1920 para STORY. Arquivar pela conta de usuário no Drive conectado e comparar os bytes baixados com os locais antes de declarar archiveReadbackSha.

## Envio único
1. Reserve o escritor. Leia o registro atual e o histórico completo; valide a pauta e mídia.
2. Rode ready. Grave apenas output.registry no MESMO arquivo Drive, preservando seus demais campos. Antes de atualizar, compare leitura fresca com o snapshot. Releia o conteúdo completo e rode verify.
3. Reconsulte histórico e reserva, rode sending, grave output.registry e confirme verify. Se qualquer operação falhar ou o horário vencer, não envie.
4. Apenas após sending e readback íntegro, rode dispatch com registry, lock, owner, attemptId, now, readback e mediaFiles:[caminhoLocalDoJPG]. O CLI lê os bytes desse arquivo e exige SHA-256 igual ao arquivo validado no registro antes de gerar a chamada. Dispatch retorna registry, request e sendAuthorized:true; grave registry no mesmo arquivo Drive e releia com verify ANTES da chamada externa. O estado DISPATCHING impede uma nova preparação com o snapshot atual. Guarde o recibo e use request retornado sem modificações. Se a persistência falhar ou houver interrupção, NÃO repetir o envio: investigar a mesma tentativa. Request isolado apenas prepara parâmetros, não autoriza chamada. Use blogId, date e info retornados sem remover o offset: date E info.publicationDate.dateTime recebem ISO 8601 completo com ±HH:MM, timezone America/Sao_Paulo. Não usar YYYY-MM-DDTHH:MM:SS sem fuso: causa INVALID_ARGUMENT no conector. Chame createScheduledPost UMA vez, com a mídia real. Use mediaFiles com arquivo suportado; não invente URL nem torne a pasta pública.
5. Rode accepted a partir de DISPATCHING, com seu readback, e response id/data.id/metricoolId real. Se erro ambíguo ou sem ID, use unknown. Grave e confirme readback. Sem ID, não declarar aceitação nem reenviar. Se a escrita após envio falhar, manter reserva ocupada e reconciliar a tentativa; SENDING e DISPATCHING também impedem retry.
6. Para status, rode reconcile com observed retornado pelo provedor para o MESMO ID. PUBLISHED exige ID positivo válido, um único providers instagram com status PUBLISHED e publicUrl HTTPS válida, do formato da pauta. Para STORY, exige conta aconteceja; se provider.id for URL, deve corresponder ao publicUrl. URL ausente, inválida ou divergente bloqueia a transição. Ausência da listagem nunca comprova publicação. Preservar evidência/URL. Para liberar, faça readback do registro final, execute release com registry, lock, owner, attemptId, readback e now, grave o resultado pelo SHA atual da reserva no GitHub e releia. Release exige PUBLISHED com ID/URL/evidência coerentes e sem observação contraditória pendente, ou REJECTED com prova positiva de rejeição, ou FAILED com observação final inequívoca do mesmo ID. FAILED libera o escritor para outras pautas, mas não permite recriar o fato com ID conhecido. Guarda readback e closed_at em lastCompleted. UNKNOWN ou falha de persistência exigem reconciliação antes de liberar. Uma resposta de erro e ausência na listagem não autorizam, sozinhas, liberação ou retry. A recuperação de UNKNOWN sem ID exige investigação com evidência do provedor; não fabrique target.metricool_id.
7. Aviso único por ID/status: registrar notified_at após entrega confirmada. Aviso de resultado incerto não é aviso de publicação.
O rascunho de teste 391069292 nunca deve ser promovido automaticamente. Não reenviar a notícia 391073818 já publicada. REEL permanece bloqueado neste protocolo até implementação de validação de vídeo.

## Limite de cobertura
Os testes validam as regras e o tratamento de evidências. Não comprovam publicação operacional nova. A tarefa executa as operações dos conectores entre as etapas Node; GitHub Actions não acessa esses conectores. O preflight REST antigo continua independente e pode falhar por ausência de secrets ou cota de conta de serviço.

## Evidências persistidas e limites
history_evidence.ready e history_evidence.sending guardam a consulta completa, janela e prova de completude. readback_evidence.ready e readback_evidence.sending guardam os recibos SHA-256 de snapshots anteriores efetivamente comparados. O recibo do snapshot final deve ser guardado junto ao encerramento operacional. Esses recibos não são assinaturas do Drive: comprovam as entradas comparadas pelo protocolo, e não substituem a leitura real via conector. Não registrar como comprovado algo que não foi consultado.

## Recuperação operacional pendente
A tentativa amazonas-1791925600753 permanece UNKNOWN, sem ID persistido, após INVALID_ARGUMENT de data sem offset. Não reenviar nem apagar a reserva por ausência na listagem. Consultar/revisar o Planner completo e obter evidência positiva de aceitação ou rejeição antes de encerrar. Uma pauta vencida deve ser revalidada e receber novo horário antes de qualquer tentativa autorizada.



## Recuperação sem ID e rejeição definitiva

Não inferir rejeição definitiva de INVALID_ARGUMENT, timeout ou ausência na listagem. O protocolo trata a prova como entrada consultada pelo executor; seus campos nunca devem ser inventados.

- `recover`: registro fresco e readback, mesma reserva/owner/attemptId, observed.id real e evidence com source:metricool_provider_acceptance, attempt_id, metricool_id, checked_at, reference e response bruta contendo a confirmação da mesma tentativa e ID. Deve haver uma confirmação positiva do provedor que permita essa associação, por exemplo um atendimento ou recibo correlacionado; não criar response a partir da própria conclusão. Retorna SCHEDULED, não PUBLISHED; depois usar reconcile por ID.
- `reject`: registro fresco e readback, mesma tentativa incerta sem ID, evidence com source:metricool_provider_rejection, attempt_id, accepted:false, definitive:true, checked_at, reference e response bruta do provedor confirmando attempt_id e accepted:false. Se o provedor não fornecer essa associação, manter UNKNOWN. Retorna REJECTED; gravar/reler e só então usar release.
- Retry do mesmo fato após REJECTED exige NOVO attemptId, manifesto revalidado com horário futuro e retryOfAttemptId apontando à tentativa rejeitada. O registro anterior é preservado. ID conhecido continua bloqueando recriação, inclusive FAILED.

`unknown` aceita response bruta de erro, preservando CONNECTOR_ERROR_EVIDENCE. Não exige novo manifesto: recuperação usa owner e attemptId persistidos.

## Limite de chamada única

Persistir DISPATCHING antes da chamada elimina retry com estado fresco, mas não oferece idempotência no servidor Metricool. O executor deve consultar registro e reserva atuais, fazer atualização protegida e aguardar seu próprio readback. Não reutilizar outputs antigos, não chamar o provedor duas vezes e não retomar uma chamada após crash. Alterações concorrentes são bloqueios, não justificativa de retry. As funções Node apenas produzem resultados; não executam escrita no Drive, liberação GitHub ou a chamada do conector.

As evidências antigas ausentes não podem ser retroativamente fabricadas. Aplicar o novo protocolo às novas tentativas; manter evidências legadas como legadas.

## Quarentena para preservar disponibilidade sem reenviar o fato incerto

Quarentena NÃO significa rejeição, cancelamento ou publicação. Só pode ser usada em UNKNOWN sem ID com resposta síncrona INVALID_ARGUMENT já persistida e received_at válido. Timeout, SENDING e DISPATCHING sem esse retorno continuam ocupando o escritor. A notícia fica UNKNOWN e bloqueada por identidade, equivalências, fingerprint, legenda e alt.

1. Ler reserva/registro frescos da mesma tentativa; executar verify do snapshot. Rodar `quarantine` com registry, lock, owner, attemptId, readback, now. O protocolo preserva a resposta bruta e fixa SHA-256 da identidade editorial. Gravar apenas output.registry no mesmo arquivo Drive, reler e verificar.
2. Rodar `quarantine-release` com esse snapshot e seu novo readback. Gravar a reserva pelo SHA GitHub atual e reler. O resultado é IDLE com quarantinedAttempts; lastCompleted permanece intacto. O resultado incerto não foi encerrado.
3. `claim` quando existem quarantinedAttempts passa também registry e readback. A identidade dos registros UNKNOWN precisa permanecer íntegra; exclusão, alteração ou falta de releitura bloqueiam a reserva. Cada transição repete a verificação das quarentenas. A pauta nova passa todas as validações de novidade e histórico do protocolo existente. Não chamar a criação de post para o fato em quarentena.
4. Para investigar a tentativa original com prova positiva futura, esperar IDLE e rodar `resume` com a identidade ORIGINAL owner/attemptId e readback do registro. Gravar/reler a reserva ACTIVE. Usar recover/reject/reconcile; estas etapas nunca reenviam. Release só remove a pendência da lista após publicação confirmada, rejeição comprovada ou falha final de ID conhecido. Se continuar UNKNOWN, não executar envio.

Nunca apagar o registro em quarentena para desbloquear duplicatas. Nunca substituir lastCompleted por UNKNOWN. A rota REST continua desativada. Essa separação mantém um resultado incerto bloqueado por fato e permite apenas notícias independentes, com reserva única e readback real.
