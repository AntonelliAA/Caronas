# Docs

Written in English so both people and agents read the same thing. UI copy stays
in pt-BR. See `CLAUDE.md` for the language rule.

| File | Read it when |
|---|---|
| [domain.md](domain.md) | You want to know why the app works backwards from every other carpool tracker |
| [architecture.md](architecture.md) | You are touching data, counting, or the schema |
| [design-system.md](design-system.md) | You are touching anything visual |
| [workflow.md](workflow.md) | You are branching, committing, or merging |
| [agents.md](agents.md) | You are an AI agent, or dispatching one |
| `specs/` | Feature specs, one per file, `YYYY-MM-DD-<topic>.md` |

The root [CLAUDE.md](../CLAUDE.md) is the short version that loads into every
session. It holds the rules that break things silently; these files hold the
reasoning behind them.
