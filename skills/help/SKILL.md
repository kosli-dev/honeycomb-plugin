---
name: honeycomb:help
description: Quick reference for all Honeycomb MCP tools, skills, and example queries
user_invocable: true
---

# Honeycomb Help

Print the quick-reference guide below directly to the user. Do not call any MCP tools.

---

## Honeycomb MCP — Quick Reference

### Skills (slash commands)

| Command | What it does |
|---|---|
| `/honeycomb:explore` | Browse environments, datasets, columns, SLOs, boards, triggers |
| `/honeycomb:query` | Run queries — counts, latency percentiles, error rates, breakdowns |
| `/honeycomb:analyze` | Investigate incidents, compare time periods, find root causes |
| `/honeycomb:help` | This help page |

### Example prompts

**Explore your setup:**
```
/honeycomb:explore What environments do we have?
/honeycomb:explore Show me the schema for the server dataset in prod
/honeycomb:explore What SLOs are configured in production?
```

**Run queries:**
```
/honeycomb:query What's the P99 latency in prod over the last hour?
/honeycomb:query Count requests by status code in the last 15 minutes
/honeycomb:query Show me the slowest endpoints in staging, last 24 hours
```

**Investigate issues:**
```
/honeycomb:analyze We're seeing elevated error rates — what's going on?
/honeycomb:analyze Compare latency now vs yesterday for the API
/honeycomb:analyze What are the top error-producing endpoints in prod?
```

### Available MCP tools (used automatically by skills)

| Tool | Purpose |
|---|---|
| `honeycomb_list_environments` | List all environments |
| `honeycomb_list_datasets` | List datasets in an environment |
| `honeycomb_list_columns` | List columns/fields in a dataset |
| `honeycomb_query` | Run an aggregation query |
| `honeycomb_get_slos` | List or get SLO details |
| `honeycomb_get_boards` | List or get board/dashboard details |
| `honeycomb_get_triggers` | List alert triggers for a dataset |

### Query time ranges

| Period | Seconds |
|---|---|
| 15 minutes | `900` |
| 1 hour | `3600` |
| 6 hours | `21600` |
| 24 hours | `86400` |
| 7 days | `604800` |

### Setup & credentials

Credentials are stored in macOS Keychain — never in config files or Claude logs.

```bash
# First-time setup
cd honeycomb-plugin && ./setup.sh

# Check if credentials are configured
security find-generic-password -s "kosli-honeycomb" -a "management-key"

# Update credentials
./setup.sh

# Remove everything
./setup.sh --uninstall
```

### Troubleshooting

- **"credentials not configured"** — Run `./setup.sh` from the honeycomb-plugin directory
- **"config not found"** — Run `./setup.sh` to set team slug and API base
- **Tools not appearing** — Restart Claude Code after setup; check MCP entry in `~/.claude.json`
- **401 errors** — Management key may have expired; create a new one in Honeycomb Team Settings and re-run `./setup.sh`
- **Environment not found** — Use `/honeycomb:explore` to list available environments first
