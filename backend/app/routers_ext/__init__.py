"""Router extensions. Every module in this package that defines `router` (a FastAPI APIRouter) is included by main.py."""
import importlib
import pkgutil


def routers():
    found = []
    for module_info in sorted(pkgutil.iter_modules(__path__), key=lambda item: item.name):
        module = importlib.import_module(f'{__name__}.{module_info.name}')
        router = getattr(module, 'router', None)
        if router is not None:
            found.append(router)
    return found
