import { PostHog } from "posthog-node";

let client: PostHog | null = null;

/**
 * Initializes the PostHog telemetry client.
 *
 * Gated by `POSTHOG_API_KEY` — when unset, all telemetry is a no-op.
 */
export function initTelemetry(): void {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return;

  client = new PostHog(apiKey, {
    host: process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com",
    flushAt: 10,
    flushInterval: 30000,
  });
}

/**
 * Tracks a tool invocation event.
 *
 * Uses `"mcp-server"` as the distinct ID for anonymous aggregate tracking.
 *
 * @param toolName - Name of the tool invoked.
 * @param success - Whether the invocation succeeded.
 * @param durationMs - Execution duration in milliseconds.
 * @param errorType - Optional error type string on failure.
 */
export function trackToolInvocation(
  toolName: string,
  success: boolean,
  durationMs: number,
  errorType?: string,
): void {
  if (!client) return;

  client.capture({
    distinctId: "mcp-server",
    event: "mcp.tool_invoked",
    properties: {
      tool_name: toolName,
      success,
      duration_ms: durationMs,
      ...(errorType ? { error_type: errorType } : {}),
    },
  });
}

/**
 * Tracks the server start event.
 */
export function trackServerStarted(): void {
  if (!client) return;

  client.capture({
    distinctId: "mcp-server",
    event: "mcp.server_started",
  });
}

/**
 * Captures a tool execution exception to PostHog for error tracking.
 *
 * Fire-and-forget: never throws, even if PostHog is unavailable.
 *
 * @param error - The error to capture.
 * @param toolName - Name of the tool that failed.
 * @param errorType - Classification: ApiError, TimeoutError, NetworkError, or UnknownError.
 */
export function captureToolException(error: unknown, toolName: string, errorType: string): void {
  if (!client) return;

  try {
    client.captureException(error, "mcp-server", {
      tool_name: toolName,
      error_type: errorType,
      source: "mcp",
    });
  } catch {
    // Never propagate telemetry errors
  }
}

/**
 * Flushes pending events and shuts down the telemetry client.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (client) {
    await client.shutdown();
  }
}
