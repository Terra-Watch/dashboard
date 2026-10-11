"""Georeferencing of an MCD64A1 tile from the file's own metadata.

MCD64A1 is a 2400 x 2400 grid per sinusoidal tile, so a pixel is
1,111,950.52 m / 2400 = 463.313 m, not 500 m. The corner coordinates are read
from the HDF-EOS `StructMetadata.0` attribute (UpperLeftPointMtrs,
LowerRightMtrs, XDim, YDim, ProjParams radius); the tile index is only a
fallback when a file carries no metadata.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

SPHERE_RADIUS_M = 6_371_007.181
TILE_SIZE_M = 1_111_950.5196666666
GRID_ORIGIN_X_M, GRID_ORIGIN_Y_M = -20_015_109.354, 10_007_554.677
TILE_PIXELS = 2400


@dataclass(frozen=True)
class TileGrid:
    ul_x: float
    ul_y: float
    lr_x: float
    lr_y: float
    xdim: int
    ydim: int
    radius: float = SPHERE_RADIUS_M

    @property
    def pixel_size_x(self) -> float:
        return (self.lr_x - self.ul_x) / self.xdim

    @property
    def pixel_size_y(self) -> float:
        return (self.ul_y - self.lr_y) / self.ydim

    def centre_xy(self, rows, cols):
        rows, cols = np.asarray(rows, dtype=float), np.asarray(cols, dtype=float)
        return self.ul_x + (cols + 0.5) * self.pixel_size_x, self.ul_y - (rows + 0.5) * self.pixel_size_y

    def lonlat(self, rows, cols):
        """(longitude, latitude) in degrees of pixel centres."""
        x, y = self.centre_xy(rows, cols)
        lat = np.degrees(y / self.radius)
        return np.degrees(x / (self.radius * np.cos(np.radians(lat)))), lat

    def rowcol(self, lon, lat):
        """Integer (row, col) of the pixel containing each (lon, lat); may fall outside the tile."""
        lon, lat = np.asarray(lon, dtype=float), np.asarray(lat, dtype=float)
        x = self.radius * np.radians(lon) * np.cos(np.radians(lat))
        y = self.radius * np.radians(lat)
        return np.floor((self.ul_y - y) / self.pixel_size_y).astype(int), np.floor((x - self.ul_x) / self.pixel_size_x).astype(int)


def _pair(text: str, key: str) -> tuple[float, float]:
    match = re.search(rf"{key}=\(([-\d.eE+]+),([-\d.eE+]+)\)", text)
    if not match:
        raise ValueError(f"{key} not found in StructMetadata")
    return float(match.group(1)), float(match.group(2))


def grid_from_struct_metadata(text: str) -> TileGrid:
    ul_x, ul_y = _pair(text, "UpperLeftPointMtrs")
    lr_x, lr_y = _pair(text, "LowerRightMtrs")
    xdim = int(re.search(r"XDim=(\d+)", text).group(1))
    ydim = int(re.search(r"YDim=(\d+)", text).group(1))
    radius = re.search(r"ProjParams=\(([-\d.eE+]+)", text)
    return TileGrid(ul_x, ul_y, lr_x, lr_y, xdim, ydim, float(radius.group(1)) if radius else SPHERE_RADIUS_M)


def grid_from_tile_name(horizontal: int, vertical: int) -> TileGrid:
    ul_x = GRID_ORIGIN_X_M + horizontal * TILE_SIZE_M
    ul_y = GRID_ORIGIN_Y_M - vertical * TILE_SIZE_M
    return TileGrid(ul_x, ul_y, ul_x + TILE_SIZE_M, ul_y - TILE_SIZE_M, TILE_PIXELS, TILE_PIXELS)


def grid_from_hdf(path: Path, dataset=None) -> TileGrid:
    """The tile's grid from its own StructMetadata; falls back to the h??v?? in the file name."""
    if dataset is None:
        from pyhdf.SD import SD, SDC
        dataset = SD(str(path), SDC.READ)
    try:
        return grid_from_struct_metadata(dataset.attributes()["StructMetadata.0"])
    except (KeyError, ValueError, AttributeError):
        match = re.search(r"\.h(\d+)v(\d+)\.", Path(path).name)
        if not match:
            raise
        return grid_from_tile_name(int(match.group(1)), int(match.group(2)))
