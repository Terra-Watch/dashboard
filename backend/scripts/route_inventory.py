"""Lists every API route with whether it needs a sign-in and, for changes, CSRF protection. Flags the ones that look wrong.
Public on purpose (no sign-in): sign-in, register, password reset, access requests, public map/contacts/reports, health, and the model-host style endpoints listed below.
usage: python scripts/route_inventory.py            (exit code 1 when something is flagged)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app.core.config  # noqa: E402,F401
from fastapi.routing import APIRoute  # noqa: E402

from app.main import app  # noqa: E402

PUBLIC_OK = ("/api/auth/sign-in", "/api/auth/redesign/login", "/api/auth/citizen/login", "/api/auth/citizen/register", "/api/auth/access-requests", "/api/auth/password-reset",
             "/api/auth/citizen/password-reset", "/api/auth/refresh", "/api/auth/logout", "/api/auth/invites/", "/api/public/", "/health", "/ready", "/docs", "/openapi.json", "/redoc")
AUTH_NAMES = ("current_", "require_", "citizen_user", "_control_user", "_operator", "community_user", "patrol_planning")


def deps_of(route: APIRoute) -> list[str]:
    names = []
    def walk(dep):
        if dep.call is not None:
            names.append(getattr(dep.call, "__qualname__", getattr(dep.call, "__name__", str(dep.call))))
        for sub in dep.dependencies:
            walk(sub)
    walk(route.dependant)
    return names


def main() -> int:
    flagged = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        names = deps_of(route)
        has_auth = any(any(a in n for a in AUTH_NAMES) for n in names)
        has_csrf = any("require_csrf" in n for n in names)
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            public = route.path.startswith(PUBLIC_OK)
            problems = []
            if not has_auth and not public:
                problems.append("no sign-in required")
            if method in ("POST", "PUT", "PATCH", "DELETE") and not has_csrf and not public:
                problems.append("changes data without the CSRF check")
            print(f"{method:6} {route.path:60} {'auth' if has_auth else 'open':5} {'csrf' if has_csrf else '    '} {'; '.join(problems)}")
            if problems:
                flagged.append((method, route.path, problems))
    print(f"\n{len(flagged)} flagged")
    return 1 if flagged else 0


sys.exit(main())
