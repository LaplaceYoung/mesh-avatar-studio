# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10.4"]
# ///
"""Prepare auditable local crops from explicit, observed source-pixel regions.

This tool does not detect anatomy. An agent/user supplies region proposals after
viewing the image; confidence and observations remain proposals, not validation.
"""
import argparse
import hashlib
import json
import math
import re
import sys
import uuid
from pathlib import Path

from PIL import Image, ImageDraw
from agent_common import ROOT, font, inside_repo, save_image, save_json


def prepare(project, regions_file):
    project = inside_repo(project)
    private_root = (ROOT / "projects").resolve()
    if not project.is_relative_to(private_root) or project == private_root:
        raise ValueError("project must be a private directory under projects/")
    source = (project / "source.png").resolve()
    if not source.is_relative_to(project):
        raise ValueError("source.png must stay inside this project")
    specification = inside_repo(regions_file)
    if not specification.is_relative_to(project):
        raise ValueError("region specification must stay inside this project")
    regions = json.loads(specification.read_text(encoding="utf-8"))
    if not isinstance(regions, list) or not 1 <= len(regions) <= 32:
        raise ValueError("regions must be an array with 1 to 32 entries")
    with Image.open(source) as opened:
        if opened.format != "PNG":
            raise ValueError("source.png must be a PNG")
        if opened.width * opened.height > 16_000_000:
            raise ValueError("source exceeds 16 megapixels")
        image = opened.convert("RGBA")
    w, h = image.size
    names = set()
    for region in regions:
        if not isinstance(region, dict):
            raise ValueError("each region must be an object")
        name, box = region.get("name"), region.get("box")
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,47}", name) or name in names:
            raise ValueError("region names must be unique ASCII identifiers")
        names.add(name)
        if not isinstance(box, list) or len(box) != 4 or any(type(v) is not int for v in box):
            raise ValueError(f"{name}: box must be four integer source coordinates")
        x0, y0, x1, y1 = box
        if not 0 <= x0 < x1 <= w or not 0 <= y0 < y1 <= h:
            raise ValueError(f"{name}: box must be inside the source image")
        step = region.get("step", 5)
        if type(step) is not int or not 1 <= step <= 200:
            raise ValueError(f"{name}: step must be an integer from 1 to 200")
        if not isinstance(region.get("observation"), str) or not region["observation"].strip():
            raise ValueError(f"{name}: a visual observation is required")
        confidence = region.get("confidence")
        if confidence not in ("low", "medium", "high"):
            raise ValueError(f"{name}: confidence must be low, medium or high (self-reported)")
    output = inside_repo(project / "work" / f"vision-{uuid.uuid4().hex[:12]}")
    if not output.is_relative_to(project):
        raise ValueError("evidence output must stay inside this project")
    output.mkdir(parents=True, exist_ok=False)
    overview = image.copy()
    draw = ImageDraw.Draw(overview)
    manifest = {"version": 1, "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "sourceSize": [w, h], "status": "proposals-require-visual-review", "regions": []}
    for region in regions:
        name, (x0, y0, x1, y1) = region["name"], region["box"]
        crop = image.crop((x0, y0, x1, y1))
        # Bound both axes: narrow/tall crops cannot allocate unbounded review images.
        scale = min(4, 1400 / crop.width, 1400 / crop.height)
        display_size = [max(1, round(crop.width * scale)), max(1, round(crop.height * scale))]
        sx, sy = display_size[0] / crop.width, display_size[1] / crop.height
        plain = crop.resize(display_size, Image.Resampling.NEAREST)
        save_image(plain, output / f"{name}-detail.png")
        canvas = Image.new("RGB", (display_size[0] + 64, display_size[1] + 40), "#eeeeee")
        background = Image.new("RGBA", plain.size, "#999999")
        background.alpha_composite(plain)
        canvas.paste(background.convert("RGB"), (64, 40))
        grid = ImageDraw.Draw(canvas)
        step = region.get("step", 5)
        x_stride, y_stride = max(1, math.ceil(48 / (step * sx))), max(1, math.ceil(22 / (step * sy)))
        for x in range(math.ceil(x0 / step) * step, x1, step):
            px = 64 + round((x - x0) * sx)
            grid.line((px, 40, px, canvas.height), fill="#697680")
            if (x // step) % x_stride == 0:
                grid.text((px + 2, 16), str(x), font=font(12), fill="#14191c")
        for y in range(math.ceil(y0 / step) * step, y1, step):
            py = 40 + round((y - y0) * sy)
            grid.line((64, py, canvas.width, py), fill="#697680")
            if (y // step) % y_stride == 0:
                grid.text((4, py - 6), str(y), font=font(12), fill="#14191c")
        grid.text((4, 2), "source px", font=font(12), fill="#14191c")
        save_image(canvas, output / f"{name}-grid.png")
        draw.rectangle((x0, y0, x1 - 1, y1 - 1), outline="#ff7040", width=2)
        draw.text((x0 + 3, y0 + 3), name, font=font(14), fill="#ff7040", stroke_width=1, stroke_fill="#ffffff")
        manifest["regions"].append({**region, "detail": f"{name}-detail.png", "grid": f"{name}-grid.png",
            "gridTransform": {"origin": [64, 40], "scale": [sx, sy], "sourceOffset": [x0, y0],
                              "inverse": "source = (gridPixel - origin) / scale + sourceOffset"},
            "reviewed": False})
    save_image(overview, output / "overview.png")
    save_json(manifest, output / "manifest.json")
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project", type=Path)
    parser.add_argument("--regions", required=True, type=Path)
    args = parser.parse_args()
    try:
        output = prepare(args.project, args.regions)
        print(f"Evidence: {output.relative_to(ROOT)}/manifest.json")
        print("Inspect overview, detail and grid images. Region confidence is self-reported, not a quality score.")
    except (OSError, ValueError, KeyError) as error:
        print(f"vision-regions: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
