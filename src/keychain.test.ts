import { describe, it, expect, vi } from "vitest";
import { readManagementKey, hasKeychainCredentials } from "./keychain.js";
import { execSync } from "node:child_process";

vi.mock("node:child_process");

describe("keychain", () => {
  describe("readManagementKey", () => {
    it("returns the key when Keychain entry exists", () => {
      vi.mocked(execSync).mockReturnValue("my-key-id:my-secret\n");
      const key = readManagementKey();
      expect(key).toBe("my-key-id:my-secret");
    });

    it("trims whitespace from Keychain output", () => {
      vi.mocked(execSync).mockReturnValue("  key-value  \n");
      expect(readManagementKey()).toBe("key-value");
    });

    it("returns null when no Keychain entry exists", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("security: SecItemCopyMatching: The specified item could not be found in the keychain.");
      });
      expect(readManagementKey()).toBeNull();
    });

    it("calls security with correct service and account", () => {
      vi.mocked(execSync).mockReturnValue("key\n");
      readManagementKey();
      expect(execSync).toHaveBeenCalledWith(
        'security find-generic-password -s "kosli-honeycomb" -a "management-key" -w',
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );
    });
  });

  describe("hasKeychainCredentials", () => {
    it("returns true when key exists", () => {
      vi.mocked(execSync).mockReturnValue("some-key\n");
      expect(hasKeychainCredentials()).toBe(true);
    });

    it("returns false when key does not exist", () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error("not found");
      });
      expect(hasKeychainCredentials()).toBe(false);
    });
  });
});
