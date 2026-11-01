from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PETS = ("mumu", "bear", "rabbit", "cat", "dog")
STATES = ("idle", "listening", "thinking", "comforting", "encouraging", "resting")
for pet in PETS:
    for state in STATES:
        keyframes = [Image.open(ROOT / "frontend/public/pets" / pet / f"{state}-{i}.png").convert("RGBA") for i in range(8)]
        frames = []
        if pet == "bear":
            # Preserve the bear's clearly authored action poses. Do not blend
            # them into near-identical intermediates; the body-part changes
            # must remain visible during review.
            frames = [frame.copy() for frame in keyframes]
        else:
            for index, current in enumerate(keyframes):
                frames.append(current.copy())
                if index < len(keyframes) - 1:
                    following = keyframes[index + 1]
                    frames.append(Image.blend(current, following, 0.5))
        # Reverse the interior of the same-state sequence so the loop returns
        # smoothly to the first pose instead of jumping from the last pose.
        frames.extend(frame.copy() for frame in reversed(frames[1:-1]))
        frames[0].save(
            ROOT / "frontend/public/pets" / pet / f"{state}.gif",
            save_all=True,
            append_images=frames[1:],
            duration=145 if state not in {"idle", "resting"} else 210,
            loop=0,
            disposal=2,
            transparency=0,
        )
        print(f"built {pet}/{state}.gif: 28 frames (forward + reverse loop)")
