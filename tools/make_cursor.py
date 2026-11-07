#!/usr/bin/env python3
"""Generator kursorów KOSMOS: strzałka (obrót grafiki) i celownik (rysowany) — eksport 1x / 2x + hotspot do reguły CSS.

--kind pointer (domyślnie): PNG z przezroczystym tłem, trójkąt skierowany W PRAWO; hotspot = jego prawy wierzchołek.
--kind target: celownik rysowany od zera w kolorach pliku --src (jasna linia obwódki + ciemny pas); hotspot = środek.

Użycie (z katalogu repo, wymaga Pillow):
  python tools/make_cursor.py --src <myszka1.png>
      → assets/cursors/cursor-default.png + @2x (24 / 48 px), obrót 135° (ostrze w lewy górny róg)
  python tools/make_cursor.py --src <myszka1.png> --size 20 --out assets/cursors/alt --name cursor-default-20
  python tools/make_cursor.py --src <myszka1.png> --angle 90 --out assets/cursors/alt --name cursor-default-90
  python tools/make_cursor.py --src <myszka1.png> --kind target
      → assets/cursors/cursor-target.png + @2x (24 / 48 px)

Oba pliki powstają z tej samej wersji wysokiej jakości i tego samego kadru, więc plik 2x ma dokładnie
dwukrotnie większe wymiary, a hotspot 2x = 2 × hotspot 1x. Reguła CSS podaje jeden hotspot, w px 1x
(Chrome skaluje go przy wyborze pliku 2x i obcina do liczby całkowitej).
"""
import argparse
import math
import pathlib
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

MARGIN_PX = 1              # zapas wokół zawartości, px 1x
CONTENT_ALPHA_MIN = 16     # bbox zawartości: pomija resztki alfy po skalowaniu
HOTSPOT_SUBPIXEL = 0.25    # ostrze w środku piksela 2x, który przeglądarka wskaże: 2 × hotspot 1x
MARKER_TOLERANCE_PX = 0.75 # dopuszczalny błąd kontroli hotspotu, px 2x
LINE_MASK = (110, 120, 128)  # jasna linia obwódki: G >= 110, B >= 120, alfa >= 128 (kolory myszka1.png)
LINE_MIN_PX = 0.65         # minimalna szerokość jasnej linii w px 1x; przy 32 px źródło ją ma bez wzmacniania
TARGET_SCALE = 8           # celownik: rysunek ×8 względem 1x = ×4 względem 2x, potem Lanczos
# Celownik w px 1x dla rozmiaru 24 (inne rozmiary — proporcjonalnie). Linie po 1 px na granicach pikseli:
# ostre w 1x i w 2x; środek = środek piksela hotspotu 1x.
TARGET_GEOMETRY = {
    'ring_r': 6.5,     # promień osi pierścienia
    'line': 1.0,       # grubość linii cyjanowej (pierścień i kreski)
    'edge': 1.0,       # ciemny obrys z każdej strony linii
    'tick_in': 3.5,    # kreski od tego promienia (przerwa w środku)...
    'tick_out': 9.5,   # ...do tego
}


def find_tip(img, alpha_min):
    """Prawy wierzchołek: skrajnie prawa kolumna z widocznym pikselem, środek w pionie (ważony alfą)."""
    alpha = img.getchannel('A')
    bbox = alpha.point(lambda v: 255 if v >= alpha_min else 0).getbbox()
    if bbox is None:
        sys.exit(f'Brak widocznych pikseli (alfa >= {alpha_min}) w pliku źródłowym.')
    col = bbox[2] - 1
    rows = [y for y in range(img.height) if alpha.getpixel((col, y)) >= alpha_min]
    weight = sum(alpha.getpixel((col, y)) for y in rows)
    center_y = sum(alpha.getpixel((col, y)) * (y + 0.5) for y in rows) / weight
    return col + 0.5, center_y


def rotate_point(x, y, angle_deg, old_size, new_size):
    """Pozycja punktu po Image.rotate(expand=True): obrót przeciwnie do zegara wokół środka obrazu."""
    a = math.radians(angle_deg)
    dx, dy = x - old_size[0] / 2, y - old_size[1] / 2
    return (math.cos(a) * dx + math.sin(a) * dy + new_size[0] / 2,
            -math.sin(a) * dx + math.cos(a) * dy + new_size[1] / 2)


def fit_crop(content, tip, longest_px):
    """Kadr wersji HQ i skala: najdłuższy bok <= longest_px, zapas MARGIN_PX, ostrze trafia w hotspot."""
    x0, y0, x1, y1 = content
    per_px = max(x1 - x0, y1 - y0) / (longest_px - 2 * MARGIN_PX)  # px HQ na 1 px 1x
    while True:
        # Hotspot = najmniejszy piksel, przy którym przesunięcie kadru nie zjada zapasu z lewej i z góry
        hx = math.ceil((tip[0] - x0) / per_px + MARGIN_PX - HOTSPOT_SUBPIXEL)
        hy = math.ceil((tip[1] - y0) / per_px + MARGIN_PX - HOTSPOT_SUBPIXEL)
        left = tip[0] - (hx + HOTSPOT_SUBPIXEL) * per_px
        top = tip[1] - (hy + HOTSPOT_SUBPIXEL) * per_px
        width = math.ceil((x1 - left) / per_px + MARGIN_PX)
        height = math.ceil((y1 - top) / per_px + MARGIN_PX)
        if max(width, height) <= longest_px:
            box = (left, top, left + width * per_px, top + height * per_px)
            return box, (width, height), (hx, hy)
        per_px *= 1.005


def pad_transparent(img, pad):
    """Przezroczysty margines: kadr resize(box=...) nie może wyjść poza obraz."""
    out = Image.new('RGBA', (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
    out.paste(img, (pad, pad))
    return out


def threshold(channel, minimum):
    return channel.point(lambda v: 255 if v >= minimum else 0)


def line_mask(img):
    """Maska jasnej linii obwódki (progi LINE_MASK)."""
    _, g, b, a = img.split()
    return ImageChops.multiply(ImageChops.multiply(threshold(g, LINE_MASK[0]), threshold(b, LINE_MASK[1])),
                               threshold(a, LINE_MASK[2]))


def line_width(mask):
    """Szerokość linii w px: erozje 3×3, aż zostanie < 5 % pikseli (dokładność ±1 px)."""
    total = mask.histogram()[255]
    steps = 0
    while total and mask.histogram()[255] > total * 0.05:
        mask = mask.filter(ImageFilter.MinFilter(3))
        steps += 1
    return 2 * steps


def boost_outline(img, radius):
    """Pogrubia jasną linię o `radius` px z każdej strony — tylko w nieprzezroczystym pasie; kolor = średnia linii."""
    mask = line_mask(img)
    color = tuple(round(v) for v in ImageStat.Stat(img.convert('RGB'), mask).mean)
    ring = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(2 * radius + 1)), mask)
    ring = ImageChops.multiply(ring, threshold(img.getchannel('A'), 250))
    out = img.copy()
    out.paste(color + (255,), mask=ring)
    return out, color


def alpha_centroid(img):
    alpha = img.getchannel('A')
    sum_a = sum_x = sum_y = 0
    for y in range(alpha.height):
        for x in range(alpha.width):
            v = alpha.getpixel((x, y))
            sum_a += v
            sum_x += v * (x + 0.5)
            sum_y += v * (y + 0.5)
    return (sum_x / sum_a, sum_y / sum_a) if sum_a else None


def source_colors(src):
    """Kolory z pliku źródłowego: jasna linia = średnia 5 % najjaśniejszych pikseli kryjących, ciemny pas = średnia
    kryjących pikseli o kanałach < 64."""
    data = src.tobytes()
    opaque = [tuple(data[i:i + 3]) for i in range(0, len(data), 4) if data[i + 3] == 255]
    if not opaque:
        sys.exit('Plik źródłowy nie ma kryjących pikseli.')
    opaque.sort(key=max, reverse=True)
    top = opaque[:max(1, len(opaque) // 20)]
    dark = [p for p in opaque if max(p) < 64] or opaque[-max(1, len(opaque) // 4):]
    mean = lambda ps: tuple(round(sum(p[i] for p in ps) / len(ps)) for i in range(3))
    return mean(top), mean(dark)


def make_pointer(src, args):
    alpha_hist = src.getchannel('A').histogram()
    tip_src = find_tip(src, args.alpha_min)

    # Wersja HQ: powiększenie przed obrotem ogranicza rozmycie resamplingu przy 64 px źródła
    scale = args.supersample
    enlarged = src.resize((src.width * scale, src.height * scale), Image.BICUBIC)
    rotated = enlarged.rotate(args.angle, resample=Image.BICUBIC, expand=True)
    tip_hq = rotate_point(tip_src[0] * scale, tip_src[1] * scale, args.angle, enlarged.size, rotated.size)

    content = threshold(rotated.getchannel('A'), CONTENT_ALPHA_MIN).getbbox()
    box, size_1x, hotspot = fit_crop(content, tip_hq, args.size)
    per_px = (box[2] - box[0]) / size_1x[0]

    # Obwódka: przy małym rozmiarze linia źródła ma < LINE_MIN_PX px 1x i Lanczos ją przygasza — pogrubiona w HQ,
    # przed zmniejszeniem (w pasie nieprzezroczystym, więc bbox i hotspot bez zmian)
    width_hq = line_width(line_mask(rotated))
    radius = max(0, round((args.line_min_px * per_px - width_hq) / 2))
    line_color = None
    if radius:
        rotated, line_color = boost_outline(rotated, radius)

    # Kadr może wyjść poza obraz o zapas zaokrągleń — margines = rozmiar 2 px 1x z każdej strony
    pad = math.ceil(2 * per_px) + 1
    box_padded = tuple(v + pad for v in box)
    size_2x = (size_1x[0] * 2, size_1x[1] * 2)
    hq = pad_transparent(rotated, pad)
    # Oba pliki z wersji HQ, nigdy jeden z drugiego
    out_1x = hq.resize(size_1x, Image.LANCZOS, box=box_padded)
    out_2x = hq.resize(size_2x, Image.LANCZOS, box=box_padded)

    # Kontrola 1: znacznik na ostrzu przechodzi te same operacje co obraz — niezależnie od rachunku rotate_point
    marker = Image.new('RGBA', enlarged.size, (0, 0, 0, 0))
    r = scale
    mx, my = tip_src[0] * scale, tip_src[1] * scale
    ImageDraw.Draw(marker).ellipse((mx - r - 0.5, my - r - 0.5, mx + r - 0.5, my + r - 0.5), fill=(255, 255, 255, 255))
    marker_2x = pad_transparent(marker.rotate(args.angle, resample=Image.BICUBIC, expand=True), pad) \
        .resize(size_2x, Image.LANCZOS, box=box_padded)
    center = alpha_centroid(marker_2x)
    if center is None:
        sys.exit('Kontrola znacznikiem: znacznik wypadł poza kadr.')

    # Kontrola 2: skrajny widoczny piksel pliku 2x w kierunku ostrza
    a = math.radians(args.angle)
    direction = (math.cos(a), -math.sin(a))
    alpha_2x = out_2x.getchannel('A')
    extreme = max(((x + 0.5, y + 0.5) for y in range(out_2x.height) for x in range(out_2x.width)
                   if alpha_2x.getpixel((x, y)) >= args.alpha_min),
                  key=lambda p: p[0] * direction[0] + p[1] * direction[1])

    info = [
        f'Źródło: {src.width}×{src.height} RGBA, alfa: {alpha_hist[0]} przezroczystych / '
        f'{alpha_hist[255]} pełnych / {sum(alpha_hist[1:255])} częściowych',
        f'Wierzchołek w źródle: ({tip_src[0]:.2f}, {tip_src[1]:.2f})  obrót: {args.angle:g}°',
        f'Obwódka: linia {width_hq} px HQ = {width_hq / per_px:.2f} px 1x, minimum {args.line_min_px} px — '
        + (f'pogrubiona o {radius} px HQ z każdej strony, kolor {line_color}' if radius else 'bez zmian'),
    ]
    return out_1x, out_2x, hotspot, center, ('Skrajny widoczny piksel w kierunku ostrza (2x)', extreme), info


def make_target(src, args):
    cyan, dark = source_colors(src)
    unit = args.size / 24 * TARGET_SCALE                     # px HQ na 1 px 1x geometrii z TARGET_GEOMETRY
    g = {k: v * unit for k, v in TARGET_GEOMETRY.items()}
    side = args.size * TARGET_SCALE
    hot = args.size // 2
    c = (hot + 0.5) * TARGET_SCALE                           # środek piksela hotspotu 1x, px HQ

    def layer(extra):
        """Maska pierścienia i czterech kresek; `extra` = poszerzenie z każdej strony (ciemny obrys)."""
        mask = Image.new('L', (side, side), 0)
        draw = ImageDraw.Draw(mask)
        half = g['line'] / 2 + extra
        outer = g['ring_r'] + half
        draw.ellipse((c - outer, c - outer, c + outer - 1, c + outer - 1), outline=255, width=round(2 * half))
        t0, t1 = g['tick_in'] - extra, g['tick_out'] + extra
        for sx, sy in ((0, -1), (0, 1), (-1, 0), (1, 0)):    # góra, dół, lewo, prawo
            if sx == 0:
                y_a, y_b = sorted((c + sy * t0, c + sy * t1))
                draw.rectangle((c - half, y_a, c + half - 1, y_b - 1), fill=255)
            else:
                x_a, x_b = sorted((c + sx * t0, c + sx * t1))
                draw.rectangle((x_a, c - half, x_b - 1, c + half - 1), fill=255)
        return mask

    hq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    hq.paste(dark + (255,), mask=layer(g['edge']))
    hq.paste(cyan + (255,), mask=layer(0))
    size_1x = (args.size, args.size)
    out_1x = hq.resize(size_1x, Image.LANCZOS)
    out_2x = hq.resize((args.size * 2, args.size * 2), Image.LANCZOS)
    center = alpha_centroid(out_2x)                          # rysunek symetryczny: środek masy = środek celownika
    info = [
        f'Kolory z {pathlib.Path(args.src).name}: linia {cyan}, obrys {dark}',
        f'Rysunek ×{TARGET_SCALE} ({side}×{side}), środek w px 1x: ({hot + 0.5}, {hot + 0.5})',
    ]
    return out_1x, out_2x, (hot, hot), center, None, info


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

    parser = argparse.ArgumentParser(description='Generator kursorów KOSMOS (1x + 2x + hotspot).')
    parser.add_argument('--src', required=True, help='PNG źródłowy: trójkąt w prawo, przezroczyste tło')
    parser.add_argument('--kind', choices=('pointer', 'target'), default='pointer', help='strzałka albo celownik')
    parser.add_argument('--angle', type=float, default=135.0, help='strzałka: obrót przeciwnie do zegara, stopnie')
    parser.add_argument('--out', default='assets/cursors', help='katalog wyjściowy')
    parser.add_argument('--name', default=None, help='nazwa pliku bez rozszerzenia (domyślnie cursor-default / cursor-target)')
    parser.add_argument('--size', type=int, default=24, help='dłuższy bok 1x w px (2x = dwa razy tyle)')
    parser.add_argument('--supersample', type=int, default=4, help='strzałka: krotność wersji HQ przed obrotem')
    parser.add_argument('--alpha-min', type=int, default=128, help='strzałka: próg alfy „widocznego” piksela')
    parser.add_argument('--line-min-px', type=float, default=LINE_MIN_PX,
                        help='strzałka: minimalna szerokość jasnej linii obwódki w px 1x (0 = bez pogrubiania)')
    args = parser.parse_args()
    name = args.name or ('cursor-target' if args.kind == 'target' else 'cursor-default')

    src = Image.open(args.src).convert('RGBA')
    if src.getchannel('A').histogram()[0] == 0:
        sys.exit('Plik źródłowy nie ma przezroczystych pikseli — oczekiwane przezroczyste tło.')
    make = make_target if args.kind == 'target' else make_pointer
    out_1x, out_2x, hotspot, center, extreme, info = make(src, args)

    # Kontrola hotspotu: środek znacznika (strzałka) / środek masy (celownik) w pliku 2x leży w pikselu hotspotu
    center_err = math.hypot(center[0] - (2 * hotspot[0] + 0.5), center[1] - (2 * hotspot[1] + 0.5))
    if center_err > MARKER_TOLERANCE_PX:
        sys.exit(f'Kontrola hotspotu: punkt ({center[0]:.2f}, {center[1]:.2f}) daleko od hotspotu 2x '
                 f'{2 * hotspot[0], 2 * hotspot[1]} — błąd {center_err:.2f} px.')

    out_dir = pathlib.Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    path_1x = out_dir / f'{name}.png'
    path_2x = out_dir / f'{name}@2x.png'
    out_1x.save(path_1x, optimize=True)
    out_2x.save(path_2x, optimize=True)

    for line in info:
        print(line)
    print(f'1x: {path_1x.as_posix()}  {out_1x.width}×{out_1x.height}  hotspot {hotspot[0]} {hotspot[1]}')
    print(f'2x: {path_2x.as_posix()}  {out_2x.width}×{out_2x.height}  hotspot {2 * hotspot[0]} {2 * hotspot[1]}')
    label = 'Kontrola znacznikiem (2x)' if args.kind == 'pointer' else 'Środek masy celownika (2x)'
    print(f'{label}: ({center[0]:.2f}, {center[1]:.2f}), {center_err:.2f} px od środka piksela hotspotu')
    if extreme:
        dist = math.hypot(extreme[1][0] - (2 * hotspot[0] + 0.5), extreme[1][1] - (2 * hotspot[1] + 0.5))
        print(f'{extreme[0]}: {extreme[1]}, {dist:.2f} px od hotspotu')
    fallback = 'crosshair' if args.kind == 'target' else 'default'
    print(f"CSS: image-set(url('{path_1x.as_posix()}') 1x, url('{path_2x.as_posix()}') 2x) "
          f'{hotspot[0]} {hotspot[1]}, {fallback}')


if __name__ == '__main__':
    main()
