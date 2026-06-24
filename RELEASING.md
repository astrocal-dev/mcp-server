# Releasing `@astrocal/mcp-server`

This package ships in three places that must stay in lockstep:

1. **npm** — `@astrocal/mcp-server` (invoked as `npx -y @astrocal/mcp-server`)
2. **Official MCP Registry** — `dev.astrocal/mcp-server` (via `server.json`)
3. **MCPB desktop bundle** — `astrocal.mcpb` (via `manifest.json`)

Registries and the `.mcpb` bundle both shell out to `npx -y @astrocal/mcp-server`,
so **the npm package is the source of truth** — publish it first, then the rest.

## Hard rules (do not skip)

- **The bundle must be self-contained.** `@astrocal/shared` is a private
  workspace package that is _never_ published to npm. `tsup.config.ts` inlines
  it via `noExternal: ["@astrocal/shared"]`, and it lives in `devDependencies`
  (not `dependencies`). If it ever leaks back into `dependencies` or out of
  `noExternal`, the published package 404s on install. The `prepublishOnly`
  guard (`scripts/verify-bundle.mjs`) fails the publish if this regresses.
- **Bump the version above what npm already has.** Check with
  `npm view @astrocal/mcp-server version`. Bump **all three** in lockstep:
  `package.json`, `manifest.json`, and **both** version fields in `server.json`
  (top-level + the npm package entry). They have drifted before.
- **Never change the public interface without a major-intent note.** Stable
  contract: package name, `astrocal-mcp` bin, env vars
  (`ASTROCAL_API_KEY` / `ASTROCAL_API_URL` / `ASTROCAL_DEFAULT_EVENT_TYPE_ID`),
  and the 8 tool names. Adding tools is fine; renaming/removing breaks clients.

## 1. Publish to npm

```bash
cd code/packages/mcp-server
npm view @astrocal/mcp-server version          # confirm the latest published version
# bump version in package.json, manifest.json, server.json (x2) to > that
pnpm publish --access public                   # runs prepublishOnly → build + verify-bundle.mjs
```

`pnpm publish` runs `prepublishOnly` automatically: it builds and then runs
`scripts/verify-bundle.mjs`, which asserts the bundle is self-contained (shared
inlined), has exactly one shebang on line 1, and contains all 8 tools.

Smoke-test the published artifact before moving on:

```bash
npx -y @astrocal/mcp-server@latest   # should print "Astrocal MCP Server running on stdio" (needs ASTROCAL_API_KEY)
```

## 2. Publish to the Official MCP Registry

Namespace `dev.astrocal/*` is the reverse-DNS of `astrocal.dev`, so ownership is
proven by DNS. The npm package is authorized because `package.json` carries
`mcpName: "dev.astrocal/mcp-server"` (the registry cross-checks this).

```bash
brew install mcp-publisher          # or see registry.modelcontextprotocol.io for other installs
mcp-publisher login dns             # add the printed TXT record to astrocal.dev DNS, then confirm
cd code/packages/mcp-server
mcp-publisher publish               # publishes server.json (npm package + remote connector)
# verify:
curl "https://registry.modelcontextprotocol.io/v0/servers?search=dev.astrocal"
```

`server.json` lists **both** transports: the npm `stdio` package and the hosted
`streamable-http` remote (`https://api.astrocal.dev/mcp`). Publishing here seeds
the downstream aggregators that auto-ingest from the official registry
(GitHub MCP Registry, mcp.directory, Glama).

## 3. Refresh the MCPB desktop bundle

```bash
cd code/packages/mcp-server
pnpm bundle          # build + mcpb validate manifest.json + mcpb pack . astrocal.mcpb
```

Upload the resulting `astrocal.mcpb` to wherever the marketing site serves
`/download/astrocal.mcpb` from. The manifest just runs `npx -y @astrocal/mcp-server`,
so it inherits the npm publish from step 1 — no code is shipped inside the bundle.

## Manual directory submissions

The broader discovery rollout (Smithery, Claude Connectors Directory, mcp.so,
PulseMCP, etc.) is tracked in **`/specs/prds/PRD-127-mcp-registry-submissions.md`**,
including the Claude Connectors Directory listing copy and reviewer test-account
checklist. Do those after step 1 lands on npm.
