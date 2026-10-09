"""Export a compact Bar v3 replay bundle without modifying the research tree."""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Transformer


def export(research: Path, output: Path) -> None:
    table = pd.read_pickle(research / 'outputs/reproduction/features/model_table.pkl')
    centers = pd.read_csv(research / 'proposed/imagery/cells_in_rows.csv', usecols=['cell', 'cx', 'cy', 'state'])
    transformer = Transformer.from_crs('EPSG:6933', 'EPSG:4326', always_xy=True)
    centers['lon'], centers['lat'] = transformer.transform(centers['cx'].to_numpy(), centers['cy'].to_numpy())
    output.mkdir(parents=True, exist_ok=True)
    for year in (2023, 2024):
        archive = np.load(research / f'proposed/results/bar3_deployable_{year}_predictions.npz', allow_pickle=False)
        rows = table.iloc[archive['val_idx']][['cell', 'day', 'state']].copy()
        rows['p_bagged'] = archive['p_bagged']
        rows = rows[rows['state'].isin({'OD', 'CG', 'TS', 'MP', 'MH', 'JH'})]
        np.savez_compressed(output / f'bar3_replay_{year}.npz', cell=rows.cell.to_numpy('int64'), day=rows.day.to_numpy('int32'), state=rows.state.to_numpy('U2'), p_bagged=rows.p_bagged.to_numpy('float32'))
    centers.to_csv(output / 'cell_centers.csv', index=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--research', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    export(args.research, args.output)
    print(f'Exported 2023/2024 replay bundle to {args.output}')
