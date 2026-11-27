"""Desenho dos labirintos e das buscas (PNG e GIF animado).

Paleta pensada para leitura fácil: poucas cores, bem separadas em matiz e
luminosidade. Azul marca o que a busca explorou e o fio vermelho (o fio de
Ariadne) marca o caminho encontrado.
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .maze import E, MUD_COST, S, Maze
from .search import SearchResult

GROUND = (20, 22, 26)
WALL = (233, 228, 216)
FLOOR = (20, 22, 26)
MUD = (74, 58, 36)
EXPLORED = (47, 111, 214)
THREAD = (255, 90, 54)
MARK = (255, 255, 255)


def base_image(maze: Maze, cell: int) -> np.ndarray:
    h, w = maze.height * cell + 1, maze.width * cell + 1
    img = np.empty((h, w, 3), dtype=np.uint8)
    img[:] = WALL
    for i, m in enumerate(maze.cells):
        x, y = maze.xy(i)
        x0, y0 = x * cell + 1, y * cell + 1
        color = MUD if maze.cost[i] >= MUD_COST else FLOOR
        img[y0:y0 + cell - 1, x0:x0 + cell - 1] = color
        if m & E:
            img[y0:y0 + cell - 1, x0 + cell - 1] = color
        if m & S:
            img[y0 + cell - 1, x0:x0 + cell - 1] = color
    for idx, side in ((maze.start, "top"), (maze.goal, "bottom")):
        x, y = maze.xy(idx)
        row = 0 if side == "top" else h - 1
        img[row, x * cell + 1:x * cell + cell] = FLOOR
    return img


def paint_cell(img: np.ndarray, maze: Maze, idx: int, cell: int, color) -> None:
    x, y = maze.xy(idx)
    x0, y0 = x * cell + 1, y * cell + 1
    img[y0:y0 + cell - 1, x0:x0 + cell - 1] = color


def _centers(maze: Maze, path: Sequence[int], cell: int) -> List[tuple]:
    return [((i % maze.width) * cell + cell / 2, (i // maze.width) * cell + cell / 2) for i in path]


def draw_thread(im: Image.Image, maze: Maze, path: Sequence[int], cell: int, upto: int | None = None) -> None:
    pts = _centers(maze, path[: upto or len(path)], cell)
    if len(pts) < 2:
        return
    d = ImageDraw.Draw(im)
    d.line(pts, fill=THREAD, width=max(1, cell // 2), joint="curve")


def draw_marks(im: Image.Image, maze: Maze, cell: int) -> None:
    d = ImageDraw.Draw(im)
    r = max(1.5, cell * 0.32)
    for idx in (maze.start, maze.goal):
        cx, cy = _centers(maze, [idx], cell)[0]
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=MARK)


def render_result(maze: Maze, res: SearchResult, cell: int = 8) -> Image.Image:
    img = base_image(maze, cell)
    for idx in res.expanded:
        paint_cell(img, maze, idx, cell, EXPLORED)
    im = Image.fromarray(img)
    draw_thread(im, maze, res.path, cell)
    draw_marks(im, maze, cell)
    return im


def _font(size: int, bold: bool = False):
    names = ["DejaVuSans-Bold.ttf", "Arial Bold.ttf"] if bold else ["DejaVuSans.ttf", "Arial.ttf"]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow antigo
        return ImageFont.load_default()


def race_gif(maze: Maze, results: List[SearchResult], out: str | Path, cell: int = 6,
             frames: int = 90, cols: int = 3, ms: int = 60) -> Path:
    """GIF com todas as buscas correndo juntas, um estado por tique."""
    out = Path(out)
    base = base_image(maze, cell)
    ph, pw = base.shape[:2]
    label_h, pad = 46, 14
    rows = (len(results) + cols - 1) // cols
    W = cols * pw + (cols + 1) * pad
    H = rows * (ph + label_h) + (rows + 1) * pad
    canvases = [base.copy() for _ in results]
    done = [0] * len(results)
    longest = max(len(r.expanded) for r in results)
    tail = 18
    font = _font(15, bold=True)
    small = _font(13)
    images = []
    for f in range(frames + tail):
        step = longest if f >= frames else int(longest * ((f + 1) / frames) ** 1.6)
        sheet = Image.new("RGB", (W, H), GROUND)
        d = ImageDraw.Draw(sheet)
        for k, r in enumerate(results):
            target = min(step, len(r.expanded))
            for idx in r.expanded[done[k]:target]:
                paint_cell(canvases[k], maze, idx, cell, EXPLORED)
            done[k] = target
            panel = Image.fromarray(canvases[k])
            finished = target >= len(r.expanded)
            if finished and r.found:
                if f >= frames:
                    reveal = min(1.0, (f - frames + 1) / (tail * 0.6))
                else:
                    reveal = 1.0
                draw_thread(panel, maze, r.path, cell, max(2, int(len(r.path) * reveal)))
            draw_marks(panel, maze, cell)
            cx, cy = k % cols, k // cols
            x0 = pad + cx * (pw + pad)
            y0 = pad + cy * (ph + label_h + pad)
            stats = f"{target} estados expandidos"
            if finished and r.found:
                stats += f"   custo {r.cost}"
            d.text((x0, y0 + 4), r.name, fill=WALL, font=font)
            d.text((x0, y0 + 24), stats, fill=(170, 166, 156), font=small)
            sheet.paste(panel, (x0, y0 + label_h))
        images.append(sheet.quantize(colors=32, method=Image.Quantize.MEDIANCUT))
    durations = [ms] * frames + [ms * 2] * (tail - 1) + [2600]
    out.parent.mkdir(parents=True, exist_ok=True)
    images[0].save(out, save_all=True, append_images=images[1:], duration=durations, loop=0,
                   optimize=True)
    return out
