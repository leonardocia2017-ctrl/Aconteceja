# Autenticação do arquivo de mídia

O preflight e a rota de produção usam a mesma função createDriveClient e a mesma pasta. Todas as chamadas Drive incluem supportsAllDrives=true.

## Drive compartilhado

Defina a variável Actions GOOGLE_DRIVE_ARCHIVE_FOLDER_ID com o ID de uma pasta em Drive compartilhado e conceda à conta de serviço existente acesso para criar arquivos. Um compartilhamento de pasta no Meu Drive não atribui cota à conta de serviço. Sem segredo OAuth, OIDC permanece a autenticação padrão.

## OAuth de usuário

Se não houver Drive compartilhado, cadastre o segredo Actions GOOGLE_DRIVE_OAUTH_CREDENTIALS com um JSON de credenciais OAuth do tipo authorized_user, contendo client_id, client_secret e refresh_token, obtidos por consentimento do usuário com escopo Drive suficiente para ler/editar o registro e criar/ler mídia. Não colocar credenciais em código, issues ou logs. A função valida o formato e usa UserRefreshClient para renovação. OIDC continua presente no workflow, mas as chamadas Drive usam o cliente OAuth quando o segredo está configurado.

## Gate operacional

Também são necessários os segredos METRICOOL_TOKEN e METRICOOL_USER_ID. Execute operational-preflight.yml na main e verifique driveRead, driveWriteReadback, mediaArchiveReadback, metricoolCredentials e metricoolHistory com ok:true. O probe grava um evento e um JPG de teste, sem POST social. Um preflight verde não comprova POST nem publicação. Depois de revisão editorial e do histórico completo, execute production-route.yml uma vez com manifesto em queue/*.json. Sem ID real, reconciliar UNKNOWN; PUBLISHED exige confirmação explícita do provedor Instagram.
