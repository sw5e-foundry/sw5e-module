const GMBINDER_DIRECTIVE = /^\\(?:columnbreak|pagebreakNum|pagebreak)\b.*$/;
const HEADING_LINE = /^(#{1,6})\s+(.*)$/;
const BLOCKQUOTE_HEADING = /^>\s*(#{1,6})\s+(.*)$/;
const SUBCLASS_GROUP_SUFFIX = /\b(Approaches|Traditions|Disciplines|Specialties|Foci|Orders|Practices|Pursuits|Techniques|Callings)\s*$/i;
const PHB_CLASS_NAMES = new Set([
	"Berserker", "Consular", "Engineer", "Fighter", "Guardian",
	"Monk", "Operative", "Scholar", "Scout", "Sentinel"
]);

/**
 * Demote archetype/subclass implementation headings (e.g. "Ballistic Approach") so they
 * stay out of Foundry's journal TOC. Keeps class names, "Class Features", and group headers
 * (e.g. "Berserker Approaches") at h2.
 */
function resolveJournalHeadingLevel(markdownLevel, title, state) {
	const baseLevel = Math.min(6, markdownLevel);
	if ( markdownLevel !== 2 ) return baseLevel;

	const trimmed = String(title ?? "").trim();

	if ( /^class features$/i.test(trimmed) ) {
		state.inSubclassDetail = false;
		return 2;
	}

	if ( PHB_CLASS_NAMES.has(trimmed) ) {
		state.inSubclassDetail = false;
		return 2;
	}

	if ( SUBCLASS_GROUP_SUFFIX.test(trimmed) ) {
		state.inSubclassDetail = true;
		return 2;
	}

	if ( state.inSubclassDetail ) return 4;

	return 2;
}
const TABLE_SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;
const LIST_ITEM = /^[-*]\s+/;
const HR_LINE = /^_{3,}$|^-{3,}$/;
const HTML_LINE = /^<(div|img|span|br)\b/i;

export function preprocessMarkdown(source) {
	return String(source ?? "")
		.replace(/\r\n/g, "\n")
		.replace(/<img\b[\s\S]*?\/?>/gi, match => match.replace(/\s*\n\s*/g, " "))
		.split("\n")
		.filter(line => !GMBINDER_DIRECTIVE.test(line.trim()))
		.join("\n");
}

export function extractPageTitle(line) {
	return String(line ?? "")
		.replace(/^>\s*/, "")
		.replace(/^#+\s*/, "")
		.trim();
}

export function convertMarkdownToHtml(source, options = {}) {
	const depth = options.depth ?? 0;
	const headingState = options.headingState ?? { inSubclassDetail: false };
	const text = preprocessMarkdown(source);
	const lines = text.split("\n");
	const html = [];
	let index = 0;

	while ( index < lines.length ) {
		const line = lines[index];
		if ( !line.trim() ) {
			index += 1;
			continue;
		}

		const blockquoteHeading = line.match(BLOCKQUOTE_HEADING);
		if ( blockquoteHeading ) {
			const level = Math.min(6, blockquoteHeading[1].length);
			html.push(`<h${level}>${formatInline(blockquoteHeading[2])}</h${level}>`);
			index += 1;
			continue;
		}

		const heading = line.match(HEADING_LINE);
		if ( heading && !line.startsWith(">") ) {
			const markdownLevel = heading[1].length;
			const title = heading[2];
			const level = resolveJournalHeadingLevel(markdownLevel, title, headingState);
			html.push(`<h${level}>${formatInline(title)}</h${level}>`);
			index += 1;
			continue;
		}

		if ( line.includes("|") && TABLE_SEPARATOR.test(lines[index + 1] ?? "") ) {
			const tableLines = [];
			while ( index < lines.length && lines[index].includes("|") ) {
				tableLines.push(lines[index]);
				index += 1;
			}
			html.push(renderTable(tableLines));
			continue;
		}

		if ( HR_LINE.test(line.trim()) ) {
			html.push("<hr>");
			index += 1;
			continue;
		}

		if ( LIST_ITEM.test(line) ) {
			const items = [];
			while ( index < lines.length && LIST_ITEM.test(lines[index]) ) {
				items.push(lines[index].replace(LIST_ITEM, ""));
				index += 1;
			}
			html.push(`<ul>${items.map(item => `<li>${formatInline(item)}</li>`).join("")}</ul>`);
			continue;
		}

		if ( line.startsWith(">") ) {
			const quoteLines = [];
			while ( index < lines.length && lines[index].startsWith(">") ) {
				quoteLines.push(lines[index].replace(/^>\s?/, ""));
				index += 1;
			}
			html.push(`<blockquote>${convertMarkdownToHtml(quoteLines.join("\n"), { ...options, headingState })}</blockquote>`);
			continue;
		}

		if ( HTML_LINE.test(line.trim()) ) {
			const htmlLines = [];
			if ( /<div\b/i.test(line) ) {
				let depth = 0;
				while ( index < lines.length ) {
					const current = lines[index];
					const opens = (current.match(/<div\b/gi) ?? []).length;
					const closes = (current.match(/<\/div>/gi) ?? []).length;
					depth += opens - closes;
					htmlLines.push(current);
					index += 1;
					if ( depth <= 0 ) break;
				}
			}
			else {
				htmlLines.push(line);
				index += 1;
			}
			html.push(processHtmlBlock(htmlLines.join("\n"), options));
			continue;
		}

		if ( /<[a-z][^>]*>/i.test(line) ) {
			html.push(postProcessEmbeddedMarkdown(line));
			index += 1;
			continue;
		}

		const paragraphLines = [];
		while ( index < lines.length && isParagraphLine(lines, index) ) {
			paragraphLines.push(lines[index]);
			index += 1;
		}
		if ( paragraphLines.length ) {
			html.push(`<p>${formatInline(paragraphLines.join(" "))}</p>`);
		}
	}

	const joined = html.join("\n\n");
	return groupBottomRowImages(normalizeGmbinderFootnotes(normalizeGmbinderSpacers(normalizeGmbinderImages(joined))));
}

function isParagraphLine(lines, index) {
	const line = lines[index];
	if ( !line?.trim() ) return false;
	if ( HEADING_LINE.test(line) && !line.startsWith(">") ) return false;
	if ( BLOCKQUOTE_HEADING.test(line) ) return false;
	if ( line.startsWith(">") ) return false;
	if ( LIST_ITEM.test(line) ) return false;
	if ( HR_LINE.test(line.trim()) ) return false;
	if ( HTML_LINE.test(line.trim()) ) return false;
	if ( line.includes("|") && TABLE_SEPARATOR.test(lines[index + 1] ?? "") ) return false;
	return true;
}

function processHtmlBlock(htmlBlock, options = {}) {
	const depth = options.depth ?? 0;
	const block = String(htmlBlock ?? "").trim();
	const divMatch = block.match(/^<div\b([^>]*)>([\s\S]*)<\/div>$/i);
	if ( !divMatch ) return postProcessEmbeddedMarkdown(block);

	let attrs = divMatch[1];
	const classMatch = attrs.match(/class=['"]([^'"]*)['"]/i);
	if ( classMatch && /\bfootnote\b/i.test(classMatch[1]) ) return "";

	const inner = divMatch[2].trim();
	const convertedInner = convertMarkdownToHtml(inner, { ...options, depth: depth + 1, headingState: options.headingState });
	if ( !convertedInner.trim() ) return "";

	attrs = attrs.replace(/style=['"][^'"]*['"]/gi, match => (
		/column-count/i.test(match) ? "" : match
	));
	const preservedClass = (classMatch?.[1] ?? "")
		.replace(/\bwide\b/g, "")
		.replace(/\bclassTable\b/g, "")
		.trim();
	const blockClass = preservedClass ? `${preservedClass} sw5e-book-block` : "sw5e-book-block";
	return `<div class="${blockClass}">${convertedInner}</div>`;
}

function renderTable(tableLines) {
	if ( tableLines.length < 2 ) return `<p>${formatInline(tableLines.join(" "))}</p>`;

	const headerCells = splitTableRow(tableLines[0]);
	const bodyRows = tableLines.slice(2).map(splitTableRow);
	const thead = `<thead><tr>${headerCells.map(cell => `<th>${formatInline(cell)}</th>`).join("")}</tr></thead>`;
	const tbody = bodyRows.length
		? `<tbody>${bodyRows.map(row => `<tr>${row.map(cell => `<td>${formatInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`
		: "";
	return `<table class="sw5e-book-table">${thead}${tbody}</table>`;
}

function splitTableRow(line) {
	const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
	return trimmed.split("|").map(cell => cleanTableCell(cell));
}

function cleanTableCell(cell) {
	return String(cell ?? "")
		.replace(/&emsp;/gi, "")
		.replace(/&ensp;/gi, "")
		.replace(/\t+/g, " ")
		.trim();
}

const PRESERVED_HTML_ENTITIES = "amp|lt|gt|quot|apos|nbsp|emsp|ensp|thinsp|#";

function formatInline(text) {
	let value = String(text ?? "");
	if ( /<[a-z][^>]*>/i.test(value) ) return postProcessEmbeddedMarkdown(value);
	value = value.replace(new RegExp(`&(?!(?:${PRESERVED_HTML_ENTITIES});)`, "gi"), "&amp;");
	value = value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
	value = value.replace(/`([^`]+)`/g, "<code>$1</code>");
	value = value.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
	value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	value = value.replace(/\*([^*]+)\*/g, "<em>$1</em>");
	value = value.replace(/_([^_]+)_/g, "<em>$1</em>");
	value = value.replace(/&lt;(\/?(?:div|span|img|br|p|ul|ol|li|table|thead|tbody|tr|th|td|hr|blockquote|h[1-6])\b[^&]*?)&gt;/gi, "<$1>");
	return value;
}

function stripHtmlText(value) {
	return String(value ?? "")
		.replace(/<br\s*\/?>/gi, " ")
		.replace(/<p>\s*<\/p>/gi, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeGmbinderFootnotes(html) {
	return String(html ?? "").replace(/<div\b[^>]*\bfootnote\b[^>]*>[\s\S]*?<\/div>/gi, "");
}

function normalizeGmbinderSpacers(html) {
	return String(html ?? "").replace(/<div\b([^>]*)>([\s\S]*?)<\/div>/gi, (match, attrs, inner) => {
		const style = attrs.match(/style=['"]([^'"]*)['"]/i)?.[1] ?? "";
		if ( !/margin-top\s*:\s*\d+px/i.test(style) ) return match;
		if ( stripHtmlText(inner) ) return match;
		return "";
	});
}

function normalizeGmbinderImages(html) {
	return String(html ?? "").replace(/<img\b([^>]*)>/gi, (match, attrs) => {
		const styleMatch = attrs.match(/style=['"]([^'"]*)['"]/i);
		const srcMatch = attrs.match(/src=['"]([^'"]*)['"]/i);
		if ( !srcMatch ) return match;

		const style = styleMatch?.[1] ?? "";
		const widthMatch = style.match(/width\s*:\s*(\d+)px/i);
		const widthPx = widthMatch ? Number(widthMatch[1]) : null;
		const isBottomRow = /\bbottom\s*:/i.test(style);

		// Tiny GMBinder chapter ornaments duplicate headings and stack in Foundry.
		if ( widthPx && widthPx <= 80 ) return "";

		let cleanedStyle = style
			.replace(/position\s*:\s*absolute\s*;?/gi, "")
			.replace(/(?:top|left|right|bottom)\s*:\s*[^;]+;?/gi, "")
			.replace(/z-index\s*:\s*[^;]+;?/gi, "")
			.replace(/transform\s*:\s*[^;]+;?/gi, "")
			.replace(/;\s*;/g, ";")
			.trim()
			.replace(/^;|;$/g, "");

		const imageClass = isBottomRow ? "sw5e-book-image sw5e-book-image--row" : "sw5e-book-image";
		const flowStyle = isBottomRow
			? "height:auto;margin:0;clear:none"
			: "display:block;max-width:100%;height:auto;margin:1rem auto;clear:both";
		const mergedStyle = cleanedStyle ? `${flowStyle};${cleanedStyle}` : flowStyle;
		return `<img src='${srcMatch[1]}' class='${imageClass}' style='${mergedStyle}' />`;
	});
}

function groupBottomRowImages(html) {
	return String(html ?? "").replace(
		/(?:<img[^>]*sw5e-book-image--row[^>]*>\s*){2,}/gi,
		match => `<div class="sw5e-book-image-row">${match.trim()}</div>`
	);
}

function postProcessEmbeddedMarkdown(text) {
	return String(text ?? "")
		.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
		.replace(/_([^_\n]+)_/g, "<em>$1</em>");
}
