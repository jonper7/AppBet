"""Genera los iconos de la PWA (requiere Pillow): python tools/generar_iconos.py"""
from pathlib import Path
from PIL import Image, ImageDraw

SALIDA = Path(__file__).resolve().parent.parent / "web" / "iconos"
FONDO = (7, 9, 15)


def degradado(n):
    img = Image.new("RGB", (n, n))
    px = img.load()
    a, b = (220, 255, 85), (163, 232, 0)
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * n)
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return img


def icono(n, seguro):
    """seguro=True: sin esquinas redondeadas y con el dibujo dentro del 60 % central (maskable)."""
    s = 4  # supermuestreo
    N = n * s
    base = Image.new("RGB", (N, N), FONDO)
    margen = 0 if seguro else int(N * 0.06)
    lado = N - 2 * margen
    cuerpo = degradado(lado)
    mascara = Image.new("L", (lado, lado), 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, lado - 1, lado - 1], radius=0 if seguro else int(lado * 0.24), fill=255)
    base.paste(cuerpo, (margen, margen), mascara)

    d = ImageDraw.Draw(base)
    c = N // 2
    escala = 0.30 if seguro else 0.36
    for radio, grosor in ((escala, 0.075), (escala * 0.60, 0.06)):
        r = int(N * radio)
        g = int(N * grosor)
        d.ellipse([c - r, c - r, c + r, c + r], outline=FONDO, width=g)
    r = int(N * escala * 0.22)
    d.ellipse([c - r, c - r, c + r, c + r], fill=FONDO)
    return base.resize((n, n), Image.LANCZOS)


SALIDA.mkdir(parents=True, exist_ok=True)
icono(192, False).save(SALIDA / "icono-192.png")
icono(512, False).save(SALIDA / "icono-512.png")
icono(512, True).save(SALIDA / "icono-maskable-512.png")
print("Iconos generados en", SALIDA)
