<div align="center">

# Vibe Notion

[![npm](https://img.shields.io/npm/v/vibe-notion?color=000000)](https://www.npmjs.com/package/vibe-notion) [![SkillPad - vibe-notion](https://img.shields.io/badge/SkillPad-vibe--notion-1a1a1a)](https://skillpad.dev/install/devxoul/vibe-notion/vibe-notion) [![SkillPad - vibe-notionbot](https://img.shields.io/badge/SkillPad-vibe--notionbot-1a1a1a)](https://skillpad.dev/install/devxoul/vibe-notion/vibe-notionbot)

**Your agent edits Notion as you — not as a bot**

</div>

![demo](./docs/public/vibe-notion-demo.gif)

For Notion, automation is easy. Acting as *you* isn't. `vibe-notion` reads the session your Notion desktop app already holds, so your agent edits, comments, and searches as your logged-in account — not as an integration bot. If you do want a bot identity (server, CI/CD), `vibe-notionbot` ships alongside it and speaks the official Integration API.

## Table of Contents

- [Why Vibe Notion?](#why-vibe-notion)
- [Installation](#installation)
- [Agent Skills](#agent-skills)
  - [SkillPad](#skillpad)
  - [Skills CLI](#skills-cli)
  - [Claude Code Plugin](#claude-code-plugin)
  - [OpenCode Plugin](#opencode-plugin)
- [Quick Start](#quick-start)
- [Command Overview](#command-overview)
- [Use Cases](#use-cases)
  - [Research & Discovery](#research--discovery)
  - [Project Tracking](#project-tracking)
  - [Creating & Writing](#creating--writing)
  - [Automation & Pipelines](#automation--pipelines)
  - [...and More](#and-more)
- [Philosophy](#philosophy)
- [Contributing](#contributing)
- [License](#license)

## Why Vibe Notion?

**You shouldn't need a bot to edit your own notes.**

The Notion MCP and the official Integration API are fine for automation. They share one thing by design: the agent acts as an **integration bot**, not as you.

Concretely, that means:

- **Bot identity on writes.** Pages, blocks, and comments created through the official API are attributed to the integration, with its own name and avatar. The `last_edited_by` and `created_by` fields return a bot user, not you. ([Notion docs](https://developers.notion.com/reference/authentication))
- **Access is integration-scoped.** The integration only sees pages that have been explicitly shared with it via "Add connections." Your private drafts and pages you haven't connected stay invisible. ([Notion docs](https://developers.notion.com/docs/authorization))
- **Setup needs a workspace owner.** Creating an internal integration requires workspace owner privileges — regular members can't.
- **No user impersonation.** The API has no "act on behalf of" mode. Integration-scoped is the only mode.

That's the right fit for a shared automation or a CI bot. It's the wrong fit when the agent is *yours* and the work is *yours* — when a comment should show your face, a page edit should show your name, and your agent should be able to read the private doc you never "connected" anything to.

`vibe-notion` reads the `token_v2` your Notion desktop app is already using, so your agent inherits your session directly.

- **Act as you** — `vibe-notion` extracts `token_v2` from the Notion desktop app. Edits, comments, and pages are attributed to your account
- **See what you see** — Anything your logged-in session can open is accessible. No per-page "Add connections" step
- **Bot mode included** — `vibe-notionbot` uses official Integration tokens (`NOTION_TOKEN`) when a bot identity is what you actually want
- **Full API coverage** — Pages, databases, blocks, users, search, comments, workspaces
- **Agent memory** — Remembers workspace IDs, page names, and preferences across sessions
- **CLI, not MCP** — One command per action, loaded through a skill. Smaller tool surface per prompt. ([More](#philosophy))

## Installation

```bash
npm install -g vibe-notion
```

Or use your favorite package manager. This installs both `vibe-notion` and `vibe-notionbot`.

## Agent Skills

Vibe Notion ships with [Agent Skills](https://agentskills.io/) that teach your AI agent how to use each CLI. Install only what you need:

- **`vibe-notion`** — Act as you (private API, `token_v2`)
- **`vibe-notionbot`** — Act as a bot (official Integration API, `NOTION_TOKEN`)

### SkillPad

SkillPad is a GUI app for Agent Skills. See [skillpad.dev](https://skillpad.dev/) for more details.

[![Available on SkillPad](https://badge.skillpad.dev/vibe-notion/dark.svg)](https://skillpad.dev/install/devxoul/vibe-notion/vibe-notion) [![Available on SkillPad](https://badge.skillpad.dev/vibe-notionbot/dark.svg)](https://skillpad.dev/install/devxoul/vibe-notion/vibe-notionbot)

### Skills CLI

Skills CLI is a CLI tool for Agent Skills. See [skills.sh](https://skills.sh/) for more details.

```bash
npx skills add devxoul/vibe-notion
```

### Claude Code Plugin

```
/plugin marketplace add devxoul/vibe-notion
/plugin install vibe-notion
```

### OpenCode Plugin

Add to your `opencode.jsonc`:

```jsonc
{
  "plugins": [
    "vibe-notion"
  ]
}
```

## Quick Start

### `vibe-notion` — act as yourself

```bash
# 1. List your workspaces (token auto-extracts from the desktop app on first run)
vibe-notion workspace list --pretty

# 2. Search across everything your session can see
vibe-notion search "Roadmap" --workspace-id <workspace-id> --pretty

# 3. Read a page
vibe-notion page get <page-id> --workspace-id <workspace-id> --pretty
```

No OAuth flow. No integration to create. No pages to connect.

The extracted `token_v2` is stored at `~/.config/vibe-notion/credentials.json`. To use a custom location, set `VIBE_NOTION_CONFIG_DIR`:

```bash
export VIBE_NOTION_CONFIG_DIR=/path/to/config
```

### `vibe-notionbot` — act as a bot

```bash
# 1. Set your Notion Integration Token
export NOTION_TOKEN=secret_xxx

# 2. Check auth status
vibe-notionbot auth status --pretty

# 3. Search with filters
vibe-notionbot search "Roadmap" --filter page --pretty

# 4. Read a page
vibe-notionbot page get <page-id> --pretty
```

## Command Overview

### `vibe-notion` (Private API — acts as you)

| Command | Description |
|---------|-------------|
| `auth` | Extract token from desktop app, check status, logout |
| `workspace` | List accessible workspaces, resolve workspace ID from a page ID |
| `page` | Get, list, create, update, archive pages |
| `database` | Get schema, query, create, update, delete properties, add/update rows, list, manage views |
| `block` | Get, list children, append (with nested markdown support), update, delete blocks |
| `user` | Get current user, get user by ID |
| `search` | Workspace search |
| `comment` | List, create, and get comments (including inline block-level comments) |

> `--workspace-id` is optional for most commands that take a target page/block/database ID — it is auto-resolved by probing each authenticated account. It remains required for commands without a primary target (`page list`, `database list`, `search`, `user list`, etc.) and for creating root-level pages. Use `vibe-notion workspace list` to find your workspace IDs, or `vibe-notion workspace resolve <page_id_or_url>` to look up the workspace ID directly from a Notion URL.

### `vibe-notionbot` (Official API — acts as a bot)

| Command | Description |
|---------|-------------|
| `auth` | Check authentication status |
| `page` | Get, create, update, archive pages, retrieve properties |
| `database` | Get schema, query, create, update, delete properties, list databases |
| `block` | Get, list children, append (with nested markdown support), update, delete blocks |
| `user` | List users, get user info, get bot info |
| `search` | Global workspace search with filters |
| `comment` | List, create, and get comments (including inline block-level comments) |

> Requires `NOTION_TOKEN` environment variable with an Integration token from the [Notion Developer Portal](https://www.notion.so/my-integrations).

## Use Cases

Each of these runs under your account: the page history shows your name, and comments post under your avatar.

### Research & Discovery

Pull context from Notion before you start working — no tab-switching, no skimming.

> "Gather all context from the BUG-1234 page — read the description, comments, and any linked pages so I can start fixing it."

> "Search our Engineering Wiki for any existing discussion about rate limiting before I write a new proposal."

> "Look up our Onboarding Guide page and answer: what's the process for requesting AWS access?"

> "Search across all workspaces for any page mentioning 'API deprecation' so I know if this was discussed before."

> "Read the API Design Principles page and the REST Conventions page, then tell me if our current approach violates any of them."

### Project Tracking

Check, update, and clean up project boards without leaving your editor.

> "Query the Sprint 24 database and tell me which tasks are still in progress or blocked."

> "Update the status of task INFRA-42 in the Sprint database to Done and set the completed date to today."

> "Find all tasks in the Q1 Roadmap database with status Done and archive them."

> "List everything assigned to me across the Backend and Infrastructure databases that's due this week."

> "Move all P0 bugs from the Triage database to the Sprint 25 database and set their status to To Do."

### Creating & Writing

Create pages, file reports, and post comments — all from a prompt.

> "Create a meeting notes page under the Team Meetings database with today's date, attendees, and an empty agenda section."

> "I found a crash in production. Create a bug report page in the Bug Tracker database with this stack trace, set priority to P1, and assign it to me."

> "Post a comment on the Project Alpha page summarizing what the team shipped today."

> "Write an RFC page in the Engineering Proposals database with the title 'Migrate to gRPC' and scaffold the Problem, Proposal, Alternatives, and Open Questions sections."

> "Add a new row to the Interview Scorecard database for the candidate I just talked to, with my notes and a Strong Hire recommendation."

### Automation & Pipelines

Wire Notion into your CI, scripts, or agent workflows. Use `vibe-notionbot` when a bot identity is the right fit (server-side jobs, shared automation, auditable CI), or `vibe-notion` when the automation should run under your account.

> "A new user just signed up. Add a row to the Leads database with their name, email, and source."

> "Append today's deploy results to the Deploy Log page — include the commit hash, status, and timestamp."

> "Read the content of the v2.3 Release page and draft a changelog from it."

> "Every time a GitHub issue is labeled 'needs-design', create a page in the Design Requests database with the issue title, link, and reporter."

> "Query the On-Call Schedule database for this week's rotation and post the name in our Slack channel."

### ...and More

These are starting points. If you build something cool with Vibe Notion, [let me know](https://x.com/devxoul)!

## Philosophy

### Why CLI, not MCP?

MCP is great for broad tool interoperability across many services. For a single-surface tool like Notion, a CLI loaded through an Agent Skill is lighter: the agent pulls in one skill file and one shell command per action, rather than registering and keeping a server process around. It's a fit question, not a verdict on MCP.

### Why not just the official API?

Because the official API is, by design, the *integration's* identity — not yours. That's correct for a shared bot, a CI job, or any automation where "Edited by Releases Bot" is the right answer. It's not correct when you want the agent to act as you: your account, your visibility, your attribution on edits and comments.

`vibe-notion` covers the personal-agent case by piggybacking on the session your desktop app already holds. `vibe-notionbot` covers the bot case through the official API. Pick whichever identity actually fits the job.

Inspired by [agent-browser](https://github.com/vercel-labs/agent-browser) from Vercel Labs and [agent-messenger](https://github.com/devxoul/agent-messenger).

## Contributing

```bash
bun install    # Install dependencies
bun link       # Link CLI globally for local testing
bun run test   # Run tests
bun run lint   # Lint
bun run build  # Build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## License

MIT
