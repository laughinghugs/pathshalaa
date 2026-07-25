"""The subject-agent plugin contract.

Each subject (math, and later geography/history/language) registers one of
these. The recognition endpoint looks up whichever plugins are active and
uses only their `command_types` + `prompt_template` to build the LLM call —
adding a subject is a new registration (see math_plugin.py + registry.py),
not a change to app/routers/recognize_router.py.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SubjectPlugin:
    id: str
    name: str
    # Which AICommand `type` values (see app/commands.py) this subject is
    # allowed to produce. The recognition prompt only advertises these.
    command_types: list[str]
    # Subject-specific instructions (what's on the canvas, how to read it).
    # A shared JSON-shape instruction block is appended on top of this by
    # build_recognition_prompt() — see prompts.py.
    prompt_template: str
