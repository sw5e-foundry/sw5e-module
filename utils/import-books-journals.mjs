import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";
import { BOOKS, DEFAULT_SOURCE_SUBPATH, getBookConfig, getBookKeys } from "./book-journal-config.mjs";
import { convertMarkdownToHtml, extractPageTitle } from "./book-journal-markdown.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE_ROOT = path.join(ROOT, ".book-sources", DEFAULT_SOURCE_SUBPATH);
const ARGS = process.argv.slice(2);
const ARG_SET = new Set(ARGS);

const SYSTEM_ID = "dnd5e";
const SYSTEM_VERSION = "5.2.5";
const LAST_MODIFIED_BY = "dnd5ebuilder0000";
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function hashToId(seed, length = 16) {
	const hex = crypto.createHash("sha1").update(seed).digest("hex");
	let value = BigInt(`0x${hex}`);
	let encoded = "";
	while ( value > 0n ) {
		const index = Number(value % 62n);
		encoded = BASE62[index] + encoded;
		value /= 62n;
	}
	encoded = encoded || "0";
	if ( encoded.length >= length ) return encoded.slice(0, length);
	return encoded.padStart(length, "0");
}

function getArgValue(name, fallback = undefined) {
	const index = ARGS.indexOf(name);
	if ( index === -1 ) return fallback;
	const value = ARGS[index + 1];
	if ( !value || value.startsWith("--") ) return fallback;
	return value;
}

function compileSplitPatterns(patterns) {
	return patterns.map(pattern => {
		if ( pattern instanceof RegExp ) return pattern;
		return new RegExp(pattern);
	});
}

function splitIntoPages(content, splitPatterns) {
	const patterns = compileSplitPatterns(splitPatterns);
	const lines = String(content ?? "").replace(/\r\n/g, "\n").split("\n");
	const pages = [];
	let current = { title: null, lines: [] };

	function flush() {
		const body = current.lines.join("\n").trim();
		if ( !body && !current.title ) return;
		pages.push({
			title: current.title ?? "Untitled",
			body
		});
	}

	for ( const line of lines ) {
		const matched = patterns.find(pattern => pattern.test(line));
		if ( matched ) {
			flush();
			current = {
				title: extractPageTitle(line),
				lines: [line]
			};
		}
		else current.lines.push(line);
	}
	flush();
	return pages;
}

function buildPageEntry({ bookKey, journalId, page, sort }) {
	const pageId = hashToId(`book-journal:${bookKey}:page:${sort}:${page.title}`);
	return {
		name: page.title,
		_id: pageId,
		text: {
			content: convertMarkdownToHtml(page.body),
			format: 1
		},
		src: null,
		flags: {
			"sw5e-module": {
				bookJournal: {
					book: bookKey,
					source: "StarWars5e.Core"
				}
			}
		},
		type: "text",
		title: {
			show: true,
			level: 1
		},
		image: {},
		video: {
			controls: true,
			volume: 0.5
		},
		system: {},
		sort,
		ownership: {
			default: -1
		},
		_stats: {
			systemId: null,
			systemVersion: null,
			coreVersion: null,
			createdTime: null,
			modifiedTime: null,
			lastModifiedBy: null,
			duplicateSource: null
		},
		_key: `!journal.pages!${journalId}.${pageId}`
	};
}

function buildJournalEntry({ bookKey, config, pages }) {
	const journalId = hashToId(`book-journal:${bookKey}:entry`);
	return {
		_id: journalId,
		name: config.journalName,
		folder: null,
		sort: 0,
		ownership: {
			default: 0
		},
		_stats: {
			systemId: SYSTEM_ID,
			systemVersion: SYSTEM_VERSION,
			coreVersion: null,
			createdTime: null,
			modifiedTime: null,
			lastModifiedBy: LAST_MODIFIED_BY,
			duplicateSource: null
		},
		flags: {
			"sw5e-module": {
				bookJournal: {
					book: bookKey,
					source: "StarWars5e.Core",
					pageCount: pages.length
				}
			}
		},
		pages: pages.map((page, index) => buildPageEntry({
			bookKey,
			journalId,
			page,
			sort: index * 100
		})),
		_key: `!journal!${journalId}`
	};
}

async function readSourceFile(sourceRoot, relativePath) {
	const filePath = path.join(sourceRoot, relativePath);
	return fs.readFile(filePath, "utf8");
}

async function importBook(bookKey, sourceRoot) {
	const config = getBookConfig(bookKey);
	const pages = [];

	for ( const fileSpec of config.files ) {
		const content = await readSourceFile(sourceRoot, fileSpec.path);
		const splitPatterns = fileSpec.pageSplits ?? config.pageSplits;
		if ( !splitPatterns?.length ) {
			throw new Error(`No page split patterns configured for ${bookKey}:${fileSpec.path}`);
		}
		pages.push(...splitIntoPages(content, splitPatterns));
	}

	const journal = buildJournalEntry({ bookKey, config, pages });
	const outputDir = path.join(ROOT, "packs", "_source", config.packName);
	const outputPath = path.join(outputDir, config.outputFile);
	await fs.mkdir(outputDir, { recursive: true });
	await fs.writeFile(outputPath, YAML.dump(journal, {
		lineWidth: -1,
		noRefs: true,
		quotingType: "'",
		forceQuotes: false
	}), "utf8");

	return {
		bookKey,
		packName: config.packName,
		outputPath,
		pageCount: pages.length
	};
}

async function ensureSourceRoot(sourceRoot) {
	try {
		await fs.access(sourceRoot);
	}
	catch {
		throw new Error([
			`Book source directory not found: ${sourceRoot}`,
			"Clone upstream sources with:",
			"  git clone --depth 1 --filter=blob:none --sparse https://github.com/sangheili868/StarWars5e.Core.git .book-sources",
			"  cd .book-sources && git sparse-checkout set StarWars5e.Parser/Sources/en",
			"Or pass --source-dir <path-to>/StarWars5e.Parser/Sources/en"
		].join("\n"));
	}
}

function printUsage() {
	console.log([
		"Usage: node ./utils/import-books-journals.mjs [--book phb|ec|wh] [--source-dir <path>] [--dry-run]",
		"",
		"Books:",
		...getBookKeys().map(key => `  ${key} -> ${BOOKS[key].journalName}`)
	].join("\n"));
}

async function main() {
	if ( ARG_SET.has("--help") || ARG_SET.has("-h") ) {
		printUsage();
		return;
	}

	const sourceRoot = path.resolve(getArgValue("--source-dir", DEFAULT_SOURCE_ROOT));
	await ensureSourceRoot(sourceRoot);

	const requestedBook = getArgValue("--book");
	const bookKeys = requestedBook ? [requestedBook] : getBookKeys();
	const dryRun = ARG_SET.has("--dry-run");
	const results = [];

	for ( const bookKey of bookKeys ) {
		if ( !BOOKS[bookKey] ) throw new Error(`Unknown book key: ${bookKey}`);
		if ( dryRun ) {
			const config = getBookConfig(bookKey);
			let pageCount = 0;
			for ( const fileSpec of config.files ) {
				const content = await readSourceFile(sourceRoot, fileSpec.path);
				const splitPatterns = fileSpec.pageSplits ?? config.pageSplits;
				pageCount += splitIntoPages(content, splitPatterns).length;
			}
			results.push({ bookKey, packName: config.packName, pageCount, dryRun: true });
			continue;
		}
		results.push(await importBook(bookKey, sourceRoot));
	}

	console.log("Book journal import complete:");
	for ( const result of results ) {
		if ( result.dryRun ) {
			console.log(`  ${result.bookKey}: ${result.pageCount} pages (dry run)`);
		}
		else {
			console.log(`  ${result.bookKey}: ${result.pageCount} pages -> ${path.relative(ROOT, result.outputPath)}`);
		}
	}
}

main().catch(error => {
	console.error(error.message ?? error);
	process.exitCode = 1;
});
