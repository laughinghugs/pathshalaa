"""Central role -> permission map.

This is the one place that decides what a role can do. Routes and query
helpers check against this map (via require_permission / has_permission)
rather than testing `user.role == "..."` inline, so the set of permissions
for a role stays in one place as roles evolve.
"""

PERMISSIONS: dict[str, list[str]] = {
    "owner": ["*"],
    "developer": ["view_logs", "manage_feature_flags", "view_system_health"],
    "admin": ["manage_org_users", "view_org_usage", "manage_org_subscription"],
    "user": ["use_canvas", "use_recognize", "use_solve", "use_graph", "use_3d"],
}


def has_permission(role: str, permission: str) -> bool:
    granted = PERMISSIONS.get(role, [])
    return "*" in granted or permission in granted
