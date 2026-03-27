#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HoneycombClient } from "./honeycomb-client.js";

const server = new McpServer({
  name: "honeycomb",
  version: "0.1.0",
});

let client: HoneycombClient;

try {
  client = new HoneycombClient();
} catch (err: any) {
  console.error(`Failed to initialise Honeycomb client: ${err.message}`);
  process.exit(1);
}

// --- Tools ---

server.tool(
  "honeycomb_list_environments",
  "List all Honeycomb environments available to the configured team",
  {},
  async () => {
    const envs = await client.listEnvironments();
    return {
      content: [{ type: "text", text: JSON.stringify(envs, null, 2) }],
    };
  }
);

server.tool(
  "honeycomb_list_datasets",
  "List datasets in a Honeycomb environment",
  {
    environment: z.string().describe("Environment name, slug, or ID"),
  },
  async ({ environment }) => {
    const env = await client.resolveEnvironment(environment);
    const datasets = await client.listDatasets(env.id);
    return {
      content: [{ type: "text", text: JSON.stringify(datasets, null, 2) }],
    };
  }
);

server.tool(
  "honeycomb_list_columns",
  "List columns/fields in a dataset within an environment",
  {
    environment: z.string().describe("Environment name, slug, or ID"),
    dataset: z.string().describe("Dataset name or slug"),
  },
  async ({ environment, dataset }) => {
    const env = await client.resolveEnvironment(environment);
    const columns = await client.listColumns(env.id, dataset);
    return {
      content: [{ type: "text", text: JSON.stringify(columns, null, 2) }],
    };
  }
);

server.tool(
  "honeycomb_query",
  "Run a query against a Honeycomb dataset. Returns aggregated results.",
  {
    environment: z.string().describe("Environment name, slug, or ID"),
    dataset: z.string().describe("Dataset name or slug"),
    calculations: z
      .array(
        z.object({
          op: z.string().describe("Aggregation operation: COUNT, SUM, AVG, MAX, MIN, P50, P90, P95, P99, HEATMAP, COUNT_DISTINCT"),
          column: z.string().optional().describe("Column to aggregate (not needed for COUNT)"),
        })
      )
      .describe("Aggregation calculations to perform"),
    filters: z
      .array(
        z.object({
          column: z.string().describe("Column to filter on"),
          op: z.string().describe("Filter operator: =, !=, >, <, >=, <=, starts-with, contains, exists, not-exists, in, not-in"),
          value: z.union([z.string(), z.number()]).describe("Filter value"),
        })
      )
      .optional()
      .describe("Filters to apply"),
    breakdowns: z.array(z.string()).optional().describe("Columns to group by"),
    time_range: z
      .number()
      .optional()
      .default(3600)
      .describe("Time range in seconds (default: 3600 = last hour)"),
    granularity: z.number().optional().describe("Bucket granularity in seconds"),
    limit: z.number().optional().describe("Max results to return"),
  },
  async ({ environment, dataset, calculations, filters, breakdowns, time_range, granularity, limit }) => {
    const env = await client.resolveEnvironment(environment);
    const query: any = { calculations, time_range };
    if (filters?.length) query.filters = filters;
    if (breakdowns?.length) query.breakdowns = breakdowns;
    if (granularity) query.granularity = granularity;
    if (limit) query.limit = limit;

    const results = await client.runQuery(env.id, dataset, query);
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }
);

server.tool(
  "honeycomb_get_slos",
  "List SLOs for a dataset, or get details for a specific SLO",
  {
    environment: z.string().describe("Environment name, slug, or ID"),
    dataset: z.string().describe("Dataset name or slug"),
    slo_id: z.string().optional().describe("Specific SLO ID to get details for"),
  },
  async ({ environment, dataset, slo_id }) => {
    const env = await client.resolveEnvironment(environment);
    if (slo_id) {
      const slo = await client.getSLO(env.id, dataset, slo_id);
      return {
        content: [{ type: "text", text: JSON.stringify(slo, null, 2) }],
      };
    }
    const slos = await client.getSLOs(env.id, dataset);
    return {
      content: [{ type: "text", text: JSON.stringify(slos, null, 2) }],
    };
  }
);

server.tool(
  "honeycomb_get_boards",
  "List boards in an environment, or get details for a specific board",
  {
    environment: z.string().describe("Environment name, slug, or ID"),
    board_id: z.string().optional().describe("Specific board ID to get details for"),
  },
  async ({ environment, board_id }) => {
    const env = await client.resolveEnvironment(environment);
    if (board_id) {
      const board = await client.getBoard(env.id, board_id);
      return {
        content: [{ type: "text", text: JSON.stringify(board, null, 2) }],
      };
    }
    const boards = await client.getBoards(env.id);
    return {
      content: [{ type: "text", text: JSON.stringify(boards, null, 2) }],
    };
  }
);

server.tool(
  "honeycomb_get_triggers",
  "List alert triggers for a dataset",
  {
    environment: z.string().describe("Environment name, slug, or ID"),
    dataset: z.string().describe("Dataset name or slug"),
  },
  async ({ environment, dataset }) => {
    const env = await client.resolveEnvironment(environment);
    const triggers = await client.getTriggers(env.id, dataset);
    return {
      content: [{ type: "text", text: JSON.stringify(triggers, null, 2) }],
    };
  }
);

// --- Graceful shutdown: clean up ephemeral keys ---

async function shutdown() {
  console.error("Shutting down — cleaning up ephemeral API keys...");
  await client.cleanupAllKeys();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("beforeExit", () => client.cleanupAllKeys());

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Honeycomb MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
