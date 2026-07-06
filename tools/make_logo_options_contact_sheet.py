from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


SOURCE_DIR = Path("public/assets/generated/tlhelper-z")
OUT_DIR = Path("public/assets/generated/tlhelper-logo-options")
SLUGS = [
    "logo-option-sigil-compass",
    "logo-option-codex-star",
    "logo-option-crown-check",
    "logo-option-portal-pin",
]


def remove_green_background(source: Image.Image) -> Image.Image:
    image = source.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            green_strength = g - max(r, b)
            if g > 120 and green_strength > 32:
                alpha = max(0, min(255, 255 - ((green_strength - 32) * 6)))
                if alpha < 32:
                    alpha = 0
                pixels[x, y] = (r, g, b, alpha)
    return image


def composite_on_checker(image: Image.Image, size: int) -> Image.Image:
    tile = 16
    checker = Image.new("RGBA", (size, size), (26, 30, 39, 255))
    draw = ImageDraw.Draw(checker)
    for y in range(0, size, tile):
        for x in range(0, size, tile):
            fill = (48, 54, 67, 255) if (x // tile + y // tile) % 2 else (22, 26, 35, 255)
            draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=fill)
    fitted = image.copy()
    fitted.thumbnail((size - 24, size - 24), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    checker.alpha_composite(fitted, (x, y))
    return checker


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    previews = []
    for slug in SLUGS:
        raw = Image.open(SOURCE_DIR / f"{slug}.png")
        transparent = remove_green_background(raw)
        transparent.save(OUT_DIR / f"{slug}.png")
        favicon = transparent.copy()
        favicon.thumbnail((64, 64), Image.Resampling.LANCZOS)
        icon = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        icon.alpha_composite(favicon, ((64 - favicon.width) // 2, (64 - favicon.height) // 2))
        icon.save(OUT_DIR / f"{slug}-favicon-64.png")
        previews.append((slug, composite_on_checker(transparent, 220)))

    sheet_width = 520
    sheet_height = 2 * 300
    sheet = Image.new("RGBA", (sheet_width, sheet_height), (7, 11, 19, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for index, (slug, preview) in enumerate(previews):
        col = index % 2
        row = index // 2
        x = 30 + col * 250
        y = 24 + row * 300
        sheet.alpha_composite(preview, (x, y))
        draw.text((x, y + 232), slug.replace("logo-option-", ""), fill=(234, 241, 248, 255), font=font)
    sheet.save(OUT_DIR / "logo-options-contact-sheet.png")


if __name__ == "__main__":
    main()
