"""Schema extensions. Every module in this package that defines `ensure(db)` is run, in name order, at the end of init_db().

Each `ensure` must be idempotent (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS) because there is no migration tool yet.
"""
import importlib
import pkgutil


def apply(db) -> None:
    for module_info in sorted(pkgutil.iter_modules(__path__), key=lambda item: item.name):
        module = importlib.import_module(f'{__name__}.{module_info.name}')
        ensure = getattr(module, 'ensure', None)
        if callable(ensure):
            ensure(db)
