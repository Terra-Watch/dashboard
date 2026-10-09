"""Export the checked Cell2Fire benchmark as browser frames."""
from pathlib import Path
import csv
from PIL import Image

SOURCE = Path('/Users/kireeti/Desktop/Projects/wild-fire-simulation/experiments/non_saturating_benchmark/rothermel/Grids/Grids1')
DEST = Path(__file__).resolve().parents[2] / 'frontend/public/simulation/similipal-demo'
COLORS = {0: (0, 0, 0, 0), 1: (176, 24, 58, 210)}

def export() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    for index, source in enumerate(sorted(SOURCE.glob('ForestGrid*.csv'))):
        with source.open(newline='') as handle:
            grid = [[int(value) for value in row] for row in csv.reader(handle) if row]
        image = Image.new('RGBA', (len(grid[0]), len(grid)), (0, 0, 0, 0))
        image.putdata([COLORS.get(value, (0, 0, 0, 0)) for row in grid for value in row])
        image.save(DEST / f'frame-{index:02d}.png', optimize=True)
    (DEST / 'manifest.json').write_text('{"scenario_id":"similipal-development-benchmark","location":{"latitude":21.62,"longitude":86.30},"grid":{"rows":40,"columns":40},"frame_count":4,"source_date":"2024-01-01","status":"development_demo","georeferenced":false,"disclaimer":"Synthetic Cell2Fire benchmark overlay; not calibrated for Indian field operations."}\n')

if __name__ == '__main__':
    export()
