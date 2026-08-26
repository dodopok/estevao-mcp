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

Todas as ferramentas são somente leitura.
