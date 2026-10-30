"""Textures for the Blender table: felt artwork, chip faces and edges, tray tubes. Writes into tex/."""
import json, math, os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "tex")
os.makedirs(OUT, exist_ok=True)
L = json.load(open(os.path.join(HERE, "layout.json")))

SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
SERIF_I = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"


def oklch(l, c, h):
    a, b = c * math.cos(math.radians(h)), c * math.sin(math.radians(h))
    l_, m_, s_ = l + 0.3963377774 * a + 0.2158037573 * b, l - 0.1055613458 * a - 0.0638541728 * b, l - 0.0894841775 * a - 1.2914855480 * b
    l3, m3, s3 = l_**3, m_**3, s_**3
    lin = (4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
           -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
           -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3)
    enc = lambda x: 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
    return tuple(max(0, min(255, round(enc(max(0, v)) * 255))) for v in lin)


# Rendered under the pendant the UI palette reads pale, so the clay is a shade deeper.
CHIPS = [tuple(round(v * 0.8) for v in oklch(*c)) for c in L["chips"]]
IVORY = (243, 238, 228)

# ---- Felt: x in [-1, 1] across, y in [-1, 0] from the players' rail to the dealer's edge -------------
FW, FH = 4096, 2048
px = FW / 2


def at(x, y):
    return ((x + 1) * px, -y * px)


def arc_text(img, text, r, font_path, size, color, spacing=0.0):
    """Text along an arc around the dealer's centre, reading upright from the players' side."""
    font = ImageFont.truetype(font_path, round(size * px))
    cx, cy = at(0, 0)
    rr = r * px
    widths = [font.getlength(ch) + spacing * rr for ch in text]
    total = sum(widths)
    angle = math.pi / 2 + total / rr / 2
    for ch, w in zip(text, widths):
        a = angle - w / rr / 2
        tile = Image.new("RGBA", (round(size * px * 2), round(size * px * 2)), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((tile.width / 2, tile.height / 2), ch, font=font, fill=color, anchor="mm")
        tile = tile.rotate(-math.degrees(a - math.pi / 2), resample=Image.BICUBIC, expand=True)
        x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
        img.alpha_composite(tile, (round(x - tile.width / 2), round(y - tile.height / 2)))
        angle -= w / rr


def angles(seats):
    """Where a table's spots sit around the arc, in degrees: spread evenly, seat 1 on the right."""
    lo, hi = L["arc"]
    return [lo + (hi - lo) * i / (seats - 1) for i in range(seats)]


# One felt per table size, its spots spread across the same arc.
for seats in L["seatCounts"]:
    ink = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    d = ImageDraw.Draw(ink)
    GOLD = (232, 206, 146, 255)
    SOFT = (232, 206, 146, 165)
    m = L["markings"]
    arc_text(ink, "BLACKJACK PAYS 3 TO 2", m["pays"], SERIF, 0.044, GOLD, 0.012)
    arc_text(ink, "Dealer must draw to 16 and stand on all 17s", m["rule"], SERIF_I, 0.022, SOFT, 0.004)
    for rr in m["band"]:
        cx, cy = at(0, 0)
        R = rr * px
        d.arc((cx - R, cy - R, cx + R, cy + R), 18, 162, fill=SOFT, width=round(0.0045 * px))
    arc_text(ink, "INSURANCE PAYS 2 TO 1", sum(m["band"]) / 2, SERIF, 0.025, GOLD, 0.02)
    num_font = ImageFont.truetype(SERIF, round(0.032 * px))
    for i, a in enumerate(angles(seats)):
        a = math.radians(a)
        x, y = L["spotRing"] * math.cos(a), -L["spotRing"] * math.sin(a)
        X, Y = at(x, y)
        for R, w, c in ((L["spotOuter"], 0.007, GOLD), (L["spotInner"], 0.003, SOFT)):
            d.ellipse((X - R * px, Y - R * px, X + R * px, Y + R * px), outline=c, width=round(w * px))
        nr = L["spotRing"] - L["spotOuter"] - 0.05
        d.text(at(nr * math.cos(a), -nr * math.sin(a)), str(i + 1), font=num_font, fill=SOFT, anchor="mm")
    ink = ink.filter(ImageFilter.GaussianBlur(0.8))
    felt = Image.new("RGBA", (FW, FH), tuple(L["felt"]) + (255,))
    felt.alpha_composite(ink)
    felt.convert("RGB").save(os.path.join(OUT, f"felt-{seats}.png"))
    ink.split()[3].save(os.path.join(OUT, f"ink-{seats}.png"))


# ---- Chips --------------------------------------------------------------------------------------------
def side(color, chips=1, seed=0):
    """u runs around the chip, v along its edge: six ivory edge spots per chip."""
    W, H = 1024, 48 * chips
    img = Image.new("RGB", (W, H), color)
    g = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    for k in range(chips):
        off = 0 if chips == 1 else rnd.random() * W / 6
        for i in range(6):
            x = off + i * W / 6 + W / 12
            for dx in (0, -W, W):
                g.rectangle((x - 28 + dx, k * 48, x + 28 + dx, k * 48 + 47), fill=IVORY)
        if chips > 1:
            g.rectangle((0, k * 48, W, k * 48 + 2), fill=tuple(round(v * 0.35) for v in color))
    return img


def face(color):
    N = 1024
    mid = N / 2
    img = Image.new("RGB", (N, N), color)
    bump = Image.new("L", (N, N), 128)
    g, b = ImageDraw.Draw(img), ImageDraw.Draw(bump)
    for i in range(6):
        a = math.radians(i * 60 + 30)
        # A rim inlay: a block reaching the edge, lined up with the edge spots.
        tile = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        tg = ImageDraw.Draw(tile)
        tg.rectangle((mid - 30, 0, mid + 30, 118), fill=IVORY + (255,))
        tg.rectangle((mid - 6, 20, mid + 6, 98), fill=tuple(round(v * 0.8) for v in color) + (255,))
        tile = tile.rotate(-math.degrees(a), center=(mid, mid))
        img.paste(tile, (0, 0), tile)
        bt = Image.new("L", (N, N), 0)
        ImageDraw.Draw(bt).rectangle((mid - 30, 0, mid + 30, 118), fill=255)
        bt = bt.rotate(-math.degrees(a), center=(mid, mid))
        bump.paste(150, (0, 0), bt)
    for i in range(48):
        a = 2 * math.pi * i / 48
        r0, r1 = mid * 0.66, mid * 0.66 + 22
        g.line((mid + r0 * math.sin(a), mid - r0 * math.cos(a), mid + r1 * math.sin(a), mid - r1 * math.cos(a)), fill=(246, 240, 228), width=9)
    R = mid * 0.56
    g.ellipse((mid - R, mid - R, mid + R, mid + R), fill=tuple(round(v * 0.86) for v in color), outline=(214, 208, 196), width=5)
    b.ellipse((mid - R, mid - R, mid + R, mid + R), fill=104)
    b.ellipse((mid - R + 3, mid - R + 3, mid + R - 3, mid + R - 3), outline=150, width=4)
    return img, bump.filter(ImageFilter.GaussianBlur(1.5))


for i, c in enumerate(CHIPS):
    side(c).save(os.path.join(OUT, f"chip-side-{i + 1}.png"))
    f, b = face(c)
    f.save(os.path.join(OUT, f"chip-face-{i + 1}.png"))
    b.save(os.path.join(OUT, f"chip-bump-{i + 1}.png"))
    side(c, 16, i).save(os.path.join(OUT, f"tube-{i + 1}.png"))
print("textures", len(os.listdir(OUT)))
