import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..", "..");

function readJson(relPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(packageRoot, relPath), "utf-8"));
}

const manifest = readJson("manifest.json");
const pkg = readJson("package.json");

/** The 8 tools the stdio server exposes; the bundle manifest must mirror them. */
const EXPECTED_TOOLS = [
  "list_event_types",
  "check_availability",
  "create_booking",
  "cancel_booking",
  "reschedule_booking",
  "list_bookings",
  "join_waitlist",
  "check_waitlist",
] as const;

describe("MCPB manifest.json", () => {
  it("uses the supported manifest version and stays in sync with the package version", () => {
    expect(manifest.manifest_version).toBe("0.3");
    expect(manifest.version).toBe(pkg.version);
  });

  it("declares ASTROCAL_API_KEY as a required, sensitive user-config field", () => {
    const userConfig = manifest.user_config as Record<string, Record<string, unknown>>;
    expect(userConfig.api_key).toMatchObject({
      type: "string",
      required: true,
      sensitive: true,
    });
    // The mcp_config env must source the key from that user-config field so
    // Claude Desktop prompts for it at install.
    const env = (manifest.server as { mcp_config: { env: Record<string, string> } }).mcp_config.env;
    expect(env.ASTROCAL_API_KEY).toBe("${user_config.api_key}");
  });

  it("exposes the optional default event type without marking it sensitive", () => {
    const userConfig = manifest.user_config as Record<string, Record<string, unknown>>;
    expect(userConfig.default_event_type_id).toMatchObject({
      type: "string",
      required: false,
    });
  });

  it("lists exactly the 8 tools the stdio server registers", () => {
    const tools = (manifest.tools as { name: string }[]).map((t) => t.name);
    expect(new Set(tools)).toEqual(new Set(EXPECTED_TOOLS));
  });

  it("wraps the unchanged published stdio server via npx", () => {
    const mcpConfig = (manifest.server as { mcp_config: { command: string; args: string[] } })
      .mcp_config;
    expect(mcpConfig.command).toBe("npx");
    expect(mcpConfig.args).toEqual(["-y", "@astrocal/mcp-server"]);
  });
});
