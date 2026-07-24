# Pathshalaa

An MVP web app for teachers to hand-write math equations on screen and have AI
recognize, solve, graph, and visualize them in 3D, with explanations in a
regional language.

**Current status:** canvas → recognize → display LaTeX → graph (2D or 3D) is
wired end-to-end, behind Google Sign-In, with per-teacher handwriting
calibration (few-shot conditioning) improving recognition accuracy.
Step-by-step Solve, the manual 3D shape panel (Three.js), and the language
toggle are follow-up steps.

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
│       ├── calibration.py   per-teacher handwriting sample storage (SQLite)
│       ├── graphing.py      LaTeX -> SymPy -> numeric data for 2D/3D plots
│       ├── llm/             provider-agnostic LLM abstraction
│       │   ├── base.py           LLMProvider interface + HandwritingExample
│       │   ├── anthropic_provider.py
│       │   ├── openai_provider.py
│       │   └── __init__.py       get_llm_provider() factory (reads LLM_PROVIDER)
│       └── routers/
│           ├── auth_router.py         POST /api/auth/google
│           ├── recognize_router.py    POST /api/recognize
│           ├── calibration_router.py  calibration samples + corrections
│           └── graph_router.py        POST /api/graph
└── frontend/           React (Vite) app
    └── src/
        ├── App.jsx
        ├── api/client.js         axios client, attaches session token
        └── components/
            ├── Login.jsx               Google Sign-In button
            ├── CalibrationFlow.jsx     guided handwriting onboarding
            ├── DrawingCanvas.jsx       shared canvas drawing primitive
            ├── EquationCanvas.jsx      main canvas + undo/clear/recognize
            ├── LatexDisplay.jsx        editable LaTeX review + confirm
            └── GraphView.jsx           2D/3D plot via Plotly.js (lazy-loaded)
```

### Why it's structured this way

Recognition, solving, and translation are kept as separate modules behind a
single `LLMProvider` interface (`app/llm/base.py`) so the rest of the app never
touches the Anthropic or OpenAI SDKs directly. Adding a new subject (geography,
history, language) later means adding a new router + service module, not
rewiring the LLM plumbing — and it sets up cleanly for an agent-based
architecture down the line.

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
- **Continuous correction:** the recognized LaTeX is editable
  (`LatexDisplay.jsx`) before the teacher confirms it. If they change it,
  `App.jsx` submits the original canvas image + the corrected LaTeX as a new
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

## Using it

1. Open `http://localhost:5173` and sign in with your Google account.
2. If this is your first time, you'll be prompted to calibrate your
   handwriting (10 quick prompts); you can skip it or redo it later via
   **"Calibrate my handwriting"** in the header.
3. Draw an equation on the canvas with mouse, trackpad, or stylus.
4. Use **Undo** / **Clear** as needed.
5. Click **Recognize** — the canvas is sent as a PNG to the configured LLM
   provider (along with a few of your stored calibration samples, if any),
   which returns LaTeX rendered below the canvas.
6. Edit the LaTeX if it's wrong, then **Confirm** — an edited confirmation is
   saved as a correction sample for next time.
7. Click **Graph** — a one- or two-variable equation renders as a 2D line or
   3D surface (rotate/zoom with your mouse) below.

## Roadmap (not yet implemented)

- **Solve** — step-by-step algebraic solution (currently only *Graph* uses
  SymPy, and only to rearrange the equation for plotting).
- **3D shape panel** — manual cone/sphere/cylinder picker with Three.js
  (separate from equation-driven graphing above).
- **Language toggle** — translate solution steps via `translate_text()`
  (Hindi/Bengali), already stubbed in the `LLMProvider` interface.
