# AEGIS Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the real AEGIS frontend from the dark dashboard into a light editorial/isometric security-control-plane product while preserving current functionality and security semantics.

**Architecture:** Keep the existing React hash-routed application, data/API layer, shared shell, and Three.js runtime architecture as the functional source of truth. Add a real onboarding route, restyle shared primitives through the existing CSS system, recompose Overview around the existing runtime scene, and visually refine the current Three.js system without adding a second canvas or scene.

**Tech Stack:** React, TypeScript, CSS, Three.js, existing Vite/Express app, existing tests.

**Spec:** `docs/superpowers/specs/2026-09-20-aegis-editorial-redesign-design.md`

## Global Constraints

- Reference visual language: `#FCFFFF`, `#D5D8C5`, `#DEDFDE`, `#0A0A0A`, `#F47920`, Poppins-style typography, strong black outlines, light editorial/isometric composition.
- No dark theme, cyberpunk, neon, dark glassmorphism, or generic dark SaaS dashboard.
- Do not modify `server/**`, Cedar policies, backend security logic, ledger semantics, or API contracts.
- Preserve existing API integration, state model, ledger, evidence, replay, navigation, ALLOW/DENY semantics, fixture/derived/live distinctions.
- Runtime architecture remains one scene with one request ball and no duplicate canvas.
- ALLOW route remains `devfix -> request -> contract -> context -> cedar -> approved -> decision -> tool`.
- DENY route remains `devfix -> request -> contract -> context -> cedar -> rejected -> evidence -> hash -> investigation`.
- Do not invent data, metrics, AWS health, Cedar diagnostics, byte counts, signing status, or security guarantees.
- Leave unrelated `package-lock.json` metadata churn untouched unless explicitly requested.

## Review Focus

- Direct deep links: opening `#overview`, `#aws`, or any app route should bypass onboarding and render the requested page.
- Onboarding transition: `#onboarding` should render the four-step flow and Enter AEGIS should navigate to `#overview`.
- Narrow widths: sidebar collapse, tables, onboarding, Overview, and runtime controls must not create page-level horizontal overflow.
- 3D semantics: visual restyling must not change route arrays, one-ball behavior, replay, component selection, full view, zoom, or reset.
- Source honesty: fixture/local/not-verified labels remain visible after visual restyling.

---

### Task 1: Light Design System And Shell

**Files:**
- Modify: `src/styles/aegis.css`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/TopNav.tsx`
- Modify: `src/components/shared/Panel.tsx`
- Modify: `src/components/shared/PageHead.tsx`

**Interfaces:**
- Consumes: existing class names `app`, `sidebar`, `main`, `authbar`, `workspace`, `panel`, `pagehead`, `btn`, `chip`, `dt`.
- Produces: light tokens and utility classes used by later tasks: `editorial-eyebrow`, `editorial-title`, `aegis-card`, `aegis-visual-panel`, `isometric-stack`, `control-metric`, `source-line`.

- [ ] **Step 1: Convert CSS tokens to the reference light palette**

Update `:root` in `src/styles/aegis.css` to use off-white/cream/black/orange tokens and set `--sans` to a Poppins-first stack:

```css
:root{
  --bg:#FCFFFF; --panel:#FCFFFF; --panel-2:#F6F3E8; --panel-3:#DEDFDE;
  --cream:#D5D8C5; --ink:#0A0A0A; --orange:#F47920;
  --line:#0A0A0A; --line-2:#0A0A0A; --line-3:#F47920;
  --fg:#0A0A0A; --muted:#3D3D37; --dim:#67685F;
  --allow:#3E8B5C; --deny:#E5562F; --amber:#F47920; --info:#0A0A0A;
  --allow-bg:rgba(62,139,92,.1); --deny-bg:rgba(229,86,47,.1);
  --amber-bg:rgba(244,121,32,.12); --info-bg:rgba(10,10,10,.06);
  --sans:"Poppins","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
}
```

- [ ] **Step 2: Restyle shell and navigation**

Update `.app`, `.sidebar`, `.brand`, `.navitem`, `.authbar`, `.content`, `.rail`, `.transport` to match the light editorial sidebar and strong black-outline shell. Keep the same DOM and route behavior.

- [ ] **Step 3: Restyle shared primitives**

Update `.panel`, `.pagehead`, `.btn`, `.chip`, `table.dt`, `.note`, `.bigstat`, dense-table sticky helpers, and transport controls to the light editorial style.

- [ ] **Step 4: Add reusable editorial/isometric utility classes**

Add CSS classes for later tasks:

```css
.editorial-eyebrow{...}
.editorial-title{...}
.aegis-card{...}
.aegis-visual-panel{...}
.isometric-stack{...}
.control-metric{...}
.source-line{...}
```

- [ ] **Step 5: Update Sidebar and TopNav copy/structure only where needed**

Keep the same navigation groups. Make the sidebar brand read `AEGIS` / `SECURITY FOR AI AGENTS`, active states orange, and footer `A SAFER AGENT FUTURE`.

- [ ] **Step 6: Run a quick type check**

Run: `npm run lint`

Expected: PASS.

### Task 2: Onboarding Route And Four-Step Flow

**Files:**
- Create: `src/components/onboarding/Onboarding.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/layout/routes.ts`
- Modify: `src/styles/aegis.css`

**Interfaces:**
- Consumes: `go(route: string)` behavior from `App.tsx`.
- Produces: `Onboarding({ go }: { go: (route: string) => void })`, route id `onboarding`.

- [ ] **Step 1: Add route support**

Update `routes.ts` so `parseHash("#onboarding")` returns `onboarding`, but keep existing app routes unchanged. Ensure app routes remain directly addressable.

- [ ] **Step 2: Wire Onboarding into `App.tsx`**

Import `Onboarding`, include it in the route component map, and hide the regular shell if the route is `onboarding` by rendering the onboarding component directly with `go={setRoute}`.

- [ ] **Step 3: Create four onboarding screens**

Build `Onboarding.tsx` with local step state and four screens:

```tsx
const screens = [
  { id: "welcome", kicker: "01 / WELCOME", title: "AEGIS", ... },
  { id: "works", kicker: "02 / HOW IT WORKS", title: "HOW AEGIS WORKS", ... },
  { id: "decide", kicker: "03 / SEE IT DECIDE", title: "AEGIS DECIDES BEFORE THE TOOL DOES.", ... },
  { id: "ready", kicker: "04 / READY", title: "READY TO ENTER THE CONTROL PLANE?", ... },
];
```

Use existing fixture values such as `SESSION.contractId`, `package.json`, `.env`, and current event semantics. Do not invent live values.

- [ ] **Step 4: Add isometric onboarding visuals**

Use CSS/SVG/React markup for cream blocks, orange connector rails, labels, and allow/deny flow panels. Do not use the attached image as a static asset.

- [ ] **Step 5: Implement navigation controls**

Add Next/Previous controls and Enter AEGIS CTA. Enter calls `go("overview")`.

- [ ] **Step 6: Browser-smoke `#onboarding`**

Open `http://localhost:3000/#onboarding`. Verify four steps render and Enter AEGIS navigates to `#overview`.

### Task 3: Overview Recomposition

**Files:**
- Modify: `src/components/overview/Overview.tsx`
- Modify: `src/styles/aegis.css`

**Interfaces:**
- Consumes: `events`, `idx`, `go`, `chain`, `analysis`, `SESSION`, current `AegisRuntimeArchitecture`.
- Produces: Overview hero layout with runtime scene, live session panel, visual brand panel, and honest metric cards.

- [ ] **Step 1: Compute Overview data from existing inputs**

Use current events to compute allow, deny, untrusted, decision count, and event count. Use `chain` for integrity display and `SESSION` for agent/session fixture-backed display.

- [ ] **Step 2: Replace generic PageHead+Panel composition with editorial hero layout**

Build a top section matching the lower reference:

```tsx
<section className="overview-hero">
  <div className="overview-runtime-card">
    <div className="editorial-eyebrow">AEGIS RUNTIME ARCHITECTURE</div>
    <h1 className="editorial-title">FROM AGENT INTENT TO VERIFIED OUTCOMES</h1>
    <AegisRuntimeArchitecture ... />
  </div>
  <aside className="live-session-panel">...</aside>
  <aside className="aegis-visual-panel">CONTROL OBSERVE INVESTIGATE VERIFY</aside>
</section>
```

- [ ] **Step 3: Add metric cards below the hero**

Add Total Decisions, Policy Enforcement, Evidence Integrity, Active Agent cards. Mark fixture/derived values honestly with existing source language.

- [ ] **Step 4: Preserve existing navigation actions**

Cards and panels should still navigate to Agents, Evidence, Decisions, Execution, or Sessions through `go`.

- [ ] **Step 5: Browser-smoke `#overview`**

Verify one canvas, no page overflow, runtime scene appears, cards navigate.

### Task 4: Runtime 3D Visual And Mechanism Refinement

**Files:**
- Modify: `src/components/viz/AegisRuntimeArchitecture.tsx`
- Modify: `src/components/viz/AegisRuntimeArchitectureModel.ts`
- Modify: `src/styles/aegis.css`
- Test: `tests/runtime-architecture-model.ts`

**Interfaces:**
- Consumes: existing `RuntimeNodeId`, `RuntimeRoute`, `getRuntimeArchitectureRoute`, `getRuntimeArchitectureDemoRoute`, `buildRuntimeArchitectureInspector`.
- Produces: same route arrays and one-canvas scene with light cream/orange visual style and stronger mechanism reveal.

- [ ] **Step 1: Lock route semantics with tests**

Ensure `tests/runtime-architecture-model.ts` asserts:

```ts
assert.deepEqual(getRuntimeArchitectureRoute({ decision: "ALLOW" }).waypoints, ["devfix","request","contract","context","cedar","approved","decision","tool"]);
assert.deepEqual(getRuntimeArchitectureRoute({ decision: "DENY" }).waypoints, ["devfix","request","contract","context","cedar","rejected","evidence","hash","investigation"]);
```

- [ ] **Step 2: Update visual detail metadata**

Change `RUNTIME_VISUAL_DETAIL.palette.stage` from dark dashboard language to light editorial machine language without changing route IDs.

- [ ] **Step 3: Replace Three.js palette**

Update `COLORS` in `AegisRuntimeArchitecture.tsx` to use cream background/floor, black structure, orange active rails, restrained allow/deny colors. Remove cyan as the primary accent.

- [ ] **Step 4: Restyle labels and overlays**

Change canvas-generated label colors and inspector/demo overlay inline styles from dark translucent panels to cream panels with black outlines.

- [ ] **Step 5: Strengthen same-component replay**

When a selected component is clicked again, briefly reset `inspectionPhase` to `focused`, then back to `revealed`, so physical exploded/reveal animation visibly replays.

- [ ] **Step 6: Preserve one ball and canvas cleanup**

Do not add additional request meshes. Ensure only the existing `requestBall` sphere exists and cleanup still removes one renderer canvas.

- [ ] **Step 7: Browser-smoke 3D controls**

Check selection for Cedar, Decision Gate, Tool, Evidence, Hash, Investigation; replay ALLOW/DENY; zoom; reset; full view.

### Task 5: Secondary Page Editorial Polish

**Files:**
- Modify: existing secondary pages as needed:
  - `src/components/agents/Agents.tsx`
  - `src/components/execution/Execution.tsx`
  - `src/components/contracts/Contracts.tsx`
  - `src/components/policies/Policies.tsx`
  - `src/components/decisions/Decisions.tsx`
  - `src/components/sessions/Sessions.tsx`
  - `src/components/evidence/Evidence.tsx`
  - `src/components/recorder/FlightRecorder.tsx`
  - `src/components/lineage/LineageVisual.tsx`
  - `src/components/investigations/Investigations.tsx`
  - `src/components/tests/SecurityTests.tsx`
  - `src/components/aws/AwsControlPlane.tsx`
- Modify: `src/styles/aegis.css`

**Interfaces:**
- Consumes: existing page props and current shared components.
- Produces: consistent light editorial visual system across all secondary routes.

- [ ] **Step 1: Prefer shared CSS over page rewrites**

Rely on Task 1 primitives first. Only alter page markup where hierarchy, source honesty, or route relationship needs clearer presentation.

- [ ] **Step 2: Preserve dense table affordances**

Keep `tablescroll is-scrollable`, `.sticky-key`, `.sticky-actions`, and `.tablehint` where already added.

- [ ] **Step 3: Make source labels more visible**

Keep `SourceFlag`, `StateChip`, and `Note` semantics, but allow the new CSS to make labels clearer and more editorial.

- [ ] **Step 4: Verify AWS wording remains honest**

Ensure AWS page still distinguishes local runtime state from AWS service verification and does not imply live AWS services unless verified.

- [ ] **Step 5: Browser-smoke every secondary route**

Visit all listed routes and verify no page-level horizontal overflow and no broken navigation.

### Task 6: Final Verification And QA

**Files:**
- No product-file changes expected unless verification reveals a bug.

**Interfaces:**
- Consumes: completed Tasks 1-5.
- Produces: verified app and final report.

- [ ] **Step 1: Run model tests**

Run:

```powershell
npx tsx tests\control-plane-model.ts
npx tsx tests\runtime-architecture-model.ts
```

Expected: both pass.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm run lint
```

Expected: pass.

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: pass. Existing chunk-size warnings are acceptable.

- [ ] **Step 4: Full browser QA**

Check:

- `#onboarding`
- `#overview`
- `#agents`
- `#execution`
- `#contracts`
- `#policies`
- `#decisions`
- `#sessions`
- `#evidence`
- `#recorder`
- `#lineage`
- `#investigations`
- `#tests`
- `#aws`

Verify no broken routes, no page-level horizontal overflow, no duplicate canvases, onboarding to app works, all navigation relationships work.

- [ ] **Step 5: 3D mechanism QA**

Verify:

- Click Agent, Request, Task Contract, Context, Cedar, Decision Gate, Protected Tool, Evidence, Hash Chain, Investigation.
- Click the same component multiple times and see reveal replay.
- ALLOW reaches Protected Tool and stops.
- DENY keeps executor unreachable and continues to Evidence, Hash Chain, Investigation.
- Replay, Normal View, Full View, Zoom, Reset work.
- Exactly one request ball is visible.

- [ ] **Step 6: Final status**

Report files changed, tests run, browser QA results, and any residual limitations such as unavailable console-event capture.
