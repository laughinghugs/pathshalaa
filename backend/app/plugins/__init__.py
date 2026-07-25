from .base import SubjectPlugin
from .prompts import build_recognition_prompt
from .registry import get_active_plugins, get_plugin, register

# Importing this triggers MATH_PLUGIN's module-level register() call.
# Registering a new subject later means adding a new `<subject>_plugin.py`
# module and importing it here — not touching recognize_router.py.
from . import math_plugin  # noqa: F401

__all__ = [
    "SubjectPlugin",
    "build_recognition_prompt",
    "get_active_plugins",
    "get_plugin",
    "register",
]
