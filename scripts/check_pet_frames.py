"""Run with project-local Pillow: PYTHONPATH=.deps python scripts/check_pet_frames.py."""
from pathlib import Path
from collections import deque
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
STATES = ('idle', 'listening', 'thinking', 'comforting', 'encouraging', 'resting')

def check():
    failures = []
    for state in STATES:
        counts = []
        for frame in range(8):
            path = ROOT / 'frontend/public/pets/mumu' / f'{state}-{frame}.png'
            with Image.open(path) as image:
                alpha = image.convert('RGBA').getchannel('A')
                visible = alpha.point(lambda a: 255 if a > 40 else 0)
                count = visible.histogram()[255]
                counts.append(count)
                if image.size != (192, 171) or count < 1000:
                    failures.append(f'{path.name}: size={image.size}, visible={count}')
                if count:
                    left, top, right, bottom = visible.getbbox()
                    if abs((left + right - 1) / 2 - 95.5) > 1 or bottom != 171:
                        failures.append(f'{path.name}: center/baseline drift')
                    components = _component_sizes(visible)
                    if len(components) > 1 and components[1] > 20:
                        failures.append(f'{path.name}: detached visible fragment ({components[1]} pixels)')
        print(f'{state}: visible pixels {counts}')
    assert not failures, '\n'.join(failures)
    print('PASS: all 48 frames visible, centered, and baseline aligned')

def _component_sizes(mask):
    pixels = mask.load()
    seen = bytearray(mask.width * mask.height)
    sizes = []
    for y in range(mask.height):
        for x in range(mask.width):
            index = y * mask.width + x
            if not pixels[x, y] or seen[index]:
                continue
            seen[index] = 1
            queue = deque([index])
            size = 0
            while queue:
                current = queue.popleft()
                cx, cy = current % mask.width, current // mask.width
                size += 1
                for ny in range(max(0, cy - 1), min(mask.height, cy + 2)):
                    for nx in range(max(0, cx - 1), min(mask.width, cx + 2)):
                        neighbor = ny * mask.width + nx
                        if pixels[nx, ny] and not seen[neighbor]:
                            seen[neighbor] = 1
                            queue.append(neighbor)
            sizes.append(size)
    return sorted(sizes, reverse=True)

if __name__ == '__main__':
    check()
