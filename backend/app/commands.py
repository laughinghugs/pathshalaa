"""The structured AI command protocol.

Instead of the LLM returning loose prose/LaTeX, every recognition call must
return a JSON array of "commands" matching one of the typed shapes below.
This is what makes the recognition pipeline safe to extend: a new
subject-agent (geography, history, language — see app/plugins/) adds new
command types to this same union rather than inventing its own response
format.

`parse_ai_commands` is the single place that turns raw model text into
validated command objects, dropping anything malformed or not produced by
an active plugin before it ever reaches the frontend.
"""

from __future__ import annotations

import json
import re
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter, ValidationError

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


class CommandValidationError(Exception):
    """Raised when the model's response isn't valid JSON, or no command in
    it survives validation/filtering. Mirrors GraphError in graphing.py —
    the message is meant to be safe to surface to the teacher."""


class LatexCommand(BaseModel):
    type: Literal["latex"]
    content: str


class GraphCommand(BaseModel):
    type: Literal["graph"]
    function: str
    domain: tuple[float, float]


class Shape3DCommand(BaseModel):
    type: Literal["shape3d"]
    shape: Literal["cone", "sphere", "cylinder"]
    # Bounded, declarative numeric parameters ONLY (e.g. radius, height).
    # NEVER treat model output as executable code — a future 3D renderer
    # must read these as plain numbers to size a shape, never eval/exec
    # anything derived from the model's response.
    params: dict[str, float]


class SolutionStepsCommand(BaseModel):
    type: Literal["solution_steps"]
    steps: list[str]


class TranslationCommand(BaseModel):
    type: Literal["translation"]
    text: str
    language: str


AICommand = Annotated[
    Union[LatexCommand, GraphCommand, Shape3DCommand, SolutionStepsCommand, TranslationCommand],
    Field(discriminator="type"),
]

_COMMAND_ADAPTER: TypeAdapter[AICommand] = TypeAdapter(AICommand)


def _strip_code_fences(text: str) -> str:
    """Best-effort cleanup for models that ignore the "no markdown fences"
    instruction — this is a safety net, not a license to skip prompting for
    the right shape."""
    return _CODE_FENCE_RE.sub("", text).strip()


def parse_ai_commands(raw_text: str, allowed_types: set[str]) -> list[AICommand]:
    """Parses and validates the model's raw response text into a list of
    AICommand objects.

    Anything with an unrecognized `type`, a `type` outside `allowed_types`
    (not produced by any currently active plugin), or a schema mismatch is
    dropped rather than failing the whole batch. Raises CommandValidationError
    only if the text isn't valid JSON at all, or if nothing survives.
    """
    cleaned = _strip_code_fences(raw_text)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise CommandValidationError("The AI response was not valid JSON.") from exc

    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list):
        raise CommandValidationError("The AI response must be a JSON array of commands.")

    commands: list[AICommand] = []
    for item in parsed:
        if not isinstance(item, dict) or item.get("type") not in allowed_types:
            continue
        try:
            commands.append(_COMMAND_ADAPTER.validate_python(item))
        except ValidationError:
            continue

    if not commands:
        raise CommandValidationError("The AI response contained no valid commands.")

    return commands
