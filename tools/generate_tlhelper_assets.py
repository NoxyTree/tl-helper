import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path


COMFY_URL = "http://127.0.0.1:8188"
OUT_DIR = Path("public/assets/generated/tlhelper-z")
MODEL = "z_image_turbo_bf16.safetensors"
CLIP_1 = "qwen_3_4b.safetensors"
VAE = "ae.safetensors"

STYLE_ANCHOR = (
    "TLHelper arcane chronicle style, dark high-fantasy MMORPG interface artwork, "
    "obsidian and midnight blue atmosphere, violet void magic, antique gold filigree, "
    "frost-blue rim light, elegant cinematic lighting, detailed but readable, "
    "premium game guide website asset, no text, no logo, no UI, no watermark"
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
    "profile card, dashboard, screenshot, white background, white border, paper frame"
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
        "prompt": "ultra-wide achievement tracker header art with absolutely no words, no letters, no symbols resembling writing, no inscriptions, no title, no logo; left third is plain dark obsidian stone and soft shadow only for website copy; right two thirds show an ornate achievement board viewed from above, bright violet constellation paths, antique gold relic frames, frost-blue magical highlights, strong visible fantasy detail",
    },
    {
        "slug": "achievement-overview-strip",
        "kind": "layout-strip",
        "width": 3200,
        "height": 512,
        "prompt": "very wide panoramic achievement overview strip, ornate dark fantasy completion board with glowing violet achievement nodes, gold filigree border pieces, visible magical paths and relic medallions spread across the center and right side, left side softly dark for readable copy, no text",
    },
    {
        "slug": "adventure-codex-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "ancient quest codex opened on a stone table, glowing map lines across Laslan wilderness, violet magical wind, gold quest markers as abstract light, distant castle silhouettes, heroic exploration mood",
    },
    {
        "slug": "content-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "grand archive chamber filled with floating parchment, dungeon maps, sealed scrolls, and blue-violet magical particles, gold-trimmed stone pillars, organized knowledge and discovery mood",
    },
    {
        "slug": "character-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "heroic adventurer silhouette before an enchanted mirror, armor pieces and weapon sigils floating around them, violet aura, gold trim, frost-blue highlights, identity and progression mood",
    },
    {
        "slug": "combat-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "battlefield clash at twilight, sword trails, shield sparks, violet spell impact, gold embers, dramatic but not too busy, high-fantasy combat achievement mood",
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
        "prompt": "four adventurer silhouettes entering a glowing dungeon gate together, violet portal, gold runes on stone archway, teamwork and raid preparation mood",
    },
    {
        "slug": "special-achievements-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "rare golden achievement relic floating freely in a dark shrine, violet magical beams, frost-blue particles, ornate treasure-chamber atmosphere, prestigious completion mood, full bleed dark cinematic background, no pedestal, no plaque, no inscription",
    },
    {
        "slug": "hidden-achievements-banner",
        "kind": "category-banner",
        "width": 3200,
        "height": 512,
        "prompt": "concealed moonlit ruin behind a curtain of violet mist, hidden glyphs glowing faintly, gold key suspended in shadow, mystery and secret discovery mood",
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


def workflow(asset, seed):
    layout_hint = ""
    if asset["kind"] == "category-banner":
        layout_hint = (
            "very wide panoramic website category strip composed for a 1600 by 256 pixel banner, "
            "left third plain dark stone and shadow for readable page copy, main fantasy detail centered and right, "
            "full-bleed scene, absolutely no words, no letters, no title, no logo, no inscription, no UI"
        )
    style_anchor = LOGO_STYLE_ANCHOR if asset["kind"] == "brand-mark" else STYLE_ANCHOR
    brand_hint = ""
    if asset["kind"] == "brand-mark":
        brand_hint = (
            "single isolated emblem only, vector-logo-like silhouette, crisp edges, centered composition, "
            "perfectly flat uniform #00ff00 background for alpha removal, no gradients in background, "
            "no background texture, no cast shadow, no contact shadow"
        )
    positive = f"{style_anchor}, {layout_hint}, {brand_hint}, {asset['prompt']}, no text, no UI"
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
    prompt = {"prompt": workflow(asset, seed)}
    response = request_json("POST", "/prompt", prompt)
    prompt_id = response["prompt_id"]
    image = wait_for_output(prompt_id)
    data = get_bytes("/view", image)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUT_DIR / f"{asset['slug']}.png"
    target.write_bytes(data)
    return {
        **asset,
        "seed": seed,
        "src": f"/assets/generated/tlhelper-z/{asset['slug']}.png",
        "prompt": f"{STYLE_ANCHOR}, {asset['prompt']}",
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
