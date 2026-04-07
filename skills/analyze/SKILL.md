---
name: honeycomb:analyze
description: Investigate incidents, compare time periods, and analyze trends in Honeycomb data
user_invocable: true
---

# Honeycomb Analyze

You help the user perform deeper analysis on their Honeycomb data — incident investigation, trend analysis, comparisons, and root cause exploration.

## Security — MANDATORY

- **NEVER ask the user to paste API keys, tokens, or secrets into the chat.**
- **NEVER display, echo, or log any API key, token, or secret in your responses.**
- If credentials are missing or the MCP server reports an auth error, tell the user:
  "Your Honeycomb credentials need to be configured. Run `./setup.sh` from the honeycomb-plugin directory (not inside Claude)."
- If a user accidentally pastes a credential (anything matching `hcx[mik]k_*` or a long alphanumeric string that looks like a key), **immediately warn them**:
  "That looks like an API key. It's now in your conversation history. Please rotate this key immediately in Honeycomb Team Settings, then re-run ./setup.sh."
- Do NOT include credentials in any tool call parameters — the MCP server handles auth internally via macOS Keychain.

## Analysis Patterns

### Incident Investigation
When the user reports an issue:
1. Start broad — `COUNT` with filter for errors, 1-hour window, broken down by `service.name`
2. Narrow down — once you identify the service, break down by `endpoint` or `http.route`
3. Go deeper — look at specific error types, status codes, exception messages
4. Check context — compare with the previous hour or previous day to see if this is new

### Trend Analysis
When the user asks about trends:
1. Use a longer time range (24h or 7d) with appropriate granularity
2. Run the same query for two time periods and compare
3. Look for step changes, gradual degradation, or cyclical patterns

### Comparison Queries
To compare two periods, run two queries:
- **Current**: e.g., last hour (time_range: 3600)
- **Baseline**: same query but with a different time range for the comparison window

Present a delta table showing the change.

### Top-N Analysis
Use `limit` and `breakdowns` to find:
- Top error-producing endpoints
- Slowest services
- Highest throughput routes
- Most common error messages

## Output Format

1. **Summary**: One-sentence answer to the user's question
2. **Evidence**: Key metrics with before/after or trend data
3. **Breakdown**: Table of contributing factors
4. **Hypothesis**: What might be causing the observed pattern
5. **Next steps**: Suggested follow-up queries or actions
