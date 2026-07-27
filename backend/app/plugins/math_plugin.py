from __future__ import annotations

from .base import SubjectPlugin
from .registry import register

PROMPT_TEMPLATE = (
    "This image contains a handwritten math note on a whiteboard-style canvas. "
    "If it is just an equation or expression with no instruction attached, transcribe it as "
    "clean, valid LaTeX (no surrounding $ or $$ delimiters) and return it as a single `latex` "
    "command — e.g. a bare \"x^2 - 4 = 0\" is a `latex` command, not a `solve_equation` one.\n\n"
    "If it explicitly instructs solving the equation — the word \"solve\", \"find x\", \"evaluate\", "
    "or similar, written alongside the equation — return a `solve_equation` command instead: put "
    "the equation itself (with the instruction words stripped out) in `content` as clean LaTeX. "
    "If it also restricts the solution to a range of x — phrases like \"for x in [0, 2\\pi)\", "
    "\"0 <= x < 2pi\", or a bare bracketed range such as [0, \\pi) right after the equation — put "
    "the lower and upper bounds as LaTeX expressions in `range_min`/`range_max` (e.g. \"0\", "
    "\"\\\\pi\", not a decimal approximation), and set `range_min_inclusive`/`range_max_inclusive` "
    "to true for a square bracket ([ or ]) on that side and false for a round one (( or )). Omit "
    "range_min/range_max entirely (leave them unset) if no range is written.\n\n"
    "If instead the drawing is a 3D solid outline (a cone, sphere, cylinder, or cuboid/box) with "
    "dimensions labeled near it — e.g. \"r=3, h=5\", \"radius 3 height 5\", or numbers written next "
    "to the sides of a box — return a `shape_mensuration` command: set `shape` to whichever of "
    "cone/sphere/cylinder/cuboid the outline is, and fill in `dimensions` with only the numeric "
    "values actually labeled (a cone/cylinder needs radius+height; a sphere needs only radius; a "
    "cuboid needs length+width+height — use `side` only if a single side length is labeled for a "
    "cube-like box and length/width/height aren't distinguishable). Do not guess a value that "
    "isn't written down — leave that dimension unset rather than inventing a number. If a unit "
    "(cm, m, etc.) is written next to the numbers, put it in `unit`; otherwise omit `unit`. This is "
    "a distinct instruction from an equation — don't also return a `latex` command for the same "
    "drawing."
)

MATH_PLUGIN = SubjectPlugin(
    id="math",
    name="Math",
    # `graph` / `shape3d` / `solution_steps` remain valid AICommand types
    # this plugin (or a future one) can adopt later without any change to
    # recognize_router.py.
    command_types=["latex", "solve_equation", "shape_mensuration"],
    prompt_template=PROMPT_TEMPLATE,
)

register(MATH_PLUGIN)
