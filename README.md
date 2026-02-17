# Vibe Notion

**Give your AI agent the power to read and write Notion pages, databases, and more**

A full-coverage, agent-friendly CLI for the Notion API. Ships two CLIs — `vibe-notion` for the unofficial private API (act as yourself) and `vibe-notionbot` for the official Integration API (act as a bot).

## ✨ Why Vibe Notion?

Notion's official API only supports Integration (bot) tokens — your agent can't do things **on behalf of you**. Vibe Notion solves this by extracting your `token_v2` from the Notion desktop app, so your agent operates as you, with your full permissions.

Need official API access instead? `vibe-notionbot` is included and fully supports Integration tokens via `NOTION_TOKEN`.

- 👤 **Act as you** — `vibe-notion` extracts `token_v2` from the Notion desktop app to operate with your own permissions
- 🤖 **Bot support too** — `vibe-notionbot` supports official Integration tokens via `NOTION_TOKEN`
- 📦 **Full API coverage** — Pages, databases, blocks, users, search, comments, and workspaces
- 🧾 **Agent friendly** — JSON output by default, perfect for LLM tool use
- 👁 **Human friendly too** — Add `--pretty` for readable output
- 🧠 **Agent memory** — Remembers workspace IDs, page names, and preferences across sessions
- 🪙 **Token efficient** — CLI, not MCP. Load only what you need. ([Why not MCP?](#-philosophy))

## 📦 Installation

```bash
npm install -g vibe-notion
```

Or use your favorite package manager.

This installs both the `vibe-notion` and `vibe-notionbot` CLI tools.

## 🧩 Agent Skills

Vibe Notion includes [Agent Skills](https://agentskills.io/) that teach your AI agent how to use the CLI effectively. Two skills are available:

- **`vibe-notion`** — For the unofficial private API (`token_v2`)
- **`vibe-notionbot`** — For the official Integration API (`NOTION_TOKEN`)

### Skills CLI (OpenCode, Cline, etc.)

```bash
npx skills add devxoul/vibe-notion
```

See [skills.sh](https://skills.sh/) for more details.

### Claude Code

```bash
claude plugin marketplace add devxoul/vibe-notion
claude plugin install vibe-notion
```

Or within Claude Code:

```
/plugin marketplace add devxoul/vibe-notion
/plugin install vibe-notion
```

### OpenCode (via plugin)

Add to your `opencode.jsonc`:

```jsonc
{
  "plugins": [
    "vibe-notion"
  ]
}
```

## 🚀 Quick Start

### `vibe-notion` (Private API — act as yourself)

```bash
# 1. Extract token_v2 from Notion desktop app
vibe-notion auth extract

# 2. List your workspaces
vibe-notion workspace list --pretty

# 3. Search for something
vibe-notion search "Roadmap" --workspace-id <workspace-id> --pretty

# 4. Get page details
vibe-notion page get <page-id> --workspace-id <workspace-id> --pretty
```

### `vibe-notionbot` (Official API — act as a bot)

```bash
# 1. Set your Notion Integration Token
export NOTION_TOKEN=secret_xxx

# 2. Check auth status
vibe-notionbot auth status --pretty

# 3. Search for something
vibe-notionbot search "Roadmap" --filter page --pretty

# 4. Get page details
vibe-notionbot page get <page-id> --pretty
```

## 🛠 Command Overview

### `vibe-notion` (Private API)

| Command | Description |
|---------|-------------|
| `auth` | Extract token, check status, logout |
| `workspace` | List accessible workspaces |
| `page` | Get, list, create, update, archive pages |
| `database` | Get schema, query, create, update, add rows, list, manage views |
| `block` | Get, list children, append, update, delete blocks |
| `user` | Get current user, get user by ID |
| `search` | Workspace search |
| `comment` | List, create, and get comments |

> All commands that operate within a workspace require `--workspace-id`. Use `vibe-notion workspace list` to find yours.

### `vibe-notionbot` (Official API)

| Command | Description |
|---------|-------------|
| `auth` | Check authentication status |
| `page` | Get, create, update, archive pages, retrieve properties |
| `database` | Get schema, query, create, update, list databases |
| `block` | Get, list children, append, update, delete blocks |
| `user` | List users, get user info, get bot info |
| `search` | Global workspace search with filters |
| `comment` | List, create, and get comments |

> Requires `NOTION_TOKEN` environment variable with an Integration token from the [Notion Developer Portal](https://www.notion.so/my-integrations).

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

