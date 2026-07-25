# Pathshalaa

An MVP web app for teachers to hand-write math equations on screen and have AI
recognize, solve, graph, and visualize them in 3D, with explanations in a
regional language.

**Current status:** canvas → recognize → draft/confirm → graph (2D or 3D) is
wired end-to-end, behind Google Sign-In, with per-teacher handwriting
calibration (few-shot conditioning) improving recognition accuracy.
Recognition is driven by a structured JSON command protocol and a
subject-agent plugin registry (see "Recognition architecture" below) so that
step-by-step Solve, the manual 3D shape panel (Three.js), and the language
toggle — still follow-up steps — can be added as new command types/plugins
without changing the core recognition flow.

## Project structure

```
Pathsalaa/
├── backend/            FastAPI app
│   └── app/
│       ├── main.py          FastAPI app + CORS + routers + startup DB init
│       ├── config.py        env-based settings (pydantic-settings)
│       ├── auth.py          get_current_user dependency (verifies session token)
│       ├── google_auth.py   Google ID token verification + session tokens
│       ├── schemas.py       Pydantic request/response models
│       ├── commands.py      the AICommand JSON schema + parse_ai_commands() validator
│       ├── calibration.py   per-teacher handwriting sample storage (SQLite)
│       ├── graphing.py      LaTeX -> SymPy -> numeric data for 2D/3D plots
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
│       └── routers/
│           ├── auth_router.py         POST /api/auth/google
│           ├── recognize_router.py    POST /api/recognize
│           ├── calibration_router.py  calibration samples + corrections
│           └── graph_router.py        POST /api/graph
└── frontend/           React (Vite) app
    └── src/
        ├── App.jsx
        ├── commands.js               frontend-side AICommand validation (mirrors commands.py)
        ├── api/client.js             axios client, attaches session token
        ├── utils/focusRegion.js      getFocusRegion() / cropToBlob() for cropped recognition
        └── components/
            ├── Login.jsx               Google Sign-In button
            ├── CalibrationFlow.jsx     guided handwriting onboarding
            ├── DrawingCanvas.jsx       shared canvas drawing primitive
            ├── EquationCanvas.jsx      canvas + undo/clear/manual+auto recognize
            ├── CommandDrafts.jsx       generic draft/confirm layer for AI commands
            └── GraphView.jsx           2D/3D plot via Plotly.js (lazy-loaded)
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

- `{ type: "latex", content: string }` — a recognized handwritten equation.
- `{ type: "graph", function: string, domain: [min, max] }`
- `{ type: "shape3d", shape: "cone" | "sphere" | "cylinder", params: {...} }`
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
  `command_types=["latex"]`. `graph` / `shape3d` / `solution_steps` /
  `translation` are already valid schema entries any future plugin (or math
  itself, later) can adopt without touching `recognize_router.py`.
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
— with explicit **Accept** / **Discard** controls. Only `latex` has a fully
built renderer today (the existing KaTeX preview + edit-and-confirm flow);
accepting an edited `latex` draft is what feeds the correction-storage flow
below. The other command types render through the same shell with a minimal
fallback display (label + raw fields) so the pattern already works
end-to-end for whatever a future plugin adds — building their real
renderers (a Three.js shape, a step-by-step layout, a translated-text panel)
is separate feature work, not part of this architecture. Discarding a draft
only removes that card — it never affects anything already accepted.

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
before a real pilot to avoid unrestricted API cost exposure.

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
   → a line (`numpy`-evaluated over x ∈ [-10, 10], 400 points); 2 variables
   → a surface (60×60 grid). More than 2 → a `GraphError` with a message
   meant to be shown directly to the teacher (e.g. "too many variables to
   graph").
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
   3D surface (rotate/zoom with your mouse) below.

## Roadmap (not yet implemented)

The `AICommand` schema and plugin registry (see "Recognition architecture"
above) already define these as first-class command types — what's missing is
their actual renderer/feature logic:

- **Solve** — step-by-step algebraic solution. The `solution_steps` command
  type and its draft-card fallback display already exist; no subject-agent
  produces it yet, and there's no dedicated step-by-step layout (currently
  only *Graph* uses SymPy, and only to rearrange the equation for plotting).
- **3D shape panel** — manual cone/sphere/cylinder picker with Three.js. The
  `shape3d` command type is fully validated on both backend and frontend
  (bounded numeric `params` only — see the "never execute AI-provided code"
  note above); the actual Three.js renderer is still to be built.
- **Language toggle** — translate solution steps via `translate_text()`
  (Hindi/Bengali). The `translation` command type is validated and has a
  draft-card fallback; no plugin emits it yet and there's no dedicated
  translated-text display.
