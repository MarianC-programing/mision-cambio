#!/usr/bin/env python3
"""
Genera el arte pixel-art de la landing y los derivados del logo.

    python3 scripts/make-art.py        (requiere Pillow)

Entradas : public/mision-cambio.svg   (el logo de las llaves)
Salidas  : public/llaves-blanco.png, favicon.png, apple-touch-icon.png
           public/art/hero.png, doors.png, card-*.png
"""
import base64
import io
import math
import random
import re
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
ART = PUB / 'art'
ART.mkdir(parents=True, exist_ok=True)

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)) + (255,)


def shade(c, k):
    return (int(c[0] * k), int(c[1] * k), int(c[2] * k), 255)


def bayer(x, y):
    return (BAYER[y % 4][x % 4] + 0.5) / 16


# --------------------------------------------------------------------------
# Logo (las llaves) -> silueta blanca + favicons
# --------------------------------------------------------------------------
def build_logo():
    svg = (PUB / 'mision-cambio.svg').read_text()
    imgs = re.findall(r'data:image/png;base64,([A-Za-z0-9+/=]+)', svg)
    # La primera imagen del SVG es la máscara (blanco = llaves).
    mask = Image.open(io.BytesIO(base64.b64decode(imgs[0]))).convert('L')
    box = mask.point(lambda v: 255 if v > 8 else 0).getbbox()
    mask = mask.crop(box)
    w, h = mask.size
    s = max(w, h)
    pad = int(s * 0.04)
    side = s + 2 * pad

    def render(color, size):
        canvas = Image.new('L', (side, side), 0)
        canvas.paste(mask, ((side - w) // 2, (side - h) // 2))
        out = Image.new('RGBA', (side, side), color + (0,))
        out.putalpha(canvas)
        return out.resize((size, size), Image.LANCZOS)

    render((255, 255, 255), 256).save(PUB / 'llaves-blanco.png', optimize=True)

    def tile(size):
        bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(bg).rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 4, fill=(10, 10, 10, 255))
        k = render((255, 255, 255), int(size * 0.72))
        bg.alpha_composite(k, ((size - k.width) // 2, (size - k.height) // 2))
        return bg

    tile(64).save(PUB / 'favicon.png', optimize=True)
    tile(180).save(PUB / 'apple-touch-icon.png', optimize=True)


# --------------------------------------------------------------------------
# Helpers de escena
# --------------------------------------------------------------------------
def brick_wall(img, box, base, hi, lo, mortar, seed=1, bw=16, bh=8):
    d = ImageDraw.Draw(img)
    r = random.Random(seed)
    x0, y0, x1, y1 = box
    row = 0
    for y in range(y0, y1, bh):
        off = (bw // 2) if row % 2 else 0
        for x in range(x0 - off, x1, bw):
            t = r.random()
            col = base if t < 0.6 else (hi if t < 0.82 else lo)
            xa, xb = max(x, x0), min(x + bw - 1, x1 - 1)
            yb = min(y + bh - 1, y1 - 1)
            d.rectangle((xa, y, xb, yb), fill=col)
            d.line((xa, yb, xb, yb), fill=mortar)
            if x >= x0:
                d.line((x, y, x, yb), fill=mortar)
        row += 1


def vignette(img, strength=0.7, levels=5):
    w, h = img.size
    px = img.load()
    cx, cy = w / 2, h / 2
    for y in range(h):
        for x in range(w):
            dx, dy = (x - cx) / cx, (y - cy) / cy
            f = min(1.0, dx * dx * 0.85 + dy * dy * 0.75)
            v = f * strength * levels
            b = int(v)
            if v - b > bayer(x, y):
                b += 1
            k = max(0.25, 1 - b / levels)
            r, g, bl = px[x, y][:3]
            px[x, y] = (int(r * k), int(g * k), int(bl * k))


def glow(img, cx, cy, radius, color, strength=0.6):
    w, h = img.size
    px = img.load()
    for y in range(max(0, int(cy - radius)), min(h, int(cy + radius) + 1)):
        for x in range(max(0, int(cx - radius)), min(w, int(cx + radius) + 1)):
            dist = math.hypot(x - cx, y - cy)
            if dist >= radius:
                continue
            inten = (1 - dist / radius) ** 1.4 * strength
            lv = 4
            v = inten * lv
            b = int(v)
            if v - b > bayer(x, y):
                b += 1
            if b <= 0:
                continue
            t = min(1.0, b / lv)
            r, g, bl = px[x, y][:3]
            px[x, y] = mix((r, g, bl), color, t * 0.85)[:3]


def sprite(d, rows, x, y, palette, s=1):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in palette:
                d.rectangle((x + i * s, y + j * s, x + i * s + s - 1, y + j * s + s - 1), fill=palette[ch])


FLAME = [
    "..o..",
    ".ooo.",
    ".ooo.",
    "ooyoo",
    "ooyyo",
    ".oyo.",
    ".ooo.",
    "..o..",
]
KEY = [
    ".###.",
    "#...#",
    "#...#",
    ".###.",
    "..#..",
    "..#..",
    "..##.",
    "..#..",
    "..##.",
]
DIGITS = {
    '0': ["###", "#.#", "#.#", "#.#", "###"],
    '1': [".#.", "##.", ".#.", ".#.", "###"],
    '2': ["###", "..#", "###", "#..", "###"],
    '3': ["###", "..#", "###", "..#", "###"],
    '4': ["#.#", "#.#", "###", "..#", "..#"],
    '5': ["###", "#..", "###", "..#", "###"],
    '6': ["###", "#..", "###", "#.#", "###"],
    '7': ["###", "..#", "..#", ".#.", ".#."],
    '8': ["###", "#.#", "###", "#.#", "###"],
    '9': ["###", "#.#", "###", "..#", "###"],
}


def number(d, text, x, y, color):
    for ch in text:
        sprite(d, DIGITS[ch], x, y, {'#': color})
        x += 4


def torch(img, x, y):
    d = ImageDraw.Draw(img, 'RGBA')
    glow(img, x + 2, y + 3, 46, hexc('#ff7a1a'), 0.55)
    d = ImageDraw.Draw(img, 'RGBA')
    d.rectangle((x, y + 8, x + 4, y + 10), fill=hexc('#3a2a20'))
    d.rectangle((x + 1, y + 10, x + 3, y + 16), fill=hexc('#5a3d2b'))
    sprite(d, FLAME, x, y, {'o': hexc('#ff6a13'), 'y': hexc('#ffe36b')})


def arch_door(img, cx, top, bottom, w, wood, band, frame, seed=3):
    """Puerta con arco: marco de piedra, tablones, bandas de hierro y cerradura."""
    W, H = img.size
    d = ImageDraw.Draw(img, 'RGBA')
    x0, x1 = cx - w // 2, cx + w // 2
    r = w // 2
    d.ellipse((x0 - 4, top - 4, x1 + 4, top + 2 * r + 4), fill=frame)
    d.rectangle((x0 - 4, top + r, x1 + 4, bottom), fill=frame)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rectangle((x0, top, x1, bottom), fill=wood)
    for x in range(x0, x1 + 1, 6):
        ld.line((x, top, x, bottom), fill=shade(wood, 0.72))
        ld.line((x + 1, top, x + 1, bottom), fill=shade(wood, 1.12))
    for yy in (top + r + 6, bottom - 14):
        ld.rectangle((x0, yy, x1, yy + 3), fill=band)
        for x in range(x0 + 3, x1, 9):
            ld.point((x, yy + 1), fill=(200, 200, 210, 255))
    mask = Image.new('L', (W, H), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse((x0, top, x1, top + 2 * r), fill=255)
    md.rectangle((x0, top + r, x1, bottom), fill=255)
    img.paste(layer, (0, 0), mask)


def lock_plate(img, cx, cy, lime):
    d = ImageDraw.Draw(img, 'RGBA')
    d.rectangle((cx - 6, cy - 8, cx + 6, cy + 8), fill=hexc('#15131f'))
    d.rectangle((cx - 5, cy - 7, cx + 5, cy + 7), outline=hexc('#3b3550'))
    d.ellipse((cx - 3, cy - 5, cx + 3, cy + 1), fill=lime)
    d.polygon([(cx - 1, cy), (cx + 1, cy), (cx + 3, cy + 6), (cx - 3, cy + 6)], fill=lime)


def person(img, x, yb, hood, hair):
    d = ImageDraw.Draw(img, 'RGBA')
    d.ellipse((x - 2, yb - 2, x + 13, yb + 2), fill=(0, 0, 0, 110))
    leg = hexc('#1b1830')
    d.rectangle((x + 2, yb - 6, x + 4, yb), fill=leg)
    d.rectangle((x + 7, yb - 6, x + 9, yb), fill=leg)
    d.rectangle((x, yb - 16, x + 11, yb - 6), fill=hood)
    d.rectangle((x, yb - 16, x + 1, yb - 6), fill=shade(hood, 0.7))
    d.rectangle((x + 10, yb - 16, x + 11, yb - 6), fill=shade(hood, 1.15))
    d.rectangle((x - 1, yb - 14, x, yb - 8), fill=shade(hood, 0.8))
    d.rectangle((x + 12, yb - 14, x + 13, yb - 8), fill=shade(hood, 0.8))
    d.rectangle((x + 3, yb - 18, x + 8, yb - 16), fill=hexc('#e0ac84'))
    d.rectangle((x + 2, yb - 24, x + 9, yb - 17), fill=hair)
    d.rectangle((x + 2, yb - 24, x + 9, yb - 23), fill=shade(hair, 1.35))


# --------------------------------------------------------------------------
# HERO 320x180
# --------------------------------------------------------------------------
def build_hero():
    W, H = 320, 180
    img = Image.new('RGB', (W, H), hexc('#1a1433')[:3])
    brick_wall(img, (0, 0, W, 140), hexc('#2b2350')[:3], hexc('#352b63')[:3], hexc('#221b43')[:3], hexc('#150f2c')[:3], seed=7)
    d = ImageDraw.Draw(img, 'RGBA')

    # suelo
    d.rectangle((0, 140, W, H), fill=hexc('#241c47'))
    vp = (W / 2, 104)
    for xi in range(-260, W + 260, 30):
        x_top = vp[0] + (xi - vp[0]) * (140 - vp[1]) / (H - vp[1])
        d.line((x_top, 140, xi, H), fill=hexc('#171031'))
    for y in (140, 146, 154, 165, 179):
        d.line((0, y, W, y), fill=hexc('#171031'))
    d.rectangle((0, 140, W, 141), fill=hexc('#3a2f6b'))

    # luz que escapa por la puerta
    glow(img, 160, 92, 84, hexc('#ff7a1a'), 0.55)
    d = ImageDraw.Draw(img, 'RGBA')
    for y in range(141, H):
        half = 30 + (y - 141) * 1.1
        for x in range(int(160 - half), int(160 + half)):
            f = 1 - (y - 141) / 40
            if 0 <= x < W and f > 0 and f * (1 - abs(x - 160) / half) > bayer(x, y) * 0.7:
                d.point((x, y), fill=hexc('#ffb347', 150))

    # pilares y antorchas
    for px in (30, 266):
        d.rectangle((px, 0, px + 24, 140), fill=hexc('#3a3070'))
        d.rectangle((px, 0, px + 3, 140), fill=hexc('#241c47'))
        d.rectangle((px + 21, 0, px + 24, 140), fill=hexc('#4a3f8a'))
        for yy in range(6, 140, 14):
            d.line((px, yy, px + 24, yy), fill=hexc('#2a2258'))
        d.rectangle((px - 3, 0, px + 27, 6), fill=hexc('#4a3f8a'))
        d.rectangle((px - 3, 134, px + 27, 140), fill=hexc('#4a3f8a'))
    torch(img, 38, 52)
    torch(img, 276, 52)

    # puerta principal
    arch_door(img, 160, 38, 140, 64, hexc('#d9480f'), hexc('#18141f'), hexc('#4a3f8a'))
    lock_plate(img, 160, 92, hexc('#d7f36a'))
    d = ImageDraw.Draw(img, 'RGBA')

    # equipo: cuatro siluetas de espaldas
    team = [(100, '#f72585', '#2a1020'), (124, '#3158f5', '#101a33'), (196, '#22c55e', '#3a2a14'), (220, '#ffd51a', '#2a2412')]
    for i, (x, hood, hair) in enumerate(team):
        person(img, x, 160 + (i % 2) * 4, hexc(hood), hexc(hair))
        d = ImageDraw.Draw(img, 'RGBA')
        kx, ky = x + 3, 112 + (i % 2) * 6
        sprite(d, KEY, kx, ky, {'#': hexc(hood)}, 1)
        d.point((kx + 1, ky + 1), fill=(255, 255, 255, 220))

    # motas de polvo
    r = random.Random(11)
    for _ in range(70):
        x, y = r.randrange(W), r.randrange(0, 150)
        col = hexc('#d7f36a', 190) if r.random() < 0.25 else (255, 255, 255, 120)
        d.point((x, y), fill=col)

    vignette(img, 0.85, 5)
    img.save(ART / 'hero.png', optimize=True)


# --------------------------------------------------------------------------
# LAS 10 PUERTAS 320x180 (marco de medios)
# --------------------------------------------------------------------------
def build_doors():
    W, H = 320, 180
    img = Image.new('RGB', (W, H), hexc('#0f0b22')[:3])
    brick_wall(img, (0, 0, W, 138), hexc('#201a45')[:3], hexc('#2a2257')[:3], hexc('#191338')[:3], hexc('#100b25')[:3], seed=21)
    d = ImageDraw.Draw(img, 'RGBA')
    d.rectangle((0, 138, W, H), fill=hexc('#1c1540'))
    for y in (138, 146, 157, 170):
        d.line((0, y, W, y), fill=hexc('#120d2c'))
    for xi in range(-200, W + 200, 28):
        d.line((W / 2 + (xi - W / 2) * 0.3, 138, xi, H), fill=hexc('#120d2c'))

    colors = ['#f72585', '#ff6b16', '#ffd51a', '#22c55e', '#16c6e8', '#3158f5', '#8337ed', '#f472b6', '#14b8a6', '#ff2e2e']
    for i, col in enumerate(colors):
        cx = 18 + i * 31
        last = i == 9
        glow(img, cx, 100, 40 if last else 26, hexc(col), 0.7 if last else 0.4)
        arch_door(img, cx, 76, 138, 22, hexc(col), hexc('#14101f'), hexc('#3a3070'))
        d = ImageDraw.Draw(img, 'RGBA')
        d.rectangle((cx - 8, 62, cx + 8, 70), fill=hexc('#0e0a1f'))
        d.rectangle((cx - 8, 62, cx + 8, 70), outline=hexc('#3a3070'))
        txt = str(i + 1)
        number(d, txt, cx - (len(txt) * 4 - 1) // 2, 63, (255, 255, 255, 255) if not last else hexc('#ff5c5c'))
        d.ellipse((cx + 3, 112, cx + 5, 114), fill=hexc('#fff3b0'))
    for i in range(0, 10, 3):
        cx = 18 + i * 31 + 15
        d.line((cx, 0, cx, 14), fill=hexc('#3a3070'))
        d.rectangle((cx - 3, 14, cx + 3, 18), fill=hexc('#ffd51a'))
        glow(img, cx, 18, 30, hexc('#ffb347'), 0.45)
        d = ImageDraw.Draw(img, 'RGBA')

    # llaves en el suelo
    for i, col in enumerate(colors[:9]):
        x = 14 + i * 31
        sprite(d, KEY, x, 152 + (i % 2) * 6, {'#': hexc(col)}, 1)

    vignette(img, 0.6, 5)
    img.save(ART / 'doors.png', optimize=True)


# --------------------------------------------------------------------------
# PORTADAS de las tarjetas (80x100)
# --------------------------------------------------------------------------
CW, CH = 80, 100
GROUND = 76


def m_bug(d, cx, cy, p):
    body, dark, white = hexc('#ff2e63'), hexc('#1b1030'), (255, 255, 255, 255)
    for dy in (-7, 1, 9):
        k = -4 if dy < 0 else (4 if dy > 5 else 0)
        d.line((cx - 10, cy + dy, cx - 18, cy + dy + k), fill=dark, width=2)
        d.line((cx + 10, cy + dy, cx + 18, cy + dy + k), fill=dark, width=2)
    d.line((cx - 3, cy - 17, cx - 9, cy - 24), fill=dark, width=2)
    d.line((cx + 3, cy - 17, cx + 9, cy - 24), fill=dark, width=2)
    d.ellipse((cx - 11, cy - 10, cx + 11, cy + 19), fill=body)
    d.ellipse((cx - 7, cy - 20, cx + 7, cy - 6), fill=dark)
    d.line((cx, cy - 6, cx, cy + 19), fill=dark)
    for dx, dy in ((-7, -1), (4, -1), (-7, 8), (4, 8)):
        d.rectangle((cx + dx, cy + dy, cx + dx + 2, cy + dy + 2), fill=dark)
    d.rectangle((cx - 4, cy - 16, cx - 3, cy - 15), fill=white)
    d.rectangle((cx + 3, cy - 16, cx + 4, cy - 15), fill=white)


def m_gear(d, cx, cy, p):
    col = hexc('#e8fbff')
    for i in range(8):
        a = i * math.pi / 4
        x, y = cx + math.cos(a) * 17, cy + math.sin(a) * 17
        d.rectangle((x - 3, y - 3, x + 3, y + 3), fill=col)
    d.ellipse((cx - 15, cy - 15, cx + 15, cy + 15), fill=col)
    d.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=p['deep'])
    d.rectangle((cx - 15, cy + 3, cx - 12, cy + 6), fill=shade(col, 0.8))


def m_star(d, cx, cy, p):
    pts = [(cx, cy - 24), (cx + 5, cy - 5), (cx + 24, cy), (cx + 5, cy + 5), (cx, cy + 24), (cx - 5, cy + 5), (cx - 24, cy), (cx - 5, cy - 5)]
    d.polygon(pts, fill=hexc('#fffbd0'))
    d.polygon([(cx, cy - 13), (cx + 3, cy - 3), (cx + 13, cy), (cx + 3, cy + 3), (cx, cy + 13), (cx - 3, cy + 3), (cx - 13, cy), (cx - 3, cy - 3)], fill=hexc('#ffe36b'))
    for sx, sy in ((cx + 22, cy - 20), (cx - 24, cy + 18), (cx + 20, cy + 22)):
        d.rectangle((sx - 1, sy - 4, sx, sy + 4), fill=(255, 255, 255, 255))
        d.rectangle((sx - 4, sy - 1, sx + 3, sy), fill=(255, 255, 255, 255))


def m_shield(d, cx, cy, p):
    d.polygon([(cx - 17, cy - 19), (cx + 17, cy - 19), (cx + 17, cy + 3), (cx, cy + 24), (cx - 17, cy + 3)], fill=hexc('#eaf0ff'))
    d.polygon([(cx - 13, cy - 15), (cx + 13, cy - 15), (cx + 13, cy + 2), (cx, cy + 19), (cx - 13, cy + 2)], fill=hexc('#3158f5'))
    d.line((cx - 7, cy - 1, cx - 2, cy + 6), fill=(255, 255, 255, 255), width=3)
    d.line((cx - 2, cy + 6, cx + 8, cy - 8), fill=(255, 255, 255, 255), width=3)


def m_bolt(d, cx, cy, p):
    pts = [(cx + 4, cy - 25), (cx - 14, cy + 3), (cx - 2, cy + 3), (cx - 6, cy + 25), (cx + 15, cy - 6), (cx + 2, cy - 6)]
    d.polygon([(x + 2, y + 2) for x, y in pts], fill=hexc('#7c2d12'))
    d.polygon(pts, fill=hexc('#ffe14d'))
    d.polygon([(cx + 3, cy - 20), (cx - 8, cy + 1), (cx, cy + 1)], fill=hexc('#fff7b0'))


def m_coins(d, cx, cy, p):
    gold, dgold = hexc('#ffd51a'), hexc('#b8860b')
    for i in range(3):
        y = cy + 14 - i * 11
        d.rectangle((cx - 16, y - 4, cx + 16, y + 3), fill=dgold)
        d.ellipse((cx - 16, y - 9, cx + 16, y + 1), fill=gold)
        d.ellipse((cx - 9, y - 7, cx + 9, y - 1), outline=dgold)
    d.rectangle((cx - 1, cy - 29, cx, cy - 22), fill=(255, 255, 255, 255))


def m_cycle(d, cx, cy, p):
    white = (255, 255, 255, 255)
    R = 17
    for a0, a1 in ((20, 150), (200, 330)):
        d.arc((cx - R, cy - R, cx + R, cy + R), a0, a1, fill=white, width=5)
        a = math.radians(a1)
        px, py = cx + R * math.cos(a), cy + R * math.sin(a)
        tx, ty = -math.sin(a), math.cos(a)
        nx, ny = math.cos(a), math.sin(a)
        d.polygon([(px + tx * 9, py + ty * 9), (px + nx * 7, py + ny * 7), (px - nx * 7, py - ny * 7)], fill=white)


def m_stairs(d, cx, cy, p):
    cols = ['#a7f3d0', '#6ee7b7', '#34d399', '#10b981']
    for i in range(4):
        x = cx - 22 + i * 12
        h = 9 + i * 8
        d.rectangle((x, cy + 22 - h, x + 10, cy + 22), fill=hexc(cols[i]))
        d.rectangle((x, cy + 22 - h, x + 10, cy + 23 - h), fill=(255, 255, 255, 255))
    d.polygon([(cx + 20, cy - 22), (cx + 28, cy - 12), (cx + 12, cy - 12)], fill=(255, 255, 255, 255))


def m_blocks(d, cx, cy, p):
    d.rectangle((cx - 19, cy + 3, cx - 2, cy + 20), fill=hexc('#fde68a'))
    d.rectangle((cx + 2, cy + 3, cx + 19, cy + 20), fill=hexc('#a5f3fc'))
    d.rectangle((cx - 19, cy + 3, cx - 2, cy + 5), fill=(255, 255, 255, 255))
    d.rectangle((cx + 2, cy + 3, cx + 19, cy + 5), fill=(255, 255, 255, 255))
    d.rectangle((cx - 9, cy - 16, cx + 8, cy + 1), fill=hexc('#fbcfe8'))
    d.rectangle((cx - 9, cy - 16, cx + 8, cy - 14), fill=(255, 255, 255, 255))
    for x in range(cx - 19, cx + 20, 4):
        d.point((x, cy - 22), fill=(255, 255, 255, 255))


COVERS = [
    ('correctivo', '#ff5d8f', '#5c0b33', m_bug),
    ('adaptativo', '#3bd4f2', '#0a3f66', m_gear),
    ('perfectivo', '#c6f432', '#14603a', m_star),
    ('preventivo', '#6a7dff', '#150f5c', m_shield),
    ('quickfix', '#ffd51a', '#b4400c', m_bolt),
    ('boehm', '#ff8a3d', '#6e1f0c', m_coins),
    ('osborne', '#b277ff', '#33085e', m_cycle),
    ('iterativa', '#2dd4bf', '#0b3b3a', m_stairs),
    ('reutilizacion', '#ff8ac4', '#4c1a9e', m_blocks),
]


def build_cover(slug, top, bot, motif, seed):
    top_c, bot_c = hexc(top), hexc(bot)
    img = Image.new('RGB', (CW, CH))
    px = img.load()
    levels = 9
    for y in range(CH):
        t = y / (GROUND - 1)
        for x in range(CW):
            v = min(1.0, t) * levels
            b = int(v)
            if v - b > bayer(x, y):
                b += 1
            px[x, y] = mix(top_c, bot_c, b / levels)[:3]
    d = ImageDraw.Draw(img, 'RGBA')
    r = random.Random(seed)
    for _ in range(22):
        x, y = r.randrange(CW), r.randrange(0, 50)
        d.point((x, y), fill=(255, 255, 255, 220 if r.random() < 0.4 else 110))
    d.ellipse((54, 8, 70, 24), fill=(255, 255, 255, 60))
    d.ellipse((57, 11, 67, 21), fill=(255, 255, 255, 90))
    deep = shade(bot_c, 0.55)
    d.rectangle((0, GROUND, CW, CH), fill=deep)
    for y in range(GROUND, CH, 6):
        for x in range(0, CW, 8):
            if ((x // 8) + ((y - GROUND) // 6)) % 2 == 0:
                d.rectangle((x, y, x + 7, y + 5), fill=shade(bot_c, 0.7))
    d.rectangle((0, GROUND, CW, GROUND + 1), fill=(255, 255, 255, 70))
    d.ellipse((20, GROUND - 2, 60, GROUND + 6), fill=(0, 0, 0, 90))
    motif(d, 40, 44, {'deep': shade(bot_c, 0.8)})
    vignette(img, 0.35, 4)
    img.save(ART / f'card-{slug}.png', optimize=True)


if __name__ == '__main__':
    build_logo()
    build_hero()
    build_doors()
    for i, (slug, top, bot, motif) in enumerate(COVERS):
        build_cover(slug, top, bot, motif, 100 + i)
    print('listo')
