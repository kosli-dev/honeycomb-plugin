/**
 * Sanitise strings to strip any credential material before
 * returning data across the MCP boundary to Claude.
 *
 * This is a defence-in-depth measure — keys should never reach
 * response paths, but if they do, this catches them.
 */

// Honeycomb key patterns: management keys, configuration keys, ingest keys
// Format: hcxmk_, hcxik_, hcxck_ prefixes, or bare alphanumeric key IDs
const KEY_PATTERNS = [
  /hcx[mick]k_[a-zA-Z0-9]{20,}/g,         // Honeycomb prefixed keys
  /\b[a-f0-9]{32}\b/g,                      // 32-char hex strings (API key IDs)
  /Bearer\s+[a-zA-Z0-9_\-:.]{20,}/g,       // Bearer tokens in error messages
  /X-Honeycomb-Team:\s*[a-zA-Z0-9_\-:.]+/gi, // Header values in error messages
];

let knownSecrets: string[] = [];

/**
 * Register a secret so it can be stripped from output.
 * Called once at startup with the management key, and whenever
 * ephemeral keys are created.
 */
export function registerSecret(secret: string): void {
  if (secret && !knownSecrets.includes(secret)) {
    knownSecrets.push(secret);
  }
}

/**
 * Remove registered secrets and known key patterns from a string.
 */
export function sanitise(input: string): string {
  let result = input;

  // Strip any registered secrets (exact match)
  for (const secret of knownSecrets) {
    if (secret.length >= 8) {
      // Only replace secrets long enough to be meaningful
      result = result.replaceAll(secret, "[REDACTED]");
    }
  }

  // Strip known key patterns
  for (const pattern of KEY_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }

  return result;
}
