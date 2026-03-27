# Credential Safety — Honeycomb Plugin

This document describes the credential security model for the Honeycomb Claude Code plugin.

## How Credentials Are Stored

- The Honeycomb Management API key is stored via Claude Code's `userConfig` with `sensitive: true`
- On macOS, this stores the key in the **system Keychain** (Keychain Access.app)
- On other systems, it falls back to an encrypted local credential store
- The key is **never written to disk in plaintext**, conversation logs, or plugin files

## How Credentials Are Used

1. When the plugin starts, Claude Code retrieves the key from the Keychain
2. The key is passed to the MCP server as an **environment variable** (`HONEYCOMB_MGMT_KEY`)
3. The MCP server uses the Management Key to create **ephemeral Configuration Keys** scoped to specific environments
4. Ephemeral keys are:
   - Named `claude-ephemeral-{timestamp}` for easy identification
   - Cached in-memory for up to 30 minutes
   - Automatically deleted on MCP server shutdown
   - Never exposed in tool call results or conversation context

## What Users Should Know

### DO
- Run `claude plugin configure honeycomb` to set up your credentials
- Rotate your Management Key periodically in Honeycomb Team Settings → API Keys
- Use a Management Key with minimal scopes (`api-keys:read`, `api-keys:write`, `environments:read`)

### DO NOT
- **Never paste your API key into the chat** — it will be logged in conversation history
- Never store your key in `.env` files within the project directory
- Never commit any file containing API keys

### If You Accidentally Paste a Key in Chat
1. The plugin will warn you immediately
2. Go to Honeycomb → Team Settings → API Keys
3. Delete the compromised key
4. Create a new key
5. Run `claude plugin configure honeycomb` to update the stored credential

## Ephemeral Key Lifecycle

```
┌─────────────────────────────────┐
│  Plugin starts                  │
│  → Management Key from Keychain │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  User asks a question           │
│  → MCP creates ephemeral key    │
│  → Scoped to target environment │
│  → Cached in memory (30 min)    │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Query executes                 │
│  → Uses ephemeral key           │
│  → Key never in chat/logs       │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Plugin shuts down              │
│  → All ephemeral keys deleted   │
│  → Management Key stays in      │
│    Keychain for next session    │
└─────────────────────────────────┘
```

## Security Boundaries

| Data | Where it lives | Visible in chat? |
|------|---------------|-------------------|
| Management Key | macOS Keychain | Never |
| Management Key | MCP server env var | Never |
| Ephemeral Keys | MCP server memory | Never |
| Query results | Chat conversation | Yes (this is the point) |
| Environment names | Chat conversation | Yes |
| Dataset schemas | Chat conversation | Yes |
