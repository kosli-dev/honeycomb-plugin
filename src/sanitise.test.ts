import { describe, it, expect, beforeEach } from "vitest";
import { sanitise, registerSecret } from "./sanitise.js";

describe("sanitise", () => {
  describe("registered secrets", () => {
    beforeEach(() => {
      // Register some test secrets
      registerSecret("mysecretkey12345678");
      registerSecret("anothersecret99999");
    });

    it("strips registered secrets from output", () => {
      const input = "Error: auth failed with key mysecretkey12345678";
      expect(sanitise(input)).toBe("Error: auth failed with key [REDACTED]");
    });

    it("strips multiple registered secrets", () => {
      const input = "Keys: mysecretkey12345678 and anothersecret99999";
      expect(sanitise(input)).toBe("Keys: [REDACTED] and [REDACTED]");
    });

    it("ignores short secrets (< 8 chars)", () => {
      registerSecret("short");
      const input = "This has short in it";
      expect(sanitise(input)).toBe("This has short in it");
    });
  });

  describe("Honeycomb key patterns", () => {
    it("strips management key patterns (hcxmk_)", () => {
      const input = "Auth: hcxmk_abcdefghij1234567890extra";
      expect(sanitise(input)).toBe("Auth: [REDACTED]");
    });

    it("strips ingest key patterns (hcxik_)", () => {
      const input = "Key: hcxik_abcdefghij1234567890extra";
      expect(sanitise(input)).toBe("Key: [REDACTED]");
    });

    it("strips configuration key patterns (hcxck_)", () => {
      const input = "Key: hcxck_abcdefghij1234567890extra";
      expect(sanitise(input)).toBe("Key: [REDACTED]");
    });

    it("strips 32-char hex strings (key IDs)", () => {
      const input = "ID: abcdef0123456789abcdef0123456789";
      expect(sanitise(input)).toBe("ID: [REDACTED]");
    });

    it("strips Bearer tokens from error messages", () => {
      const input = 'Authorization: Bearer mytoken_abcdefghij1234567890';
      expect(sanitise(input)).toBe("Authorization: [REDACTED]");
    });

    it("strips X-Honeycomb-Team header values", () => {
      const input = "X-Honeycomb-Team: some_api_key_value_here";
      expect(sanitise(input)).toBe("[REDACTED]");
    });
  });

  describe("safe content", () => {
    it("passes through normal text unchanged", () => {
      const input = "Environment 'prod' not found. Available: staging, prod-us";
      expect(sanitise(input)).toBe(input);
    });

    it("passes through JSON error bodies", () => {
      const input = '{"error":"not found","status":404}';
      expect(sanitise(input)).toBe(input);
    });

    it("handles empty string", () => {
      expect(sanitise("")).toBe("");
    });
  });
});
