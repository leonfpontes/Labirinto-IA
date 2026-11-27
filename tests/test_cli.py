from labirinto.cli import main


def test_resolver_prints_scoreboard(capsys, tmp_path):
    main(["resolver", "--gerar", "12", "--lacos", "0.3", "--lama", "0.1", "--saida", str(tmp_path)])
    out = capsys.readouterr().out
    assert "A*" in out and "Custo uniforme" in out
    assert len(list(tmp_path.glob("resolucao-*.png"))) == 6


def test_gif(tmp_path):
    out = tmp_path / "corrida.gif"
    main(["gif", "--gerar", "8", "--quadros", "6", "--saida", str(out)])
    assert out.stat().st_size > 1000
