"""Module-level registry of subject-agent plugins.

Plugins register themselves at import time (see math_plugin.py, imported by
__init__.py below) — app/routers/recognize_router.py never needs to know the
concrete list of subjects, only `get_active_plugins(ids)`.
"""

from __future__ import annotations

from .base import SubjectPlugin

_REGISTRY: dict[str, SubjectPlugin] = {}


def register(plugin: SubjectPlugin) -> None:
    _REGISTRY[plugin.id] = plugin


def get_plugin(plugin_id: str) -> SubjectPlugin:
    try:
        return _REGISTRY[plugin_id]
    except KeyError:
        raise ValueError(f"Unknown subject plugin: {plugin_id!r}") from None


def get_active_plugins(plugin_ids: list[str]) -> list[SubjectPlugin]:
    return [get_plugin(plugin_id) for plugin_id in plugin_ids]
