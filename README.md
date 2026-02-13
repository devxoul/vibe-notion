![Agent Notion](https://github.com/user-attachments/assets/notion-placeholder)

**Give your AI agent the power to read and write Notion pages, databases, and more**

A full-coverage, agent-friendly CLI for the Notion API. Built for AI agents to interact with Notion workspaces through simple CLI commands with JSON output.

## ✨ Why Agent Notion?

- 🤖 **AI-agent friendly** — JSON output by default, perfect for LLM tool use
- 📦 **Full API coverage** — Pages, databases, blocks, users, search, and comments
- 🔑 **Simple Auth** — Just set your `NOTION_TOKEN` environment variable
- 👤 **Human friendly too** — Add `--pretty` for readable output
- 🧠 **Agent memory** — Remembers workspace IDs, page names, and preferences across sessions
- 🪙 **Token efficient** — CLI, not MCP. Load only what you need. ([Why not MCP?](#-philosophy))

## 📦 Installation

```bash
npm install -g agent-notion
```

Or use your favorite package manager.

This installs the `agent-notion` CLI tool.

## 🧩 Agent Skills

Agent Notion includes [Agent Skills](https://agentskills.io/) that teach your AI agent how to use the CLI effectively.

### Skills CLI

```bash
npx skills add devxoul/agent-notion
```

See [skills.sh](https://skills.sh/) for more details.

### Claude Code

```bash
claude plugin marketplace add devxoul/agent-notion
claude plugin install agent-notion
```

Or within Claude Code:

```
/plugin marketplace add devxoul/agent-notion
/plugin install agent-notion
```

## 🚀 Quick Start

Get up and running in 30 seconds:

```bash
# 1. Set your Notion Integration Token
export NOTION_TOKEN=your_token_here

# 2. Check auth status
agent-notion auth status --pretty

# 3. Search for something
agent-notion search "Roadmap" --filter page

# 4. Get page details
agent-notion page get <page-id> --pretty
```

## 🛠 Command Overview

| Command | Description |
|---------|-------------|
| `auth` | Check authentication status |
| `page` | Get, create, update, archive pages |
| `database` | Get schema, query, create, update, list databases |
| `block` | Get, list children, append, update, delete blocks |
| `user` | List users, get user info, get bot info |
| `search` | Global workspace search |
| `comment` | List and create comments |

## 💡 Use Cases

**🤖 For AI Agents**
- Give Claude, GPT, or your custom agent the ability to manage Notion content
- Automate documentation and project tracking
- Build knowledge base integrations with simple CLI commands

**👩‍💻 For Developers**
- Quick Notion operations from terminal
- Scripted page creation and database querying
- Workspace data extraction for debugging

**👥 For Teams**
- Automate report generation in Notion
- Sync data from other tools to Notion databases
- Build custom notification and logging pipelines

## 🧠 Philosophy

**Why not MCP?** MCP servers expose all tools at once, bloating context and confusing agents. **[Agent Skills](https://agentskills.io/) + agent-friendly CLI** offer a better approach—load what you need, when you need it. Fewer tokens, cleaner context, better output.

Inspired by [agent-browser](https://github.com/vercel-labs/agent-browser) from Vercel Labs and [agent-messenger](https://github.com/devxoul/agent-messenger).

## 🤝 Contributing

```bash
bun install    # Install dependencies
bun link       # Link CLI globally for local testing
bun test       # Run tests
bun run lint   # Lint
bun run build  # Build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## 📄 License

MIT

