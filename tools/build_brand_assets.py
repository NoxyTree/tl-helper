from pathlib import Path
import json

from PIL import Image, ImageDraw, ImageFont


SOURCE_DIR = Path("public/assets/generated/tlhelper-logo-options")
OUT_DIR = Path("public/assets/brand")
SECONDARY_DIR = OUT_DIR / "secondary"

ASSETS = [
    {
        "source": "logo-option-sigil-compass.png",
        "slug": "sigil-compass",
        "name": "Sigil Compass",
        "role": "primary-logo",
        "usage": "TLHelper logo, favicon, app icon",
    },
    {
        "source": "logo-option-codex-star.png",
        "slug": "codex-star",
        "name": "Codex Star",
        "role": "secondary-icon",
        "usage": "guide, codex, knowledge, documentation sections",
    },
    {
        "source": "logo-option-crown-check.png",
        "slug": "crown-check",
        "name": "Crown Check",
        "role": "secondary-icon",
        "usage": "completion, achievements, milestone rewards",
    },
    {
        "source": "logo-option-portal-pin.png",
        "slug": "portal-pin",
        "name": "Portal Pin",
        "role": "secondary-icon",
        "usage": "maps, locations, dungeon routes, future boss tools",
    },
]


def fitted_canvas(image: Image.Image, size: int, padding_ratio: float = 0.13) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 255 if value > 18 else 0)
    bbox = alpha.getbbox()
    if bbox:
        image = image.crop(bbox)
    max_size = int(size * (1 - padding_ratio * 2))
    scale = min(max_size / image.width, max_size / image.height)
    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
    return canvas


def checker(size: int) -> Image.Image:
    tile = max(8, size // 12)
    image = Image.new("RGBA", (size, size), (7, 11, 19, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size, tile):
        for x in range(0, size, tile):
            fill = (31, 36, 48, 255) if (x // tile + y // tile) % 2 else (15, 20, 31, 255)
            draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=fill)
    return image


def contact_sheet(records: list[dict]) -> None:
    width = 1120
    cell_w = 265
    cell_h = 300
    margin = 32
    image = Image.new("RGBA", (width, cell_h + margin * 2), (7, 11, 19, 255))
    draw = ImageDraw.Draw(image)
    try:
        name_font = ImageFont.truetype("arial.ttf", 18)
        note_font = ImageFont.truetype("arial.ttf", 12)
    except OSError:
        name_font = ImageFont.load_default()
        note_font = ImageFont.load_default()

    for index, record in enumerate(records):
        x = margin + index * cell_w
        preview = checker(150)
        icon = Image.open(Path("public") / record["path"].lstrip("/")).convert("RGBA")
        icon.thumbnail((126, 126), Image.Resampling.LANCZOS)
        preview.alpha_composite(icon, ((150 - icon.width) // 2, (150 - icon.height) // 2))
        image.alpha_composite(preview, (x, margin))
        draw.text((x, margin + 164), record["name"], fill=(234, 241, 248, 255), font=name_font)
        usage = record["usage"]
        lines = []
        while len(usage) > 32:
            split_at = usage.rfind(" ", 0, 32)
            if split_at == -1:
                split_at = 32
            lines.append(usage[:split_at])
            usage = usage[split_at:].strip()
        lines.append(usage)
        for line_index, line in enumerate(lines[:3]):
            draw.text((x, margin + 190 + line_index * 17), line, fill=(163, 177, 197, 255), font=note_font)

    image.save(OUT_DIR / "brand-kit-contact-sheet.png")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SECONDARY_DIR.mkdir(parents=True, exist_ok=True)

    records = []
    for asset in ASSETS:
        source = Image.open(SOURCE_DIR / asset["source"]).convert("RGBA")
        full = fitted_canvas(source, 512)
        small = fitted_canvas(source, 96)

        if asset["role"] == "primary-logo":
            full.save(OUT_DIR / "logo.png")
            fitted_canvas(source, 32).save(OUT_DIR / "favicon-32.png")
            fitted_canvas(source, 64).save(OUT_DIR / "favicon-64.png")
            fitted_canvas(source, 180).save(OUT_DIR / "apple-touch-icon.png")
            fitted_canvas(source, 192).save(OUT_DIR / "icon-192.png")
            fitted_canvas(source, 512).save(OUT_DIR / "icon-512.png")
            path = "/assets/brand/logo.png"
        else:
            full.save(SECONDARY_DIR / f"{asset['slug']}.png")
            small.save(SECONDARY_DIR / f"{asset['slug']}-96.png")
            path = f"/assets/brand/secondary/{asset['slug']}.png"

        records.append({
            "slug": asset["slug"],
            "name": asset["name"],
            "role": asset["role"],
            "usage": asset["usage"],
            "path": path,
        })

    contact_sheet(records)
    (OUT_DIR / "brand-kit.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
