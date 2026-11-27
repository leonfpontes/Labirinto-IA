"""Labirinto IA: buscas cegas e heurísticas, agora com arena interativa."""
from .maze import Maze, add_mud, braid, from_line_png, generate
from .search import ALGORITHMS, SearchResult, run, run_all

__all__ = ["Maze", "generate", "braid", "add_mud", "from_line_png", "ALGORITHMS", "SearchResult", "run", "run_all"]
__version__ = "2.0.0"
