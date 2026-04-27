import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SPECIES_DIR = path.join(ROOT, "packs", "_source", "hgttgspecies");
const SPECIES_FEATURES_DIR = path.join(ROOT, "packs", "_source", "hgttgspeciesfeatures");
const ART_DIR = path.join(ROOT, "icons", "packs", "Species", "hgttg");
const CACHE_DIR = path.join(ROOT, "utils", ".hgttg-pdf-art-cache");
const MANIFEST_PATH = path.join(ROOT, "utils", "hgttg-pdf-art-sources.json");
const REPORT_PATH = path.join(ROOT, "utils", "hgttg-pdf-art-report.md");
const ATTRIBUTION_PATH = path.join(ROOT, "ATTRIBUTION-HGTTG-ART.md");
const DEFAULT_PDF_PATH = path.resolve(ROOT, "..", "..", "SW5e Docs", "hgttg.pdf");
const DEFAULT_MARKDOWN_PATH = path.resolve(ROOT, "..", "..", "SW5e Docs", "hgttg.md");
const MODULE_ART_PREFIX = "modules/sw5e-module/icons/packs/Species/hgttg";
const GENERIC_ICON = "icons/svg/mystery-man.svg";
const ARGS = new Set(process.argv.slice(2));
const ARG_LIST = process.argv.slice(2);

const PYTHON_EXTRACTOR = String.raw`
import json
import pathlib
import sys
import fitz
from PIL import Image, ImageChops, ImageEnhance, ImageStat
from collections import deque
from io import BytesIO

config = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
pdf_path = config["pdfPath"]
art_dir = pathlib.Path(config["artDir"])
cache_dir = pathlib.Path(config["cacheDir"])
entries = config["entries"]
zoom = float(config.get("zoom", 2.5))
art_dir.mkdir(parents=True, exist_ok=True)
cache_dir.mkdir(parents=True, exist_ok=True)
doc = fitz.open(pdf_path)
results = []

def crop_portrait(image, window):
    width, height = image.size
    wx0, wy0, wx1, wy1 = window["box"]
    region_left = int(width * wx0)
    region_top = int(height * wy0)
    region_right = int(width * wx1)
    fallback_bottom = int(height * wy1)
    region_bottom = fallback_bottom
    region_box = (region_left, region_top, region_right, region_bottom)
    region = image.crop(region_box).convert("RGB")
    if window.get("saturationCrop", False):
        bbox = saturated_art_component_bbox(region)
        if not bbox:
            return { "image": region, "cropBox": region_box, "artifactWarnings": ["no-saturated-art-component"] }
        left, top, right, bottom = bbox
        bbox_width = right - left
        bbox_height = bottom - top
        pad_x = max(int(region.size[0] * 0.1), int(bbox_width * (1.25 if bbox_width < region.size[0] * 0.3 else 0.45)))
        pad_y = max(int(region.size[1] * 0.08), int(bbox_height * 0.22))
        left = max(0, left - pad_x)
        top = max(0, top - pad_y)
        right = min(region.size[0], right + pad_x)
        bottom = min(region.size[1], bottom + pad_y)
        red_top = detect_red_heading_top(region, left, top, right, bottom)
        if red_top and red_top > top + int(region.size[1] * 0.18):
            bottom = min(bottom, max(top + 20, red_top - int(region.size[1] * 0.01)))
        crop = region.crop((left, top, right, bottom))
        crop_box = (region_box[0] + left, region_box[1] + top, region_box[0] + right, region_box[1] + bottom)
        return { "image": crop, "cropBox": crop_box, "artifactWarnings": artifact_warnings(crop) }
    if window.get("fixedFrame", False):
        return { "image": region, "cropBox": region_box, "artifactWarnings": artifact_warnings(region) }
    bg = Image.new("RGB", region.size, region.getpixel((region.size[0] - 5, 5)))
    diff = ImageChops.difference(region, bg).convert("L")
    mask = diff.point(lambda value: 255 if value > 18 else 0)
    bbox = largest_art_component_bbox(mask)
    if not bbox:
        return { "image": region, "cropBox": region_box, "artifactWarnings": ["no-component-bbox"] }
    left, top, right, bottom = bbox
    pad_x = int(region.size[0] * 0.06)
    pad_y = int(region.size[1] * 0.08)
    left = max(0, left - pad_x)
    top = max(0, top - pad_y)
    right = min(region.size[0], right + pad_x)
    bottom = min(region.size[1], bottom + pad_y)
    crop = region.crop((left, top, right, bottom))
    crop_box = (region_box[0] + left, region_box[1] + top, region_box[0] + right, region_box[1] + bottom)
    trimmed = trim_light_edges(crop)
    return { "image": trimmed, "cropBox": crop_box, "artifactWarnings": artifact_warnings(trimmed) }

def detect_red_heading_top(image, left, top, right, bottom):
    rgb = image.convert("RGB")
    pixels = rgb.load()
    red_rows = []
    for y in range(top, bottom):
        red_count = 0
        for x in range(left, right):
            r, g, b = pixels[x, y]
            if r > 145 and g < 95 and b < 95 and r > g * 1.35 and r > b * 1.35:
                red_count += 1
        if red_count > max(8, (right - left) * 0.02):
            red_rows.append(y)
    return min(red_rows) if red_rows else None

def detect_traits_heading_top(image, left, top, right, fallback_bottom):
    rgb = image.convert("RGB")
    width, height = rgb.size
    search_top = int(height * 0.22)
    search_bottom = min(fallback_bottom, int(height * 0.58))
    pixels = rgb.load()
    red_rows = []
    for y in range(search_top, search_bottom):
        red_count = 0
        for x in range(left, right):
            r, g, b = pixels[x, y]
            if r > 145 and g < 90 and b < 90 and r > g * 1.35 and r > b * 1.35:
                red_count += 1
        if red_count > max(8, (right - left) * 0.015):
            red_rows.append(y)
    if not red_rows:
        return fallback_bottom
    return max(top + 20, min(red_rows) - int(height * 0.015))

def largest_art_component_bbox(mask):
    reduced_width = 220
    ratio = reduced_width / mask.size[0]
    reduced_height = max(1, int(mask.size[1] * ratio))
    small = mask.resize((reduced_width, reduced_height), Image.Resampling.NEAREST)
    pixels = small.load()
    visited = set()
    best = None
    best_score = 0
    for y in range(reduced_height):
        for x in range(reduced_width):
            if pixels[x, y] == 0 or (x, y) in visited:
                continue
            queue = deque([(x, y)])
            visited.add((x, y))
            min_x = max_x = x
            min_y = max_y = y
            count = 0
            while queue:
                cx, cy = queue.popleft()
                count += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or nx >= reduced_width or ny < 0 or ny >= reduced_height:
                        continue
                    if pixels[nx, ny] == 0 or (nx, ny) in visited:
                        continue
                    visited.add((nx, ny))
                    queue.append((nx, ny))
            box_width = max_x - min_x + 1
            box_height = max_y - min_y + 1
            if count < 40 or box_height < 18 or box_width < 8:
                continue
            # Reject long page-rule/table lines and bottom trait text blocks.
            if box_width / max(1, box_height) > 8:
                continue
            if min_y > reduced_height * 0.72 and box_height < reduced_height * 0.22:
                continue
            score = count * (box_height / reduced_height)
            if score > best_score:
                best_score = score
                best = (min_x, min_y, max_x + 1, max_y + 1)
    if not best:
        return mask.getbbox()
    scale_x = mask.size[0] / reduced_width
    scale_y = mask.size[1] / reduced_height
    return (
        int(best[0] * scale_x),
        int(best[1] * scale_y),
        int(best[2] * scale_x),
        int(best[3] * scale_y)
    )

def saturated_art_component_bbox(image):
    saturation = image.convert("RGB").convert("HSV").split()[1]
    reduced_width = 240
    ratio = reduced_width / saturation.size[0]
    reduced_height = max(1, int(saturation.size[1] * ratio))
    small = saturation.resize((reduced_width, reduced_height), Image.Resampling.NEAREST)
    pixels = small.load()
    visited = set()
    best = None
    best_score = 0
    for y in range(reduced_height):
        for x in range(reduced_width):
            if pixels[x, y] < 35 or (x, y) in visited:
                continue
            queue = deque([(x, y)])
            visited.add((x, y))
            min_x = max_x = x
            min_y = max_y = y
            count = 0
            while queue:
                cx, cy = queue.popleft()
                count += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or nx >= reduced_width or ny < 0 or ny >= reduced_height:
                        continue
                    if (nx, ny) in visited or pixels[nx, ny] < 35:
                        continue
                    visited.add((nx, ny))
                    queue.append((nx, ny))
            box_width = max_x - min_x + 1
            box_height = max_y - min_y + 1
            if count < 30 or box_width < 5 or box_height < 8:
                continue
            if box_width / max(1, box_height) > 7:
                continue
            if min_x > reduced_width * 0.72 and box_width < reduced_width * 0.22:
                continue
            if box_height > reduced_height * 0.85 and box_width < reduced_width * 0.25:
                continue
            if min_y > reduced_height * 0.65:
                continue
            score = count * (box_height / reduced_height)
            if min_x > reduced_width * 0.15:
                score *= 1.4
            if score > best_score:
                best_score = score
                best = (min_x, min_y, max_x + 1, max_y + 1)
    if not best:
        return None
    scale_x = saturation.size[0] / reduced_width
    scale_y = saturation.size[1] / reduced_height
    return (
        int(best[0] * scale_x),
        int(best[1] * scale_y),
        int(best[2] * scale_x),
        int(best[3] * scale_y)
    )

def trim_light_edges(image):
    rgb = image.convert("RGB")
    bg = Image.new("RGB", rgb.size, rgb.getpixel((rgb.size[0] - 1, 0)))
    diff = ImageChops.difference(rgb, bg).convert("L")
    mask = diff.point(lambda value: 255 if value > 14 else 0)
    bbox = mask.getbbox()
    if bbox:
        left, top, right, bottom = bbox
        pad = max(8, int(max(rgb.size) * 0.04))
        rgb = rgb.crop((max(0, left - pad), max(0, top - pad), min(rgb.size[0], right + pad), min(rgb.size[1], bottom + pad)))
    return rgb

def artifact_warnings(image):
    warnings = []
    gray = image.convert("L")
    width, height = gray.size
    pixels = gray.load()
    long_lines = 0
    for y in range(0, height, max(1, height // 80)):
        run = 0
        max_run = 0
        for x in range(width):
            value = pixels[x, y]
            if value < 80 or (120 < value < 190):
                run += 1
                max_run = max(max_run, run)
            else:
                run = 0
        if max_run > width * 0.65:
            long_lines += 1
    if long_lines >= 3:
        warnings.append("horizontal-rule-or-text-lines")
    left_text_rows = 0
    left_limit = max(1, int(width * 0.28))
    for y in range(0, height, max(1, height // 100)):
        dark = 0
        for x in range(left_limit):
            if pixels[x, y] < 120:
                dark += 1
        if dark > left_limit * 0.08:
            left_text_rows += 1
    if left_text_rows > 6:
        warnings.append("left-column-text")
    bottom_text_rows = 0
    bottom_start = int(height * 0.72)
    for y in range(bottom_start, height, max(1, height // 100)):
        dark = 0
        for x in range(width):
            if pixels[x, y] < 120:
                dark += 1
        if dark > width * 0.05:
            bottom_text_rows += 1
    if bottom_text_rows > 5:
        warnings.append("bottom-trait-text")
    if width / max(1, height) > 2.4 or height / max(1, width) > 3.4:
        warnings.append("unusual-aspect-ratio")
    return warnings

def image_metrics(image):
    rgb = image.convert("RGB")
    gray = rgb.convert("L")
    stat_gray = ImageStat.Stat(gray)
    stat_rgb = ImageStat.Stat(rgb)
    color_spread = sum(stat_rgb.stddev) / 3
    saturation = ImageStat.Stat(rgb.convert("HSV").split()[1]).mean[0]
    contrast = stat_gray.stddev[0]
    return { "contrast": contrast, "colorSpread": color_spread, "saturation": saturation }

def score_crop(crop, source_type, window_name, artifact_warnings):
    metrics = image_metrics(crop)
    width, height = crop.size
    area = width * height
    score = metrics["contrast"] * 2.2 + metrics["colorSpread"] * 1.5 + metrics["saturation"] * 0.45
    score += min(area / 6000, 80)
    if source_type == "page-render":
        score += 18
    if window_name == "art-component-frame":
        score -= 30
    if window_name == "saturation-art":
        score += 140
    if window_name == "painted-art-frame":
        score -= 60
    if window_name == "fixed-art-frame":
        score += 20
    if window_name == "portrait-column":
        score += 18
    if window_name == "tight-portrait":
        score += 28
    if window_name == "art-only":
        score += 22
    if width < 120 or height < 120:
        score -= 120
    if artifact_warnings:
        score -= 60 * len(artifact_warnings)
    return { **metrics, "qualityScore": score, "area": area }

def make_candidate(image, source_type, source_xref, window):
    cropped = crop_portrait(image, window)
    crop = cropped["image"]
    enhanced = ImageEnhance.Contrast(crop).enhance(1.08)
    enhanced = ImageEnhance.Color(enhanced).enhance(1.08)
    warnings = cropped["artifactWarnings"]
    metrics = score_crop(enhanced, source_type, window["name"], warnings)
    return {
        "image": enhanced,
        "sourceType": source_type,
        "sourceXref": source_xref,
        "windowName": window["name"],
        "cropBox": cropped["cropBox"],
        "artifactWarnings": warnings,
        **metrics
    }

def source_images(doc, page, zoom):
    images = []
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    images.append({
        "sourceType": "page-render",
        "sourceXref": None,
        "image": Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    })
    for index, image_info in enumerate(page.get_images(full=True)):
        xref = image_info[0]
        try:
            extracted = doc.extract_image(xref)
            images.append({
                "sourceType": f"embedded-layer-{index + 1}",
                "sourceXref": xref,
                "image": Image.open(BytesIO(extracted["image"])).convert("RGB")
            })
        except Exception:
            continue
    return images

def best_crop_candidate(doc, page, zoom):
    windows = [
        { "name": "saturation-art", "box": (0.30, 0.00, 1.00, 0.48), "saturationCrop": True },
        { "name": "art-component-frame", "box": (0.36, 0.00, 1.00, 0.40) },
        { "name": "fixed-art-frame", "box": (0.36, 0.00, 1.00, 0.40), "fixedFrame": True },
        { "name": "tight-portrait", "box": (0.50, 0.02, 0.98, 0.40) },
        { "name": "art-only", "box": (0.45, 0.00, 1.00, 0.42) },
    ]
    candidates = []
    for source in source_images(doc, page, zoom):
        if source["sourceType"] != "page-render":
            continue
        for window in windows:
            candidates.append(make_candidate(source["image"], source["sourceType"], source["sourceXref"], window))
    candidates.sort(key=lambda candidate: candidate["qualityScore"], reverse=True)
    return candidates[0], candidates

for entry in entries:
    page_number = int(entry["pdfPage"])
    if page_number < 1 or page_number > len(doc):
        results.append({ **entry, "status": "missing", "reason": "page-out-of-range" })
        continue
    page = doc[page_number - 1]
    best, candidates = best_crop_candidate(doc, page, zoom)
    crop = best["image"]
    if min(crop.size) < 40:
        results.append({ **entry, "status": "missing", "reason": "crop-too-small", "width": crop.size[0], "height": crop.size[1] })
        continue
    output_file = art_dir / f"{entry['slug']}.png"
    crop.save(output_file, optimize=True)
    cache_file = cache_dir / f"{entry['slug']}-page.png"
    best["image"].resize((max(1, int(best["image"].size[0] * 0.25)), max(1, int(best["image"].size[1] * 0.25)))).save(cache_file, optimize=True)
    missing_art = best["contrast"] < 12 or best["saturation"] < 5 or "no-saturated-art-component" in best["artifactWarnings"]
    confidence = "high" if crop.size[0] >= 100 and crop.size[1] >= 100 and best["qualityScore"] > 95 and not missing_art else "low"
    status = "mapped" if confidence == "high" else "low-confidence"
    if missing_art:
        best["artifactWarnings"].append("missing-or-nearly-blank-art")
    results.append({
        **entry,
        "status": status,
        "confidence": confidence,
        "width": crop.size[0],
        "height": crop.size[1],
        "localPath": str(output_file),
        "cachePath": str(cache_file),
        "sourceType": best["sourceType"],
        "sourceXref": best["sourceXref"],
        "windowName": best["windowName"],
        "cropBox": best["cropBox"],
        "qualityScore": round(best["qualityScore"], 2),
        "contrast": round(best["contrast"], 2),
        "saturation": round(best["saturation"], 2),
        "colorSpread": round(best["colorSpread"], 2),
        "artifactWarnings": best["artifactWarnings"],
        "candidateCount": len(candidates),
        "pageTextPreview": page.get_text("text")[:120].replace("\n", " ")
    })

print(json.dumps({ "pages": len(doc), "results": results }, indent=2))
`;

function getArgValue(name, fallback = undefined) {
	const index = ARG_LIST.indexOf(name);
	if ( index === -1 ) return fallback;
	const value = ARG_LIST[index + 1];
	if ( !value || value.startsWith("--") ) return fallback;
	return value;
}

function normalizeWhitespace(value) {
	return String(value ?? "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
	return String(value ?? "")
		.normalize("NFKD")
		.replace(/[^\w\s-]/g, " ")
		.toLowerCase()
		.replace(/[_\s]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

async function readJson(filePath, fallback = null) {
	try {
		return JSON.parse(await fs.readFile(filePath, "utf8"));
	} catch (error) {
		if ( error?.code === "ENOENT" ) return fallback;
		throw error;
	}
}

async function writeJson(filePath, data) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function parseMarkdownSpeciesNames(markdown) {
	const lines = String(markdown ?? "").replace(/\r/g, "").split("\n").map(normalizeWhitespace).filter(Boolean);
	const tocStart = lines.findIndex(line => line === "Table of Contents");
	const firstSpeciesIndex = lines.findIndex((line, index) => index > tocStart && line === "Abednedo" && lines[index + 1] === "Visual Characteristics");
	if ( tocStart === -1 || firstSpeciesIndex === -1 ) throw new Error("Could not read HGTTG species order from markdown.");
	const names = [];
	for ( const line of lines.slice(tocStart + 1, firstSpeciesIndex) ) {
		if ( /^pg\d+$/i.test(line) ) continue;
		if ( /^Heretic's Guide to the Galaxy$/i.test(line) ) continue;
		if ( /^Table of Contents$/i.test(line) ) continue;
		names.push(line);
	}
	return Array.from(new Set(names));
}

async function readSpeciesBySlug() {
	const entries = await fs.readdir(SPECIES_DIR);
	const species = new Map();
	for ( const entry of entries ) {
		if ( !entry.endsWith(".json") ) continue;
		const filePath = path.join(SPECIES_DIR, entry);
		const item = JSON.parse(await fs.readFile(filePath, "utf8"));
		const slug = item.system?.identifier || path.basename(entry, ".json");
		species.set(slug, { name: item.name, slug, filePath });
	}
	return species;
}

async function buildSpeciesEntries(markdownPath) {
	const names = parseMarkdownSpeciesNames(await fs.readFile(markdownPath, "utf8"));
	const speciesBySlug = await readSpeciesBySlug();
	return names.map((name, index) => {
		const slug = slugify(name);
		const generated = speciesBySlug.get(slug);
		return {
			name: generated?.name ?? name,
			slug,
			pdfPage: index + 3,
			speciesFile: generated ? path.relative(ROOT, generated.filePath).replace(/\\/g, "/") : "",
			expected: Boolean(generated)
		};
	});
}

function runPythonExtractor(configPath) {
	return new Promise((resolve, reject) => {
		const child = spawn("python", ["-c", PYTHON_EXTRACTOR, configPath], {
			cwd: ROOT,
			stdio: ["ignore", "pipe", "pipe"]
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", chunk => { stdout += chunk; });
		child.stderr.on("data", chunk => { stderr += chunk; });
		child.on("error", reject);
		child.on("close", code => {
			if ( code !== 0 ) {
				reject(new Error(stderr || `Python extractor failed with exit code ${code}`));
				return;
			}
			resolve(JSON.parse(stdout));
		});
	});
}

function toModulePath(localPath) {
	return `${MODULE_ART_PREFIX}/${path.basename(localPath).replace(/\\/g, "/")}`;
}

function toRelativePath(localPath) {
	return path.relative(ROOT, localPath).replace(/\\/g, "/");
}

function buildManifest({ pdfPath, markdownPath, extraction }) {
	const generatedAt = new Date().toISOString();
	const species = extraction.results.map(result => {
		const localPath = result.localPath ? toRelativePath(result.localPath) : "";
		const modulePath = result.localPath ? toModulePath(result.localPath) : "";
		return {
			name: result.name,
			slug: result.slug,
			status: result.status,
			confidence: result.confidence ?? "missing",
			pdfPage: result.pdfPage,
			pdfPath,
			extractedImage: localPath,
			localPath,
			modulePath,
			width: result.width ?? null,
			height: result.height ?? null,
			sourceType: result.sourceType ?? "",
			sourceXref: result.sourceXref ?? null,
			windowName: result.windowName ?? "",
			cropBox: result.cropBox ?? null,
			qualityScore: result.qualityScore ?? null,
			contrast: result.contrast ?? null,
			saturation: result.saturation ?? null,
			colorSpread: result.colorSpread ?? null,
			artifactWarnings: result.artifactWarnings ?? [],
			candidateCount: result.candidateCount ?? 0,
			cachePath: result.cachePath ? toRelativePath(result.cachePath) : "",
			pageTextPreview: result.pageTextPreview ?? "",
			reason: result.reason ?? "",
			generatedAt
		};
	});
	return {
		generatedAt,
		source: "HGTTG PDF",
		pdfPath,
		markdownPath,
		pages: extraction.pages,
		species
	};
}

function buildReport(manifest) {
	const species = manifest.species ?? [];
	const mapped = species.filter(entry => entry.status === "mapped").length;
	const missing = species.filter(entry => entry.status === "missing").length;
	const lowConfidence = species.filter(entry => entry.status === "low-confidence").length;
	const flagged = species.filter(entry => entry.artifactWarnings?.length).length;
	const duplicateImages = Array.from(new Set(species
		.filter(entry => entry.localPath)
		.map(entry => entry.localPath)
		.filter((value, index, values) => values.indexOf(value) !== index)));
	const lines = [
		"# HGTTG PDF Art Report",
		"",
		`Generated: ${manifest.generatedAt}`,
		`PDF: ${manifest.pdfPath}`,
		`Markdown: ${manifest.markdownPath}`,
		"",
		"## Summary",
		"",
		`- Expected species: ${species.length}`,
		`- Mapped species: ${mapped}`,
		`- Missing species: ${missing}`,
		`- Low-confidence mappings: ${lowConfidence}`,
		`- Artifact warnings: ${flagged}`,
		`- Duplicate image assignments: ${duplicateImages.length}`,
		"",
		"## Species",
		""
	];
	for ( const entry of species ) {
		lines.push(`### ${entry.name}`);
		lines.push("");
		lines.push(`- Slug: \`${entry.slug}\``);
		lines.push(`- Status: ${entry.status}`);
		lines.push(`- Confidence: ${entry.confidence}`);
		lines.push(`- PDF page: ${entry.pdfPage}`);
		lines.push(`- Local art: ${entry.localPath || "none"}`);
		lines.push(`- Source: ${entry.sourceType || "none"}${entry.sourceXref ? ` (xref ${entry.sourceXref})` : ""}`);
		lines.push(`- Crop window: ${entry.windowName || "none"}`);
		lines.push(`- Quality score: ${entry.qualityScore ?? "n/a"}`);
		lines.push(`- Contrast: ${entry.contrast ?? "n/a"}`);
		lines.push(`- Saturation: ${entry.saturation ?? "n/a"}`);
		if ( entry.artifactWarnings?.length ) lines.push(`- Artifact warnings: ${entry.artifactWarnings.join(", ")}`);
		if ( entry.reason ) lines.push(`- Reason: ${entry.reason}`);
		lines.push("");
	}
	return `${lines.join("\n")}\n`;
}

function buildPdfArtFlags(entry) {
	return {
		source: "HGTTG PDF",
		pdfPath: entry.pdfPath,
		pdfPage: entry.pdfPage,
		sourceType: entry.sourceType,
		sourceXref: entry.sourceXref,
		extractedImage: entry.extractedImage,
		localPath: entry.localPath,
		modulePath: entry.modulePath,
		confidence: entry.confidence,
		qualityScore: entry.qualityScore,
		artifactWarnings: entry.artifactWarnings ?? [],
		retrievedAt: entry.generatedAt
	};
}

async function updateItemArt(filePath, modulePath, entry) {
	const item = JSON.parse(await fs.readFile(filePath, "utf8"));
	item.img = modulePath;
	item.flags = item.flags ?? {};
	item.flags["sw5e-module"] = item.flags["sw5e-module"] ?? {};
	item.flags["sw5e-module"].hgttgArt = buildPdfArtFlags(entry);
	await writeJson(filePath, item);
}

async function resetItemArt(filePath) {
	const item = JSON.parse(await fs.readFile(filePath, "utf8"));
	item.img = GENERIC_ICON;
	if ( item.flags?.["sw5e-module"]?.hgttgArt ) {
		delete item.flags["sw5e-module"].hgttgArt;
		if ( !Object.keys(item.flags["sw5e-module"]).length ) delete item.flags["sw5e-module"];
		if ( !Object.keys(item.flags).length ) delete item.flags;
	}
	await writeJson(filePath, item);
}

async function applyPdfArt(manifest) {
	let appliedSpecies = 0;
	let appliedFeatures = 0;
	let resetSpecies = 0;
	let resetFeatures = 0;
	for ( const entry of manifest.species ?? [] ) {
		const speciesPath = path.join(SPECIES_DIR, `${entry.slug}.json`);
		const featureDir = path.join(SPECIES_FEATURES_DIR, entry.slug);
		let featureEntries = [];
		try {
			featureEntries = await fs.readdir(featureDir);
		} catch {
			featureEntries = [];
		}
		if ( entry.status === "mapped" && entry.modulePath ) {
			await updateItemArt(speciesPath, entry.modulePath, entry);
			appliedSpecies += 1;
			for ( const featureEntry of featureEntries ) {
				if ( !featureEntry.endsWith(".json") ) continue;
				await updateItemArt(path.join(featureDir, featureEntry), entry.modulePath, entry);
				appliedFeatures += 1;
			}
		} else {
			await resetItemArt(speciesPath);
			resetSpecies += 1;
			for ( const featureEntry of featureEntries ) {
				if ( !featureEntry.endsWith(".json") ) continue;
				await resetItemArt(path.join(featureDir, featureEntry));
				resetFeatures += 1;
			}
		}
	}
	return { appliedSpecies, appliedFeatures, resetSpecies, resetFeatures };
}

function buildAttribution(manifest) {
	const mapped = (manifest.species ?? []).filter(entry => entry.status === "mapped" && entry.modulePath);
	const lines = [
		"# HGTTG Species Art Attribution",
		"",
		"HGTTG species art is extracted from the provided Heretic's Guide to the Galaxy PDF source document.",
		"",
		`Generated: ${new Date().toISOString()}`,
		`PDF: ${manifest.pdfPath}`,
		"",
		"## PDF-Sourced Images",
		""
	];
	for ( const entry of mapped ) {
		lines.push(`### ${entry.name}`);
		lines.push("");
		lines.push(`- Local file: \`${entry.modulePath}\``);
		lines.push(`- PDF page: ${entry.pdfPage}`);
		lines.push(`- Extraction confidence: ${entry.confidence}`);
		lines.push("");
	}
	return `${lines.join("\n")}\n`;
}

async function extractAndApply() {
	const pdfPath = path.resolve(getArgValue("--pdf", DEFAULT_PDF_PATH));
	const markdownPath = path.resolve(getArgValue("--markdown", DEFAULT_MARKDOWN_PATH));
	const entries = await buildSpeciesEntries(markdownPath);
	const config = {
		pdfPath,
		markdownPath,
		artDir: ART_DIR,
		cacheDir: CACHE_DIR,
		entries
	};
	await fs.mkdir(CACHE_DIR, { recursive: true });
	const configPath = path.join(CACHE_DIR, "extract-config.json");
	await writeJson(configPath, config);
	const extraction = await runPythonExtractor(configPath);
	const manifest = buildManifest({ pdfPath, markdownPath, extraction });
	await writeJson(MANIFEST_PATH, manifest);
	await fs.writeFile(REPORT_PATH, buildReport(manifest), "utf8");
	let applied = { appliedSpecies: 0, appliedFeatures: 0, resetSpecies: 0, resetFeatures: 0 };
	if ( !ARGS.has("--no-apply") ) {
		applied = await applyPdfArt(manifest);
		await fs.writeFile(ATTRIBUTION_PATH, buildAttribution(manifest), "utf8");
	}
	const mapped = manifest.species.filter(entry => entry.status === "mapped").length;
	const missing = manifest.species.filter(entry => entry.status === "missing").length;
	const lowConfidence = manifest.species.filter(entry => entry.status === "low-confidence").length;
	console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)} and ${path.relative(ROOT, REPORT_PATH)}.`);
	console.log(`PDF art mapped ${mapped} species, ${missing} missing, ${lowConfidence} low-confidence.`);
	console.log(`Applied art to ${applied.appliedSpecies} species and ${applied.appliedFeatures} features.`);
	console.log(`Reset ${applied.resetSpecies} species and ${applied.resetFeatures} features to generic art.`);
}

async function main() {
	await extractAndApply();
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
