# AEGIS Editorial Redesign Design

Date: 2026-09-20

## Objective

Redesign the real AEGIS React frontend so it visually matches the supplied reference image while preserving the current security-control-plane behavior. The new product identity is light, editorial, architectural, isometric, mechanical, and premium. The existing AEGIS application remains the functional source of truth.

The redesign must not become a static mockup or a screenshot replacement. It must keep the current routes, state model, API integration, evidence ledger, replay controls, ALLOW/DENY semantics, runtime architecture interactions, and data-honesty labels.

## Visual Direction

The reference image is the primary visual benchmark.

The application moves from the current dark dashboard to:

- Main background: `#FCFFFF`
- Warm cream surfaces: `#D5D8C5`
- Light gray structural fill: `#DEDFDE`
- Typography/outlines: `#0A0A0A`
- Primary accent: `#F47920`
- Poppins-style sans typography
- Bold editorial headings
- Strong black outlines
- Cream slabs, architectural panels, and restrained orange route accents
- Physical/isometric component illustrations
- Clean whitespace and presentation-readable hierarchy

The redesign must avoid dark cybersecurity styling, cyberpunk effects, neon cyan, dark glassmorphism, giant dark grids, and generic dark SaaS dashboard patterns.

## Functional Boundaries

Do not modify:

- `server/**`
- Cedar policies
- Backend security logic
- Ledger semantics
- API contracts
- Runtime ALLOW/DENY route semantics

Avoid dependency additions unless implementation proves they are necessary. The current Three.js implementation is reused.

Current known local caveat: `package-lock.json` contains unrelated npm metadata churn and is not part of this redesign unless explicitly requested.

## Existing Frontend Structure

The current app uses hash routing in `src/App.tsx` and renders a shared shell through `src/components/layout/AppShell.tsx`.

Key reusable areas:

- `src/App.tsx`: global route, ledger data, chain verification, selected event, playback index, API refresh.
- `src/components/layout/Sidebar.tsx`: sectioned navigation.
- `src/components/layout/TopNav.tsx`: authority/session bar.
- `src/components/overview/Overview.tsx`: current Overview composition and runtime architecture mount.
- `src/components/viz/AegisRuntimeArchitecture.tsx`: existing Three.js runtime scene, camera, controls, selection, full view, replay, ALLOW/DENY demo modes.
- `src/components/viz/AegisRuntimeArchitectureModel.ts`: node IDs, route arrays, rails, inspector data, explanations, and route semantics.
- `src/styles/aegis.css`: primary design system, shell, tables, panels, chips, visualization styles.
- Secondary pages under `src/components/{agents,execution,contracts,policies,decisions,sessions,evidence,recorder,lineage,investigations,tests,aws}` already consume current data and should be visually recomposed rather than rewritten wholesale.

## Data And State Model

The redesign keeps the existing data flow:

- `App.tsx` loads ledger events and chain verification through `aegisApi`.
- Fixture data remains the fallback source through `src/data/fixtures.ts`.
- Derived frontend models remain in `src/data/controlPlane.ts`.
- The current selected event and playback index continue flowing from `App.tsx` to pages and the runtime scene.
- Source distinctions such as `LIVE`, `FIXTURE`, `DERIVED`, `LOCAL`, `NOT VERIFIED`, and `TARGET` remain visible where currently available.

No metrics may be invented. Overview metrics must be derived from current events, chain verification, session fixture data, or existing source labels.

## Onboarding

Add a real interactive onboarding flow before the main control plane. It must use the same data-honesty constraints as the app and must not replace the application with an image.

Route/state:

- Add an onboarding entry route, expected as `#onboarding`.
- First-time entry may default to onboarding unless the URL already targets an app route.
- "Enter AEGIS" moves to `#overview`.
- Existing app routes remain directly addressable.

Screens:

1. Welcome
   - Large `AEGIS` editorial title.
   - `SECURITY CONTROL PLANE FOR AI AGENTS`.
   - Short explanation of control, authorization, and evidence.
   - CTA: `ENTER AEGIS ->`.
   - Isometric architecture illustration showing Agent, Request, Task Contract, Context, Cedar/PEP, Tool, Evidence.

2. How AEGIS Works
   - Heading: `HOW AEGIS WORKS`.
   - Seven-stage explanation: Request, Task Contract, Context + Provenance, Cedar, Decision, Enforcement, Evidence.
   - Cedar should be visually important.

3. See It Decide
   - Heading: `AEGIS DECIDES BEFORE THE TOOL DOES.`
   - Side-by-side ALLOW and DENY flows using the existing scenario:
     - ALLOW: `package.json -> Task Contract -> Cedar -> ALLOW -> Protected Tool -> EXECUTED`
     - DENY: `.env -> Task Contract -> Cedar -> DENY -> Executor Never Reached -> Evidence -> Hash Chain -> Investigation`
   - ALLOW may use restrained green state; DENY may use red/orange only where semantically needed.

4. Ready
   - Heading: `READY TO ENTER THE CONTROL PLANE?`
   - CTA: `ENTER AEGIS ->`.
   - Large branded AEGIS architectural visual panel.

Implementation should favor React/CSS/SVG/isometric CSS blocks. No static screenshot substitution.

## Main Shell

Restyle the shell to match the reference lower-half composition:

- Light sidebar with AEGIS mark and sectioned navigation.
- Black typography and outlines.
- Orange active route state.
- Editorial footer line: `A SAFER AGENT FUTURE`.
- Light top authority/session bar.
- Content area with off-white background and framed product surfaces.

Navigation sections remain:

- Control: Overview, Agents, Execution, Contracts, Policies
- Record: Decisions, Sessions, Evidence, Flight Recorder
- Investigate: Evidence Lineage, Investigations, Security Tests
- System: AWS Control Plane

## Overview

Recompose Overview as the main control-plane hero page.

Top/hero layout:

- Title label: `AEGIS RUNTIME ARCHITECTURE`
- Large editorial headline: `FROM AGENT INTENT TO VERIFIED OUTCOMES`
- Center: existing `AegisRuntimeArchitecture` scene
- Right: live session panel using real current data:
  - Session ID
  - Agent
  - Contract
  - Events
  - Allowed
  - Denied
  - Untrusted Inputs
  - View Session action
- Right visual brand panel:
  - `CONTROL`
  - `OBSERVE`
  - `INVESTIGATE`
  - `VERIFY`

Metric panels:

- Total Decisions: derived from current decision events.
- Policy Enforcement: only show `100%` if computed as allowed/denied decisions passing through the recorded event set; otherwise label as derived.
- Evidence Integrity: from `chain.verified` and verified link counts.
- Active Agent: from session/fixture-derived data, labeled accordingly.

## Runtime 3D Scene

The existing `AegisRuntimeArchitecture` scene remains the single runtime architecture implementation. Do not add a second canvas or second scene system.

Visual restyle:

- Use light/cream environment and floor.
- Use cream shells, black structures, and orange active rails.
- Reduce dark/cyan styling.
- Keep restrained green for ALLOW and red/orange for DENY only as decision state indicators.
- Use physical blocks, rails, chambers, gates, platforms, mechanical connectors, and slabs.
- Keep soft shadows and an isometric presentation.

Interaction semantics:

- Exactly one request ball.
- No request particles or duplicate request objects.
- Component clicks remain the primary interaction.
- Clicking a component focuses the camera, highlights that component, dims unrelated components, reveals mechanism parts, shows the inspector, slows demo speed, and allows orbit/zoom.
- Clicking the same component again should replay or re-trigger its reveal.

Route semantics must remain:

ALLOW:

`devfix -> request -> contract -> context -> cedar -> approved -> decision -> tool`

The ball stops at the protected tool. It never continues to Evidence, Hash Chain, or Investigation.

DENY:

`devfix -> request -> contract -> context -> cedar -> rejected -> evidence -> hash -> investigation`

The executor remains visibly unreachable. The denied/evidence branch continues to Evidence, Hash Chain, and Investigation.

Important meaning:

- Cedar is runtime authorization authority.
- Decision Gate / PEP is the enforcement boundary.
- Protected Tool activates only for ALLOW.
- Evidence records accountability and is not another authorization gate.
- Hash Chain represents verifiable/tamper-evident evidence linkage.
- Investigation is post-hoc and has zero runtime authorization authority.

## Secondary Pages

Apply the same design language across all secondary pages without turning them into unrelated dashboards.

Pages:

- Agents
- Execution
- Contracts
- Policies
- Decisions
- Sessions
- Evidence
- Flight Recorder
- Evidence Lineage
- Investigations
- Security Tests
- AWS Control Plane

Shared patterns:

- Large editorial page headings.
- Framed cream/off-white panels with strong outlines.
- Orange selected states and call-to-action accents.
- Light technical tables with black text and clear separators.
- Sticky identifying columns/actions where already useful.
- Source flags more visible but honest.
- No page-level horizontal overflow.

## Implementation Phases

Phase 1: Light Design System And Shell

- Replace global dark CSS tokens with light reference tokens.
- Restyle shell, sidebar, top bar, panels, buttons, chips, tables, notes, rails, and transport controls.
- Preserve component APIs.

Phase 2: Onboarding

- Add onboarding components and route handling.
- Build four interactive screens using CSS/SVG/isometric block language.
- Enter action routes to Overview.

Phase 3: Overview

- Recompose Overview into the hero control-plane layout.
- Add live session panel and branded right-side visual panel.
- Keep `AegisRuntimeArchitecture` as the runtime scene.

Phase 4: Runtime 3D Mechanism

- Restyle Three.js palette/materials/background/floor.
- Adjust labels and overlays to light editorial UI.
- Strengthen mechanical reveals for components without changing route semantics.
- Confirm one ball, no duplicate canvases, ALLOW and DENY endpoints.

Phase 5: Secondary Pages

- Apply shared visual system to secondary pages.
- Keep existing page data and source labels.
- Tighten tables and panel hierarchy for the new editorial style.

## Validation

After implementation:

- `npx tsx tests\control-plane-model.ts`
- `npx tsx tests\runtime-architecture-model.ts`
- `npm run lint`
- `npm run build`

Browser QA routes:

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

Browser QA checks:

- No broken routes.
- No page-level horizontal overflow.
- No duplicate canvases.
- Exactly one request ball.
- 3D component selection works.
- Same-component inspection can replay/reveal again.
- ALLOW reaches Protected Tool and stops.
- DENY keeps executor unreachable and continues to Evidence, Hash Chain, Investigation.
- Replay works.
- Normal View, Full View, Zoom, and Reset work.
- Onboarding to application works.
- Navigation relationships work.

Console-event capture should be attempted where the available browser tooling supports it. If unavailable, report the limitation and rely on DOM/visual route checks plus build/lint/test evidence.

## Acceptance Criteria

The finished browser UI should clearly share the visual DNA of the reference image:

- Light
- Cream
- Black
- Orange
- Poppins-style typography
- Editorial hierarchy
- Isometric/architectural geometry
- Mechanical runtime story
- Premium technical product feel

The redesign is not complete if the result feels like the old dark dashboard with new colors.
