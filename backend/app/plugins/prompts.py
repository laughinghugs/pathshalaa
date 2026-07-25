"""Builds the final recognition prompt from whichever plugins are active.

The prompt has two parts:
  1. Each active plugin's own `prompt_template` (what's on the canvas, how
     to read it).
  2. A shared instruction block, generated here, that tells the model
     exactly which AICommand shapes (app/commands.py) it's allowed to
     return and in what wrapper format — this is the same for every
     plugin, so a new subject only has to supply part 1.
"""

from __future__ import annotations

from .base import SubjectPlugin

# One canonical example per AICommand type, used to show the model the
# exact JSON shape for whichever types its active plugin(s) may produce.
_COMMAND_EXAMPLES: dict[str, str] = {
    "latex": '{"type": "latex", "content": "x^2 + 3x - 4 = 0"}',
    "graph": '{"type": "graph", "function": "x^2", "domain": [-10, 10]}',
    "shape3d": '{"type": "shape3d", "shape": "cone", "params": {"radius": 3, "height": 5}}',
    "solution_steps": '{"type": "solution_steps", "steps": ["Step 1: ...", "Step 2: ..."]}',
    "translation": '{"type": "translation", "text": "...", "language": "hi"}',
}

FEW_SHOT_PREAMBLE = (
    "The preceding examples show this teacher's handwriting style, each with its correct "
    "reading. Using them as a style reference, "
)


def _schema_instructions(allowed_types: list[str]) -> str:
    examples = ", ".join(_COMMAND_EXAMPLES[t] for t in allowed_types if t in _COMMAND_EXAMPLES)
    return (
        "Respond with ONLY a JSON array of command objects, each matching one of these shapes: "
        f"[{examples}]. "
        "Return ONLY the raw JSON array — no prose, no explanation, no markdown code fences, "
        "and nothing before or after the array."
    )


def build_recognition_prompt(plugins: list[SubjectPlugin], has_examples: bool) -> str:
    subject_instructions = " ".join(plugin.prompt_template for plugin in plugins)
    preamble = FEW_SHOT_PREAMBLE if has_examples else ""
    allowed_types = sorted({t for plugin in plugins for t in plugin.command_types})
    return f"{preamble}{subject_instructions}\n\n{_schema_instructions(allowed_types)}"
