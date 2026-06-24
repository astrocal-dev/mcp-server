/**
 * Pre-publish guard: asserts the built bundle is self-contained and runnable.
 *
 * @astrocal/shared is a private workspace package that is never published to
 * npm. tsup MUST inline it (tsup.config.ts `noExternal`) or the published
 * package will fail to install via `npx -y @astrocal/mcp-server` — the exact
 * invocation used by MCP registries and the .mcpb desktop bundle. This script
 * fails the publish loudly if that ever regresses.
 */
/* global console, process */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.js");
const errors = [];

let source;
try {
  source = readFileSync(dist, "utf8");
} catch {
  console.error(`✗ ${dist} not found — run \`pnpm build\` first.`);
  process.exit(1);
}

// 1. The private workspace package must be inlined, not left as an import.
if (/from\s*["']@astrocal\/shared["']|require\(["']@astrocal\/shared["']\)/.test(source)) {
  errors.push("@astrocal/shared is imported externally — tsup `noExternal` is not bundling it.");
}

// 2. Exactly one shebang, on the first line (a duplicate is a syntax error).
const lines = source.split("\n");
const shebangCount = lines.filter((l) => l.startsWith("#!")).length;
if (shebangCount !== 1 || !lines[0].startsWith("#!/usr/bin/env node")) {
  errors.push(`expected exactly one shebang on line 1, found ${shebangCount}.`);
}

// 3. All eight public tools must be present in the bundle.
const REQUIRED_TOOLS = [
  "check_availability",
  "create_booking",
  "cancel_booking",
  "reschedule_booking",
  "list_bookings",
  "list_event_types",
  "join_waitlist",
  "check_waitlist",
];
const missing = REQUIRED_TOOLS.filter((t) => !source.includes(t));
if (missing.length > 0) {
  errors.push(`missing tool definitions in bundle: ${missing.join(", ")}.`);
}

if (errors.length > 0) {
  console.error("✗ Bundle verification failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("✓ Bundle is self-contained (shared inlined, single shebang, all 8 tools present).");
