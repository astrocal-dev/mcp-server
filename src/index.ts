/**
 * Astrocal MCP Server (stdio transport).
 *
 * Thin wiring layer over the shared, transport-agnostic tool core in
 * `@astrocal/shared` (tool definitions + dispatcher + API client). The same
 * core powers the hosted Streamable HTTP endpoint in `@astrocal/api`.
 *
 * Configure with environment variables:
 *   ASTROCAL_API_KEY               - API key for authentication (required)
 *   ASTROCAL_API_URL               - Base URL of the Astrocal API (default: https://api.astrocal.dev)
 *   ASTROCAL_DEFAULT_EVENT_TYPE_ID - Optional default event type for tool calls
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  AstrocalApiClient,
  dispatchTool,
  loadConfig,
  toolDefinitions,
  UnknownToolError,
} from "@astrocal/shared";
import {
  initTelemetry,
  trackToolInvocation,
  captureToolException,
  trackServerStarted,
  shutdownTelemetry,
} from "./lib/telemetry.js";

const config = loadConfig();
const apiClient = new AstrocalApiClient(config.apiUrl, config.apiKey);

const server = new Server(
  {
    name: "astrocal-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── List Tools ────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
}));

// ─── Handle Tool Calls ─────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();

  try {
    const result = await dispatchTool(name, args, apiClient, config);
    trackToolInvocation(name, true, Date.now() - startTime);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    if (error instanceof UnknownToolError) {
      trackToolInvocation(name, false, Date.now() - startTime, "UnknownTool");
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
    trackToolInvocation(name, false, Date.now() - startTime, errorType);
    captureToolException(error, name, errorType);

    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${error instanceof Error ? error.message : "An unexpected error occurred."}`,
        },
      ],
      isError: true,
    };
  }
});

// ─── Start Server ──────────────────────────────────────────────────

async function main() {
  initTelemetry();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Astrocal MCP Server running on stdio");

  trackServerStarted();
}

// Graceful shutdown: flush telemetry events
const shutdown = async () => {
  await shutdownTelemetry();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((error) => {
  console.error("Failed to start Astrocal MCP Server:", error);
  process.exit(1);
});
