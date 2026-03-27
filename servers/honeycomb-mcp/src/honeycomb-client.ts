/**
 * Honeycomb API client with ephemeral key management.
 *
 * Uses a Management API key to create short-lived Configuration keys
 * scoped to specific environments. Ephemeral keys are cached for their
 * lifetime and cleaned up on expiry or server shutdown.
 */

const DEFAULT_API_BASE = "https://api.honeycomb.io";
const EPHEMERAL_KEY_TTL_MINUTES = 30;

interface EphemeralKey {
  keyId: string;
  secret: string;
  environmentId: string;
  createdAt: number;
  expiresAt: number;
}

interface HoneycombEnvironment {
  id: string;
  name: string;
  slug: string;
  color: string;
}

interface HoneycombDataset {
  name: string;
  slug: string;
  description: string;
  created_at: string;
  last_written_at: string;
}

interface HoneycombColumn {
  id: string;
  key_name: string;
  type: string;
  description: string;
  hidden: boolean;
}

interface QuerySpec {
  calculations: Array<{ op: string; column?: string }>;
  filters?: Array<{ column: string; op: string; value: string | number }>;
  breakdowns?: string[];
  time_range?: number;
  granularity?: number;
  limit?: number;
}

export class HoneycombClient {
  private mgmtKey: string;
  private teamSlug: string;
  private apiBase: string;
  private ephemeralKeys: Map<string, EphemeralKey> = new Map();

  constructor() {
    const mgmtKey = process.env.HONEYCOMB_MGMT_KEY;
    const teamSlug = process.env.HONEYCOMB_TEAM;
    const apiBase = process.env.HONEYCOMB_API_BASE || DEFAULT_API_BASE;

    if (!mgmtKey) {
      throw new Error(
        "HONEYCOMB_MGMT_KEY not set. Configure your Management API key in the plugin settings."
      );
    }
    if (!teamSlug) {
      throw new Error(
        "HONEYCOMB_TEAM not set. Configure your team slug in the plugin settings."
      );
    }

    this.mgmtKey = mgmtKey;
    this.teamSlug = teamSlug;
    this.apiBase = apiBase.replace(/\/$/, "");
  }

  // --- Management API calls (use Management Key) ---

  private async mgmtFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.apiBase}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.mgmtKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Honeycomb Management API error (${response.status}): ${body}`);
    }

    return response;
  }

  async listEnvironments(): Promise<HoneycombEnvironment[]> {
    const resp = await this.mgmtFetch(`/2/teams/${this.teamSlug}/environments`);
    const data = await resp.json() as any;
    return (data.data || []).map((env: any) => ({
      id: env.id,
      name: env.attributes?.name || env.id,
      slug: env.attributes?.slug || env.id,
      color: env.attributes?.color || "",
    }));
  }

  // --- Ephemeral Key Management ---

  private async createEphemeralKey(environmentId: string): Promise<EphemeralKey> {
    const now = Date.now();
    const expiresAt = now + EPHEMERAL_KEY_TTL_MINUTES * 60 * 1000;

    const resp = await this.mgmtFetch(`/2/teams/${this.teamSlug}/api-keys`, {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "api-keys",
          attributes: {
            key_type: "configuration",
            name: `claude-ephemeral-${Date.now()}`,
            disabled: false,
            permissions: {
              create_datasets: false,
            },
          },
          relationships: {
            environment: {
              data: {
                id: environmentId,
                type: "environments",
              },
            },
          },
        },
      }),
    });

    const data = await resp.json() as any;
    const key: EphemeralKey = {
      keyId: data.data.id,
      secret: data.data.attributes.secret,
      environmentId,
      createdAt: now,
      expiresAt,
    };

    this.ephemeralKeys.set(environmentId, key);
    return key;
  }

  private async getEphemeralKey(environmentId: string): Promise<string> {
    const existing = this.ephemeralKeys.get(environmentId);
    if (existing && existing.expiresAt > Date.now() + 60_000) {
      // Reuse if more than 1 minute of life remaining
      return `${existing.keyId}${existing.secret}`;
    }

    // Clean up expired key if it exists
    if (existing) {
      await this.deleteEphemeralKey(existing.keyId).catch(() => {});
    }

    const key = await this.createEphemeralKey(environmentId);
    return `${key.keyId}${key.secret}`;
  }

  private async deleteEphemeralKey(keyId: string): Promise<void> {
    await this.mgmtFetch(`/2/teams/${this.teamSlug}/api-keys/${keyId}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  async cleanupAllKeys(): Promise<void> {
    const deletions = Array.from(this.ephemeralKeys.values()).map((key) =>
      this.deleteEphemeralKey(key.keyId)
    );
    await Promise.allSettled(deletions);
    this.ephemeralKeys.clear();
  }

  // --- Environment-scoped API calls (use ephemeral Configuration Key) ---

  private async envFetch(
    environmentId: string,
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const apiKey = await this.getEphemeralKey(environmentId);
    const url = `${this.apiBase}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "X-Honeycomb-Team": apiKey,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Honeycomb API error (${response.status}): ${body}`);
    }

    return response;
  }

  async listDatasets(environmentId: string): Promise<HoneycombDataset[]> {
    const resp = await this.envFetch(environmentId, "/1/datasets");
    return await resp.json() as HoneycombDataset[];
  }

  async listColumns(environmentId: string, dataset: string): Promise<HoneycombColumn[]> {
    const resp = await this.envFetch(environmentId, `/1/columns/${encodeURIComponent(dataset)}`);
    return await resp.json() as HoneycombColumn[];
  }

  async createQuery(environmentId: string, dataset: string, query: QuerySpec): Promise<any> {
    const resp = await this.envFetch(environmentId, `/1/queries/${encodeURIComponent(dataset)}`, {
      method: "POST",
      body: JSON.stringify(query),
    });
    return await resp.json();
  }

  async getQueryResults(environmentId: string, dataset: string, queryId: string): Promise<any> {
    const resp = await this.envFetch(
      environmentId,
      `/1/query_results/${encodeURIComponent(dataset)}/${queryId}`
    );
    return await resp.json();
  }

  async runQuery(environmentId: string, dataset: string, query: QuerySpec): Promise<any> {
    // Create the query
    const created = await this.createQuery(environmentId, dataset, query);
    const queryId = created.id;

    // Poll for results (max 30 seconds)
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const results = await this.getQueryResults(environmentId, dataset, queryId);
        if (results.complete) {
          return results;
        }
      } catch {
        // Query not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Query ${queryId} did not complete within 30 seconds`);
  }

  async getSLOs(environmentId: string, dataset: string): Promise<any[]> {
    const resp = await this.envFetch(environmentId, `/1/slos/${encodeURIComponent(dataset)}`);
    return await resp.json() as any[];
  }

  async getSLO(environmentId: string, dataset: string, sloId: string): Promise<any> {
    const resp = await this.envFetch(
      environmentId,
      `/1/slos/${encodeURIComponent(dataset)}/${sloId}`
    );
    return await resp.json();
  }

  async getBoards(environmentId: string): Promise<any[]> {
    const resp = await this.envFetch(environmentId, "/1/boards");
    return await resp.json() as any[];
  }

  async getBoard(environmentId: string, boardId: string): Promise<any> {
    const resp = await this.envFetch(environmentId, `/1/boards/${boardId}`);
    return await resp.json();
  }

  async getTriggers(environmentId: string, dataset: string): Promise<any[]> {
    const resp = await this.envFetch(environmentId, `/1/triggers/${encodeURIComponent(dataset)}`);
    return await resp.json() as any[];
  }

  // --- Helper: resolve environment by name or slug ---

  async resolveEnvironment(nameOrSlug: string): Promise<HoneycombEnvironment> {
    const envs = await this.listEnvironments();
    const match = envs.find(
      (e) =>
        e.name.toLowerCase() === nameOrSlug.toLowerCase() ||
        e.slug.toLowerCase() === nameOrSlug.toLowerCase() ||
        e.id === nameOrSlug
    );
    if (!match) {
      const available = envs.map((e) => e.name).join(", ");
      throw new Error(
        `Environment "${nameOrSlug}" not found. Available: ${available}`
      );
    }
    return match;
  }
}
