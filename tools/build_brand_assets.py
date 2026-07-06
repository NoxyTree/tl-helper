from pathlib import Path
import json

from PIL import Image


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

    (OUT_DIR / "brand-kit.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
