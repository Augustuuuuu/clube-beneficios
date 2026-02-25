#!/usr/bin/env python
import os
import sys


def main() -> None:
    """Ponto de entrada para comandos Django."""
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "clube.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Não foi possível importar Django. "
            "Verifique se o pacote está instalado no seu ambiente."
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()

