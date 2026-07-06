import argparse
import io
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image


COMFY_URL = "http://127.0.0.1:8188"
OUT_DIR = Path("public/assets/generated/tlhelper-z")
MODEL = "z_image_turbo_bf16.safetensors"
CLIP_1 = "qwen_3_4b.safetensors"
VAE = "ae.safetensors"

STYLE_ANCHOR = (
    "dark high-fantasy MMORPG panoramic environment artwork, "
    "obsidian and midnight blue atmosphere, violet void magic, antique gold metal details, "
    "frost-blue rim light, elegant cinematic lighting, detailed but readable, "
    "raw in-world fantasy scene, no text, no letters, no logo, no UI, no watermark"
)

LOGO_STYLE_ANCHOR = (
    "TLHelper brand mark exploration, dark high-fantasy MMORPG utility logo, "
    "clean centered emblem, antique gold metal, violet arcane glow, frost-blue highlights, "
    "sharp readable silhouette for favicon scale, premium game helper identity, "
    "no text, no letters, no watermark, no mockup"
)

NEGATIVE = (
    "text, letters, logo, watermark, blurry, low quality, modern city, sci-fi guns, "
    "anime, cartoon, goofy, overexposed, flat lighting, crowded composition, bad anatomy, "
    "extra limbs, distorted face, illegible symbols, typography, captions, interface, website mockup, "
    "profile card, dashboard, screenshot, white background, white border, paper frame, "
    "words, alphabet, numbers, title, subtitle, heading, label, sign, signage, nameplate, plaque, "
    "book text, parchment text, map labels, menu, button, UI frame, title banner, readable marks, "
    "fake writing, pseudo text, glyphs, runes, inscriptions, symbols arranged like writing, "
    "framed card, ornate border, decorative frame, top border, bottom border, corner ornament, "
    "arcane chronicle, chronicle, codex, helper, TLHelper, white panel, white block, white fade, blank white area"
)

NO_TEXT_GUARD = (
    "ABSOLUTELY NO TEXT OR LETTERING ANYWHERE IN THE IMAGE, no fake text, no pseudo letters, "
    "no decorative writing, no readable symbols, no label plaques, no title bars, no UI frames, "
    "no ornamental borders, no framed card layout, no scrolls or books with marks, no maps with labels, no signage, "
    "no white panels, no bright blank blocks, no empty white fade"
)

ASSETS = [
    {
        "slug": "logo-option-sigil-compass",
        "kind": "brand-mark",
        "width": 1024,
        "height": 1024,
        "prompt": "a compass-star achievement sigil inside a slim ornate diamond frame, symmetrical, simple negative space, icon centered with generous padding, flat pure #00ff00 chroma key background, no shadow, no floor, no scenery",
    },
    {
        "slug": "logo-option-codex-star",
        "kind": "brand-mark",
        "width": 1024,
        "height": 1024,
        "prompt": "an open fantasy codex forming a four-point star, small violet gem at the center, antique gold page edges, simple strong silhouette, icon centered with generous padding, flat pure #00ff00 chroma key background, no shadow, no floor, no scenery",
    },
    {
        "slug": "logo-option-crown-check",
        "kind": "brand-mark",
        "width": 1024,
        "height": 1024,
        "prompt": "a legendary achievement crest combining a subtle check mark and crown shape, violet core crystal, gold filigree, bold readable silhouette, icon centered with generous padding, flat pure #00ff00 chroma key background, no shadow, no floor, no scenery",
    },
    {
        "slug": "logo-option-portal-pin",
        "kind": "brand-mark",
        "width": 1024,
        "height": 1024,
        "prompt": "a magical map pin shaped like a portal rune, violet inner flame, antique gold outline, frost-blue spark accents, bold compact silhouette, icon centered with generous padding, flat pure #00ff00 chroma key background, no shadow, no floor, no scenery",
    },
    {
        "slug": "tracker-hero-wide",
        "kind": "layout-strip",
        "width": 3840,
        "height": 720,
        "prompt": "ultra-wide in-world fantasy scene; left third is plain dark obsidian stone and soft shadow; right two thirds show a magical completion constellation made from violet light paths, simple antique gold relic shapes, frost-blue magical highlights, natural environment edges",
    },
    {
        "slug": "achievement-overview-strip",
        "kind": "layout-strip",
        "width": 3200,
        "height": 512,
        "prompt": "very wide in-world dark fantasy panorama, magical completion constellation with glowing violet nodes, gold relic medallions, visible magical paths spread across the center and right side, left side softly dark and empty",
    },
    {
        "slug": "adventure-codex-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "wide heroic exploration environment, distant castle silhouettes, mountain paths made from abstract violet light, gold waypoint sparks as pure shapes, open wilderness and ruins",
    },
    {
        "slug": "content-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "grand archive chamber with blank floating crystal shards, blue-violet magical particles, gold-trimmed stone pillars, organized knowledge and discovery mood",
    },
    {
        "slug": "character-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "heroic adventurer silhouette before an enchanted mirror, armor pieces and weapon silhouettes floating around them as pure shapes, violet aura, gold trim, frost-blue highlights, identity and progression mood",
    },
    {
        "slug": "combat-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "battlefield clash at twilight, sword trails, shield sparks, violet spell impact, gold embers, dramatic combat scene, open environment",
    },
    {
        "slug": "life-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "fantasy crafting bench with herbs, cooking pot, fishing gear, alchemy bottles, warm gold candlelight, subtle violet magic, cozy progression mood",
    },
    {
        "slug": "coop-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "dark dungeon corridor with four adventurer silhouettes preparing together, violet light in the far background only, blue shadowed stone floor across the full width, teamwork and raid preparation mood, no portal glare, no bright opening",
    },
    {
        "slug": "special-achievements-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "rare golden achievement relic floating freely in a dark shrine, violet magical beams, frost-blue particles, treasure-chamber atmosphere, prestigious completion mood, full bleed dark cinematic background",
    },
    {
        "slug": "hidden-achievements-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "concealed moonlit ruin behind a curtain of violet mist, gold key suspended in shadow, soft abstract light motes, mystery and secret discovery mood, no glyphs and no inscriptions",
    },
    {
        "slug": "milestone-10",
        "kind": "milestone",
        "width": 1024,
        "height": 1024,
        "prompt": "small bronze-gold sigil awakening from darkness, faint violet sparks, first-step achievement energy, centered relic composition",
    },
    {
        "slug": "milestone-25",
        "kind": "milestone",
        "width": 1024,
        "height": 1024,
        "prompt": "quarter-complete magical compass with gold inlay and violet glow, frost-blue particles, adventurer progress mood, centered relic composition",
    },
    {
        "slug": "milestone-50",
        "kind": "milestone",
        "width": 1024,
        "height": 1024,
        "prompt": "half-lit achievement crown hovering above obsidian stone, violet and gold magic split down the center, powerful midpoint progression mood, centered relic composition, full bleed dark background",
    },
    {
        "slug": "milestone-75",
        "kind": "milestone",
        "width": 1024,
        "height": 1024,
        "prompt": "ornate golden laurel ring nearly complete, violet flame threading through the missing gap, elite progress mood, centered relic composition",
    },
    {
        "slug": "milestone-100",
        "kind": "milestone",
        "width": 1024,
        "height": 1024,
        "prompt": "completed legendary achievement seal, radiant antique gold and violet magic burst, frost-blue rim light, triumphant completion reward mood, centered relic composition",
    },
    {
        "slug": "og-achievement-tracker",
        "kind": "social",
        "width": 1200,
        "height": 640,
        "prompt": "wide cinematic composition, achievement relics arranged across an obsidian command table, violet magical constellation lines connecting them, antique gold accents, empty readable dark center space, full bleed fantasy environment, absolutely no writing",
    },
    {
        "slug": "profile-share-card-bg",
        "kind": "social",
        "width": 1200,
        "height": 640,
        "prompt": "heroic character silhouette standing before a wall of glowing achievement seals, violet magic aura, subtle gold filigree near the edges, dark readable center area, full bleed fantasy background, absolutely no writing or interface",
    },
]


def request_json(method, path, data=None):
    body = None if data is None else json.dumps(data).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFY_URL}{path}",
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def get_bytes(path, params):
    url = f"{COMFY_URL}{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def remove_white_margins(data):
    image = Image.open(io.BytesIO(data)).convert("RGB")
    pixels = image.load()
    width, height = image.size
    min_x, min_y = width, height
    max_x, max_y = -1, -1
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            if not (r > 238 and g > 238 and b > 238):
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if max_x < min_x:
        return data

    crop_w = max_x - min_x + 1
    crop_h = max_y - min_y + 1
    if crop_w >= width * 0.96 and crop_h >= height * 0.96:
        return data

    cropped = image.crop((min_x, min_y, max_x + 1, max_y + 1))
    cropped = cropped.resize(image.size, Image.Resampling.LANCZOS)
    out = io.BytesIO()
    cropped.save(out, format="PNG")
    return out.getvalue()


def workflow(asset, seed):
    layout_hint = ""
    if asset["kind"] == "category-banner":
        layout_hint = (
            "very wide panoramic in-world scene composed for a 1600 by 256 crop, "
            "left third plain dark stone and shadow, main fantasy detail centered and right, "
            "full-bleed natural environment scene, no border, no frame, no plaque, no title area"
        )
    style_anchor = LOGO_STYLE_ANCHOR if asset["kind"] == "brand-mark" else STYLE_ANCHOR
    brand_hint = ""
    if asset["kind"] == "brand-mark":
        brand_hint = (
            "single isolated emblem only, vector-logo-like silhouette, crisp edges, centered composition, "
            "perfectly flat uniform #00ff00 background for alpha removal, no gradients in background, "
            "no background texture, no cast shadow, no contact shadow"
        )
    positive = f"{style_anchor}, {NO_TEXT_GUARD}, {layout_hint}, {brand_hint}, {asset['prompt']}"
    return {
        "1": {
            "class_type": "UNETLoader",
            "inputs": {"unet_name": MODEL, "weight_dtype": "default"},
        },
        "2": {
            "class_type": "CLIPLoader",
            "inputs": {"clip_name": CLIP_1, "type": "qwen_image"},
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": VAE},
        },
        "4": {
            "class_type": "TextEncodeZImageOmni",
            "inputs": {"clip": ["2", 0], "prompt": positive, "auto_resize_images": True},
        },
        "5": {
            "class_type": "ConditioningZeroOut",
            "inputs": {"conditioning": ["4", 0]},
        },
        "6": {
            "class_type": "EmptyFlux2LatentImage",
            "inputs": {"width": asset["width"], "height": asset["height"], "batch_size": 1},
        },
        "7": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "seed": seed,
                "steps": 8,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "positive": ["4", 0],
                "negative": ["5", 0],
                "latent_image": ["6", 0],
                "denoise": 1.0,
            },
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["7", 0], "vae": ["3", 0]},
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {"images": ["8", 0], "filename_prefix": f"TLHelper/{asset['slug']}"},
        },
    }


def wait_for_output(prompt_id):
    deadline = time.time() + 600
    while time.time() < deadline:
        history = request_json("GET", f"/history/{prompt_id}")
        item = history.get(prompt_id)
        if item:
            outputs = item.get("outputs", {})
            for output in outputs.values():
                images = output.get("images") or []
                if images:
                    return images[0]
            status = item.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(json.dumps(status, indent=2))
        time.sleep(1.0)
    raise TimeoutError(f"Timed out waiting for {prompt_id}")


def generate(asset, seed):
    graph = workflow(asset, seed)
    prompt = {"prompt": graph}
    response = request_json("POST", "/prompt", prompt)
    prompt_id = response["prompt_id"]
    image = wait_for_output(prompt_id)
    data = get_bytes("/view", image)
    data = remove_white_margins(data)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUT_DIR / f"{asset['slug']}.png"
    target.write_bytes(data)
    return {
        **asset,
        "seed": seed,
        "src": f"/assets/generated/tlhelper-z/{asset['slug']}.png",
        "prompt": graph["4"]["inputs"]["prompt"],
        "negative": NEGATIVE,
        "comfy": {"prompt_id": prompt_id, "source": image},
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--base-seed", type=int, default=72026001)
    args = parser.parse_args()

    if args.smoke:
        assets = [{**ASSETS[0], "width": 768, "height": 320, "slug": "smoke-adventure-codex-banner"}]
    elif args.only:
        selected = set(args.only)
        assets = [asset for asset in ASSETS if asset["slug"] in selected or asset["kind"] in selected]
    else:
        assets = ASSETS

    manifest = []
    for index, asset in enumerate(assets):
        seed = args.base_seed + index
        print(f"Generating {asset['slug']} {asset['width']}x{asset['height']} seed={seed}", flush=True)
        manifest.append(generate(asset, seed))

    if args.smoke:
        print(f"Wrote {len(manifest)} smoke image(s) to {OUT_DIR}")
        return

    manifest_path = OUT_DIR / "manifest.json"
    previous = []
    if manifest_path.exists() and not args.smoke:
        previous = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    merged = [entry for entry in previous if entry["slug"] not in {item["slug"] for item in manifest}]
    merged.extend(manifest)
    manifest_path.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    print(f"Wrote {len(manifest)} image(s) to {OUT_DIR}")


if __name__ == "__main__":
    main()
