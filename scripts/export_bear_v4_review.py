"""Export user-supplied poses for review only; never writes product assets."""
from pathlib import Path
import hashlib
import json

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageSequence
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/pet-generation/bear-sheet-v4.png'
OUT = ROOT / 'docs/product-regression/bear-v4-review'
STATES = ['idle', 'listening', 'thinking', 'comforting', 'encouraging', 'resting']
SIZE = 256


def export():
    OUT.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert('RGBA')
    assert source.size == (1448, 1086)
    a = np.array(source)
    alpha = a[:, :, 3]
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
    sheet = Image.new('RGB', (8 * SIZE, 6 * (SIZE + 34)), '#f4f1eb')
    draw = ImageDraw.Draw(sheet)
    manifest = {'source': str(SOURCE.relative_to(ROOT)),
                'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                'product_updated': False, 'states': {}}
    for row, state in enumerate(STATES):
        poses = []
        crops = []
        for col in range(8):
            # Find the transparent gutter near each nominal row boundary.
            # Several ears extend above their nominal 181px cell.
            x0, x1 = max(0, col * 181 - 9), min(source.width, (col + 1) * 181 + 10)
            def seam(y):
                lo, hi = max(0, y - 12), min(source.height, y + 13)
                counts = (alpha[lo:hi, col*181:(col+1)*181] > 128).sum(axis=1)
                costs = counts + np.abs(np.arange(lo, hi) - y) * .15
                return lo + int(costs.argmin())
            y0 = 0 if row == 0 else seam(row * 181)
            y1 = source.height if row == 5 else seam((row + 1) * 181)
            crop = a[y0:y1, x0:x1].copy()
            labels, count = ndimage.label(crop[:, :, 3] >= 128)
            counts = np.bincount(labels.ravel())
            counts[0] = 0
            main = labels == counts.argmax()
            # Keep the source's antialiased edge, discard detached neighbors.
            keep = ndimage.binary_dilation(main, iterations=2)
            crop[:, :, 3][~keep] = 0
            pose = Image.fromarray(crop)
            # A common scale and source-row origin preserve crouch/jump height.
            # Center the solid torso mass, not the scarf or a raised paw.
            yy, xx = np.nonzero(main)
            low = (yy >= np.quantile(yy, .58)) & (yy <= np.quantile(yy, .88))
            cx = float(np.median(xx[low]))
            factor = 1.12
            pose = pose.resize((round(pose.width * factor), round(pose.height * factor)), Image.Resampling.LANCZOS)
            canvas = Image.new('RGBA', (SIZE, SIZE))
            dx = round(SIZE / 2 - cx * factor)
            dy = round(28 + (y0 - row * 181) * factor)
            canvas.alpha_composite(pose, (dx, dy))
            # Export bitmask transparency for GIF, without blending two poses.
            ca = np.array(canvas)
            ca[:, :, 3] = np.where(ca[:, :, 3] >= 128, 255, 0)
            canvas = Image.fromarray(ca)
            assert canvas.getbbox() is not None
            bbox = canvas.getbbox()
            assert min(bbox[:2]) > 0 and max(bbox[2:]) < SIZE, (state, col, bbox)
            canvas.save(OUT / f'{state}-{col + 1:02d}.png')
            poses.append(canvas)
            crops.append([x0, y0, x1, y1])
            sx, sy = col * SIZE, row * (SIZE + 34)
            sheet.paste(canvas, (sx, sy + 30), canvas)
            label = f'{state} / {col + 1:02d}'
            if state == 'comforting' and col == 4:
                label += ' EXCLUDED'
            draw.text((sx + 8, sy + 6), label, font=font,
                      fill='#be3030' if 'EXCLUDED' in label else '#38332c')
        selected = [i for i in range(8) if not (state == 'comforting' and i == 4)]
        order = selected + selected[-2:0:-1]
        # A single palette across the loop prevents color shimmer.
        atlas = Image.new('RGB', (SIZE * len(selected), SIZE), '#f4f1eb')
        for n, i in enumerate(selected):
            atlas.paste(poses[i].convert('RGB'), (n * SIZE, 0))
        pal = atlas.quantize(colors=255, dither=Image.Dither.NONE)
        palette = pal.getpalette()[:765] + [0, 0, 0]
        pal.putpalette(palette)
        encoded = []
        for i in order:
            p = poses[i].convert('RGB').quantize(palette=pal, dither=Image.Dither.NONE)
            indices = np.array(p)
            indices[np.array(poses[i])[:, :, 3] == 0] = 255
            p = Image.fromarray(indices, 'P')
            p.putpalette(palette)
            p.info['transparency'] = 255
            encoded.append(p)
        duration = 180 if state in ('idle', 'resting') else 150
        gif_path = OUT / f'{state}.gif'
        encoded[0].save(gif_path, save_all=True, append_images=encoded[1:],
                        duration=duration, loop=0, disposal=2, transparency=255,
                        optimize=False)
        with Image.open(gif_path) as check:
            decoded = [f.convert('RGBA').copy() for f in ImageSequence.Iterator(check)]
            assert len(decoded) == len(order)
            assert check.info['loop'] == 0
            assert all(f.getpixel((0, 0))[3] == 0 for f in decoded)
            assert len({hashlib.sha256(f.tobytes()).hexdigest() for f in decoded}) == len(selected)
        # Exact decoded GIF keyframes, to catch GIF disposal/palette problems.
        strip = Image.new('RGB', (SIZE * len(selected), SIZE + 30), '#f4f1eb')
        sd = ImageDraw.Draw(strip)
        for n, i in enumerate(selected):
            strip.paste(decoded[n], (n * SIZE, 30), decoded[n])
            sd.text((n * SIZE + 8, 7), f'{state} / source {i + 1:02d}', font=font, fill='#38332c')
        strip.save(OUT / f'{state}-frames.png')
        manifest['states'][state] = {'keyframes': len(selected), 'loop_frames': len(order),
            'source_columns_1based': [i + 1 for i in selected], 'loop_order_1based': [i + 1 for i in order],
            'frame_duration_ms': duration, 'crops': crops, 'decoded_checks': 'passed'}
    sheet.save(OUT / 'all-48-source-frames.png')
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    export()
