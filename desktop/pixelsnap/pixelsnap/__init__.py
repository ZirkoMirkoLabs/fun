"""PixelSnap: recover a real pixel grid from imperfect raster art."""

__version__ = "1.0.0"

from .core import Options, Result, detect_grid, process_image, snap, save_result, InputTooLarge

__all__ = ["Options", "Result", "detect_grid", "process_image", "snap", "save_result", "InputTooLarge"]
