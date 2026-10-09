"""Explicit, uncalibrated WorldCover -> stock Cell2Fire demo mapping."""

WORLDCOVER_TO_CELL2FIRE = {
    10: (182, "tree-covered -> TL2 broadleaf litter proxy"),
    20: (145, "shrubland -> SH5 shrub proxy"),
    30: (101, "grassland -> GR1 grass proxy"),
    40: (93, "cropland -> NB3 nonburnable proxy"),
    50: (91, "built-up -> NB1 nonburnable proxy"),
    60: (99, "bare/sparse -> NB9 nonburnable proxy"),
    70: (92, "snow/ice -> NB2 nonburnable proxy"),
    80: (98, "water -> NB8 nonburnable proxy"),
    90: (99, "herbaceous wetland -> NB9 proxy"),
    95: (182, "mangroves -> TL2 broadleaf litter proxy"),
    100: (101, "moss/lichen -> GR1 grass proxy"),
}

PROXY_STATUS = "UNVALIDATED_DEVELOPMENT_PROXY"
