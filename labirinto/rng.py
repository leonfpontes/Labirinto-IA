"""Gerador pseudoaleatório Mulberry32.

É o mesmo gerador usado pela arena web (``web/js/core.js``): com a mesma
semente, Python e JavaScript produzem exatamente o mesmo labirinto.
"""

MASK = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & MASK


class Mulberry32:
    """Gerador de 32 bits, rápido e reproduzível."""

    def __init__(self, seed: int) -> None:
        self.state = seed & MASK

    def random(self) -> float:
        """Número em [0, 1)."""
        self.state = (self.state + 0x6D2B79F5) & MASK
        a = self.state
        t = _imul(a ^ (a >> 15), a | 1)
        t = ((t + _imul(t ^ (t >> 7), t | 61)) & MASK) ^ t
        return ((t ^ (t >> 14)) & MASK) / 4294967296

    def randint(self, n: int) -> int:
        """Inteiro em [0, n)."""
        return int(self.random() * n)
