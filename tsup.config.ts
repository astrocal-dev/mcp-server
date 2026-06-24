import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  dts: true,
  clean: true,
  // @astrocal/shared is a private workspace package (never published to npm).
  // It MUST be inlined into the bundle so the published @astrocal/mcp-server is
  // self-contained — otherwise `npx -y @astrocal/mcp-server` (used by every
  // registry listing and the .mcpb desktop bundle) fails to resolve it.
  noExternal: ["@astrocal/shared"],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
