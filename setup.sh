#!/usr/bin/env bash
set -euo pipefail

# Kosli Honeycomb MCP — Setup
# Stores the management key in macOS Keychain, writes non-sensitive
# config to ~/.config/kosli-honeycomb/config.json, and optionally
# adds the MCP server entry to a user-specified JSON config file.

SERVICE="kosli-honeycomb"
ACCOUNT="management-key"
CONFIG_DIR="$HOME/.config/kosli-honeycomb"
CONFIG_FILE="$CONFIG_DIR/config.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_PATH="$SCRIPT_DIR/dist/index.js"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}Kosli Honeycomb MCP — Setup${NC}"
echo "───────────────────────────"
echo ""

# --- Uninstall mode ---
if [[ "${1:-}" == "--uninstall" ]]; then
  echo "Removing Honeycomb MCP configuration..."
  security delete-generic-password -s "$SERVICE" -a "$ACCOUNT" 2>/dev/null && \
    echo -e "${GREEN}✓${NC} Keychain entry removed" || \
    echo -e "${YELLOW}!${NC} No Keychain entry found"
  if [[ -f "$CONFIG_FILE" ]]; then
    rm "$CONFIG_FILE"
    rmdir "$CONFIG_DIR" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Config file removed"
  else
    echo -e "${YELLOW}!${NC} No config file found"
  fi
  echo ""
  echo "Done. Remember to also remove the honeycomb entry from your"
  echo "MCP server config file (wherever you added it)."
  exit 0
fi

# --- Check for existing credentials ---
EXISTING_KEY=""
if security find-generic-password -s "$SERVICE" -a "$ACCOUNT" > /dev/null 2>&1; then
  EXISTING_KEY="found"
  echo -e "${GREEN}✓${NC} Existing management key found in Keychain"
  echo ""
  read -p "Would you like to replace it? [y/N]: " REPLACE
  if [[ "${REPLACE:-n}" != [yY]* ]]; then
    echo "  Keeping existing key."
  else
    EXISTING_KEY=""
  fi
fi

# --- Management key ---
if [[ -z "$EXISTING_KEY" ]]; then
  echo ""
  echo "Enter your Honeycomb Management API key details."
  echo "(From Team Settings → API Keys in Honeycomb)"
  echo ""
  read -s -p "API key secret: " KEY_SECRET
  echo ""
  read -p "Key ID: " KEY_ID

  if [[ -z "$KEY_SECRET" || -z "$KEY_ID" ]]; then
    echo -e "${RED}Error:${NC} Both key ID and secret are required."
    exit 1
  fi

  MGMT_KEY="${KEY_ID}:${KEY_SECRET}"

  # -U flag updates if exists, creates if not
  security add-generic-password -s "$SERVICE" -a "$ACCOUNT" -w "$MGMT_KEY" -U
  echo -e "${GREEN}✓${NC} Management key stored in macOS Keychain"
fi

# --- Team slug ---
echo ""
CURRENT_SLUG=""
if [[ -f "$CONFIG_FILE" ]]; then
  CURRENT_SLUG=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('teamSlug',''))" 2>/dev/null || echo "")
fi

if [[ -n "$CURRENT_SLUG" ]]; then
  read -p "Honeycomb team slug or URL [$CURRENT_SLUG]: " TEAM_SLUG_INPUT
  TEAM_SLUG_INPUT="${TEAM_SLUG_INPUT:-$CURRENT_SLUG}"
else
  read -p "Honeycomb team slug or URL (e.g. kosli or https://ui.eu1.honeycomb.io/kosli/...): " TEAM_SLUG_INPUT
fi

if [[ -z "$TEAM_SLUG_INPUT" ]]; then
  echo -e "${RED}Error:${NC} Team slug cannot be empty."
  exit 1
fi

# Extract slug from URL if a full URL was pasted
if [[ "$TEAM_SLUG_INPUT" == http* ]]; then
  # Extract slug from URLs like https://ui.eu1.honeycomb.io/kosli/environments/...
  TEAM_SLUG=$(echo "$TEAM_SLUG_INPUT" | sed -E 's|https?://[^/]+/([^/]+).*|\1|')
  echo -e "${GREEN}✓${NC} Extracted team slug: $TEAM_SLUG"
else
  TEAM_SLUG="$TEAM_SLUG_INPUT"
fi

# --- API base ---
# Auto-detect from URL if user pasted one for the team slug
DETECTED_BASE=""
if [[ "$TEAM_SLUG_INPUT" == http* ]]; then
  # Extract host from URL and convert ui.* to api.*
  URL_HOST=$(echo "$TEAM_SLUG_INPUT" | sed -E 's|https?://([^/]+).*|\1|')
  DETECTED_BASE="https://${URL_HOST/ui./api.}"
fi

CURRENT_BASE="${DETECTED_BASE:-https://api.honeycomb.io}"
if [[ -z "$DETECTED_BASE" && -f "$CONFIG_FILE" ]]; then
  CURRENT_BASE=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('apiBase','https://api.honeycomb.io'))" 2>/dev/null || echo "https://api.honeycomb.io")
fi

if [[ -n "$DETECTED_BASE" ]]; then
  echo -e "${GREEN}✓${NC} Detected API base from URL: $CURRENT_BASE"
fi

read -p "Honeycomb API base URL [$CURRENT_BASE]: " API_BASE
API_BASE="${API_BASE:-$CURRENT_BASE}"

# Fix common mistake: ui.* instead of api.*
if [[ "$API_BASE" == *"://ui."* ]]; then
  FIXED_BASE="${API_BASE/ui./api.}"
  echo -e "${YELLOW}!${NC} That looks like the web UI URL. The API URL should be: $FIXED_BASE"
  read -p "Use $FIXED_BASE instead? [Y/n]: " FIX_URL
  if [[ "${FIX_URL:-y}" != [nN]* ]]; then
    API_BASE="$FIXED_BASE"
  fi
fi

# --- Write config ---
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_FILE" <<EOF
{
  "teamSlug": "$TEAM_SLUG",
  "apiBase": "$API_BASE"
}
EOF
echo -e "${GREEN}✓${NC} Config written to $CONFIG_FILE"

# --- Detect node path ---
NODE_PATH=""
if command -v node > /dev/null 2>&1; then
  NODE_PATH="$(command -v node)"
elif [[ -x "/opt/homebrew/bin/node" ]]; then
  NODE_PATH="/opt/homebrew/bin/node"
elif [[ -x "/usr/local/bin/node" ]]; then
  NODE_PATH="/usr/local/bin/node"
fi

if [[ -z "$NODE_PATH" ]]; then
  echo -e "${RED}Error:${NC} Node.js not found. Install it first."
  exit 1
fi

# --- MCP server config ---
echo ""
echo -e "${BOLD}MCP Server Configuration${NC}"
echo ""
echo "To use with Claude Code, the honeycomb MCP server entry needs to"
echo "be added to your MCP config file. The entry to add is:"
echo ""
echo -e "  ${BOLD}\"honeycomb\": {${NC}"
echo -e "  ${BOLD}  \"command\": \"$NODE_PATH\",${NC}"
echo -e "  ${BOLD}  \"args\": [\"$SERVER_PATH\"]${NC}"
echo -e "  ${BOLD}}${NC}"
echo ""
echo "You can either:"
echo "  1) Add it manually to your MCP config"
echo "  2) Provide the path to your config file and this script will add it"
echo ""
read -p "Enter the full path to your MCP config file (or press Enter to skip): " MCP_FILE

if [[ -n "$MCP_FILE" ]]; then
  # Expand ~ if used
  MCP_FILE="${MCP_FILE/#\~/$HOME}"

  if [[ ! -f "$MCP_FILE" ]]; then
    echo -e "${YELLOW}!${NC} File not found: $MCP_FILE"
    read -p "Create it? [Y/n]: " CREATE_FILE
    if [[ "${CREATE_FILE:-y}" == [nN]* ]]; then
      echo "  Skipping MCP config update."
    else
      mkdir -p "$(dirname "$MCP_FILE")"
      echo '{}' > "$MCP_FILE"
      echo -e "${GREEN}✓${NC} Created $MCP_FILE"
    fi
  fi

  if [[ -f "$MCP_FILE" ]]; then
    python3 <<PYEOF
import json, sys

mcp_file = "$MCP_FILE"
node_path = "$NODE_PATH"
server_path = "$SERVER_PATH"

try:
    with open(mcp_file) as f:
        config = json.load(f)
except (json.JSONDecodeError, FileNotFoundError):
    print("Error: Could not parse " + mcp_file + " as JSON.")
    sys.exit(1)

# Find or create mcpServers — handle both flat and nested structures
# Flat: { "mcpServers": { ... } }
# Nested: { "projects": { "/path": { "mcpServers": { ... } } } }

honeycomb_entry = {
    "command": node_path,
    "args": [server_path]
}

if "mcpServers" in config:
    # Flat structure — add directly
    config["mcpServers"]["honeycomb"] = honeycomb_entry
    print("Added honeycomb to mcpServers.")
elif "projects" in config:
    # Nested structure — list available projects and let user choose
    projects = {k: v for k, v in config["projects"].items() if isinstance(v, dict)}
    projects_with_mcp = {k: v for k, v in projects.items() if "mcpServers" in v}

    if len(projects_with_mcp) == 1:
        key = list(projects_with_mcp.keys())[0]
        config["projects"][key]["mcpServers"]["honeycomb"] = honeycomb_entry
        print(f"Added honeycomb to projects[{key}].mcpServers.")
    elif len(projects_with_mcp) > 1:
        print("Multiple project configs found with mcpServers:")
        for i, k in enumerate(sorted(projects_with_mcp.keys()), 1):
            print(f"  {i}) {k}")
        choice = input("Add honeycomb to which project? (number): ").strip()
        try:
            idx = int(choice) - 1
            key = sorted(projects_with_mcp.keys())[idx]
            config["projects"][key]["mcpServers"]["honeycomb"] = honeycomb_entry
            print(f"Added honeycomb to projects[{key}].mcpServers.")
        except (ValueError, IndexError):
            print("Invalid choice. Skipping.")
            sys.exit(0)
    else:
        # No mcpServers in any project — add top-level
        config["mcpServers"] = {"honeycomb": honeycomb_entry}
        print("Added mcpServers.honeycomb at top level.")
else:
    # Empty or minimal file — add top-level mcpServers
    config["mcpServers"] = {"honeycomb": honeycomb_entry}
    print("Added mcpServers.honeycomb at top level.")

with open(mcp_file, "w") as f:
    json.dump(config, f, indent=2)
    f.write("\n")
PYEOF

    echo -e "${GREEN}✓${NC} MCP config updated"
  fi
else
  echo "  Skipping — add the entry manually when ready."
fi

# --- Done ---
echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Build the server (if not already):  pnpm install && pnpm build"
echo "  2. Restart Claude Code to pick up the new MCP server"
echo "  3. Try: /honeycomb:explore"
echo ""
echo "To update credentials later, run this script again."
echo "To remove: ./setup.sh --uninstall"
