import { getModuleId } from "./module-support.mjs";
import { applySw5eThemeScope } from "./theme.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

const CHARACTER_IMPORT_BUTTON_CLASS = "sw5e-character-import-button";
const REPEATING_ATTR_PATTERN = /^repeating_([^_]+(?:_[^_]+)*)_(-[^_]+)_(.+)$/;
const MULTICLASS_ATTR_PATTERN = /^multiclass\d+$/i;
const SAFE_ITEM_PACKS = Object.freeze([
	"equipment",
	"enhanceditems",
	"feats",
	"customization-options",
	"powers-maneuvers"
]);
const FEAT_TRAIT_PACKS = Object.freeze(["feats"]);
const OTHER_TRAIT_PACKS = Object.freeze(["customization-options"]);
const REPORT_LIST_LIMIT = 12;
const PACK_INDEX_CACHE = new Map();
const PACK_DOCUMENT_CACHE = new Map();
const CHARACTER_IMPORTER_UI_ENABLED = false;
let characterImporterHooksRegistered = false;

const SKILL_ATTR_KEYS = Object.freeze({
	acr: "acrobatics_type",
	ani: "animal_handling_type",
	ath: "athletics_type",
	dec: "deception_type",
	ins: "insight_type",
	inv: "investigation_type",
	itm: "intimidation_type",
	lor: "lore_type",
	med: "medicine_type",
	nat: "nature_type",
	per: "persuasion_type",
	pil: "piloting_type",
	prc: "perception_type",
	prf: "performance_type",
	slt: "sleight_of_hand_type",
	ste: "stealth_type",
	sur: "survival_type",
	tec: "technology_type"
});

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function escapeHtml(value) {
	return foundry.utils.escapeHTML(String(value ?? ""));
}

function sanitizeText(value) {
	if ( value == null ) return "";
	return String(value).trim();
}

function normalizeLookupName(value) {
	return sanitizeText(value)
		.toLowerCase()
		.replace(/[’]/g, "'")
		.replace(/\s+/g, " ");
}

function parseNumberish(value, fallback=0, { integer=false }={}) {
	if ( value == null || value === "" ) return fallback;
	const number = typeof value === "number" ? value : Number(String(value).trim());
	if ( !Number.isFinite(number) ) return fallback;
	return integer ? Math.trunc(number) : number;
}

function parseBooleanish(value) {
	if ( value == null ) return false;
	if ( typeof value === "boolean" ) return value;
	if ( typeof value === "number" ) return value !== 0;
	const text = String(value).trim().toLowerCase();
	if ( !text ) return false;
	return !["0", "false", "off", "no", "null", "undefined"].includes(text);
}

function hasRollFormula(value) {
	if ( typeof value !== "string" ) return false;
	return /@\{|&\{|\?\{|^\[\[/.test(value) || value.includes("[[");
}

function getDialogV2Form(button, dialog) {
	return button?.form ?? dialog?.form ?? dialog?.element?.querySelector?.("form") ?? dialog?.element ?? null;
}

function packCollectionId(packName) {
	return `${getModuleId()}.${packName}`;
}

async function getPackIndexRows(packName) {
	const collectionId = packCollectionId(packName);
	if ( PACK_INDEX_CACHE.has(collectionId) ) return PACK_INDEX_CACHE.get(collectionId);
	const pack = game.packs.get(collectionId);
	if ( !pack ) {
		PACK_INDEX_CACHE.set(collectionId, []);
		return [];
	}
	const index = await pack.getIndex({ fields: ["name", "type", "system.identifier"] });
	const rows = Array.from(index ?? []);
	PACK_INDEX_CACHE.set(collectionId, rows);
	return rows;
}

async function getPackDocument(packName, documentId) {
	const cacheKey = `${packCollectionId(packName)}:${documentId}`;
	if ( PACK_DOCUMENT_CACHE.has(cacheKey) ) return PACK_DOCUMENT_CACHE.get(cacheKey);
	const pack = game.packs.get(packCollectionId(packName));
	if ( !pack ) return null;
	const document = await pack.getDocument(documentId);
	if ( document ) PACK_DOCUMENT_CACHE.set(cacheKey, document);
	return document ?? null;
}

async function findPackEntryByName(packNames, name, { types=null }={}) {
	const needle = normalizeLookupName(name);
	if ( !needle ) return null;
	const allowedTypes = Array.isArray(types) ? new Set(types) : null;
	for ( const packName of packNames ) {
		const rows = await getPackIndexRows(packName);
		const row = rows.find(candidate => {
			if ( allowedTypes && !allowedTypes.has(candidate.type) ) return false;
			return normalizeLookupName(candidate.name) === needle;
		});
		if ( !row ) continue;
		const document = await getPackDocument(packName, row._id);
		if ( !document ) continue;
		return { packName, row, document };
	}
	return null;
}

function indexAttribs(attribs=[]) {
	const map = new Map();
	for ( const attr of attribs ) {
		const name = sanitizeText(attr?.name);
		if ( !name ) continue;
		map.set(name, attr);
	}
	return map;
}

function getAttribCurrent(index, key, fallback="") {
	return index.get(key)?.current ?? fallback;
}

function groupRepeatingAttribs(attribs=[]) {
	const groups = new Map();
	for ( const attr of attribs ) {
		const name = sanitizeText(attr?.name);
		const match = name.match(REPEATING_ATTR_PATTERN);
		if ( !match ) continue;
		const [, groupName, rowId, fieldName] = match;
		let group = groups.get(groupName);
		if ( !group ) {
			group = new Map();
			groups.set(groupName, group);
		}
		let row = group.get(rowId);
		if ( !row ) {
			row = { id: rowId, group: groupName, fields: {} };
			group.set(rowId, row);
		}
		row.fields[fieldName] = attr?.current;
	}
	return groups;
}

function getRepeatingRows(groups, groupName) {
	return Array.from(groups.get(groupName)?.values?.() ?? []);
}

function parseDistanceFeet(value) {
	const match = sanitizeText(value).match(/-?\d+(?:\.\d+)?/);
	if ( !match ) return null;
	const feet = Number(match[0]);
	return Number.isFinite(feet) ? feet : null;
}

function distinctList(values) {
	return Array.from(new Set(values.map(sanitizeText).filter(Boolean)));
}

function renderStringList(entries) {
	const clean = distinctList(entries);
	if ( !clean.length ) return "";
	const shown = clean.slice(0, REPORT_LIST_LIMIT);
	const overflow = clean.length - shown.length;
	const items = shown.map(entry => `<li>${escapeHtml(entry)}</li>`).join("");
	const more = overflow > 0
		? `<li>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.More", `${overflow} more...`).replace("{count}", String(overflow)))}</li>`
		: "";
	return `<ul>${items}${more}</ul>`;
}

async function renderImportReport(report) {
	if ( !report || report.reportRendered ) return;
	report.reportRendered = true;
	const actor = report.actor;
	const actorName = report.actorName || actor?.name || localizeOrFallback("SW5E.CharacterImporter.ActorFallback", "Imported Character");

	const summary = [
		`<li><strong>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.Actor", "Actor"))}:</strong> ${escapeHtml(actorName)}</li>`,
		`<li><strong>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.Classes", "Classes"))}:</strong> ${report.created.classes.length}</li>`,
		`<li><strong>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.Subclasses", "Subclasses"))}:</strong> ${report.created.subclasses.length}</li>`,
		`<li><strong>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.Species", "Species"))}:</strong> ${report.created.species.length}</li>`,
		`<li><strong>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.Backgrounds", "Backgrounds"))}:</strong> ${report.created.backgrounds.length}</li>`,
		`<li><strong>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.Powers", "Powers"))}:</strong> ${report.created.powers.length}</li>`,
		`<li><strong>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.Items", "Items"))}:</strong> ${report.created.items.length}</li>`,
		`<li><strong>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.Proficiencies", "Proficiencies"))}:</strong> ${report.created.proficiencies.length}</li>`
	].join("");

	const sections = [
		`<section><p>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.SummaryLead", "Character import finished."))}</p><ul>${summary}</ul></section>`
	];

	if ( report.bypassedAdvancementItems.length ) {
		sections.push(`
			<section>
				<h3>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.BypassedAdvancement", "Advancement dialogs bypassed"))}</h3>
				<p>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.BypassedAdvancementHint", "These imported items still contain advancement data, but the importer did not open advancement dialogs. Explicit rows from the export were treated as the source of truth instead."))}</p>
				${renderStringList(report.bypassedAdvancementItems)}
			</section>
		`);
	}

	if ( report.warnings.length ) {
		sections.push(`
			<section>
				<h3>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.Warnings", "Warnings"))}</h3>
				${renderStringList(report.warnings)}
			</section>
		`);
	}

	if ( report.unmatchedTraitRows.length ) {
		sections.push(`
			<section>
				<h3>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.UnmatchedTraits", "Unmatched trait rows"))}</h3>
				${renderStringList(report.unmatchedTraitRows)}
			</section>
		`);
	}

	if ( report.unmatchedInventoryRows.length ) {
		sections.push(`
			<section>
				<h3>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.UnmatchedItems", "Unmatched inventory/items"))}</h3>
				${renderStringList(report.unmatchedInventoryRows)}
			</section>
		`);
	}

	if ( report.unmatchedPowerRows.length ) {
		sections.push(`
			<section>
				<h3>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.UnmatchedPowers", "Unmatched powers"))}</h3>
				${renderStringList(report.unmatchedPowerRows)}
			</section>
		`);
	}

	if ( report.unsupportedAttackRows.length ) {
		sections.push(`
			<section>
				<h3>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.UnsupportedAttacks", "Skipped custom attacks"))}</h3>
				${renderStringList(report.unsupportedAttackRows)}
			</section>
		`);
	}

	if ( report.unsupportedToolRows.length ) {
		sections.push(`
			<section>
				<h3>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Report.UnsupportedTools", "Skipped custom tools"))}</h3>
				${renderStringList(report.unsupportedToolRows)}
			</section>
		`);
	}

	await DialogV2.wait({
		rejectClose: false,
		modal: false,
		window: { title: localizeOrFallback("SW5E.CharacterImporter.ReportTitle", "Character Import Report") },
		position: { width: 720 },
		content: `<div class="sw5e-character-import-report">${sections.join("\n")}</div>`,
		buttons: [
			actor?.sheet
				? {
					action: "open",
					label: localizeOrFallback("SW5E.CharacterImporter.ReportOpenActor", "Open Actor"),
					icon: "fas fa-user",
					callback: () => {
						void actor.sheet.render(true);
						return "open";
					}
				}
				: null,
			{
				action: "close",
				label: localizeOrFallback("SW5E.CharacterImporter.ReportClose", "Close"),
				icon: "fas fa-check",
				default: true
			}
		].filter(Boolean)
	});
}

function bindImportDialog(dialog) {
	const root = dialog?.form ?? dialog?.element?.querySelector?.("form") ?? dialog?.element ?? null;
	if ( !root ) return;
	const fileInput = root.querySelector("input[name=\"import-file\"]");
	const textarea = root.querySelector("textarea[name=\"payload\"]");
	if ( !(fileInput instanceof HTMLInputElement) || !(textarea instanceof HTMLTextAreaElement) ) return;
	fileInput.addEventListener("change", async event => {
		const [file] = event.currentTarget?.files ?? [];
		if ( !file ) return;
		try {
			textarea.value = await file.text();
		} catch ( err ) {
			console.error("SW5E | Character importer file read failed.", err);
			ui.notifications.error(localizeOrFallback("SW5E.CharacterImporter.FileReadError", "Could not read the selected file."));
		}
	});
}

function injectCharacterImportButton(app, html) {
	if ( !CHARACTER_IMPORTER_UI_ENABLED ) return;
	if ( !game.user?.isGM ) return;
	const root = html?.[0] ?? html;
	if ( !(root instanceof HTMLElement) ) return;
	if ( root.querySelector(`.${CHARACTER_IMPORT_BUTTON_CLASS}`) ) return;
	const header = root.querySelector(".directory-header") ?? root.querySelector("header.directory-header");
	if ( !(header instanceof HTMLElement) ) return;
	const container = document.createElement("div");
	container.className = "header-actions action-buttons flexrow sw5e-character-import-actions";
	const button = document.createElement("button");
	button.type = "button";
	button.className = `create-document ${CHARACTER_IMPORT_BUTTON_CLASS}`;
	button.innerHTML = `<i class="fas fa-file-import"></i> ${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Button", "Import Character"))}`;
	button.addEventListener("click", event => {
		event.preventDefault();
		void openCharacterImportDialog();
	});
	container.appendChild(button);
	const anchor = header.querySelector(".header-actions") ?? header.querySelector(".action-buttons");
	if ( anchor instanceof HTMLElement ) anchor.insertAdjacentElement("afterend", container);
	else header.appendChild(container);
}

export function registerCharacterImporterHooks() {
	// Temporarily hide the importer UI while advancement handling is revisited.
	if ( !CHARACTER_IMPORTER_UI_ENABLED ) return;
	if ( characterImporterHooksRegistered ) return;
	characterImporterHooksRegistered = true;
	Hooks.on("renderActorDirectory", injectCharacterImportButton);
}

export async function openCharacterImportDialog() {
	const content = `
		<form class="sw5e-character-import-form">
			<p>${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.Help", "Paste a legacy SW5E saved-character export or load a JSON file."))}</p>
			<div class="form-group">
				<label for="sw5e-character-import-file">${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.FileLabel", "JSON file"))}</label>
				<input id="sw5e-character-import-file" type="file" name="import-file" accept=".json,application/json" />
			</div>
			<div class="form-group">
				<label for="sw5e-character-import-payload">${escapeHtml(localizeOrFallback("SW5E.CharacterImporter.PayloadLabel", "Saved character JSON"))}</label>
				<textarea id="sw5e-character-import-payload" name="payload" rows="16" spellcheck="false"></textarea>
			</div>
		</form>
	`;

	await DialogV2.wait({
		rejectClose: false,
		modal: false,
		window: { title: localizeOrFallback("SW5E.CharacterImporter.Title", "Import Character from SW5E Export") },
		position: { width: 720 },
		content,
		render: (_event, dialog) => {
			applySw5eThemeScope(dialog?.element, { scope: "module-app" });
			bindImportDialog(dialog);
		},
		buttons: [
			{
				action: "cancel",
				label: localizeOrFallback("SW5E.CharacterImporter.Cancel", "Cancel"),
				icon: "fas fa-times"
			},
			{
				action: "import",
				label: localizeOrFallback("SW5E.CharacterImporter.Import", "Import Character"),
				icon: "fas fa-file-import",
				default: true,
				callback: async (event, button, dialog) => {
					const form = getDialogV2Form(button, dialog);
					const payloadField = form?.querySelector("textarea[name=\"payload\"]");
					const raw = sanitizeText(payloadField?.value);
					if ( !raw ) {
						ui.notifications.warn(localizeOrFallback("SW5E.CharacterImporter.Empty", "Paste a saved-character export before importing."));
						return null;
					}
					try {
						const importer = new CharacterImporter();
						await importer.importRaw(raw);
					} catch ( err ) {
						console.error("SW5E | Character importer failed.", err);
						ui.notifications.error(err?.message || localizeOrFallback("SW5E.CharacterImporter.Error", "Character import failed."));
					}
					return "import";
				}
			}
		]
	});
}

export const characterImporterApi = Object.freeze({
	openDialog: openCharacterImportDialog,
	importRaw: raw => new CharacterImporter().importRaw(raw)
});

function createImportReport(payload) {
	return {
		actor: null,
		actorName: sanitizeText(payload?.name),
		created: {
			classes: [],
			subclasses: [],
			species: [],
			backgrounds: [],
			powers: [],
			items: [],
			proficiencies: []
		},
		bypassedAdvancementItems: [],
		unmatchedTraitRows: [],
		unmatchedInventoryRows: [],
		unmatchedPowerRows: [],
		unsupportedAttackRows: [],
		unsupportedToolRows: [],
		warnings: [],
		reportRendered: false
	};
}

export class CharacterImporter {
	#payload = null;
	#attribs = [];
	#attribIndex = new Map();
	#repeatingGroups = new Map();
	#report = null;
	#actor = null;
	#sawFormulaFields = false;

	async importRaw(rawCharacter) {
		let payload;
		try {
			payload = JSON.parse(rawCharacter);
		} catch {
			throw new Error(localizeOrFallback("SW5E.CharacterImporter.InvalidJson", "That text is not valid JSON."));
		}
		return this.importPayload(payload);
	}

	async importPayload(payload) {
		if ( !payload || (typeof payload !== "object") ) {
			throw new Error(localizeOrFallback("SW5E.CharacterImporter.InvalidPayload", "Character exports must be JSON objects."));
		}
		if ( !Array.isArray(payload.attribs) ) {
			throw new Error(localizeOrFallback("SW5E.CharacterImporter.InvalidAttribs", "This export is missing the expected attribs array."));
		}

		this.#payload = payload;
		this.#attribs = payload.attribs;
		this.#attribIndex = indexAttribs(this.#attribs);
		this.#repeatingGroups = groupRepeatingAttribs(this.#attribs);
		this.#report = createImportReport(payload);

		if ( payload.schema_version !== 2 ) {
			this.#report.warnings.push(localizeOrFallback(
				"SW5E.CharacterImporter.WarnSchema",
				`This export reported schema_version ${payload.schema_version ?? "unknown"} instead of 2. The importer will continue in compatibility mode.`
			));
		}
		if ( sanitizeText(payload.exportedBy) && !/sw5e\.com/i.test(String(payload.exportedBy)) ) {
			this.#report.warnings.push(localizeOrFallback(
				"SW5E.CharacterImporter.WarnExporter",
				`This export was marked as coming from ${payload.exportedBy}. The importer was built for legacy SW5E exports and may skip some data.`
			));
		}

		this.#sawFormulaFields = this.#attribs.some(attr => hasRollFormula(attr?.current));
		if ( this.#sawFormulaFields ) {
			this.#report.warnings.push(localizeOrFallback(
				"SW5E.CharacterImporter.WarnFormulaFields",
				"Roll20-style formula and query fields were ignored. The importer used stable resolved values where available."
			));
		}

		this.#actor = await Actor.create(this.#buildActorData(), { renderSheet: false });
		this.#report.actor = this.#actor;
		this.#report.actorName = this.#actor.name;

		await this.#addClasses();
		await this.#addSpecies();
		await this.#addBackground();
		await this.#addPowers();
		await this.#addItems();
		await this.#addProficiencies();
		this.#collectUnsupportedRows();
		this.#addBypassedAdvancementWarning();
		await renderImportReport(this.#report);
		return this.#report;
	}

	#getAttr(key, fallback="") {
		return getAttribCurrent(this.#attribIndex, key, fallback);
	}

	#buildActorData() {
		const CharacterData = game.dnd5e?.dataModels?.actor?.CharacterData ?? globalThis.dnd5e?.dataModels?.actor?.CharacterData;
		const abilities = {
			str: {
				value: parseNumberish(this.#getAttr("strength"), 10, { integer: true }),
				proficient: parseBooleanish(this.#getAttr("strength_save_prof")) ? 1 : 0
			},
			dex: {
				value: parseNumberish(this.#getAttr("dexterity"), 10, { integer: true }),
				proficient: parseBooleanish(this.#getAttr("dexterity_save_prof")) ? 1 : 0
			},
			con: {
				value: parseNumberish(this.#getAttr("constitution"), 10, { integer: true }),
				proficient: parseBooleanish(this.#getAttr("constitution_save_prof")) ? 1 : 0
			},
			int: {
				value: parseNumberish(this.#getAttr("intelligence"), 10, { integer: true }),
				proficient: parseBooleanish(this.#getAttr("intelligence_save_prof")) ? 1 : 0
			},
			wis: {
				value: parseNumberish(this.#getAttr("wisdom"), 10, { integer: true }),
				proficient: parseBooleanish(this.#getAttr("wisdom_save_prof")) ? 1 : 0
			},
			cha: {
				value: parseNumberish(this.#getAttr("charisma"), 10, { integer: true }),
				proficient: parseBooleanish(this.#getAttr("charisma_save_prof")) ? 1 : 0
			}
		};

		const skills = {};
		for ( const [key, attrName] of Object.entries(SKILL_ATTR_KEYS) ) {
			const initial = { value: parseNumberish(this.#getAttr(attrName), 0) };
			skills[key] = typeof CharacterData?._initialSkillValue === "function"
				? CharacterData._initialSkillValue(key, initial)
				: initial;
		}

		const hpValue = parseNumberish(this.#getAttr("hp"), 0, { integer: true });
		const hpMax = parseNumberish(this.#getAttr("hp", hpValue), hpValue, { integer: true });
		const movementWalk = parseDistanceFeet(this.#getAttr("speed"));
		const biographyParts = [
			sanitizeText(this.#payload?.bio),
			sanitizeText(this.#getAttr("character_backstory"))
		].filter(Boolean);
		const biography = biographyParts.length ? biographyParts.map(text => `<p>${escapeHtml(text)}</p>`).join("") : "";

		const actorData = {
			name: sanitizeText(this.#payload?.name) || localizeOrFallback("SW5E.CharacterImporter.ActorFallback", "Imported Character"),
			type: "character",
			system: {
				abilities,
				skills,
				attributes: {
					hp: {
						value: hpValue,
						max: hpMax,
						temp: parseNumberish(this.#getAttr("hp_temp"), 0, { integer: true })
					}
				},
				details: {
					alignment: sanitizeText(this.#getAttr("alignment")),
					xp: { value: parseNumberish(this.#getAttr("experience"), 0, { integer: true }) },
					appearance: sanitizeText(this.#getAttr("character_appearance")),
					trait: sanitizeText(this.#getAttr("personality_traits")),
					eyes: sanitizeText(this.#getAttr("eyes")),
					height: sanitizeText(this.#getAttr("height")),
					hair: sanitizeText(this.#getAttr("hair")),
					skin: sanitizeText(this.#getAttr("skin")),
					age: sanitizeText(this.#getAttr("age")),
					biography: {
						value: biography,
						public: ""
					}
				}
			}
		};

		if ( movementWalk != null ) actorData.system.attributes.movement = { walk: movementWalk };
		const avatar = sanitizeText(this.#payload?.avatar);
		if ( avatar ) actorData.img = avatar;
		return actorData;
	}

	#getClassRows() {
		const rows = this.#attribs
			.filter(attr => attr?.name === "class" || MULTICLASS_ATTR_PATTERN.test(sanitizeText(attr?.name)))
			.map(attr => {
				const name = sanitizeText(attr.current);
				if ( !name ) return null;
				const key = sanitizeText(attr.name);
				const level = key === "class"
					? parseNumberish(this.#getAttr("base_level"), 1, { integer: true })
					: parseNumberish(this.#getAttr(`${key}_lvl`), 1, { integer: true });
				const subclass = key === "class"
					? sanitizeText(this.#getAttr("subclass"))
					: sanitizeText(this.#getAttr(`${key}_subclass`));
				return {
					key,
					name,
					level: Math.max(level, 1),
					subclass
				};
			})
			.filter(Boolean);

		const baseIndex = rows.findIndex(row => row.key === "class");
		if ( baseIndex > 0 ) rows.unshift(...rows.splice(baseIndex, 1));
		return rows;
	}

	async #queueOrCreateItem(itemData, label) {
		if ( !itemData ) return false;
		const embeddedData = foundry.utils.deepClone(itemData);
		delete embeddedData._id;
		const hasAdvancement = Array.isArray(embeddedData.system?.advancement) && embeddedData.system.advancement.length > 0;
		if ( hasAdvancement ) {
			this.#report.bypassedAdvancementItems.push(label);
		}
		await this.#actor.createEmbeddedDocuments("Item", [embeddedData]);
		return true;
	}

	async #addClasses() {
		for ( const row of this.#getClassRows() ) {
			const classMatch = await findPackEntryByName(["character-classes"], row.name, { types: ["class"] });
			if ( !classMatch ) {
				this.#report.warnings.push(localizeOrFallback("SW5E.CharacterImporter.WarnMissingClass", `Could not find class '${row.name}' in the Character Classes pack.`));
				continue;
			}
			const classData = classMatch.document.toObject();
			classData.system ??= {};
			classData.system.levels = row.level;
			this.#report.created.classes.push(row.name);
			await this.#queueOrCreateItem(classData, row.name);

			if ( !row.subclass ) continue;
			const subclassMatch = await findPackEntryByName(["character-classes"], row.subclass, { types: ["subclass"] });
			if ( !subclassMatch ) {
				this.#report.warnings.push(localizeOrFallback("SW5E.CharacterImporter.WarnMissingSubclass", `Could not find subclass '${row.subclass}' in the Character Classes pack.`));
				continue;
			}
			this.#report.created.subclasses.push(row.subclass);
			await this.#queueOrCreateItem(subclassMatch.document.toObject(), row.subclass);
		}
	}

	async #adjustSpeciesAbilityBonuses(speciesData) {
		const effects = Array.isArray(speciesData?.effects) ? speciesData.effects : [];
		const updates = {};
		for ( const effect of effects ) {
			for ( const change of effect?.changes ?? [] ) {
				const ability = String(change?.key ?? "").match(/system\.abilities\.(str|dex|con|int|wis|cha)\.value/)?.[1];
				const delta = parseNumberish(change?.value, Number.NaN);
				if ( !ability || !Number.isFinite(delta) ) continue;
				const current = parseNumberish(this.#actor.system?.abilities?.[ability]?.value, Number.NaN);
				if ( !Number.isFinite(current) ) continue;
				updates[`system.abilities.${ability}.value`] = current - delta;
			}
		}
		if ( !foundry.utils.isEmpty(updates) ) await this.#actor.update(updates);
	}

	async #addSpecies() {
		const speciesName = sanitizeText(this.#getAttr("race"));
		if ( !speciesName ) return;
		const speciesMatch = await findPackEntryByName(["species"], speciesName, { types: ["race"] });
		if ( !speciesMatch ) {
			this.#report.warnings.push(localizeOrFallback("SW5E.CharacterImporter.WarnMissingSpecies", `Could not find species '${speciesName}' in the Species pack.`));
			return;
		}
		const speciesData = speciesMatch.document.toObject();
		await this.#adjustSpeciesAbilityBonuses(speciesData);
		this.#report.created.species.push(speciesName);
		await this.#queueOrCreateItem(speciesData, speciesName);
	}

	async #addBackground() {
		const backgroundName = sanitizeText(this.#getAttr("background"));
		if ( !backgroundName ) return;
		const backgroundMatch = await findPackEntryByName(["backgrounds"], backgroundName, { types: ["background"] });
		if ( !backgroundMatch ) {
			this.#report.warnings.push(localizeOrFallback("SW5E.CharacterImporter.WarnMissingBackground", `Could not find background '${backgroundName}' in the Backgrounds pack.`));
			return;
		}
		this.#report.created.backgrounds.push(backgroundName);
		await this.#queueOrCreateItem(backgroundMatch.document.toObject(), backgroundName);
	}

	async #addPowers() {
		for ( const row of getRepeatingRows(this.#repeatingGroups, "power") ) {
			const name = sanitizeText(row.fields.powername ?? row.fields.name);
			if ( !name ) continue;
			const match = await findPackEntryByName(["powers-maneuvers"], name, { types: ["spell"] });
			if ( !match ) {
				this.#report.unmatchedPowerRows.push(name);
				continue;
			}
			this.#report.created.powers.push(name);
			await this.#queueOrCreateItem(match.document.toObject(), name);
		}
	}

	async #addInventoryRow(row) {
		const name = sanitizeText(row.fields.itemname ?? row.fields.name);
		if ( !name ) return;
		const match = await findPackEntryByName(SAFE_ITEM_PACKS, name);
		if ( !match ) {
			this.#report.unmatchedInventoryRows.push(name);
			return;
		}
		const itemData = match.document.toObject();
		const quantity = Math.max(parseNumberish(row.fields.itemcount, 1, { integer: true }), 1);
		if ( foundry.utils.hasProperty(itemData, "system.quantity") ) itemData.system.quantity = quantity;
		this.#report.created.items.push(name);
		await this.#queueOrCreateItem(itemData, name);
	}

	async #addTraitRow(row) {
		const name = sanitizeText(row.fields.name);
		if ( !name ) return;
		const source = sanitizeText(row.fields.source);
		const normalizedSource = source.toLowerCase();
		if ( !["feat", "other", ""].includes(normalizedSource) ) {
			this.#report.unmatchedTraitRows.push(source ? `${name} (${source})` : name);
			return;
		}
		const packNames = normalizedSource === "feat"
			? FEAT_TRAIT_PACKS
			: normalizedSource === "other"
				? OTHER_TRAIT_PACKS
				: ["feats", "customization-options"];
		const match = await findPackEntryByName(packNames, name);
		if ( !match ) {
			this.#report.unmatchedTraitRows.push(source ? `${name} (${source})` : name);
			return;
		}
		this.#report.created.items.push(name);
		await this.#queueOrCreateItem(match.document.toObject(), name);
	}

	async #addItems() {
		for ( const row of getRepeatingRows(this.#repeatingGroups, "inventory") ) await this.#addInventoryRow(row);
		for ( const row of getRepeatingRows(this.#repeatingGroups, "traits") ) await this.#addTraitRow(row);
	}

	static #arrayValue(source) {
		if ( source instanceof Set ) return Array.from(source);
		if ( Array.isArray(source) ) return [...source];
		if ( source == null ) return [];
		return [source];
	}

	static #addTraitValue(trait, value) {
		const array = this.#arrayValue(trait.value);
		if ( !array.includes(value) ) array.push(value);
		trait.value = array;
	}

	static #addTraitCustom(trait, value) {
		const current = sanitizeText(trait.custom);
		const values = current ? current.split(/\s*;\s*/) : [];
		if ( !values.includes(value) ) values.push(value);
		trait.custom = values.join("; ");
	}

	async #addProficiencies() {
		const rows = getRepeatingRows(this.#repeatingGroups, "proficiencies");
		if ( !rows.length ) return;

		const armorProf = foundry.utils.deepClone(this.#actor.system.traits?.armorProf ?? { value: [], custom: "" });
		const languages = foundry.utils.deepClone(this.#actor.system.traits?.languages ?? { value: [], custom: "" });
		const weaponProf = foundry.utils.deepClone(this.#actor.system.traits?.weaponProf ?? { value: [], custom: "" });

		armorProf.value = CharacterImporter.#arrayValue(armorProf.value);
		languages.value = CharacterImporter.#arrayValue(languages.value);
		weaponProf.value = CharacterImporter.#arrayValue(weaponProf.value);

		for ( const row of rows ) {
			const name = sanitizeText(row.fields.name);
			if ( !name ) continue;
			const type = sanitizeText(row.fields.prof_type || "LANGUAGE").toUpperCase();
			switch ( type ) {
				case "WEAPON":
				case "OTHER": {
					const normalized = name.toLowerCase().replace(/\s/g, "");
					const match = normalized.match(/(all|simple|martial|exotic)(blaster|vibroweapon|lightweapon)s/);
					if ( match ) {
						const groups = {
							blaster: ["sbl", "mbl", "ebl"],
							vibroweapon: ["svb", "mvb", "evw"],
							lightweapon: ["slw", "mlw", "elw"]
						};
						let toAdd = groups[match[2]] ?? [];
						if ( match[1] === "all" ) toAdd = toAdd.slice(0, 2);
						else if ( match[1] === "simple" ) toAdd = [toAdd[0]];
						else if ( match[1] === "martial" ) toAdd = [toAdd[1]];
						else if ( match[1] === "exotic" ) toAdd = [toAdd[2]];
						for ( const proficiency of toAdd.filter(Boolean) ) CharacterImporter.#addTraitValue(weaponProf, proficiency);
					} else if ( normalized in (CONFIG.DND5E.weaponIds ?? {}) ) {
						CharacterImporter.#addTraitValue(weaponProf, normalized);
					} else {
						CharacterImporter.#addTraitCustom(weaponProf, name);
					}
					break;
				}
				case "ARMOR": {
					const normalized = name.toLowerCase().replace(/\s|armor/g, "");
					const mapped = CONFIG.DND5E.armorProficienciesMap?.[normalized];
					if ( mapped ) CharacterImporter.#addTraitValue(armorProf, mapped);
					else CharacterImporter.#addTraitCustom(armorProf, name);
					break;
				}
				default: {
					const normalized = name.toLowerCase().replace(/galactic /g, "").replace(/\s/g, "-");
					if ( normalized in (CONFIG.DND5E.languages ?? {}) ) CharacterImporter.#addTraitValue(languages, normalized);
					else CharacterImporter.#addTraitCustom(languages, name);
					break;
				}
			}
			this.#report.created.proficiencies.push(`${type}: ${name}`);
		}

		await this.#actor.update({
			"system.traits.armorProf": armorProf,
			"system.traits.languages": languages,
			"system.traits.weaponProf": weaponProf
		});
	}

	#collectUnsupportedRows() {
		const attackNames = getRepeatingRows(this.#repeatingGroups, "attack")
			.map(row => sanitizeText(row.fields.atkname))
			.filter(Boolean);
		const toolNames = getRepeatingRows(this.#repeatingGroups, "tool")
			.map(row => sanitizeText(row.fields.toolname))
			.filter(Boolean);

		this.#report.unsupportedAttackRows.push(...attackNames);
		this.#report.unsupportedToolRows.push(...toolNames);

		if ( attackNames.length ) {
			this.#report.warnings.push(localizeOrFallback(
				"SW5E.CharacterImporter.WarnCustomAttacks",
				"Custom attack rows are not imported yet; review those manually after import."
			));
		}
		if ( toolNames.length ) {
			this.#report.warnings.push(localizeOrFallback(
				"SW5E.CharacterImporter.WarnCustomTools",
				"Custom tool rows are not imported yet; review those manually after import."
			));
		}
	}

	#addBypassedAdvancementWarning() {
		if ( !this.#report.bypassedAdvancementItems.length ) return;
		this.#report.warnings.push(localizeOrFallback(
			"SW5E.CharacterImporter.WarnAdvancementBypassed",
			"Advancement dialogs were bypassed during import. The export's explicit rows were treated as the source of truth for already-chosen options."
		));
	}
}
