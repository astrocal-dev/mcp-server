/**
 * Configuration loader for the Astrocal MCP server.
 *
 * Reads environment variables and returns a validated config object.
 * Throws immediately if required variables are missing.
 */

/** MCP server configuration loaded from environment variables. */
export interface AstrocalConfig {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly defaultEventTypeId?: string;
}

/** Default API URL when ASTROCAL_API_URL is not set. */
const DEFAULT_API_URL = "https://api.astrocal.dev";

/**
 * Loads and validates MCP server configuration from environment variables.
 *
 * @returns Validated configuration object.
 * @throws {Error} If ASTROCAL_API_KEY is not set.
 */
export function loadConfig(): AstrocalConfig {
  const apiKey = process.env.ASTROCAL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ASTROCAL_API_KEY environment variable is required. " +
        "Get your API key from the Astrocal dashboard.",
    );
  }

  return {
    apiUrl: process.env.ASTROCAL_API_URL || DEFAULT_API_URL,
    apiKey,
    defaultEventTypeId: process.env.ASTROCAL_DEFAULT_EVENT_TYPE_ID || undefined,
  };
}
