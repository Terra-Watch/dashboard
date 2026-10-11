"""MCD64A1 pixel geometry: 463.31 m pixels placed from the file's own metadata."""
import sys
import unittest
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "inference"))

from mcd64a1_geo import grid_from_struct_metadata, grid_from_tile_name  # noqa: E402

# StructMetadata of MCD64A1.A2024061.h26v06.061.2024134021235.hdf (GridStructure excerpt).
STRUCT_H26V06 = """GROUP=GRID_1
    GridName="MOD_Grid_Monthly_500m_DB_BA"
    XDim=2400
    YDim=2400
    UpperLeftPointMtrs=(8895604.157347,3335851.558997)
    LowerRightMtrs=(10007554.677014,2223901.039330)
    Projection=GCTP_SNSOID
    ProjParams=(6371007.181000,0,0,0,0,0,0,0,0,0,0,0,0)
"""
# The ten pixels with burn date 2024-03-31 (DOY 91) found in RESQ-2 (rows, cols in the h26v06 tile).
CLUSTER = [(1807, 59), (1807, 60), (1808, 60), (1808, 61), (1808, 62), (1809, 61), (1809, 62), (1809, 63), (1809, 64), (1809, 65)]
HDF = BACKEND / "runtime_data/mcd64a1/2024-03/MCD64A1.A2024061.h26v06.061.2024134021235.hdf"


class TileGridTests(unittest.TestCase):
    def setUp(self):
        self.grid = grid_from_struct_metadata(STRUCT_H26V06)

    def test_pixel_is_463_m_not_500(self):
        self.assertAlmostEqual(self.grid.pixel_size_x, 463.3127, places=3)
        self.assertAlmostEqual(self.grid.pixel_size_y, 463.3127, places=3)

    def test_known_burned_cluster_is_at_its_real_location(self):
        rows, cols = zip(*CLUSTER)
        lon, lat = self.grid.lonlat(rows, cols)
        self.assertAlmostEqual(float(lat.mean()), 22.463, delta=0.002)
        self.assertAlmostEqual(float(lon.mean()), 86.849, delta=0.002)
        # the old 500 m step put the same pixels 75 km south-west at 21.87 N, 86.50 E
        self.assertGreater(float(lat.mean()), 22.4)

    def test_single_pixel_centre(self):
        lon, lat = self.grid.lonlat(1808, 61)
        self.assertAlmostEqual(float(lat), 22.4646, delta=0.001)
        self.assertAlmostEqual(float(lon), 86.8465, delta=0.001)

    def test_round_trip(self):
        rows, cols = np.array([0, 1808, 2399]), np.array([0, 61, 2399])
        lon, lat = self.grid.lonlat(rows, cols)
        back_rows, back_cols = self.grid.rowcol(lon, lat)
        self.assertEqual(back_rows.tolist(), rows.tolist())
        self.assertEqual(back_cols.tolist(), cols.tolist())

    def test_tile_name_fallback_matches_metadata(self):
        by_name = grid_from_tile_name(26, 6)
        self.assertAlmostEqual(by_name.ul_x, self.grid.ul_x, places=2)
        self.assertAlmostEqual(by_name.lr_y, self.grid.lr_y, places=2)

    @unittest.skipUnless(HDF.exists(), "staged MCD64A1 tile not present")
    def test_validator_reads_burned_pixels_with_file_georeferencing(self):
        import validate_mcd64a1 as validator
        pixels = validator._mcd_pixels(HDF)
        near = [(lat, lon) for lat, lon in pixels if abs(lat - 22.463) < 0.05 and abs(lon - 86.849) < 0.05]
        self.assertGreaterEqual(len(near), 10)


if __name__ == "__main__":
    unittest.main()
