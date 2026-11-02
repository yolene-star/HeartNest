"""Extract atlas poses with a row-local vertical origin, fixed center and baseline."""
from collections import deque
from PIL import Image
from check_pet_frames import ROOT, STATES, check

def extract():
    source = Image.open(ROOT / 'frontend/public/pets/mumu-sprite.png').convert('RGBA')
    output = ROOT / 'frontend/public/pets/mumu'
    for row, state in enumerate(STATES):
        # The source atlas places the raised-arm encouraging poses about 12px
        # above the nominal row boundary. Include that extra headroom, then
        # baseline the extracted pose back into the common 192x171 viewport.
        y0 = row * 171 - (12 if state == 'encouraging' else 0)
        row_height = 183 if state == 'encouraging' else 171
        strip = source.crop((0, y0, source.width, min(y0 + row_height, source.height)))
        alpha = strip.getchannel('A')
        # Locate poses by occupied columns, avoiding irregular atlas cell spacing.
        occupied = [sum(alpha.getpixel((x, y)) > 40 for y in range(strip.height)) > 4
                    for x in range(strip.width)]
        runs = []
        for x, present in enumerate(occupied + [False]):
            if present and (x == 0 or not occupied[x - 1]):
                start = x
            if not present and x and occupied[x - 1]:
                runs.append((start, x))
        assert len(runs) == 8, (state, runs)
        for frame, (left, right) in enumerate(runs):
            # These two raised-arm poses use the full head silhouette; keep a
            # little source margin so antialiased crown pixels are not clipped.
            margin = 12 if state == 'encouraging' and frame in (1, 2) else 0
            left = max(0, left - margin)
            right = min(strip.width, right + margin)
            pose = strip.crop((left, 0, right, strip.height))
            pose = remove_detached_pixels(pose)
            box = pose.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
            assert box is not None
            # Coordinates are local to the cropped row; do not add atlas y0 again.
            canvas = Image.new('RGBA', (192, 171))
            x = (192 - pose.width) // 2
            y = 171 - box[3]
            canvas.paste(pose, (x, y))
            # Quantize every silhouette to the same pixel center; odd-width
            # poses otherwise land one source pixel left after CSS scaling.
            placed = canvas.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
            if placed and (placed[0] + placed[2] - 1) / 2 < 95.5:
                shifted = Image.new('RGBA', (192, 171))
                shifted.paste(canvas, (1, 0))
                canvas = shifted
            canvas.save(output / f'{state}-{frame}.png')
    check()

def remove_detached_pixels(image):
    alpha = image.getchannel('A')
    pixels = alpha.load()
    seen = set()
    components = []
    for y in range(image.height):
        for x in range(image.width):
            if pixels[x, y] <= 40 or (x, y) in seen:
                continue
            seen.add((x, y)); queue = deque([(x, y)]); component = []
            while queue:
                cx, cy = queue.popleft(); component.append((cx, cy))
                for ny in range(max(0, cy - 1), min(image.height, cy + 2)):
                    for nx in range(max(0, cx - 1), min(image.width, cx + 2)):
                        if pixels[nx, ny] > 40 and (nx, ny) not in seen:
                            seen.add((nx, ny)); queue.append((nx, ny))
            components.append(component)
    for component in components:
        if len(component) < 1000:
            for x, y in component:
                image.putpixel((x, y), (*image.getpixel((x, y))[:3], 0))
    return image

if __name__ == '__main__':
    extract()
