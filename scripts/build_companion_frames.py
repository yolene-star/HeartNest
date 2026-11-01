from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend/public/pets"
SHEETS = {
    "bear": ROOT / "docs/pet-generation/bear-sheet-v2.png",
    "cloud": ROOT / "docs/pet-generation/cloud-sheet.png",
    "rabbit": ROOT / "docs/pet-generation/rabbit-sheet.png",
    "lamp": ROOT / "docs/pet-generation/lamp-sheet.png",
    "cat": ROOT / "docs/pet-generation/cat-sheet.png",
    "dog": ROOT / "docs/pet-generation/dog-sheet.png",
}
STATES = ("idle", "listening", "thinking", "comforting", "encouraging", "resting")


def make_frame(source: Image.Image, frame: int, strict_subject: bool = False, motion_gain: float = 1.0) -> Image.Image:
    source = source.convert("RGBA")
    # Remove checkerboard pixels that some generated sheets include as an
    # opaque transparency preview. Flood only boundary-connected near-gray
    # pixels so the rabbit's warm white fur remains intact.
    pixels = source.load()
    sw, sh = source.size
    from collections import deque
    queue = deque()
    removed = set()
    def checker(x, y):
        r, g, b, a = pixels[x, y]
        return a > 0 and max(r, g, b) - min(r, g, b) <= 8 and 150 <= (r + g + b) / 3 <= 255
    for x in range(sw):
        for y in (0, sh - 1):
            if checker(x, y): removed.add((x, y)); queue.append((x, y))
    for y in range(sh):
        for x in (0, sw - 1):
            if checker(x, y) and (x, y) not in removed: removed.add((x, y)); queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1),(x-1,y-1),(x+1,y-1),(x-1,y+1),(x+1,y+1)):
            if 0 <= nx < sw and 0 <= ny < sh and (nx, ny) not in removed and checker(nx, ny):
                removed.add((nx, ny)); queue.append((nx, ny))
    for x, y in removed:
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
    # Some checkerboard tiles are enclosed by the generated subject and are
    # therefore not boundary-connected. Their neutral mid-gray range is
    # distinct from the rabbit's warm cream fur, so clear those pixels too.
    for y in range(sh):
        for x in range(sw):
            r, g, b, a = pixels[x, y]
            if a and max(r, g, b) - min(r, g, b) <= 5 and 175 <= (r + g + b) / 3 <= 230:
                pixels[x, y] = (r, g, b, 0)
    alpha = source.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        raise ValueError("generated panel has no visible pixels")
    source = source.crop(bbox)
    # Keep the generated pose intact while giving each state a subtle, repeatable motion.
    # Exaggerated motion keeps the eight frames visibly distinct at UI size.
    scale_steps = tuple(value * motion_gain for value in (0.0, 0.025, 0.045, 0.030, 0.010, -0.025, -0.045, -0.020))
    scale = 1.0 + scale_steps[frame]
    width = max(1, round(source.width * scale))
    height = max(1, round(source.height * scale))
    source = source.resize((width, height), Image.Resampling.LANCZOS)
    # Keep generated silhouettes clean. Per-state authored poses provide the
    # meaningful body-part movement; rotation is disabled to avoid exposing
    # checkerboard remnants at the rotated corners.
    rotation_steps = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    source = source.rotate(rotation_steps[frame], resample=Image.Resampling.BICUBIC, expand=True)
    post_alpha = source.getchannel("A")
    post_bbox = post_alpha.getbbox()
    if post_bbox:
        source = source.crop(post_bbox)
    source.thumbnail((184, 164), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (192, 171), (0, 0, 0, 0))
    left = (192 - source.width) // 2
    top = 171 - source.height
    canvas.alpha_composite(source, (left, top))
    visible = canvas.getchannel("A").point(lambda value: 255 if value > 40 else 0)
    bbox = visible.getbbox()
    if bbox:
        alpha_pixels = visible.load()
        points = [(x, y) for y in range(canvas.height) for x in range(canvas.width) if alpha_pixels[x, y]]
        center_x = sum(x for x, _ in points) / len(points)
        dx = round(95.5 - center_x)
        dy = 171 - bbox[3]
        aligned = Image.new("RGBA", (192, 171), (0, 0, 0, 0))
        aligned.alpha_composite(canvas, (dx, dy))
        # Generated reference sheets can contain a checkerboard preview baked
        # into the transparent area. Remove low-opacity resampling residue so
        # that the browser never displays the checkerboard as a visible halo.
        alpha = aligned.getchannel("A")
        alpha = alpha.point(lambda value: 0 if value < 128 else value)
        aligned.putalpha(alpha)
        final_visible = aligned.getchannel("A").point(lambda value: 255 if value > 40 else 0)
        final_bbox = final_visible.getbbox()
        if final_bbox:
            final_dx = round(95.5 - (final_bbox[0] + final_bbox[2] - 1) / 2)
            final_dy = 171 - final_bbox[3]
            if final_dx or final_dy:
                recentered = Image.new("RGBA", (192, 171), (0, 0, 0, 0))
                recentered.alpha_composite(aligned, (final_dx, final_dy))
                aligned = recentered
        # Remove detached motion marks and ghost fragments outside the main
        # character silhouette. Keep the main connected component plus any
        # substantial accessory component; tiny components are artifacts.
        alpha_mask = aligned.getchannel("A").point(lambda value: 255 if value > 40 else 0)
        mask_pixels = alpha_mask.load()
        seen = set(); components = []
        for yy in range(aligned.height):
            for xx in range(aligned.width):
                if mask_pixels[xx, yy] and (xx, yy) not in seen:
                    stack = [(xx, yy)]; seen.add((xx, yy)); comp = []
                    while stack:
                        cx, cy = stack.pop(); comp.append((cx, cy))
                        for nx, ny in ((cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1)):
                            if 0 <= nx < aligned.width and 0 <= ny < aligned.height and mask_pixels[nx, ny] and (nx, ny) not in seen:
                                seen.add((nx, ny)); stack.append((nx, ny))
                    components.append(comp)
        if strict_subject and components:
            largest = max(components, key=len)
            keep = set(largest)
        else:
            keep = {point for comp in components if len(comp) >= 20 for point in comp}
        cleaned = aligned.copy()
        cleaned_alpha = cleaned.getchannel("A")
        for yy in range(aligned.height):
            for xx in range(aligned.width):
                if mask_pixels[xx, yy] and (xx, yy) not in keep:
                    cleaned_alpha.putpixel((xx, yy), 0)
        cleaned.putalpha(cleaned_alpha)
        cleaned_bbox = cleaned_alpha.point(lambda value: 255 if value > 40 else 0).getbbox()
        if cleaned_bbox:
            shift_x = round(95.5 - (cleaned_bbox[0] + cleaned_bbox[2] - 1) / 2)
            shift_y = 171 - cleaned_bbox[3]
            reanchored = Image.new("RGBA", (192, 171), (0, 0, 0, 0))
            reanchored.alpha_composite(cleaned, (shift_x, shift_y))
            aligned = reanchored
        else:
            aligned = cleaned
        return aligned
    return canvas


def build(pet: str, sheet_path: Path):
    sheet = Image.open(sheet_path).convert("RGBA")
    grid_cols, grid_rows = (8, 6) if pet == "bear" and sheet.width >= 1400 else (3, 2)
    panel_w, panel_h = sheet.width // grid_cols, sheet.height // grid_rows
    target = OUT / pet
    target.mkdir(parents=True, exist_ok=True)
    for state_index, state in enumerate(STATES):
        row = state_index
        for frame in range(8):
            col = frame if grid_cols == 8 else state_index % 3
            source_row = row if grid_cols == 8 else state_index // 3
            panel = sheet.crop((col * panel_w, source_row * panel_h, (col + 1) * panel_w, (source_row + 1) * panel_h))
            strict = pet == "bear" or (pet == "cat" and state == "encouraging") or (pet == "dog" and state == "resting")
            gain = 1.8 if pet == "bear" else 1.0
            make_frame(panel, frame, strict_subject=strict, motion_gain=gain).save(target / f"{state}-{frame}.png")


for pet, sheet in SHEETS.items():
    build(pet, sheet)
    print(f"built {pet}: 48 frames")
