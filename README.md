# Honeycomb MCP Server for Claude Code

Query, explore, and analyze your [Honeycomb](https://www.honeycomb.io/) observability data directly from Claude Code.

## Features

- **Natural language queries** — ask questions about your services and get Honeycomb query results
- **Schema exploration** — discover environments, datasets, columns, SLOs, boards, and triggers
- **Incident analysis** — investigate issues with guided root-cause analysis patterns
- **Secure credentials** — Management API key stored in macOS Keychain, never in config files or Claude logs

## Quick Start

```bash
git clone git@github.com:kosli-dev/honeycomb-plugin.git
cd honeycomb-plugin
pnpm install
pnpm build
./setup.sh
```

The setup script will:
1. Prompt for your Honeycomb Management API key secret and key ID (stored in macOS Keychain — secret input is hidden)
2. Prompt for your team slug and API base URL (stored in `~/.config/kosli-honeycomb/config.json`)
3. Optionally add the MCP server entry to your Claude Code config file

You can either:
- Provide the path to your MCP config file (e.g. `~/.claude.json`) and the script will add the entry automatically
- Add the entry manually — the script will show you the JSON to copy

Then restart Claude Code to pick up the new MCP server.

## Prerequisites

You need a Honeycomb **Management API key** with these scopes:
- `api-keys:read` — to list existing keys
- `api-keys:write` — to create/delete ephemeral query keys
- `environments:read` — to list environments

Create one in Honeycomb → Team Settings → API Keys → Create Management Key.

## Credential Management

### How credentials are stored
- **Management key** → macOS Keychain (`security` CLI, service: `kosli-honeycomb`)
- **Team slug / API base** → `~/.config/kosli-honeycomb/config.json`
- **Nothing sensitive** is stored in any config file, environment variable, or Claude Code settings

### How credentials flow at runtime
1. MCP server starts as a child process of Claude Code
2. Server reads management key from Keychain internally (via `security find-generic-password`)
3. Server creates short-lived ephemeral Configuration keys for each Honeycomb environment
4. Ephemeral keys are cached in server memory for 30 minutes, then rotated
5. All ephemeral keys are deleted on server shutdown
6. **No key material ever crosses the MCP protocol boundary** — Claude only sees query results

### Defence in depth
- All error messages are sanitised to strip key patterns before returning to Claude
- Registered secrets (management key + all ephemeral keys) are replaced with `[REDACTED]`
- Known Honeycomb key patterns (`hcx*k_*`, Bearer tokens, hex key IDs) are stripped
- Skills warn users if they accidentally paste credentials into chat

### Check / update / remove credentials
```bash
# Check if credentials are configured
security find-generic-password -s "kosli-honeycomb" -a "management-key"

# Update credentials
./setup.sh

# Remove everything
./setup.sh --uninstall
```

## Skills

### `/honeycomb:explore`
Explore your Honeycomb setup — environments, datasets, schemas, SLOs.

```
/honeycomb:explore What datasets do we have in production?
```

### `/honeycomb:query`
Run queries against your Honeycomb datasets.

```
/honeycomb:query What's the P99 latency for the checkout service in production over the last hour?
```

### `/honeycomb:analyze`
Deep analysis — incident investigation, trend comparison, top-N analysis.

```
/honeycomb:analyze We're seeing elevated error rates in production. What's going on?
```

## Development

```bash
pnpm install
pnpm build        # compile TypeScript
pnpm dev          # watch mode
```

## Updating

```bash
cd honeycomb-plugin
git pull
pnpm install
pnpm build
# Restart Claude Code
```

## License

MIT
