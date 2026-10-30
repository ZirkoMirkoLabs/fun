"""PyInstaller entry point (package-relative imports stay intact)."""
from pixelsnap.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
