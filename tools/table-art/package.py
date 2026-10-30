"""Puts the rendered table into the apps: WebP images, their metadata, and the phone's image list.

python3 package.py [render dir, default here]   (after scene.py has written out/ and chips/)
"""
import json, os, sys

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else HERE
ART = os.path.join(ROOT, "packages", "client-runtime", "table-art")
META = os.path.join(ROOT, "packages", "client-runtime", "src", "tableArt.ts")
PHONE = os.path.join(ROOT, "apps", "mobile", "src", "features", "tableImages.ts")
WIDTH = 1170  # A 390-point phone at 3x.
CHIP_WIDTH = 220
SHADOW = 0.5  # How much of the floor shadow to keep.
FADE = 0.05  # How far in from each edge the frame fades out, as a fraction of its size.

meta = json.load(open(os.path.join(SRC, "out", "meta.json")))
chips = json.load(open(os.path.join(SRC, "chips", "chips.json")))
count = len(meta["elevations"])
os.makedirs(ART, exist_ok=True)
for name in os.listdir(ART):
    os.remove(os.path.join(ART, name))


def save(image, name, quality):
    image.save(os.path.join(ART, name), "WEBP", quality=quality, method=6)


def settle(image):
    """Fits a frame onto any page, light or dark: the floor shadow is lightened (the table's own
    edges are left alone), and everything fades out toward the frame's edges, so no shadow ends
    in a hard line where the frame was cropped."""
    alpha = np.asarray(image.getchannel("A"), dtype=np.float32)
    table = image.getchannel("A").point(lambda v: 255 if v >= 250 else 0).filter(ImageFilter.MaxFilter(5))
    shadow = np.asarray(table, dtype=np.float32) == 0
    alpha = np.where(shadow, alpha * SHADOW, alpha)
    h, w = alpha.shape
    ramp = lambda n, edge: np.clip(np.minimum(np.arange(n), np.arange(n)[::-1]) / (n * edge), 0, 1)
    alpha *= np.outer(ramp(h, FADE), ramp(w, FADE))
    out = image.copy()
    out.putalpha(Image.fromarray(alpha.round().astype(np.uint8)))
    return out


def solid(alpha, threshold):
    return alpha.point(lambda v: 255 if v > threshold else 0).getbbox()


tables = [Image.open(os.path.join(SRC, "out", f"table-{i:02d}.png")).convert("RGBA") for i in range(count)]
rails = [Image.open(os.path.join(SRC, "out", f"rail-{i:04d}.png")).convert("RGBA") for i in range(count)]
W, H = tables[0].size
# One crop for every frame, so the table holds still as the camera moves. The shadow catcher's
# faint edges don't count.
boxes = [solid(t.split()[3], 40) for t in tables]
pad = 12
x0, y0 = max(0, min(b[0] for b in boxes) - pad), max(0, min(b[1] for b in boxes) - pad)
x1, y1 = min(W, max(b[2] for b in boxes) + pad), min(H, max(b[3] for b in boxes) + pad)
cw, ch = x1 - x0, y1 - y0
size = (WIDTH, round(ch * WIDTH / cw))
fx = lambda v: round((v * W - x0) / cw, 4)
fy = lambda v: round((v * H - y0) / ch, 4)
frames = []
for i in range(count):
    anchors = meta["anchors"][str(i)]
    save(settle(tables[i].crop((x0, y0, x1, y1)).resize(size, Image.LANCZOS)), f"frame-{i:02d}.webp", 84)
    # The rail layer only ships for angles where it covers a seat or a stack.
    alpha = rails[i].split()[3]
    covers = any(
        alpha.crop((round(a[x] * W - a[r] * W * 1.3), round(a[y] * H - a[r] * W * 1.3),
                    round(a[x] * W + a[r] * W * 1.3), round(a[y] * H + a[r] * W * 0.6))).getextrema()[1] > 24
        for a in anchors
        for x, y, r in (("x", "y", "r"), ("bx", "by", "br"))
    )
    if covers:
        save(rails[i].crop((x0, y0, x1, y1)).resize(size, Image.LANCZOS), f"rail-{i:02d}.webp", 80)
    frames.append({
        "rail": covers,
        "seats": [
            {"x": fx(a["x"]), "y": fy(a["y"]), "r": round(a["r"] * W / cw, 4), "e": round(a["e"], 1),
             "bx": fx(a["bx"]), "by": fy(a["by"]), "br": round(a["br"] * W / cw, 4), "be": round(a["be"], 1)}
            for a in anchors
        ],
    })

sprites = {}
for level in chips["levels"]:
    c = chips["chips"][str(level)]
    S = c["size"]
    images = [Image.open(os.path.join(SRC, "chips", f"chip-{level}-{n}.png")).convert("RGBA") for n in range(1, 9)]
    bs = [solid(im.split()[3], 4) for im in images]
    box = (min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs))
    bw, bh = box[2] - box[0], box[3] - box[1]
    for n, im in enumerate(images, 1):
        save(im.crop(box).resize((CHIP_WIDTH, round(CHIP_WIDTH * bh / bw)), Image.LANCZOS), f"chip-{level}-{n}.webp", 88)
    sprites[level] = {
        "ox": round((c["base"][0] * S - box[0]) / bw, 4),
        "oy": round((c["base"][1] * S - box[1]) / bh, 4),
        "k": round(bw / (c["diameter"] * S), 4),
        "aspect": round(bh / bw, 4),
    }

art = {
    "aspect": round(cw / ch, 4),
    "elevations": [round(e, 3) for e in meta["elevations"]],
    "chipLevels": chips["levels"],
    "frames": frames,
    "chips": {str(k): v for k, v in sprites.items()},
}
with open(META, "w") as f:
    f.write("// Generated by tools/table-art/package.py from the Blender render. Don't edit by hand.\n")
    f.write('import type { TableArt } from "./table.ts";\n\n')
    f.write(f"export const blackjackArt: TableArt = {json.dumps(art)};\n")

# Metro only bundles images it can see in a literal require(), so the phone gets a list.
rel = os.path.relpath(ART, os.path.dirname(PHONE))
with open(PHONE, "w") as f:
    f.write("// Generated by tools/table-art/package.py. Don't edit by hand.\n")
    f.write("// The phone uses every other camera angle, which halves the images it keeps in memory.\n")
    f.write("export const frameImages: Record<number, number> = {\n")
    for i in range(0, count, 2):
        f.write(f'  {i}: require("{rel}/frame-{i:02d}.webp"),\n')
    f.write("};\n\nexport const railImages: Record<number, number> = {\n")
    for i in range(0, count, 2):
        if frames[i]["rail"]:
            f.write(f'  {i}: require("{rel}/rail-{i:02d}.webp"),\n')
    f.write("};\n\nexport const chipImages: Record<number, ReadonlyArray<number>> = {\n")
    for level in chips["levels"]:
        f.write(f"  {level}: [\n")
        for n in range(1, 9):
            f.write(f'    require("{rel}/chip-{level}-{n}.webp"),\n')
        f.write("  ],\n")
    f.write("};\n")
total = sum(os.path.getsize(os.path.join(ART, n)) for n in os.listdir(ART))
print(f"{len(os.listdir(ART))} images, {total // 1024} KB; rail frames {[i for i, f in enumerate(frames) if f['rail']]}")
