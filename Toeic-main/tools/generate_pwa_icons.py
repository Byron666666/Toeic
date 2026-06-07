from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "icons"


def write_png(path: Path, width: int, height: int, pixels: list[tuple[int, int, int, int]]) -> None:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    raw_rows = []
    for y in range(height):
        row = pixels[y * width : (y + 1) * width]
        raw_rows.append(b"\x00" + b"".join(bytes(pixel) for pixel in row))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(b"".join(raw_rows), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def hex_color(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def blend(first: tuple[int, int, int], second: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    amount = max(0.0, min(1.0, amount))
    return tuple(round(a + (b - a) * amount) for a, b in zip(first, second))


def rounded_rect_mask(x: float, y: float, left: float, top: float, right: float, bottom: float, radius: float) -> bool:
    if x < left or x > right or y < top or y > bottom:
        return False

    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius**2


def rotated_rect_mask(
    x: float,
    y: float,
    center_x: float,
    center_y: float,
    width: float,
    height: float,
    angle: float,
    radius: float,
) -> bool:
    sin_value = math.sin(-angle)
    cos_value = math.cos(-angle)
    dx = x - center_x
    dy = y - center_y
    local_x = center_x + dx * cos_value - dy * sin_value
    local_y = center_y + dx * sin_value + dy * cos_value
    return rounded_rect_mask(
        local_x,
        local_y,
        center_x - width / 2,
        center_y - height / 2,
        center_x + width / 2,
        center_y + height / 2,
        radius,
    )


def draw_icon(size: int) -> list[tuple[int, int, int, int]]:
    teal = hex_color("#168f86")
    coral = hex_color("#e76650")
    navy = hex_color("#0e141b")
    ink = hex_color("#f2f7fb")
    line = hex_color("#30404f")
    gold = hex_color("#f0bf52")
    pixels: list[tuple[int, int, int, int]] = []

    for y in range(size):
        for x in range(size):
            diagonal = (x + y) / (size * 2)
            radial = math.hypot(x - size * 0.16, y - size * 0.12) / size
            color = blend(teal, navy, min(1, diagonal * 1.25))
            color = blend(color, coral, max(0, diagonal - 0.56) * 1.15)
            color = blend(color, navy, min(0.34, radial * 0.2))

            if rotated_rect_mask(x, y, size * 0.49, size * 0.52, size * 0.47, size * 0.58, -0.13, size * 0.07):
                color = blend(color, ink, 0.18)

            if rounded_rect_mask(x, y, size * 0.285, size * 0.18, size * 0.77, size * 0.81, size * 0.078):
                color = ink

            if rounded_rect_mask(x, y, size * 0.332, size * 0.246, size * 0.723, size * 0.322, size * 0.038):
                color = teal

            if rounded_rect_mask(x, y, size * 0.332, size * 0.371, size * 0.582, size * 0.41, size * 0.019):
                color = blend(line, ink, 0.12)

            if rounded_rect_mask(x, y, size * 0.332, size * 0.441, size * 0.664, size * 0.48, size * 0.019):
                color = blend(line, ink, 0.24)

            if rounded_rect_mask(x, y, size * 0.618, size * 0.661, size * 0.75, size * 0.793, size * 0.066):
                color = coral

            if rounded_rect_mask(x, y, size * 0.651, size * 0.694, size * 0.717, size * 0.727, size * 0.016):
                color = gold

            if in_letter_mark(x, y, size):
                color = navy

            pixels.append((*color, 255))

    return pixels


def in_letter_mark(x: int, y: int, size: int) -> bool:
    left = size * 0.332
    top = size * 0.535
    unit = size * 0.025
    stroke = unit * 1.1

    fx = x - left
    fy = y - top
    if 0 <= fx <= unit * 7 and 0 <= fy <= unit * 9:
        if fx <= stroke or fy <= stroke or (unit * 3.45 <= fy <= unit * 4.55 and fx <= unit * 6.1):
            return True

    wx = x - (left + unit * 8.0)
    wy = fy
    if 0 <= wx <= unit * 9.2 and 0 <= wy <= unit * 9:
        left_bar = wx <= stroke
        right_bar = wx >= unit * 8.0
        middle_left = abs(wx - (unit * 3.2 + wy * 0.22)) <= stroke * 0.95
        middle_right = abs(wx - (unit * 6.0 - wy * 0.22)) <= stroke * 0.95
        return left_bar or right_bar or middle_left or middle_right

    return False


def main() -> None:
    ICON_DIR.mkdir(exist_ok=True)
    for filename, size in {
        "flipwords-icon-192.png": 192,
        "flipwords-icon-512.png": 512,
        "apple-touch-icon.png": 180,
    }.items():
        write_png(ICON_DIR / filename, size, size, draw_icon(size))


if __name__ == "__main__":
    main()
