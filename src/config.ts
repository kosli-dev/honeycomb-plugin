/**
 * Non-sensitive configuration stored in ~/.config/kosli-honeycomb/config.json.
 * Only contains team slug and API base URL — never credentials.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".config", "kosli-honeycomb");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface HoneycombConfig {
  teamSlug: string;
  apiBase: string;
}

export function readConfig(): HoneycombConfig | null {
  if (!existsSync(CONFIG_FILE)) {
    return null;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.teamSlug) return null;
    return {
      teamSlug: parsed.teamSlug,
      apiBase: parsed.apiBase || "https://api.honeycomb.io",
    };
  } catch {
    return null;
  }
}

export { CONFIG_DIR, CONFIG_FILE };
