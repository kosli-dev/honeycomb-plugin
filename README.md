# Honeycomb Plugin for Claude Code

Query, explore, and analyze your [Honeycomb](https://www.honeycomb.io/) observability data directly from Claude Code.

## Features

- **Natural language queries** — ask questions about your services and get Honeycomb query results
- **Schema exploration** — discover environments, datasets, columns, SLOs, boards, and triggers
- **Incident analysis** — investigate issues with guided root-cause analysis patterns
- **Secure credential management** — Management API key stored in macOS Keychain, ephemeral keys for all queries

## Installation

```bash
claude plugin install kosli-dev/honeycomb-plugin
```

On first use, you'll be prompted for:
1. **Honeycomb Management API key** — stored securely in your system keychain
2. **Team slug** — your Honeycomb team identifier (visible in the URL)
3. **API base URL** — defaults to `https://api.honeycomb.io` (use `https://api.eu1.honeycomb.io` for EU)

To reconfigure credentials:
```bash
claude plugin configure honeycomb
```

## Prerequisites

You need a Honeycomb **Management API key** with these scopes:
- `api-keys:read` — to list existing keys
- `api-keys:write` — to create/delete ephemeral keys
- `environments:read` — to list environments

Create one in Honeycomb → Team Settings → API Keys → Create Management Key.

## Skills

### `/honeycomb:query`
Run queries against your Honeycomb datasets.

```
/honeycomb:query What's the P99 latency for the checkout service in production over the last hour?
```

### `/honeycomb:explore`
Explore your Honeycomb setup — environments, datasets, schemas, SLOs.

```
/honeycomb:explore What datasets do we have in production?
```

### `/honeycomb:analyze`
Deep analysis — incident investigation, trend comparison, top-N analysis.

```
/honeycomb:analyze We're seeing elevated error rates in production. What's going on?
```

## Architecture

```
┌─────────────────────────────────────────┐
│ Claude Code                             │
│                                         │
│  Skills (query/explore/analyze)         │
│    ↕ natural language ↔ tool calls      │
│  Bundled MCP Server                     │
│    ↕ Management Key from Keychain       │
│  Ephemeral Key Manager                  │
│    ↕ creates scoped, short-lived keys   │
│  Honeycomb API                          │
└─────────────────────────────────────────┘
```

The plugin **never exposes your Management API key** in conversation. It creates ephemeral Configuration keys scoped to the environment you're querying, and deletes them when the session ends.

See [CREDENTIALS_SAFETY.md](CREDENTIALS_SAFETY.md) for the full security model.

## Development

```bash
cd servers/honeycomb-mcp
npm install
npm run build
```

To test the MCP server standalone:
```bash
HONEYCOMB_MGMT_KEY="your-key" HONEYCOMB_TEAM="your-team" npm start
```

## Security

- API keys are **never** stored in plaintext on disk
- API keys are **never** included in conversation context or tool call logs
- Ephemeral keys are automatically cleaned up on shutdown
- Skills explicitly refuse to accept credentials via chat
- Accidental credential paste triggers an immediate rotation warning

See [CREDENTIALS_SAFETY.md](CREDENTIALS_SAFETY.md) for details.

## License

MIT
