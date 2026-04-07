import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the client
vi.mock("./keychain.js", () => ({
  readManagementKey: vi.fn(),
}));

vi.mock("./config.js", () => ({
  readConfig: vi.fn(),
}));

vi.mock("./sanitise.js", () => ({
  registerSecret: vi.fn(),
  sanitise: (s: string) => s,
}));

import { HoneycombClient } from "./honeycomb-client.js";
import { readManagementKey } from "./keychain.js";
import { readConfig } from "./config.js";
import { registerSecret } from "./sanitise.js";

function mockFetch(responses: Array<{ status: number; body: any; ok?: boolean }>) {
  let callIndex = 0;
  return vi.fn(async (url: string, options?: RequestInit) => {
    const resp = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.ok ?? (resp.status >= 200 && resp.status < 300),
      status: resp.status,
      json: async () => resp.body,
      text: async () => JSON.stringify(resp.body),
    } as Response;
  });
}

describe("HoneycombClient", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.mocked(readManagementKey).mockReturnValue("test-key-id:test-secret");
    vi.mocked(readConfig).mockReturnValue({
      teamSlug: "kosli",
      apiBase: "https://api.eu1.honeycomb.io",
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetAllMocks();
  });

  describe("constructor", () => {
    it("throws when management key is missing", () => {
      vi.mocked(readManagementKey).mockReturnValue(null);
      expect(() => new HoneycombClient()).toThrow("credentials not configured");
    });

    it("throws when config is missing", () => {
      vi.mocked(readConfig).mockReturnValue(null);
      expect(() => new HoneycombClient()).toThrow("config not found");
    });

    it("registers management key as a secret", () => {
      new HoneycombClient();
      expect(registerSecret).toHaveBeenCalledWith("test-key-id:test-secret");
    });

    it("strips trailing slash from apiBase", () => {
      vi.mocked(readConfig).mockReturnValue({
        teamSlug: "kosli",
        apiBase: "https://api.eu1.honeycomb.io/",
      });
      const client = new HoneycombClient();
      // Verify by listing environments — check the URL doesn't have double slashes
      global.fetch = mockFetch([{ status: 200, body: { data: [] } }]);
      client.listEnvironments();
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.eu1.honeycomb.io/2/teams/kosli/environments",
        expect.anything()
      );
    });
  });

  describe("management API headers", () => {
    it("sends correct Content-Type and Accept for JSON:API", async () => {
      global.fetch = mockFetch([{ status: 200, body: { data: [] } }]);
      const client = new HoneycombClient();
      await client.listEnvironments();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/vnd.api+json",
            Accept: "application/vnd.api+json",
            Authorization: "Bearer test-key-id:test-secret",
          }),
        })
      );
    });
  });

  describe("listEnvironments", () => {
    it("parses JSON:API response into flat environment objects", async () => {
      global.fetch = mockFetch([{
        status: 200,
        body: {
          data: [
            {
              id: "env-1",
              attributes: { name: "prod", slug: "prod", color: "red" },
            },
            {
              id: "env-2",
              attributes: { name: "staging", slug: "staging", color: "blue" },
            },
          ],
        },
      }]);

      const client = new HoneycombClient();
      const envs = await client.listEnvironments();
      expect(envs).toEqual([
        { id: "env-1", name: "prod", slug: "prod", color: "red" },
        { id: "env-2", name: "staging", slug: "staging", color: "blue" },
      ]);
    });

    it("handles missing attributes gracefully", async () => {
      global.fetch = mockFetch([{
        status: 200,
        body: { data: [{ id: "env-1" }] },
      }]);

      const client = new HoneycombClient();
      const envs = await client.listEnvironments();
      expect(envs[0]).toEqual({ id: "env-1", name: "env-1", slug: "env-1", color: "" });
    });
  });

  describe("ephemeral key management", () => {
    it("creates ephemeral key and uses only the secret for env API calls", async () => {
      const fetchMock = mockFetch([
        // createEphemeralKey (mgmtFetch POST)
        {
          status: 201,
          body: {
            data: {
              id: "ephemeral-key-id",
              attributes: { secret: "ephemeral-secret-value", key_type: "configuration" },
            },
          },
        },
        // listDatasets (env-scoped call)
        { status: 200, body: [{ name: "dataset-1", slug: "dataset-1" }] },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      await client.listDatasets("env-1");

      // The second call (listDatasets) should use only the secret
      const envCall = fetchMock.mock.calls[1];
      const headers = envCall[1]?.headers as Record<string, string>;
      expect(headers["X-Honeycomb-Team"]).toBe("ephemeral-secret-value");
    });

    it("registers ephemeral key material as secrets", async () => {
      global.fetch = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 200, body: [] },
      ]);

      const client = new HoneycombClient();
      await client.listDatasets("env-1");

      expect(registerSecret).toHaveBeenCalledWith("eph-secret");
      expect(registerSecret).toHaveBeenCalledWith("eph-id");
    });

    it("reuses cached ephemeral key within TTL", async () => {
      const fetchMock = mockFetch([
        // createEphemeralKey
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        // First listDatasets
        { status: 200, body: [{ name: "ds1" }] },
        // Second listDatasets (should reuse key, no new createEphemeralKey)
        { status: 200, body: [{ name: "ds2" }] },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      await client.listDatasets("env-1");
      await client.listDatasets("env-1");

      // Should have 3 calls total, NOT 4 (no second createEphemeralKey)
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("environment-scoped API headers", () => {
    it("sends application/json Content-Type for v1 API", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 200, body: [] },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      await client.listDatasets("env-1");

      const envCall = fetchMock.mock.calls[1];
      const headers = envCall[1]?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("resolveEnvironment", () => {
    it("matches by name (case-insensitive)", async () => {
      global.fetch = mockFetch([{
        status: 200,
        body: { data: [{ id: "env-1", attributes: { name: "Prod", slug: "prod", color: "red" } }] },
      }]);

      const client = new HoneycombClient();
      const env = await client.resolveEnvironment("prod");
      expect(env.id).toBe("env-1");
    });

    it("matches by slug", async () => {
      global.fetch = mockFetch([{
        status: 200,
        body: { data: [{ id: "env-1", attributes: { name: "Production", slug: "prod", color: "red" } }] },
      }]);

      const client = new HoneycombClient();
      const env = await client.resolveEnvironment("prod");
      expect(env.id).toBe("env-1");
    });

    it("matches by ID", async () => {
      global.fetch = mockFetch([{
        status: 200,
        body: { data: [{ id: "hcben_abc123", attributes: { name: "prod", slug: "prod", color: "red" } }] },
      }]);

      const client = new HoneycombClient();
      const env = await client.resolveEnvironment("hcben_abc123");
      expect(env.id).toBe("hcben_abc123");
    });

    it("throws with available environments when not found", async () => {
      global.fetch = mockFetch([{
        status: 200,
        body: { data: [
          { id: "env-1", attributes: { name: "prod", slug: "prod", color: "red" } },
          { id: "env-2", attributes: { name: "staging", slug: "staging", color: "blue" } },
        ] },
      }]);

      const client = new HoneycombClient();
      await expect(client.resolveEnvironment("dev")).rejects.toThrow(
        'Environment "dev" not found. Available: prod, staging'
      );
    });
  });

  describe("cleanupAllKeys", () => {
    it("deletes all cached ephemeral keys", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-1", attributes: { secret: "secret-1" } } } },
        { status: 200, body: [] },
        // cleanup DELETE
        { status: 204, body: null },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      await client.listDatasets("env-1");
      await client.cleanupAllKeys();

      // Last call should be a DELETE to the api-keys endpoint
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      expect(lastCall[1]?.method).toBe("DELETE");
      expect(lastCall[0]).toContain("/api-keys/eph-1");
    });
  });

  describe("error handling", () => {
    it("throws on management API error with sanitised message", async () => {
      global.fetch = mockFetch([{
        status: 401,
        ok: false,
        body: { error: "unauthorized" },
      }]);

      const client = new HoneycombClient();
      await expect(client.listEnvironments()).rejects.toThrow(
        'Honeycomb Management API error (401)'
      );
    });

    it("throws on environment-scoped API error with sanitised message", async () => {
      global.fetch = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 404, ok: false, body: { error: "not found" } },
      ]);

      const client = new HoneycombClient();
      await expect(client.listDatasets("env-1")).rejects.toThrow(
        'Honeycomb API error (404)'
      );
    });
  });

  describe("listColumns", () => {
    it("fetches columns for a dataset", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 200, body: [{ key_name: "duration_ms", type: "float" }] },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      const cols = await client.listColumns("env-1", "my-dataset");
      expect(cols).toEqual([{ key_name: "duration_ms", type: "float" }]);
      expect(fetchMock.mock.calls[1][0]).toContain("/1/columns/my-dataset");
    });

    it("encodes dataset name in URL", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 200, body: [] },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      await client.listColumns("env-1", "my dataset/special");
      expect(fetchMock.mock.calls[1][0]).toContain("/1/columns/my%20dataset%2Fspecial");
    });
  });

  describe("createQuery", () => {
    it("sends POST with query spec", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 200, body: { id: "query-123" } },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      const result = await client.createQuery("env-1", "ds", {
        calculations: [{ op: "COUNT" }],
        time_range: 3600,
      });
      expect(result).toEqual({ id: "query-123" });
      expect(fetchMock.mock.calls[1][1]?.method).toBe("POST");
    });
  });

  describe("getQueryResults", () => {
    it("fetches query results by ID", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 200, body: { complete: true, data: { results: [] } } },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      const result = await client.getQueryResults("env-1", "ds", "q-123");
      expect(result.complete).toBe(true);
      expect(fetchMock.mock.calls[1][0]).toContain("/1/query_results/ds/q-123");
    });
  });

  describe("runQuery", () => {
    it("creates query and polls until complete", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        // createQuery
        { status: 200, body: { id: "q-1" } },
        // getQueryResults - first poll, not complete
        { status: 200, body: { complete: false } },
        // getQueryResults - second poll, complete
        { status: 200, body: { complete: true, data: { results: [{ count: 42 }] } } },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      const result = await client.runQuery("env-1", "ds", {
        calculations: [{ op: "COUNT" }],
        time_range: 3600,
      });
      expect(result.complete).toBe(true);
      expect(result.data.results[0].count).toBe(42);
    });
  });

  describe("getSLOs", () => {
    it("fetches SLOs for a dataset", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 200, body: [{ id: "slo-1", name: "Availability" }] },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      const slos = await client.getSLOs("env-1", "ds");
      expect(slos).toEqual([{ id: "slo-1", name: "Availability" }]);
    });
  });

  describe("getSLO", () => {
    it("fetches a single SLO by ID", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 200, body: { id: "slo-1", name: "Availability", target: 99.9 } },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      const slo = await client.getSLO("env-1", "ds", "slo-1");
      expect(slo.target).toBe(99.9);
      expect(fetchMock.mock.calls[1][0]).toContain("/1/slos/ds/slo-1");
    });
  });

  describe("getBoards", () => {
    it("fetches all boards", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 200, body: [{ id: "board-1", name: "Dashboard" }] },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      const boards = await client.getBoards("env-1");
      expect(boards).toEqual([{ id: "board-1", name: "Dashboard" }]);
      expect(fetchMock.mock.calls[1][0]).toContain("/1/boards");
    });
  });

  describe("getBoard", () => {
    it("fetches a single board by ID", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 200, body: { id: "board-1", name: "Dashboard", queries: [] } },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      const board = await client.getBoard("env-1", "board-1");
      expect(board.name).toBe("Dashboard");
      expect(fetchMock.mock.calls[1][0]).toContain("/1/boards/board-1");
    });
  });

  describe("getTriggers", () => {
    it("fetches triggers for a dataset", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { data: { id: "eph-id", attributes: { secret: "eph-secret" } } } },
        { status: 200, body: [{ id: "trig-1", name: "High Latency" }] },
      ]);
      global.fetch = fetchMock;

      const client = new HoneycombClient();
      const triggers = await client.getTriggers("env-1", "ds");
      expect(triggers).toEqual([{ id: "trig-1", name: "High Latency" }]);
      expect(fetchMock.mock.calls[1][0]).toContain("/1/triggers/ds");
    });
  });
});
