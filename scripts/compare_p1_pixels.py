#!/usr/bin/env python3
"""Exact RGBA pixel comparison, including alpha; requires Pillow."""
import csv
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "docs/verification/p1"


def main():
    failed = False
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / "pixels.csv").open("w", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(["image", "different_pixels", "total_pixels", "difference_ratio", "status"])
        for page in ("home", "projects", "services", "dbs"):
            for width in (390, 1280):
                for scheme in ("light", "dark"):
                    name = f"{page}-{width}-{scheme}.png"
                    paths = [ROOT / phase / name for phase in ("before", "after")]
                    if not all(path.is_file() for path in paths):
                        row = [name, "", "", "", "missing screenshots"]
                        failed = True
                    else:
                        with Image.open(paths[0]) as first, Image.open(paths[1]) as second:
                            a, b = first.convert("RGBA"), second.convert("RGBA")
                            if a.size != b.size:
                                row = [name, "", "", "", "size mismatch"]
                                failed = True
                            else:
                                different = sum(x != y for x, y in zip(a.getdata(), b.getdata()))
                                total = a.width * a.height
                                row = [name, different, total, f"{different / total:.12f}", "different" if different else "identical"]
                                failed |= different != 0
                    writer.writerow(row)
                    print(",".join(map(str, row)))
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())
