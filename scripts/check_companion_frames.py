from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
states = ("idle", "listening", "thinking", "comforting", "encouraging", "resting")
failures = []
for pet in ("bear", "cloud", "lamp", "cat", "dog", "rabbit"):
    for state in states:
        for frame in range(8):
            path = ROOT / "frontend/public/pets" / pet / f"{state}-{frame}.png"
            with Image.open(path) as image:
                rgba = image.convert("RGBA")
                alpha = rgba.getchannel("A")
                visible = alpha.point(lambda value: 255 if value > 40 else 0)
                bbox = visible.getbbox()
                if image.size != (192, 171) or not bbox or visible.histogram()[255] < 1000:
                    failures.append(f"{pet}/{state}-{frame}: invalid size or empty frame")
                else:
                    pixels = visible.load()
                    points = [(x, y) for y in range(image.height) for x in range(image.width) if pixels[x, y]]
                    center_x = sum(x for x, _ in points) / len(points)
                    if abs(center_x - 95.5) > 1 or bbox[3] != 171:
                        failures.append(f"{pet}/{state}-{frame}: center/baseline drift {bbox}, centroid={center_x:.2f}")
print(f"checked {6 * 6 * 8} companion frames")
if failures:
    raise SystemExit("\n".join(failures))
print("PASS: all companion frames are visible, centered, and baseline aligned")
