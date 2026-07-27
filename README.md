# Pathshalaa

An MVP web app for teachers to hand-write math equations on screen and have AI
recognize, solve, graph, and visualize them in 3D, with explanations in a
regional language.

**Current status:** canvas → recognize → draft/confirm → graph (2D or 3D) or
solve (step-by-step, reveal-as-you-go) is wired end-to-end, behind Google
Sign-In, with per-teacher handwriting calibration (few-shot conditioning)
improving recognition accuracy. Recognition is driven by a structured JSON
command protocol and a subject-agent plugin registry (see "Recognition
architecture" below) so that the manual 3D shape panel (Three.js) and the
language toggle — still follow-up steps — can be added as new command
types/plugins without changing the core recognition flow.

On top of that core flow: a role-based access control layer with
organisation-level multi-tenancy (owner/developer/admin/user roles, a
self-service Demo org with a time-boxed trial, and an Owner dashboard to
manage organisations/users/invites — see "Access control, multi-tenancy, and
trials" below), and support for trigonometric equations — recognizing hand-
drawn trig expressions, graphing waves with period/amplitude called out, and
solving trig equations for all solutions in a range (which can be written
directly on the canvas, e.g. "solve sin x + cos x = 1 for [0, π)" — see
"Trigonometric functions" below).

## Project structure

```
Pathsalaa/
├── render.yaml         Render blueprint (backend web service + frontend static site)
├── backend/            FastAPI app
│   └── app/
│       ├── main.py          FastAPI app + CORS + routers + startup DB init/scheduler
│       ├── config.py        env-based settings (pydantic-settings)
│       ├── auth.py          get_current_user dependency (verifies session token)
│       ├── google_auth.py   Google ID token verification + session tokens
│       ├── schemas.py       Pydantic request/response models
│       ├── commands.py      the AICommand JSON schema + parse_ai_commands() validator
│       ├── calibration.py   per-teacher handwriting sample storage (SQLite)
│       ├── graphing.py      LaTeX -> SymPy -> numeric data for 2D/3D plots (+ wave period/amplitude)
│       ├── solving.py       LaTeX -> SymPy ground truth -> LLM step narration (algebraic/trig/ODE)
│       ├── llm/             provider-agnostic LLM abstraction
│       │   ├── base.py           LLMProvider interface + HandwritingExample
│       │   ├── anthropic_provider.py
│       │   ├── openai_provider.py
│       │   └── __init__.py       get_llm_provider() factory (reads LLM_PROVIDER)
│       ├── plugins/         subject-agent plugin registry
│       │   ├── base.py           SubjectPlugin dataclass
│       │   ├── registry.py       register() / get_active_plugins()
│       │   ├── prompts.py        build_recognition_prompt() (schema instructions)
│       │   ├── math_plugin.py    the only registered plugin for this MVP
│       │   └── __init__.py       imports math_plugin to register it
│       ├── rbac/             role/permission definitions + org-scoping (who can do what)
│       │   ├── db.py             SQLite schema (organisations/users/invites/...) + Demo org seed
│       │   ├── models.py         Organisation/User/Invite dataclasses + plain-SQL CRUD
│       │   ├── permissions.py    the PERMISSIONS role -> permission map
│       │   └── dependencies.py   get_current_app_user, require_permission(), OrgScope
│       ├── billing/          is this user's access still valid (a separate, faster-moving concern)
│       │   └── trial.py          Demo-org signup, check_trial_status, daily cleanup job, owner upgrade
│       └── routers/
│           ├── auth_router.py         POST /api/auth/google, GET /api/auth/me
│           ├── recognize_router.py    POST /api/recognize
│           ├── calibration_router.py  calibration samples + corrections
│           ├── graph_router.py        POST /api/graph
│           ├── solve_router.py        POST /api/solve
│           └── admin_router.py        org usage/invites (admin) + owner-only cross-org management
└── frontend/           React (Vite) app
    └── src/
        ├── App.jsx
        ├── commands.js               frontend-side AICommand validation (mirrors commands.py)
        ├── api/client.js             axios client, attaches session token, trial-expired interceptor
        ├── utils/focusRegion.js      getFocusRegion() / cropToBlob() for cropped recognition
        ├── utils/formatMath.js       formatPiMultiple()/formatNumber() for wave period/amplitude display
        └── components/
            ├── Login.jsx               Google Sign-In button
            ├── TrialExpired.jsx         dedicated screen shown when a Demo trial has lapsed
            ├── OwnerDashboard.jsx       owner-only: all users/orgs, create org, change role, invites
            ├── CalibrationFlow.jsx     guided handwriting onboarding
            ├── DrawingCanvas.jsx       shared canvas drawing primitive
            ├── EquationCanvas.jsx      canvas + undo/clear/manual+auto recognize
            ├── CommandDrafts.jsx       generic draft/confirm layer for AI commands
            ├── SolveView.jsx           step-by-step solve, reveal-next-step UI, auto-solve-on-confirm
            └── GraphView.jsx           2D/3D plot via Plotly.js (lazy-loaded), wave period/amplitude tags
```

### Why it's structured this way

Recognition, solving, and translation are kept as separate modules behind a
single `LLMProvider` interface (`app/llm/base.py`) so the rest of the app never
touches the Anthropic or OpenAI SDKs directly. Adding a new subject (geography,
history, language) later means registering a new plugin (see below), not
rewiring the LLM plumbing — and it sets up cleanly for an agent-based
architecture down the line.

## Recognition architecture

Instead of the LLM returning loose prose/LaTeX text, `POST /api/recognize`
requires a strict JSON response and validates it before it ever reaches the
frontend. This is what makes the recognition pipeline safe to extend as new
subject-agents (geography, history, language) come online.

### The AICommand schema

`backend/app/commands.py` defines every shape the model is allowed to return,
as a Pydantic discriminated union on `type`:

- `{ type: "latex", content: string }` — a recognized handwritten equation,
  left for the teacher to act on manually (Graph / Solve buttons).
- `{ type: "graph", function: string, domain: [min, max] }`
- `{ type: "shape3d", shape: "cone" | "sphere" | "cylinder", params: {...} }`
- `{ type: "solve_equation", content: string, range_min?: string, range_max?: string, range_min_inclusive: bool, range_max_inclusive: bool }`
  — an *explicit* "solve this [for a range]" instruction written on the
  canvas (see "Trigonometric functions" below). `range_min`/`range_max` are
  LaTeX expressions (e.g. `"\\pi"`), not decimals, since a handwritten range
  endpoint is usually a pi-multiple.
- `{ type: "solution_steps", steps: string[] }`
- `{ type: "translation", text: string, language: string }`

The model must return a raw JSON array of these — no prose, no markdown code
fences. `parse_ai_commands(raw_text, allowed_types)`:

1. Strips accidental markdown code fences (models sometimes ignore the "no
   fences" instruction — this is a safety net, not a substitute for a clear
   prompt).
2. Parses the JSON and validates each item against the `AICommand` union.
3. **Drops** (doesn't reach the frontend) anything with an unrecognized
   `type`, a schema mismatch, or a `type` outside `allowed_types` — the set
   of command types the currently active subject-plugin(s) are permitted to
   produce.
4. Raises `CommandValidationError` (→ HTTP 502) only if the response wasn't
   valid JSON at all, or if nothing survives.

`frontend/src/commands.js` mirrors this same set of shapes, so a command is
validated on both sides before it's rendered — defense in depth even though
the backend already rejects malformed output.

**`shape3d` and code execution:** `params` must always stay bounded,
declarative numeric fields (radius, height, etc.) — never raw JavaScript or
arbitrary code from the model. This is called out directly in both
`commands.py` and `commands.js` for whoever builds the actual Three.js
renderer later.

### The subject-agent plugin registry

`backend/app/plugins/` decouples "what the model is asked to do" from the
recognition endpoint itself:

- `SubjectPlugin` (`plugins/base.py`) is a small dataclass: a stable `id`, a
  display `name`, the `command_types` it's allowed to produce, and its own
  `prompt_template`.
- `math_plugin.py` registers the only plugin for this MVP — `id="math"`,
  `command_types=["latex", "solve_equation"]`. Its prompt tells the model to
  return `solve_equation` only when the handwriting has an explicit solve
  instruction (the word "solve", "find x", etc.), and plain `latex`
  otherwise — a bare equation with no instruction is never treated as a
  solve request. `graph` / `shape3d` / `solution_steps` / `translation` are
  already valid schema entries any future plugin (or math itself, later)
  can adopt without touching `recognize_router.py`.
- `recognize_router.py` looks up the active plugin(s) (hardcoded to
  `["math"]` today, structured to take a subject-selection param later),
  and `build_recognition_prompt()` (`plugins/prompts.py`) combines their
  prompt templates with a shared JSON-shape instruction block generated from
  the union of their `command_types` — so a new subject only supplies its
  own recognition instructions, not the JSON contract.

Adding "geography" later means: define a `SubjectPlugin`, register it, done
— the recognition flow, validation, and draft/confirm UI all already know
how to handle whatever command types it declares.

### Draft/confirm layer

Every command coming back from `/api/recognize` starts as an unconfirmed
**draft** in the frontend (`CommandDrafts.jsx`) — shown with a dashed border
— with explicit **Accept** / **Discard** controls. `latex` and
`solve_equation` have fully built renderers today:

- `latex` — the KaTeX preview + edit-and-confirm flow; accepting an edited
  draft is what feeds the correction-storage flow below.
- `solve_equation` — the same editable preview, plus the parsed range shown
  as two fields with clickable `[`/`(` bracket toggles (inclusive/exclusive
  per side). A single **Confirm** hands the equation *and* range straight to
  `SolveView`, which solves immediately — no separate Solve button or manual
  range entry (see "Trigonometric functions" below).

The other command types render through the same shell with a minimal
fallback display (label + raw fields) so the pattern already works
end-to-end for whatever a future plugin adds — building their real
renderers (a Three.js shape, a translated-text panel) is separate feature
work, not part of this architecture. Discarding a draft only removes that
card — it never affects anything already accepted.

### Cropped focus-region recognition

Rather than sending the whole canvas on every recognition call,
`getFocusRegion()` (`frontend/src/utils/focusRegion.js`) computes a tight
bounding box around the most recently drawn stroke (plus a margin), and
`DrawingCanvas`'s `toFocusRegionBlob()` crops to it before upload — both the
manual **Recognize** button and Auto mode use this. Smaller images cost
fewer tokens and keep the model from being distracted by unrelated marks
elsewhere on the canvas.

### Manual and Auto recognition

The manual **Recognize** button remains the default. An **Auto** toggle next
to it enables debounced auto-recognition: after a stroke ends
(`pointerup`), a 2.5s timer starts; a new stroke starts before it fires
cancels and restarts it; when it completes, recognition runs automatically
using the same cropped focus region as the manual flow.

## Authentication

Teachers sign in with their Google account (Google Identity Services /
"Sign in with Google") — there's no separate signup step, since the first
successful sign-in for a Google account is effectively its signup.

- **Frontend:** `Login.jsx` renders Google's own Sign-In button and gets back
  a Google ID token (a signed JWT proving the user owns that Google account).
- **Backend:** `POST /api/auth/google` (`google_auth.py`) verifies the ID
  token against Google's public keys (checking it was issued for our
  `GOOGLE_CLIENT_ID` and, if `GOOGLE_ALLOWED_DOMAIN` is set, that it matches
  the required Workspace domain), then mints the app's own signed, expiring
  session token (7 days) so later requests don't need to re-verify against
  Google every time.
- **Requests:** the frontend sends `Authorization: Bearer <session token>` on
  every API call; `get_current_user` (`auth.py`) verifies it and resolves the
  signed-in teacher. The Google account's stable `sub` claim is used as the
  teacher's identity everywhere (e.g. to scope handwriting calibration) — no
  separate profile/name entry step needed.

⚠️ Without `GOOGLE_ALLOWED_DOMAIN` set, **any** Google account can sign in and
use your configured LLM API key. Set it to your school's Workspace domain
before a real pilot to avoid unrestricted API cost exposure — or rely on the
trial system below, which limits an unrecognized sign-in to a time-boxed
Demo org rather than unrestricted access.

## Access control, multi-tenancy, and trials

On top of Google Sign-In, every signed-in Google account resolves to an
app-level `User` row (`app/rbac/models.py`) with a **role** and an
**organisation** — this is what decides what they can do and whose data
they can see. Two modules split the concern deliberately:

- **`app/rbac/`** — *who's allowed to do what.* Expected to stay stable.
- **`app/billing/trial.py`** — *is this user's access still valid right
  now.* Expected to change often as real subscription tiers get added.

### Roles and permissions

`app/rbac/permissions.py` is the single source of truth — a plain
`role -> [permission, ...]` map, checked via `has_permission()` /
`require_permission(...)` rather than `if user.role == "..."` scattered
through the routers:

| Role        | Organisation                    | Permissions                                                       |
| ----------- | ------------------------------- | ----------------------------------------------------------------- |
| `owner`     | none (`organisation_id = null`) | `*` — full access, incl. other orgs, bypasses trial checks        |
| `developer` | none                            | `view_logs`, `manage_feature_flags`, `view_system_health`         |
| `admin`     | one (a school)                  | `manage_org_users`, `view_org_usage`, `manage_org_subscription`   |
| `user`      | one (a school, or Demo)         | `use_canvas`, `use_recognize`, `use_solve`, `use_graph`, `use_3d` |

`require_permission(permission)` (`rbac/dependencies.py`) is a FastAPI
dependency factory: it resolves the current `User` and 403s unless their
role's permission list contains that permission or the `*` wildcard (only
`owner` has it) — which is also how endpoints meant to be **owner-only**
(`upgrade-user`, `change-role`, `list all users/orgs`) are gated, by using a
permission string no other role happens to hold, rather than special-casing
`role == "owner"` inline.

**Organisation-scoping** is a separate dependency, `OrgScope`
(`rbac/dependencies.py`): every admin-facing route that touches
organisation-scoped data resolves an `OrgScope` and calls
`scope.enforce(target_org_id)` before querying — for every role but
`owner`, that raises 403 if the target isn't their own organisation, so
cross-tenant access is rejected in the query layer, not just hidden in the
UI.

### Signup and the Demo organisation

`app/billing/trial.py`'s `resolve_or_create_user()` runs the first time any
authenticated request needs the `User` row for a Google account (via
`get_current_app_user`), in this order:

1. **Already provisioned** (matched by Google `sub`, then by email) →
   returned as-is. This is what stops trial-cycling: an email that already
   has a `User` row — even one with `data_deleted = true` from a lapsed
   trial — never gets a second Demo assignment or a reset `trial_expires_at`.
2. **A configured owner/developer email** (`OWNER_EMAILS` /
   `DEVELOPER_EMAILS`, see below) → bootstrapped with that role, no
   organisation. This is the only way to seed the very first owner — there's
   no in-app role editor for that, since granting a role needs an existing
   authority to grant it.
3. **A pending invite matches this email** — a school admin (or owner)
   created one via the Owner dashboard / `POST /api/admin/invites` ahead of
   the teacher's first sign-in → attached to that invite's organisation and
   role, no trial.
4. **Otherwise** → assigned to the seeded **Demo** organisation
   (`is_demo=true`, `trial_days=15`) as role `user`, with
   `trial_expires_at = now + 15 days`.

### Trial enforcement and expiry cleanup

`check_trial_status` (`billing/trial.py`) is a dependency applied alongside
`require_permission(...)` on every core-feature route (recognize, solve,
graph, calibration): `owner` always passes; a `null` `trial_expires_at`
(a real, non-trial org) always passes; otherwise it 403s with a structured
body once the trial has lapsed:

```json
{ "detail": { "error": "trial_expired", "message": "Your 15-day trial has ended..." } }
```

`api/client.js` has a response interceptor that recognizes this exact shape
and notifies `App.jsx`, which swaps in a dedicated `TrialExpired.jsx` screen
(contact/upgrade prompt) instead of a generic error.

An APScheduler job (`start_scheduler()`, run daily) calls
`run_expiry_cleanup()`: for every Demo-org user whose trial has passed and
whose data isn't already wiped, it deletes their calibration
samples/corrections, sets `data_deleted = true` (the `User` row itself —
email, role, organisation — is kept), and writes an audit row to
`deletion_audit_log`.

### Moving a user to a real organisation

Owner-only, since real subscriptions are still handled manually:
`POST /api/admin/upgrade-user` (`{ user_id, target_organisation_id }`) moves
a user into a real org and clears their trial. `POST /api/admin/change-role`
changes a user's role directly — moving *into* `owner`/`developer` also
clears `organisation_id`/`trial_expires_at`, preserving the "org-less roles
have no org" invariant.

### Owner dashboard

`OwnerDashboard.jsx` (reachable via an **Owner** nav button, shown only when
`GET /api/auth/me` reports that role) is the operator's control panel —
every request it makes is still independently re-checked server-side by
`require_permission`/`OrgScope`, so the frontend gate is convenience, not
the access control:

- **Organisations** — table of every org (tier, Demo flag, trial days,
  seats, user count) + a create-org form.
- **Users** — every user across every organisation, with role (editable
  inline), organisation, trial days remaining, usage-event count, and
  deletion status; an "Assign to org" dropdown per user
  (`upgrade-user` under the hood).
- **Add user** — pre-provisions an invite (email + role + organisation) for
  a teacher who hasn't signed in yet; pending invites are listed with a
  Cancel action.

A school `admin`'s equivalent view is `GET /api/admin/org` (their own
organisation's teachers, usage, and seat-limited invite management) — the
backend endpoint exists and is exercised by the Owner dashboard's org-scoped
calls, but there's no dedicated admin-facing frontend screen yet (see
Roadmap).

### Environment variables

```bash
# Comma-separated emails granted "owner"/"developer" on their first sign-in.
# Only applies to brand-new emails (see resolve_or_create_user above) — an
# email that already signed in isn't retroactively promoted; use the Owner
# dashboard's role dropdown (or a direct DB edit for the very first owner
# on a fresh database) instead.
OWNER_EMAILS=you@example.com
DEVELOPER_EMAILS=
```

⚠️ **SQLite persistence on ephemeral hosting:** `backend/data/rbac.db` (and
`calibration.db`) are plain files with no `disk:` entry in `render.yaml` —
on a platform like Render's free tier, that means they do **not** survive a
redeploy. Fine for local dev; before real users depend on trial/org state
in production, either attach a persistent disk (paid instance) and point
`rbac/db.py`'s `DB_PATH` at its mount, or move to a real database service.

## Handwriting calibration (few-shot conditioning)

This is prompt-level few-shot conditioning, not model fine-tuning: a handful
of (image, correct LaTeX) samples per teacher are injected as in-context
examples ahead of the new image at recognition time, so the vision LLM can
calibrate to that teacher's handwriting style.

- **Teacher identity:** calibration samples are scoped by the signed-in
  teacher's Google account (`sub` claim) — see Authentication above.
- **Onboarding:** on a teacher's first login (no stored samples yet), a
  guided 10-step flow (`CalibrationFlow.jsx`) asks them to write specific
  digits, operators, variables, and one full equation. Since we told them
  what to write, the label is known ground truth. Available anytime after via
  the **"Calibrate my handwriting"** header button; "Skip for now" suppresses
  the automatic prompt (stored per-teacher in `localStorage`) without
  disabling the manual button.
- **Storage:** `app/calibration.py` — a single SQLite table
  (`backend/data/calibration.db`, gitignored) with
  `store_calibration_sample()`, `get_calibration_samples(teacher_id)`, and
  `store_correction()`. Each row is tagged `source="onboarding"` or
  `source="correction"`.
- **Injection:** `POST /api/recognize` fetches up to 4 stored samples for the
  requesting teacher and passes them to `provider.recognize_equation(...,
  examples=...)`. Both providers turn each example into a
  user-turn-with-image / assistant-turn-with-label pair ahead of the real
  image, then ask the model to use that style as a reference — this is
  implemented identically (same message shape) in both
  `anthropic_provider.py` and `openai_provider.py`.
- **Continuous correction:** the recognized `latex` command is editable in
  its draft card (`CommandDrafts.jsx` — see "Recognition architecture"
  above) before the teacher accepts it. If they change it, `App.jsx`
  submits the original canvas image + the corrected LaTeX as a new
  calibration sample (`source="correction"`), so future recognitions for that
  teacher benefit from it too.

## Graphing (2D and 3D)

`graphing.py` turns the confirmed LaTeX into numeric data for Plotly to
render — no separate "Solve" step needed for this:

1. **Parse:** `sympy.parsing.latex.parse_latex` turns LaTeX into a SymPy
   expression or, if it contains `=`, an `Eq(lhs, rhs)`.
2. **Resolve the plottable form:**
   - *Explicit*, e.g. `y = x^2 + 3` or `z = x^2 + y^2` (or a bare expression
     with no `=`, treated as an implied `y = ...` / `z = ...`) — used as-is.
   - *Implicit*, e.g. `x^2 + y^2 = 25` — solved for one variable
     (preferring `z`, then `y`, then whatever's left), which can yield
     multiple branches — e.g. `±sqrt(25 - x^2)`, both plotted so the result
     reads as a full circle/sphere rather than one arc.
   - *Degenerate*, e.g. `2x + 3 = 7` — solving leaves no free variable
     (`x = 2`), so it's drawn as a reference line (vertical for anything but
     `y`, horizontal for `y = const`) rather than erroring out.
3. **Count the remaining free variables** to decide 2D vs. 3D — 1 variable
   → a line (`numpy`-evaluated over x ∈ [-10, 10] by default, 400 points); 2
   variables → a surface (60×60 grid). More than 2 → a `GraphError` with a
   message meant to be shown directly to the teacher (e.g. "too many
   variables to graph"). For a single-branch periodic function (e.g.
   `y = sin(x)`), the domain instead spans exactly two periods centered at
   zero (`sympy.periodicity()`) — so a fast wave like `sin(20x)` isn't lost
   in a fixed window and a slow one isn't shown as an uninformative sliver
   — and the response also carries `period`/`amplitude`/`midline`:
   `amplitude`/`midline` are derived numerically from the sampled curve
   (works for any bounded sin/cos combination without symbolic pattern
   matching) and omitted for unbounded functions (tan/cot/sec/csc), where
   "amplitude" isn't a meaningful concept. `GraphView.jsx` renders these as
   "Period: 2π · Amplitude: 1" tags above the plot, via
   `utils/formatMath.js`'s `formatPiMultiple()`.
4. **Numeric safety:** invalid domain points (e.g. `sqrt` of a negative, `1/0`)
   naturally evaluate to NaN/Infinity in `numpy`, which aren't valid JSON —
   `graphing.py` converts every non-finite or non-real value to `null` before
   the response is serialized, and Plotly just leaves those points as gaps.
5. **Render:** `GraphView.jsx` calls `POST /api/graph` and hands the result to
   Plotly.js — `type: "2d"` → a line trace per branch; `type: "3d"` → a
   surface trace per branch, with rotate/zoom built into Plotly's own 3D
   scene controls. `plotly.js-dist-min` (~1.6MB gzipped, since it bundles
   both 2D and 3D trace types) is dynamically `import()`-ed on first click of
   **Graph**, not included in the initial page bundle.

## Solving equations (step-by-step)

`POST /api/solve` (`solving.py` + `solve_router.py`) answers "solve this"
for algebraic equations in one unknown (linear, quadratic, cubic, or other
polynomial/non-polynomial forms), trigonometric equations (see
"Trigonometric functions" below), and first-order differential equations
written in Leibniz notation (`\frac{dy}{dx} = ...`). Unlike Graph, it
doesn't lean on the LLM for the actual math — that would risk a
confidently-wrong final answer:

1. **Ground truth first:** `compute_ground_truth()` parses the LaTeX with
   `sympy.parsing.latex.parse_latex` (same as graphing), then:
   - *Algebraic:* rejects anything with more than one free variable
     (`SolveError`, shown directly to the teacher), classifies the equation
     by polynomial degree, and solves it with `sympy.solve`.
   - *Trigonometric:* detected by the presence of `sin`/`cos`/`tan`/`cot`/
     `sec`/`csc` — see "Trigonometric functions" below for how this differs
     from the plain algebraic path.
   - *Differential:* detects a `Derivative` in the parsed tree, promotes the
     dependent symbol to an applied function (`y` → `y(x)`) so SymPy's ODE
     machinery recognizes it, classifies it with `sympy.classify_ode`, and
     solves it with `sympy.dsolve`. Higher-order or prime-notation (`y'`)
     derivatives aren't supported — SymPy's LaTeX parser doesn't recognize
     that notation as a derivative in the first place.
2. **LLM narrates, doesn't compute:** `build_solve_prompt()` hands the model
   the equation, its classification, and the already-verified final answer,
   and asks only for a short pedagogical path *to* that answer — a JSON
   `solution_steps` command (see "The AICommand schema" above), reusing
   `parse_ai_commands` for validation. Long LaTeX-heavy step lists
   occasionally trip the model into slightly malformed JSON (an unbalanced
   bracket); `solve_router.py` retries up to 3 times before returning a 502,
   since the same malformed shape essentially never repeats on retry.
3. **Reveal-as-you-go:** `SolveView.jsx` fetches all steps in one call, then
   shows them one at a time behind a **Reveal next step** button; once every
   step is shown, a pinned **Final answer** card renders the SymPy-verified
   `final_answer` (not whatever the last LLM step happened to say), via
   KaTeX with `katex/contrib/auto-render` for the `$...$`-delimited math
   inside each step's prose. Skipped entirely in the auto-solve flow (see
   below), which fires the same request without a button press.

## Trigonometric functions

Class 10-11 trig — recognizing hand-drawn `sin`/`cos`/`tan` expressions,
graphing the wave (period/amplitude — see "Graphing" above), and solving
trig equations for *all* solutions in a range — needed one genuinely new
piece: unlike a polynomial, a trig equation has infinitely many solutions in
general, so "solve" only makes sense alongside "for x in \[a, b\]".

- **Recognition** needed no changes at all — `parse_latex` already handles
  `\sin`, `\cos`, `\tan` natively, and the OCR prompt was already generic
  ("transcribe the equation"). What *did* need building is recognizing an
  explicit **instruction**, e.g. handwriting "solve sin x + cos x = 1 for
  [0, π)" — see the `solve_equation` command type above and "Write the
  whole thing on canvas" below.
- **Range-restricted solving** (`_solve_trig` in `solving.py`): instead of
  plain `sympy.solve()` — which only returns the principal pair, e.g. just
  `[π/6, 5π/6]` for `sin(x) = 0.5` — it uses
  `sympy.solveset(eq, var, domain=Interval(min, max, left_open=..., right_open=...))`,
  which returns *every* solution in an arbitrary range. No range given →
  defaults to `[0, 2π)`. Range endpoints are parsed as LaTeX expressions
  (`_parse_range_bound()`), not decimals, so a handwritten `π` stays exact
  rather than becoming a lossy `3.14159...`. (One SymPy quirk worth
  knowing: `parse_latex("\pi")` alone returns a plain `Symbol`, not the
  numeric constant — `_parse_range_bound` substitutes `sympy.pi` back in
  before evaluating to a float.)
- **Exact special angles:** an OCR'd `\sin(x) = 0.5` would otherwise solve
  to an ugly float instead of `π/6` — `_solve_trig` runs `sympy.nsimplify()`
  over the equation's `Float` atoms first (`0.5 → 1/2`,
  `0.7071... → √2/2`, etc.) so Class 10-11 answers come out as the special-
  angle fractions a textbook would show.
- **The LLM is told it's periodic:** `build_solve_prompt()` adds a line
  asking it to find the reference/principal solution first, then explain
  how the function's symmetry gives the other solution(s) in range, rather
  than just stating the (already SymPy-verified) answer.

### Write the whole thing on canvas

A teacher can write the full instruction — equation, "solve", and a range —
in one go, and get to the answer after a single confirm, no Solve button or
manual range entry:

1. The recognition prompt (`math_plugin.py`) distinguishes a bare equation
   (`latex` command, unchanged — Graph/Solve stay manual) from an explicit
   solve instruction (`solve_equation` command — the word "solve", "find
   x", etc., optionally followed by a range like "for x in [0, 2π)" or a
   bare bracketed range right after the equation). Bracket shape (`[`/`]`
   vs `(`/`)`) maps directly to `range_min_inclusive`/`range_max_inclusive`.
2. `SolveEquationDraftCard` (`CommandDrafts.jsx`) shows the parsed equation
   (editable) and the range as two fields with clickable `[`/`(` toggle
   buttons, pre-filled from recognition — a teacher can fix a misread
   bracket or bound without retyping anything.
3. One **Confirm** sets `autoSolve` in `App.jsx`; `SolveView.jsx` picks that
   up in a `useEffect` keyed on the confirmed equation and calls
   `POST /api/solve` immediately, skipping its own manual range
   checkbox/inputs/Solve-button UI for that result. A plain `latex` draft's
   Confirm still leaves Solve manual, exactly as before.

## Prerequisites

- Python 3.9+
- Node.js 20+
- A Google Cloud OAuth client ID (see below)

### Google Cloud OAuth setup (one-time)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) →
   create or select a project.
2. **APIs & Services → OAuth consent screen** — configure it (External is
   fine for a pilot; Internal if your school uses Google Workspace).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type **Web application**.
4. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` (dev)
   - your production frontend URL, once deployed
   - (No **Authorized redirect URIs** are needed — Google Identity Services'
     token-based sign-in doesn't redirect.)
5. Copy the generated **Client ID** (`....apps.googleusercontent.com`) — you'll
   put the same value in both `backend/.env` and `frontend/.env` below.

## Backend setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env`:

```bash
# Choose the active provider: "anthropic" or "openai"
LLM_PROVIDER=anthropic

# Set whichever key(s) you have — only the active provider's key is required
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8

OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# From the Google Cloud OAuth setup above — must match VITE_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Optional: restrict sign-in to one Google Workspace domain, e.g. "myschool.edu"
GOOGLE_ALLOWED_DOMAIN=

# Signs session tokens — generate with:
#   python3 -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=change-this-in-production

# Must include the frontend's dev server origin
CORS_ORIGINS=http://localhost:5173

# Comma-separated emails bootstrapped into the "owner"/"developer" role on
# their first sign-in — see "Access control, multi-tenancy, and trials"
# above. Set at least one, or there's no way to reach the Owner dashboard.
OWNER_EMAILS=you@example.com
DEVELOPER_EMAILS=
```

Run the API:

```bash
uvicorn app.main:app --reload --reload-dir app --port 8000
```

`--reload-dir app` restricts the auto-reloader to the `app/` source folder.
Without it, uvicorn also watches `.venv` — if your project lives inside a
sync client (OneDrive, Dropbox, iCloud Drive), that client continuously
touches files inside `.venv`'s installed packages, which the reloader sees
as "changes" and restarts the server in an infinite loop (symptom: it never
settles, or `--reload` seems to "hang" watching files forever).

The API is now live at `http://localhost:8000` (health check: `GET /api/health`).

### Switching LLM providers

Both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` can be set at the same time —
only `LLM_PROVIDER` decides which one is actually called. To switch, change
`LLM_PROVIDER` in `.env` and restart the backend; no code changes needed. This
works because every route calls `get_llm_provider()` (`app/llm/__init__.py`),
which reads `LLM_PROVIDER` and returns either `AnthropicProvider` or
`OpenAIProvider` — both implement the same `recognize_equation` /
`translate_text` interface.

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `frontend/.env` — this must be the **same** client ID as `GOOGLE_CLIENT_ID`
in `backend/.env`:

```bash
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

```bash
npm run dev
```

The app is now live at `http://localhost:5173`. In dev, Vite proxies API
requests to `http://localhost:8000` (see `vite.config.js`), so no other
frontend env var is needed to reach the backend locally.

## Deploying frontend and backend on separate servers

Locally, `client.js`'s API calls resolve against a relative `/api` path —
that only works because Vite's dev proxy forwards it to the backend. In
production, if the frontend and backend are on **different** servers/domains,
three things need to point at each other:

1. **Frontend → backend:** set `VITE_API_BASE_URL` in `frontend/.env` to the
   backend's full URL before running `npm run build`, e.g.:

   ```bash
   VITE_API_BASE_URL=https://api.example.com/api
   ```

   This is read at **build time**, not runtime — a rebuild is required if it
   changes (`import.meta.env.VITE_API_BASE_URL` is inlined into the bundle).
   If frontend and backend instead share an origin (e.g. one reverse proxy
   routing `/api` to the backend), leave it unset.
2. **Backend → frontend (CORS):** set `CORS_ORIGINS` in `backend/.env` to the
   deployed frontend's exact origin (scheme + host, no trailing slash), e.g.
   `CORS_ORIGINS=https://app.example.com`. Requests from an origin not in
   this list are rejected by the browser.
3. **Google Cloud Console:** add the deployed frontend's origin to that
   OAuth client's **Authorized JavaScript origins** (see the Google Cloud
   OAuth setup section above) — Google Sign-In will otherwise fail with an
   `origin_mismatch` error.

Auth uses a bearer token (not cookies), so there's no cookie/`SameSite`
cross-origin complication beyond the CORS origin check above.

### Deploying on Render

`render.yaml` at the repo root is a ready-made Blueprint: a Python web
service for the backend and a static site for the frontend. Secrets and
deploy-specific values (`ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`,
`CORS_ORIGINS`, `OWNER_EMAILS`, `VITE_API_BASE_URL`, ...) are marked
`sync: false` — set their actual values in the Render dashboard per
service, not in the committed file. See the ⚠️ note on SQLite persistence
under "Access control, multi-tenancy, and trials" above before relying on
this for anything beyond a demo — the free tier's ephemeral disk means
`rbac.db`/`calibration.db` don't survive a redeploy.

## Using it

1. Open `http://localhost:5173` and sign in with your Google account.
2. If this is your first time, you'll be prompted to calibrate your
   handwriting (10 quick prompts); you can skip it or redo it later via
   **"Calibrate my handwriting"** in the header.
3. Draw an equation on the canvas with mouse, trackpad, or stylus.
4. Use **Undo** / **Clear** as needed.
5. Click **Recognize** — a tight crop around your most recent stroke (via
   `getFocusRegion()`, not the whole canvas) is sent to the configured LLM
   provider (along with a few of your stored calibration samples, if any),
   which returns a `latex` command shown as a draft card (dashed border)
   below the canvas. Toggle **Auto** on to skip the button — recognition
   fires automatically ~2.5s after you finish a stroke, restarting the
   timer if you keep drawing.
6. Edit the LaTeX in the draft if it's wrong, then **Confirm** — the card
   turns solid (accepted), and an edited confirmation is saved as a
   correction sample for next time. **Discard** removes a draft without
   affecting anything already accepted.
7. Click **Graph** — a one- or two-variable equation renders as a 2D line or
   3D surface (rotate/zoom with your mouse) below. A periodic function (e.g.
   `y = sin(x)`) also shows **Period**/**Amplitude** tags above the plot.
8. Click **Solve** — for a single-unknown algebraic equation, a trig
   equation, or a first-order `dy/dx = ...` differential equation, this
   computes the verified answer with SymPy and reveals the first step below
   the canvas. For a trig equation, an optional **"Solve for a range of x"**
   checkbox lets you restrict to a range other than the `[0, 2π)` default.
   Click **Reveal next step** to walk through the rest one at a time; once
   every step is shown, a **Final answer** card renders the SymPy-verified
   result (plus the range it was solved for, if any).
9. Or skip steps 7-8's manual buttons for a trig equation by writing the
   whole instruction on the canvas — e.g. "solve sin x + cos x = 1 for
   [0, π)". Recognizing it shows a draft with the equation and range
   pre-filled (bracket buttons toggle inclusive/exclusive); **Confirm** once
   and the step-by-step solution appears automatically.
10. If you're the app **owner** (your email is in `OWNER_EMAILS`), an
    **Owner** button appears in the nav — see "Owner dashboard" above.

## Roadmap (not yet implemented)

The `AICommand` schema and plugin registry (see "Recognition architecture"
above) already define these as first-class command types — what's missing is
their actual renderer/feature logic:

- **3D shape panel** — manual cone/sphere/cylinder picker with Three.js. The
  `shape3d` command type is fully validated on both backend and frontend
  (bounded numeric `params` only — see the "never execute AI-provided code"
  note above); the actual Three.js renderer is still to be built.
- **Language toggle** — translate solution steps via `translate_text()`
  (Hindi/Bengali). The `translation` command type is validated and has a
  draft-card fallback; no plugin emits it yet and there's no dedicated
  translated-text display.
- **Admin-facing dashboard UI** — `GET /api/admin/org` and the seat-limited
  invite endpoints already work for a school `admin` (exercised today via
  the Owner dashboard's org-scoped calls), but there's no dedicated frontend
  screen a signed-in `admin` can reach themselves.
- **Degree-mode trig ranges** — range endpoints and equations are parsed as
  radians/LaTeX; a handwritten `0° ≤ x ≤ 360°` isn't recognized as a range
  today (Class 10 NCERT trig ratios are often taught in degrees).
- **Durable storage in production** — see the SQLite/ephemeral-disk warning
  under "Access control, multi-tenancy, and trials" and "Deploying on
  Render" above.
