"""Genera los iconos PNG de la PWA sin dependencias externas."""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"

BG = (11, 13, 18)
BODY = (30, 36, 51)
SCREEN = (110, 168, 255)
SCREEN_DIM = (58, 96, 160)
PAD = (232, 236, 245)
BTN = (255, 107, 107)


def blend(dst, src, alpha):
    return tuple(round(d + (s - d) * alpha) for d, s in zip(dst, src))


def rounded_rect(px, size, x0, y0, x1, y1, radius, color, ss=3):
    """Rectangulo redondeado con antialiasing por supermuestreo."""
    for y in range(max(0, int(y0) - 2), min(size, int(y1) + 3)):
        for x in range(max(0, int(x0) - 2), min(size, int(x1) + 3)):
            hits = 0
            for sy in range(ss):
                for sx in range(ss):
                    fx = x + (sx + 0.5) / ss
                    fy = y + (sy + 0.5) / ss
                    cx = min(max(fx, x0 + radius), x1 - radius)
                    cy = min(max(fy, y0 + radius), y1 - radius)
                    if x0 <= fx <= x1 and y0 <= fy <= y1 and math.hypot(fx - cx, fy - cy) <= radius:
                        hits += 1
            if hits:
                px[y][x] = blend(px[y][x], color, hits / (ss * ss))


def circle(px, size, cx, cy, r, color, ss=3):
    for y in range(max(0, int(cy - r) - 2), min(size, int(cy + r) + 3)):
        for x in range(max(0, int(cx - r) - 2), min(size, int(cx + r) + 3)):
            hits = sum(
                1
                for sy in range(ss)
                for sx in range(ss)
                if math.hypot(x + (sx + 0.5) / ss - cx, y + (sy + 0.5) / ss - cy) <= r
            )
            if hits:
                px[y][x] = blend(px[y][x], color, hits / (ss * ss))


def write_png(path, px, size):
    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in px)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def build(size, maskable=False):
    px = [[BG for _ in range(size)] for _ in range(size)]
    u = size / 100.0

    # En un icono maskable el sistema recorta las esquinas, asi que el dibujo se
    # encoge al 80% central y el fondo llega hasta el borde.
    inset = 12 * u if maskable else 6 * u
    scale = 0.78 if maskable else 1.0

    if not maskable:
        rounded_rect(px, size, inset, inset, size - inset, size - inset, 22 * u, BODY)
    else:
        rounded_rect(px, size, 0, 0, size, size, 0, BODY)

    def m(v):
        return size / 2 + (v - 50) * u * scale

    rounded_rect(px, size, m(24), m(20), m(76), m(53), 5 * u * scale, SCREEN_DIM)
    rounded_rect(px, size, m(27), m(23), m(73), m(50), 3 * u * scale, SCREEN)

    arm_w = 7 * u * scale
    rounded_rect(px, size, m(24) - arm_w / 2 + arm_w, m(64), m(31) + arm_w, m(86), 2 * u * scale, PAD)
    rounded_rect(px, size, m(21), m(70) + 1, m(41), m(79), 2 * u * scale, PAD)

    circle(px, size, m(72), m(69), 6.5 * u * scale, BTN)
    circle(px, size, m(60), m(80), 6.5 * u * scale, BTN)

    name = f"icon-maskable-{size}.png" if maskable else f"icon-{size}.png"
    write_png(OUT / name, px, size)
    return name


OUT.mkdir(parents=True, exist_ok=True)
for created in (build(192), build(512), build(512, maskable=True)):
    print("generado", created)
