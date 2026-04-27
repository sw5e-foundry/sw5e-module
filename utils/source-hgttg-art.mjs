import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SPECIES_DIR = path.join(ROOT, "packs", "_source", "hgttgspecies");
const SPECIES_FEATURES_DIR = path.join(ROOT, "packs", "_source", "hgttgspeciesfeatures");
const ART_DIR = path.join(ROOT, "icons", "packs", "Species", "hgttg");
const MANIFEST_PATH = path.join(ROOT, "utils", "hgttg-art-sources.json");
const REPORT_PATH = path.join(ROOT, "utils", "hgttg-art-report.md");
const ATTRIBUTION_PATH = path.join(ROOT, "ATTRIBUTION-HGTTG-ART.md");
const WOKIEEPEDIA_API = "https://starwars.fandom.com/api.php";
const MODULE_ART_PREFIX = "modules/sw5e-module/icons/packs/Species/hgttg";
const GENERIC_ICON = "icons/svg/mystery-man.svg";
const USER_AGENT = "sw5e-module-hgttg-art-source/1.0";
const ARGS = new Set(process.argv.slice(2));
const ARG_LIST = process.argv.slice(2);

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const LICENSE_RISK_PATTERNS = [
	/fair\s*use/i,
	/copyright/i,
	/lucasfilm/i,
	/disney/i,
	/non-free/i
];

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

function normalizeTitle(value) {
	return normalizeWhitespace(value)
		.replace(/_/g, " ")
		.replace(/\s*\/\s*/g, "/")
		.toLowerCase();
}

function stripTags(value) {
	return normalizeWhitespace(String(value ?? "").replace(/<[^>]+>/g, " "));
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
	const response = await fetch(url, {
		headers: {
			"Accept": "application/json",
			"User-Agent": USER_AGENT
		}
	});
	if ( !response.ok ) throw new Error(`Wookieepedia request failed (${response.status}) for ${url}`);
	return response.json();
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

async function readSpecies() {
	const entries = await fs.readdir(SPECIES_DIR);
	const species = [];
	for ( const entry of entries.sort((a, b) => a.localeCompare(b)) ) {
		if ( !entry.endsWith(".json") ) continue;
		const filePath = path.join(SPECIES_DIR, entry);
		const item = JSON.parse(await fs.readFile(filePath, "utf8"));
		species.push({
			name: item.name,
			slug: item.system?.identifier || path.basename(entry, ".json"),
			filePath,
			img: item.img || GENERIC_ICON
		});
	}
	return species;
}

function buildTitleCandidates(speciesName) {
	const base = normalizeWhitespace(speciesName);
	const candidates = [
		`${base}/Legends`,
		base
	];
	if ( /\(.+\)/.test(base) ) {
		const withoutParenthetical = normalizeWhitespace(base.replace(/\s*\(.+?\)\s*/g, " "));
		if ( withoutParenthetical ) candidates.push(`${withoutParenthetical}/Legends`, withoutParenthetical);
	}
	return Array.from(new Set(candidates));
}

function buildApiUrl(params) {
	const url = new URL(WOKIEEPEDIA_API);
	for ( const [key, value] of Object.entries(params) ) url.searchParams.set(key, value);
	return url;
}

async function queryPage(title) {
	const url = buildApiUrl({
		action: "query",
		format: "json",
		formatversion: "2",
		redirects: "1",
		prop: "info|pageimages",
		inprop: "url",
		piprop: "name|original|thumbnail",
		pithumbsize: "600",
		titles: title
	});
	const json = await fetchJson(url);
	const page = json.query?.pages?.[0];
	if ( !page || page.missing ) return null;
	return page;
}

async function searchPages(speciesName) {
	const url = buildApiUrl({
		action: "query",
		format: "json",
		formatversion: "2",
		list: "search",
		srlimit: "5",
		srsearch: `${speciesName} species Legends`
	});
	const json = await fetchJson(url);
	return json.query?.search ?? [];
}

async function queryImageInfo(imageTitle) {
	if ( !imageTitle ) return null;
	const url = buildApiUrl({
		action: "query",
		format: "json",
		formatversion: "2",
		prop: "imageinfo",
		iiprop: "url|mime|size|extmetadata",
		titles: imageTitle
	});
	const json = await fetchJson(url);
	const imagePage = json.query?.pages?.[0];
	return imagePage?.imageinfo?.[0] ?? null;
}

function metadataValue(metadata, key) {
	return stripTags(metadata?.[key]?.value ?? "");
}

function summarizeLicenseRisk(imageInfo) {
	const metadata = imageInfo?.extmetadata ?? {};
	const text = [
		metadataValue(metadata, "LicenseShortName"),
		metadataValue(metadata, "UsageTerms"),
		metadataValue(metadata, "Copyrighted"),
		metadataValue(metadata, "Credit"),
		metadataValue(metadata, "Artist")
	].join(" ");
	const matched = LICENSE_RISK_PATTERNS.filter(pattern => pattern.test(text)).map(pattern => pattern.source);
	return {
		needsReview: true,
		reasons: matched.length ? matched : ["manual-review-required"]
	};
}

function buildCandidate({ species, page, imageInfo, source }) {
	const metadata = imageInfo?.extmetadata ?? {};
	const originalUrl = imageInfo?.url || page.original?.source || page.thumbnail?.source || "";
	const imageTitle = page.pageimage ? `File:${page.pageimage}` : "";
	const licenseRisk = summarizeLicenseRisk(imageInfo);
	const normalizedPage = normalizeTitle(page.title);
	const expectedLegends = normalizeTitle(`${species.name}/Legends`);
	const expectedBase = normalizeTitle(species.name);
	let confidence = "low";
	if ( normalizedPage === expectedLegends ) confidence = "high";
	else if ( normalizedPage === expectedBase ) confidence = "medium";
	else if ( normalizedPage.includes(expectedBase) ) confidence = "medium";
	return {
		source,
		confidence,
		pageTitle: page.title,
		pageUrl: page.fullurl || "",
		imageTitle,
		imageUrl: originalUrl,
		mime: imageInfo?.mime || "",
		size: imageInfo?.size || null,
		width: imageInfo?.width || page.original?.width || null,
		height: imageInfo?.height || page.original?.height || null,
		artist: metadataValue(metadata, "Artist"),
		credit: metadataValue(metadata, "Credit"),
		license: metadataValue(metadata, "LicenseShortName") || metadataValue(metadata, "UsageTerms"),
		copyrighted: metadataValue(metadata, "Copyrighted"),
		description: metadataValue(metadata, "ImageDescription"),
		licenseReview: licenseRisk
	};
}

async function collectCandidatesForSpecies(species) {
	const candidates = [];
	const seenPages = new Set();
	const directTitles = buildTitleCandidates(species.name);
	for ( const title of directTitles ) {
		const page = await queryPage(title);
		await sleep(75);
		if ( !page || seenPages.has(page.title) ) continue;
		seenPages.add(page.title);
		const imageInfo = await queryImageInfo(page.pageimage ? `File:${page.pageimage}` : "");
		await sleep(75);
		if ( page.pageimage || imageInfo?.url ) candidates.push(buildCandidate({ species, page, imageInfo, source: "direct-title" }));
	}

	if ( !candidates.some(candidate => candidate.confidence === "high") ) {
		for ( const result of await searchPages(species.name) ) {
			if ( seenPages.has(result.title) ) continue;
			const page = await queryPage(result.title);
			await sleep(75);
			if ( !page || seenPages.has(page.title) ) continue;
			seenPages.add(page.title);
			const imageInfo = await queryImageInfo(page.pageimage ? `File:${page.pageimage}` : "");
			await sleep(75);
			if ( page.pageimage || imageInfo?.url ) candidates.push(buildCandidate({ species, page, imageInfo, source: "search" }));
		}
	}

	return candidates.sort((a, b) => {
		const rank = { high: 0, medium: 1, low: 2 };
		return rank[a.confidence] - rank[b.confidence] || a.pageTitle.localeCompare(b.pageTitle);
	});
}

function mergeManifestEntry(species, previousEntry, candidates) {
	const selected = previousEntry?.selected ?? candidates[0] ?? null;
	const approved = Boolean(previousEntry?.approved);
	return {
		name: species.name,
		slug: species.slug,
		currentImg: species.img,
		approved,
		status: approved ? "approved" : candidates.length ? "candidate" : "missing",
		selected,
		candidates,
		localPath: previousEntry?.localPath ?? "",
		modulePath: previousEntry?.modulePath ?? "",
		notes: previousEntry?.notes ?? []
	};
}

function buildReport(manifest) {
	const entries = manifest.species ?? [];
	const approved = entries.filter(entry => entry.approved).length;
	const found = entries.filter(entry => entry.candidates?.length).length;
	const missing = entries.filter(entry => !entry.candidates?.length).length;
	const ambiguous = entries.filter(entry => (entry.candidates ?? []).length > 1).length;
	const highRisk = entries.filter(entry => entry.selected?.licenseReview?.needsReview).length;
	const lines = [
		"# HGTTG Species Art Report",
		"",
		`Generated: ${manifest.generatedAt}`,
		`Source: ${manifest.source}`,
		"",
		"## Summary",
		"",
		`- Species checked: ${entries.length}`,
		`- Species with candidates: ${found}`,
		`- Missing candidates: ${missing}`,
		`- Ambiguous candidates: ${ambiguous}`,
		`- Approved entries: ${approved}`,
		`- Entries requiring licensing review: ${highRisk}`,
		"",
		"## Candidates",
		""
	];
	for ( const entry of entries ) {
		const selected = entry.selected;
		lines.push(`### ${entry.name}`);
		lines.push("");
		lines.push(`- Slug: \`${entry.slug}\``);
		lines.push(`- Status: ${entry.status}`);
		lines.push(`- Approved: ${entry.approved ? "yes" : "no"}`);
		if ( selected ) {
			lines.push(`- Page: ${selected.pageUrl || selected.pageTitle}`);
			lines.push(`- Image: ${selected.imageUrl || selected.imageTitle}`);
			lines.push(`- Confidence: ${selected.confidence}`);
			lines.push(`- License: ${selected.license || "unknown"}`);
			lines.push(`- Artist: ${selected.artist || "unknown"}`);
			lines.push(`- Credit: ${selected.credit || "unknown"}`);
			lines.push(`- Licensing review: ${selected.licenseReview?.needsReview ? "required" : "not flagged"}`);
		} else {
			lines.push("- Page: none found");
		}
		lines.push("");
	}
	return `${lines.join("\n")}\n`;
}

async function collectManifest({ limit = null } = {}) {
	const species = await readSpecies();
	const previousManifest = await readJson(MANIFEST_PATH, { species: [] });
	const previousBySlug = new Map((previousManifest.species ?? []).map(entry => [entry.slug, entry]));
	const selectedSpecies = limit ? species.slice(0, limit) : species;
	const speciesEntries = [];
	for ( const [index, item] of selectedSpecies.entries() ) {
		console.log(`[${index + 1}/${selectedSpecies.length}] Looking up ${item.name}`);
		const candidates = await collectCandidatesForSpecies(item);
		speciesEntries.push(mergeManifestEntry(item, previousBySlug.get(item.slug), candidates));
	}
	const skippedEntries = limit ? species.slice(limit).map(item => previousBySlug.get(item.slug)).filter(Boolean) : [];
	const entries = [...speciesEntries, ...skippedEntries].sort((a, b) => a.name.localeCompare(b.name));
	return {
		generatedAt: new Date().toISOString(),
		source: "Wookieepedia / Fandom MediaWiki API",
		api: WOKIEEPEDIA_API,
		reviewRequired: true,
		species: entries
	};
}

function inferExtension(candidate) {
	const urlPath = new URL(candidate.imageUrl).pathname;
	let ext = path.extname(urlPath).toLowerCase();
	if ( ext === ".jpeg" ) ext = ".jpg";
	if ( SUPPORTED_EXTENSIONS.has(ext) ) return ext;
	const mimeExtension = {
		"image/jpeg": ".jpg",
		"image/png": ".png",
		"image/webp": ".webp",
		"image/gif": ".gif"
	}[candidate.mime];
	return mimeExtension || "";
}

async function downloadApprovedArt(manifest) {
	await fs.mkdir(ART_DIR, { recursive: true });
	let downloaded = 0;
	for ( const entry of manifest.species ?? [] ) {
		if ( !entry.approved || !entry.selected?.imageUrl ) continue;
		const ext = inferExtension(entry.selected);
		if ( !ext ) {
			entry.notes = Array.from(new Set([...(entry.notes ?? []), "Skipped download: unsupported image extension."]));
			continue;
		}
		const localFileName = `${entry.slug}${ext}`;
		const localPath = path.join(ART_DIR, localFileName);
		const response = await fetch(entry.selected.imageUrl, {
			headers: { "User-Agent": USER_AGENT }
		});
		if ( !response.ok ) {
			entry.notes = Array.from(new Set([...(entry.notes ?? []), `Skipped download: HTTP ${response.status}.`]));
			continue;
		}
		const contentLength = Number(response.headers.get("content-length") ?? 0);
		if ( contentLength > 5_000_000 ) {
			entry.notes = Array.from(new Set([...(entry.notes ?? []), "Skipped download: image exceeds 5 MB."]));
			continue;
		}
		const buffer = Buffer.from(await response.arrayBuffer());
		if ( buffer.length > 5_000_000 ) {
			entry.notes = Array.from(new Set([...(entry.notes ?? []), "Skipped download: image exceeds 5 MB."]));
			continue;
		}
		await fs.writeFile(localPath, buffer);
		entry.localPath = path.relative(ROOT, localPath).replace(/\\/g, "/");
		entry.modulePath = `${MODULE_ART_PREFIX}/${localFileName}`;
		entry.status = "downloaded";
		downloaded += 1;
	}
	return downloaded;
}

function buildArtFlags(entry) {
	return {
		source: "Wookieepedia",
		pageTitle: entry.selected?.pageTitle ?? "",
		pageUrl: entry.selected?.pageUrl ?? "",
		imageTitle: entry.selected?.imageTitle ?? "",
		imageUrl: entry.selected?.imageUrl ?? "",
		license: entry.selected?.license ?? "",
		artist: entry.selected?.artist ?? "",
		credit: entry.selected?.credit ?? "",
		retrievedAt: new Date().toISOString(),
		licenseReviewRequired: Boolean(entry.selected?.licenseReview?.needsReview)
	};
}

async function updateItemArt(filePath, modulePath, entry) {
	const item = JSON.parse(await fs.readFile(filePath, "utf8"));
	item.img = modulePath;
	item.flags = item.flags ?? {};
	item.flags["sw5e-module"] = item.flags["sw5e-module"] ?? {};
	item.flags["sw5e-module"].hgttgArt = buildArtFlags(entry);
	await writeJson(filePath, item);
}

async function applyApprovedArt(manifest) {
	let appliedSpecies = 0;
	let appliedFeatures = 0;
	for ( const entry of manifest.species ?? [] ) {
		if ( !entry.approved || !entry.modulePath ) continue;
		const speciesPath = path.join(SPECIES_DIR, `${entry.slug}.json`);
		await updateItemArt(speciesPath, entry.modulePath, entry);
		appliedSpecies += 1;
		const featureDir = path.join(SPECIES_FEATURES_DIR, entry.slug);
		let featureEntries = [];
		try {
			featureEntries = await fs.readdir(featureDir);
		} catch {
			featureEntries = [];
		}
		for ( const featureEntry of featureEntries ) {
			if ( !featureEntry.endsWith(".json") ) continue;
			await updateItemArt(path.join(featureDir, featureEntry), entry.modulePath, entry);
			appliedFeatures += 1;
		}
		entry.status = "applied";
	}
	return { appliedSpecies, appliedFeatures };
}

function buildAttribution(manifest) {
	const approved = (manifest.species ?? []).filter(entry => entry.approved && entry.modulePath && entry.selected);
	const lines = [
		"# HGTTG Species Art Attribution",
		"",
		"This file records approved Wookieepedia image sources bundled for HGTTG species art.",
		"Images may include copyrighted Star Wars material and should remain manually reviewed before distribution.",
		"",
		`Generated: ${new Date().toISOString()}`,
		"",
		"## Approved Images",
		""
	];
	if ( !approved.length ) {
		lines.push("No Wookieepedia images have been approved or bundled yet.");
		lines.push("");
		return `${lines.join("\n")}\n`;
	}
	for ( const entry of approved ) {
		lines.push(`### ${entry.name}`);
		lines.push("");
		lines.push(`- Local file: \`${entry.modulePath}\``);
		lines.push(`- Page: ${entry.selected.pageUrl || entry.selected.pageTitle}`);
		lines.push(`- Image: ${entry.selected.imageUrl || entry.selected.imageTitle}`);
		lines.push(`- License: ${entry.selected.license || "unknown"}`);
		lines.push(`- Artist: ${entry.selected.artist || "unknown"}`);
		lines.push(`- Credit: ${entry.selected.credit || "unknown"}`);
		lines.push("");
	}
	return `${lines.join("\n")}\n`;
}

async function main() {
	const limit = Number(getArgValue("--limit", 0)) || null;
	if ( ARGS.has("--collect") || ARGS.has("--report") ) {
		const manifest = await collectManifest({ limit });
		await writeJson(MANIFEST_PATH, manifest);
		await fs.writeFile(REPORT_PATH, buildReport(manifest), "utf8");
		const found = manifest.species.filter(entry => entry.candidates?.length).length;
		const missing = manifest.species.filter(entry => !entry.candidates?.length).length;
		const ambiguous = manifest.species.filter(entry => (entry.candidates ?? []).length > 1).length;
		console.log(`Wrote ${path.relative(ROOT, MANIFEST_PATH)} and ${path.relative(ROOT, REPORT_PATH)}.`);
		console.log(`Art candidates: ${found} found, ${missing} missing, ${ambiguous} ambiguous.`);
		return;
	}

	if ( ARGS.has("--apply-approved") ) {
		const manifest = await readJson(MANIFEST_PATH);
		if ( !manifest ) throw new Error(`No art manifest found at ${MANIFEST_PATH}. Run --collect first.`);
		const downloaded = await downloadApprovedArt(manifest);
		const { appliedSpecies, appliedFeatures } = await applyApprovedArt(manifest);
		await writeJson(MANIFEST_PATH, manifest);
		await fs.writeFile(ATTRIBUTION_PATH, buildAttribution(manifest), "utf8");
		console.log(`Downloaded ${downloaded} approved images.`);
		console.log(`Applied art to ${appliedSpecies} species and ${appliedFeatures} features.`);
		console.log(`Wrote ${path.relative(ROOT, ATTRIBUTION_PATH)}.`);
		return;
	}

	console.log("Usage:");
	console.log("  node utils/source-hgttg-art.mjs --collect [--limit N]");
	console.log("  node utils/source-hgttg-art.mjs --apply-approved");
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
