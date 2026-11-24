# Estêvão — plugin MCP para Codex, Claude e outros clientes

Dá ao Claude dados litúrgicos anglicanos precisos: calendário com regras reais de precedência,
lecionário, coletas e o Ofício Diário completo em várias edições do Livro de Oração Comum /
Book of Common Prayer.

## Instalação

### Claude Code

```
/plugin marketplace add dodopok/estevao-mcp
/plugin install estevao@estevao
```

Na primeira vez que o Claude usar uma ferramenta, o navegador abre para você entrar com a mesma
conta do [portal do desenvolvedor](https://estevao.caminhoanglicano.com.br). Não há chave para
copiar: o servidor cuida disso.

### Codex CLI

```bash
codex mcp add estevao --url https://mcp.caminhoanglicano.com.br/mcp
codex mcp login estevao
```

O pacote também inclui o manifesto `.codex-plugin/plugin.json` para instalação como plugin no
Codex. Para desenvolvimento local, adicione a raiz deste repositório como marketplace e instale
`estevao@estevao-local`.

### Outros clientes MCP

Use o endpoint Streamable HTTP abaixo. Clientes compatíveis descobrem o OAuth e abrem o navegador
para autenticação:

```text
https://mcp.caminhoanglicano.com.br/mcp
```

O mesmo servidor funciona no Claude Desktop, Gemini CLI, VS Code, Cursor, Windsurf e no MCP
Inspector.

## O que dá para perguntar

- "quais as leituras do próximo domingo?"
- "monte as Completas de hoje"
- "compare o Natal no LOC 1662 e no 2019"
- "que festa cai em 29 de junho e qual a cor litúrgica?"

As ferramentas de consulta são somente leitura. A única que grava algo é `set_default_prayer_book`,
que guarda na sua conta o livro de oração que você segue.

## O que o plugin contém

- **Conector MCP** (`.mcp.json`): aponta para o servidor hospedado em
  `https://mcp.caminhoanglicano.com.br/mcp`. São 13 ferramentas de consulta (calendário, leituras,
  celebrações, Ofício Diário, comparação entre livros de oração e explicação de cada dia), uma
  ferramenta que guarda o livro de oração escolhido na sua conta, além de recursos e prompts.
- **Skill `anglican-liturgy`** (`skills/anglican-liturgy/SKILL.md`): ensina o Claude a escolher o
  livro de oração e a ferramenta certa, a responder perguntas de "por quê" pela trilha de decisão
  do motor litúrgico e a reproduzir o texto litúrgico sem paráfrase.

O plugin não roda comandos locais, hooks nem scripts.

## Dados e privacidade

O plugin só se conecta a `mcp.caminhoanglicano.com.br`. A cada chamada, o Claude envia os
parâmetros da ferramenta, como uma data, um código de livro de oração ou um termo de busca. O
conteúdo da conversa não é enviado.

Na primeira conexão, o navegador abre a tela de autorização, e você entra com a conta do portal do
desenvolvedor (Google ou e-mail). O servidor cria uma chave da API Estêvão em seu nome, guarda essa
chave criptografada e a usa só para consultar `api.caminhoanglicano.com.br`. Você pode revogar a
chave no [painel](https://estevao.caminhoanglicano.com.br/dashboard/keys) a qualquer momento.

Na primeira pergunta, o Claude pergunta qual livro de oração você segue e guarda a resposta na sua
conta, para não perguntar de novo nas próximas conversas. Só o código do livro é guardado. Para
trocar ou apagar, é só pedir ao Claude.

Política de privacidade: https://estevao.caminhoanglicano.com.br/privacy · Suporte: dev@dodopok.dev

---

**English.** Gives Claude accurate Anglican liturgical data from the Estêvão engine: the calendar
with real precedence rules, lectionary readings, collects and the fully assembled Daily Office in
more than twenty editions of the Book of Common Prayer and the Livro de Oração Comum. It contains a
reference to the hosted MCP server (`https://mcp.caminhoanglicano.com.br/mcp`, 13 read-only tools
plus one that saves the user's prayer book to their account, OAuth sign-in, no API key to paste) and
the `anglican-liturgy` skill. It runs no local commands,
hooks or scripts. Claude sends only tool parameters such as a date, a prayer book code or a search
term; conversation content is not sent. Privacy policy:
https://estevao.caminhoanglicano.com.br/en/privacy.
