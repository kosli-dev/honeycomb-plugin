/**
 * macOS Keychain integration for secure credential storage.
 *
 * Credentials are stored using the `security` CLI tool and never
 * appear in config files, environment variables, or Claude logs.
 */

import { execSync } from "node:child_process";

const SERVICE_NAME = "kosli-honeycomb";

export interface KeychainCredentials {
  managementKey: string;
}

/**
 * Read the Honeycomb management key from macOS Keychain.
 * Returns null if no entry exists (setup hasn't been run).
 */
export function readManagementKey(): string | null {
  try {
    const result = execSync(
      `security find-generic-password -s "${SERVICE_NAME}" -a "management-key" -w`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Check whether credentials are configured in Keychain.
 */
export function hasKeychainCredentials(): boolean {
  return readManagementKey() !== null;
}
