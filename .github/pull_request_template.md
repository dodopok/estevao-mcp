<!--
Título: Conventional Commits em inglês: `feat(tools): …`, `fix(oauth): …`.
Escreva para quem vai revisar sem ter acompanhado a conversa. Seção que não se
aplica fica com "Nada." em vez de sumir: assim fica claro que ela foi pensada.
Estes comentários não aparecem no PR.
-->

## Por quê

<!-- O problema ou a necessidade: de quem usa o servidor num assistente ou em
outro cliente MCP, ou de quem o integra. Link para a issue ou a conversa. -->

## O que muda

<!-- O que o modelo e o usuário passam a receber de diferente: ferramenta,
recurso, prompt, skill do plugin, login. Diga se vale para o servidor
hospedado, para o pacote npm (stdio) ou para os dois. Lista curta; o diff já
mostra o código. -->

## Como foi feito

<!-- O que o diff não explica: a abordagem, o que foi descartado e por quê, os
arquivos que valem ser lidos primeiro. -->

## Riscos

<!--
Uma linha por risco: o que pode dar errado, quem sente, e o que segura. Pense
em:
- o contrato com os clientes: nome, parâmetros e descrição das ferramentas
  (é por elas que o modelo escolhe). Ferramenta renomeada ou removida quebra
  quem já chama, inclusive o `allowed_tools` do estevao-lilygo e as skills de
  `plugins/estevao/`;
- o contrato com a estevao-api (v1 e v2): formato que muda lá, fixtures de
  `test/fixtures/` que deixaram de representar a resposta real;
- o livro de oração: o servidor nunca escolhe um; nenhuma chamada pode cair num
  livro que o usuário não disse;
- OAuth: descoberta, registro, PKCE, refresh, a tela de consentimento no Safari
  e no celular (`/__/auth/*`); quem já está conectado precisa entrar de novo?
- segredos: a API key de cada conta (cifrada com `MCP_ENCRYPTION_KEY`), os
  tokens, nada disso em log ou nos beacons de `/oauth/diagnostics`;
- o Postgres: tabela nova ou mudada (o schema é criado ao subir), dados de
  quem já entrou;
- carga na API: chamadas a mais por ferramenta, cache;
- a linha editorial: nada que gere sermão, homilia ou reflexão devocional.
Se não há risco que valha nomear, diga por quê.
-->

## Deploy e publicação

<!--
O merge no `main` faz o Railway publicar o servidor hospedado
(`mcp.caminhoanglicano.com.br`). O pacote npm, o registro MCP e o plugin só
mudam numa release: `npm version` (que sincroniza `server.json` e os
manifestos do plugin) e a tag `v*`, pelo `release.yml` ou à mão, como no
README ("Releasing"). Escreva o que vai além disso, em ordem:
- variável de ambiente nova ou mudada no Railway (está no `.env.example` e no
  README?);
- mudança no Postgres e o que acontece com os dados de quem já entrou;
- release do pacote: sim ou não, e de que tamanho (patch, minor, major);
- console do Firebase ou do Google Cloud (domínio autorizado, redirect URI);
- PR da API ou do portal (estevao-front, página `/mcp`) que sai antes ou
  depois, com o link;
- o que olhar depois (`/healthz`, um login num cliente real, os logs
  `[consent]`).
-->

- [ ] Nada além do deploy normal.

## Como desfazer

<!-- Reverter o merge refaz o deploy hospedado. Diga o que não volta: versão já
publicada no npm (o número não se reaproveita; corrige-se com outra versão e
`npm deprecate` na ruim), entrada no registro MCP, versão do plugin que os
clientes já instalaram, mudança no Postgres, tokens e chaves já emitidos. -->

## Como testar

<!-- O que foi rodado, com o resultado (`npm run typecheck`, `npm test`,
`npm run build`), e como conferir à mão: `npm run inspector`,
`scripts/smoke.ts` contra uma API local, ou um cliente real conectado (qual, e
se por OAuth ou por chave). -->

## Telas

<!-- A tela de consentimento antes e depois, no desktop e no celular. "Nada."
se ela não muda. -->

## Relacionados

<!-- PRs em outros repositórios (`dodopok/estevao-api#123`,
`dodopok/estevao-front#123`), a ordem em que entram, e issues. -->

## Checklist

- [ ] `npm run typecheck`, `npm test` e `npm run build` limpos
- [ ] Teste para o que mudou (vitest e msw, sem rede); fixtures regravadas com `npm run record-fixtures` quando a resposta da API mudou
- [ ] Ferramenta, recurso ou prompt mudou: nome e parâmetros compatíveis, ou a quebra está dita aqui, nas skills do plugin e no README
- [ ] Nenhuma chamada cai num livro de oração que o usuário não escolheu
- [ ] Ferramentas continuam só de leitura, fora `set_default_prayer_book`
- [ ] Nada de token, chave ou e-mail em log, erro ou beacon
- [ ] Variável de ambiente nova no `.env.example` e no README; as do OAuth continuam exigidas juntas
- [ ] Release: versão subida com `npm version`, nunca à mão em `server.json` ou nos manifestos do plugin
- [ ] Nada que gere sermão, homilia ou reflexão devocional
