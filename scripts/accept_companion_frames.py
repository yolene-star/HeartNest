from pathlib import Path
from PIL import Image
import hashlib

ROOT = Path(__file__).resolve().parents[1]
PETS = ("mumu", "bear", "rabbit", "cat", "dog")
STATES = ("idle", "listening", "thinking", "comforting", "encouraging", "resting")
failures = []
accepted = 0

for pet in PETS:
    for state in STATES:
        hashes = set()
        for frame in range(8):
            path = ROOT / "frontend/public/pets" / pet / f"{state}-{frame}.png"
            if not path.exists():
                failures.append(f"missing: {pet}/{state}-{frame}")
                continue
            with Image.open(path) as image:
                rgba = image.convert("RGBA")
                if rgba.size != (192, 171):
                    failures.append(f"size: {pet}/{state}-{frame} {rgba.size}")
                alpha = rgba.getchannel("A")
                visible = alpha.point(lambda value: 255 if value > 40 else 0)
                bbox = visible.getbbox()
                if not bbox or visible.histogram()[255] < 1000:
                    failures.append(f"empty: {pet}/{state}-{frame}")
                else:
                    bbox_center = (bbox[0] + bbox[2] - 1) / 2
                    if abs(bbox_center - 95.5) > 1.5 or bbox[3] < 170:
                        failures.append(f"anchor: {pet}/{state}-{frame} center={bbox_center:.2f} bbox={bbox}")
                # Transparent corners catch accidentally baked checkerboards.
                if any(alpha.getpixel(point) != 0 for point in ((0, 0), (191, 0), (0, 170), (191, 170))):
                    failures.append(f"background: {pet}/{state}-{frame}")
                hashes.add(hashlib.sha1(path.read_bytes()).hexdigest())
                accepted += 1
        if len(hashes) < 8:
            failures.append(f"duplicate frames: {pet}/{state} unique={len(hashes)}/8")

print(f"accepted {accepted}/240 companion frames")
if failures:
    print("FAIL: frame acceptance failed")
    raise SystemExit("\n".join(failures))
print("PASS: all frames meet product acceptance gates")
