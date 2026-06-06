# Ts.ED v7 → v8 (ESM) Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `api-gateway` from Ts.ED 7.87.9 (CommonJS) to 8.31.x (ESM-only), keeping the build, dev loop, and full test suite green, so the framework stays on a supported major.

**Architecture:** Ts.ED v8 ships **ESM-only** (no CommonJS build). This is therefore a whole-package CommonJS→ESM conversion of `api-gateway`, *plus* the @tsed bump — not a dependency upgrade. The good news (verified against v8.31.0 source): `@tsed/common` is still a broad barrel re-export, so the ~34 files' **import paths do not change**. The real cost is the toolchain: ESM tsconfig, `.js` import extensions, a dev-loop replacement, and porting 24 `jest.mock()` test files (ESM breaks `jest.mock` hoisting).

**Tech Stack:** TypeScript, Ts.ED 8, Node ≥20.11 (use 22), `tsx` (dev), Vitest (tests — recommended), `tsc-alias` (path-alias resolution at build).

---

## ⚠️ Read before starting — this plan is GATED

**This work is currently DEFERRED, not active.** The 4 advisories that motivated it are already cleared on `main` via an `overrides` pin (commit `c6089e0`) — `npm audit` reports 0, and adversarial research (workflow `wf_19c9f64d`) confirmed **none of the 4 is exploitable** in MANOE's server. So there is **no security clock** forcing this migration. Execute this plan only when:
- A deliberate decision is made to get off Ts.ED v7 (e.g. v7 EOL / a needed v8 feature), AND
- 3–6 contiguous working days are budgeted, AND
- The override-pinned advisories resurface or a new @tsed advisory lands that the override can't satisfy.

When that day comes, **first re-verify the research is still current** (Ts.ED minor versions move): re-fetch the v8 latest `@tsed/common` `package.json` `exports` map and `packages/platform/common/src/index.ts` barrel from GitHub. If the barrel was removed in a later v8 minor, Task 4's "no import-path changes" assumption is void and import rewrites become mandatory.

---

## Research provenance

Grounded in adversarial multi-agent research run 2026-06-06 (workflow `wf_19c9f64d-877`): 4 parallel research angles → adversarial critic → synthesis, all re-verified against the **real repo** and the **v8.31.0 published artifacts**. Key verified facts:

- **v8 is ESM-only, confirmed uncontested.** `@tsed/*@8.31.0` `package.json`: `"type":"module"`, `exports` with only `import`/`default` → `lib/esm`, **no `require` condition**. `require(esm)` interop is a dead end (decorator/DI bootstrap + `useDefineForClassFields:false` runtime semantics aren't satisfied; top-level await → `ERR_REQUIRE_ASYNC_MODULE`).
- **`@tsed/common` is still a barrel in v8.31.0** — the official migration *prose* ("no longer re-exports") contradicts the actual source. Import paths for `Controller/Get/Post/PathParams/Service/Inject/Property/...` do **not** need to change, *provided `@tsed/common` stays installed*.
- **MANOE-specific non-issues (verified by repo grep):** no `multer`/file-upload route (multer v1→v2 irrelevant); `@Configuration() settings` is never read via property access (config-API proxy removal is a no-op here); none of v8's removed decorators (`@Configurable/@Deprecated/@Enumerable/@ReadOnly/@Writable`) are used.
- **Dominant cost:** **24 of 45 test files use `jest.mock()` (32 calls)**. ESM breaks `jest.mock` hoisting → each must move to `jest.unstable_mockModule()` + dynamic import, or be ported to Vitest.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `api-gateway/tsconfig.json` | compiler config | `module`/`moduleResolution` → `NodeNext`; `useDefineForClassFields: false`; keep `experimentalDecorators`+`emitDecoratorMetadata` |
| `api-gateway/package.json` | module type, scripts, deps | `"type":"module"`; dev script → `tsx`; bump all `@tsed/*` to 8.31.x; drop `ts-node-dev`; (test runner per Task 6) |
| `api-gateway/src/**/*.ts` (~34+ files) | all source | add `.js` extension to every **relative** import specifier; `import.meta.url` for the one `__dirname` use |
| `api-gateway/src/Server.ts` | bootstrap | `__dirname` → `fileURLToPath(import.meta.url)`; verify `import "@tsed/swagger"`/`"@tsed/socketio"` side-effect imports resolve under ESM |
| `api-gateway/src/__tests__/**` (24 mock files) | tests | `jest.mock` → `vi.mock` (Vitest) or `unstable_mockModule` |
| `api-gateway/vitest.config.ts` *(new, if Vitest)* | test config | swc/esbuild transform with `useDefineForClassFields:false`, decorator metadata |
| `.github/workflows/ci.yml` | CI | pin Node to `22` (guarantee v8's ≥20.11 floor) |

---

## The biggest risk (read first)

**`useDefineForClassFields: false` must be set identically in all THREE transform configs** — `tsc` (build), the test-runner transform (Vitest swc plugin / ts-jest), and the dev loader (`tsx`). A single mismatch makes `@Inject`/`@Constant` silently return `undefined` **at runtime with no compile error** — on MANOE's 25-file DI surface, tests can pass while the booted orchestrator fails to wire providers. Every task below that touches a transform config MUST assert this flag, and Task 8 explicitly smoke-tests DI wiring at runtime.

Secondary risk (Windows/Zscaler): the swc-based dev loader (`@swc-node/register`) pulls `@swc/core`, a native prebuilt whose postinstall can fail under Zscaler (npm strips `NODE_EXTRA_CA_CERTS` from lifecycle scripts). **Use `tsx` (esbuild, prebuilt, installs cleaner) instead.** If a native binary must be installed, apply the CLAUDE.md workaround: `npm install --ignore-scripts` then run `prebuild-install` from an interactive shell.

---

## Task 1: Spike — prove ESM + one mocked test on a throwaway branch

**Do this FIRST and STOP if it fails.** It de-risks the whole effort for ~1 day instead of discovering the cost mid-migration.

**Files:**
- Modify: `api-gateway/tsconfig.json`, `api-gateway/package.json`
- Modify: `api-gateway/src/index.ts`, `api-gateway/src/Server.ts`, ONE controller, ONE service
- Port: ONE existing `jest.mock`-bearing suite (e.g. `CancellationToken.test.ts` or `ValueShiftRestore.test.ts`) to the chosen runner

- [ ] **Step 1:** Branch off `main`. Set `tsconfig`: `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `useDefineForClassFields: false`. Set `package.json` `"type":"module"`.
- [ ] **Step 2:** Bump `@tsed/*` (common, core, di, exceptions, json-mapper, platform-express, platform-views, openspec, schema, socketio, swagger, logger) to `8.31.x`: `npm install @tsed/common@8 ... --ignore-scripts` then verify install (pure-JS, no prebuild needed).
- [ ] **Step 3:** In `index.ts`, `Server.ts`, the one controller, and the one service: add `.js` to every relative import. Replace `Server.ts`'s `__dirname` with `const rootDir = dirname(fileURLToPath(import.meta.url));` (import `fileURLToPath` from `node:url`, `dirname` from `node:path`).
- [ ] **Step 4:** Swap dev script to `"dev": "tsx watch src/index.ts"`; `npm install -D tsx`; remove `ts-node-dev`.
- [ ] **Step 5:** Add `tsc-alias` (the `@/*` path alias is not honored by NodeNext at runtime): `npm install -D tsc-alias`, build script → `"build": "tsc && tsc-alias"`. For dev/test, configure `tsx`/runner path resolution.
- [ ] **Step 6 (success criteria — ALL must hold):**
  - `npm run build` clean.
  - App boots: `npm start` → no DI errors in logs.
  - Swagger UI serves at `/docs`; `GET /api/metrics` responds 200.
  - The one ported mock-bearing test suite passes under the new runner.
- [ ] **Step 7:** If Step 6 fully passes, the approach is proven — proceed. If the mocked suite fights ESM, **escalate to the human with the exact failure** before committing to the full port. Record findings; commit the spike branch for reference.

---

## Task 2: Decide & lock the test-runner strategy

**Decision input from research:** porting to **Vitest is the recommended lower-friction path** — the frontend already uses Vitest, Ts.ED dogfoods it, and ESM `jest.mock` requires the awkward `unstable_mockModule()`+dynamic-import rewrite anyway. The alternative (stay on Jest, go `unstable_mockModule`) keeps coverage config but is more brittle.

- [ ] **Step 1:** Based on Task 1's spike (whichever runner you proved), commit to it. Default: **Vitest.**
- [ ] **Step 2:** If Vitest: add `vitest.config.ts` mirroring `jest.config.js` (testMatch `src/__tests__/**/*.test.ts`, node env, coverage thresholds: branches/lines/statements 10, functions 9 — *do not lower*), with the swc/esbuild transform configured for decorators + `useDefineForClassFields:false` + `emitDecoratorMetadata`.
- [ ] **Step 3:** Update `package.json` test scripts (`test`, `test:watch`, `test:coverage`) to the chosen runner.

---

## Task 3: ESM codemod across all source files

**Files:** all `api-gateway/src/**/*.ts` not already converted in Task 1.

- [ ] **Step 1:** Add `.js` extension to every **relative** import/export specifier (`./x` → `./x.js`, `../y/z` → `../y/z.js`). Bare-package imports (`@tsed/*`, `express`, etc.) stay unchanged. On Windows/MSYS2, ensure forward slashes only — no backslashes.
- [ ] **Step 2:** JSON imports (if any `require('./x.json')` or `import x from './x.json'`) → `import x from "./x.json" with { type: "json" }` (NodeNext import attributes).
- [ ] **Step 3:** Grep for remaining CommonJS: `require(`, `module.exports`, `__dirname`, `__filename`. Replace each (`createRequire`/`import.meta`/`fileURLToPath` as needed).
- [ ] **Step 4:** `npm run build` clean; `npm run typecheck` clean.

---

## Task 4: Verify @tsed import surface compiles (NO path rewrites expected)

**Files:** the 34 `@tsed`-importing files.

- [ ] **Step 1:** `npm run typecheck`. The barrel re-export means `Controller/Get/Post/Delete/PathParams/BodyParams/QueryParams/Req/Res/Next/Context/Middleware/PlatformApplication/$log/AcceptMime` (from `@tsed/common`), `Service/Inject/Configuration` (`@tsed/di`), `Property/Required/Enum/Optional/CollectionOf/Description/Returns/Summary/Tags/Groups` (`@tsed/schema`), and `NotFound/Unauthorized/Forbidden/BadRequest` (`@tsed/exceptions`) should all resolve **without import-path changes**.
- [ ] **Step 2:** If any symbol fails to resolve (would mean the barrel changed in the installed v8 minor), update that specific import to its canonical subpackage and note it. Do **not** preemptively rewrite working imports.
- [ ] **Step 3:** Update the **test bootstrap** import: `PlatformTest` → `@tsed/platform-http/testing` (only resolvable under NodeNext — which Task 1 already set).

---

## Task 5: Port the 24 `jest.mock()` test files

**Files:** the 24 suites containing `jest.mock()` (32 calls). They mock internal modules (`../services/LangfuseService` in ~20 files, `LLMProviderService`, `RedisStreamsService`, `MetricsService`) and packages (`openai`, `@qdrant/js-client-rest`, `@google/generative-ai`; `uuid` mocks can be dropped — uuid is no longer a direct dep).

- [ ] **Step 1:** For each file, convert `jest.mock("mod", factory)` → `vi.mock("mod", factory)` (Vitest hoists `vi.mock` correctly) OR, if staying on Jest, `jest.unstable_mockModule("mod", factory)` + move the subject import to a dynamic `await import()` after the mock.
- [ ] **Step 2:** Run each ported suite individually as you go — keep the green count monotonic. Do not batch-convert all 24 then debug.
- [ ] **Step 3:** Drop now-dead `jest.mock("uuid", ...)` lines (uuid is no longer imported by source after the `crypto.randomUUID()` change).

---

## Task 6: Remove the LangfuseService dynamic-import workaround

**Files:** `api-gateway/src/services/LangfuseService.ts` and its tests.

- [ ] **Step 1:** The dynamic `await import(...)` that fought Jest's CJS VM now works natively under ESM. If the workaround added indirection purely for the test VM, simplify it. **Do this only AFTER Task 5** (the test runner must be ESM-native first). Verify the LangfuseService suite still passes.

---

## Task 7: Dev loop + CI

**Files:** `package.json`, `.github/workflows/ci.yml`.

- [ ] **Step 1:** Confirm `"dev": "tsx watch src/index.ts"` hot-reloads on a source edit.
- [ ] **Step 2:** Pin CI Node to `22` (or `20.11`) — v8's ≥20.11 floor is documented, not engine-enforced; the current floating `"20"` could regress.
- [ ] **Step 3:** Confirm CI `npm ci` → build → test all green. Drop the `overrides` block added in `c6089e0` **only after** confirming v8 no longer pulls the vulnerable picomatch/uuid (re-audit; if v8 still drags them, keep the override).

---

## Task 8: Runtime DI smoke test (the silent-failure guard)

**Files:** a new `api-gateway/src/__tests__/DiWiring.smoke.test.ts` (or a manual boot check).

- [ ] **Step 1:** Add a test that boots the platform (`PlatformTest.bootstrap`) and asserts a representative injected dependency is actually defined on a service instance (e.g. the orchestrator's injected `LLMProviderService` is not `undefined`). This is the canary for a `useDefineForClassFields` config mismatch across the three transforms — a green unit suite alone will NOT catch it.
- [ ] **Step 2:** Manually run `npm start` against a local stack and confirm an end-to-end `/orchestrate/generate` request wires through. (DI failures from the field-init semantics surface only at runtime.)

---

## What we will NOT do

- **Will NOT** rewrite the 34 `@tsed/common` imports to subpackages — the barrel re-exports them; that's optional tree-shaking polish, out of scope.
- **Will NOT** drop @tsed for Express/Fastify — multi-day DI/routing/test rewrite, unjustified by the (non-exploitable) advisories.
- **Will NOT** use `@swc/core`/`@swc-node/register` as the default dev loader — native-postinstall Zscaler hazard; prefer `tsx`.
- **Will NOT** attempt CJS-stays-CJS `require(esm)` interop — dead end.
- **Will NOT** lower the coverage thresholds when porting the test runner.

## Effort & exit criteria

**Estimate:** 3–6 working days. Breakdown: ESM codemod + toolchain ~1–1.5d; **test-runner port (24 files) ~1.5–3d (dominant)**; @tsed bump + dev-loop + Swagger/Socket.io ESM validation + DI smoke ~0.5–1d.

**Done when:** `npm ci` clean, `npm run build` clean, `npm run typecheck` clean, full suite green at or above current coverage thresholds, app boots with Swagger at `/docs` + `/api/metrics` responding, the DI smoke test passes, `npm audit` 0, and the `overrides` block removed if v8 made it redundant.
