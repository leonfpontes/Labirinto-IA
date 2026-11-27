"""Atalho histórico: roda as buscas no labirinto original de 2018.

O ponto de entrada novo é ``python -m labirinto`` (veja o README).
"""
from labirinto.cli import main

if __name__ == "__main__":
    main(["resolver", "labirintos/labirinto.png", "--saida", "resolv"])
