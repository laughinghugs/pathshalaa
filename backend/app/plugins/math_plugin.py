from __future__ import annotations

from .base import SubjectPlugin
from .registry import register

PROMPT_TEMPLATE = (
    "This image contains a handwritten math equation on a whiteboard-style canvas. "
    "Transcribe it as clean, valid LaTeX (no surrounding $ or $$ delimiters) and "
    "return it as a single `latex` command."
)

MATH_PLUGIN = SubjectPlugin(
    id="math",
    name="Math",
    # Only `latex` is actually produced today. `graph` / `shape3d` /
    # `solution_steps` remain valid AICommand types this plugin (or a future
    # one) can adopt later without any change to recognize_router.py.
    command_types=["latex"],
    prompt_template=PROMPT_TEMPLATE,
)

register(MATH_PLUGIN)
