import {
	applyStarshipPrototypeTokenDimensions,
	createBlankLegacyStarshipActorData,
	getStarshipPrototypeTokenDimensions
} from "../starship-data.mjs";

const STARSHIP_CREATE_VALUE = "__sw5e_starship__";
const STARSHIP_CREATE_FLAG = "flags.sw5e.createStarship";
const DEBUG_PREFIX = "sw5e-module | starship-create";

/** @see dnd5e `templates/apps/document-create.hbs` — Vehicle option lives in `ol.unlist.card > li`. */
const VEHICLE_RADIO_SELECTOR = 'input[type="radio"][value="vehicle"]';
const TYPE_LIST_SELECTOR = "ol.unlist.card";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function hasRequiredActorTypeValues(values) {
	return values.has("vehicle");
}

function getActorCreateForm(root) {
	if ( root instanceof HTMLFormElement ) return root;
	if ( !(root instanceof HTMLElement) ) return null;

	const form = root.querySelector("form");
	if ( !(form instanceof HTMLFormElement) ) return null;
	if ( !form.querySelector('[name="name"]') ) return null;

	const typeSelect = form.querySelector('select[name="type"]');
	if ( typeSelect instanceof HTMLSelectElement ) {
		const optionValues = new Set(Array.from(typeSelect.options).map(option => option.value));
		if ( hasRequiredActorTypeValues(optionValues) ) return form;
		return null;
	}

	const vehicleRadio = form.querySelector(VEHICLE_RADIO_SELECTOR);
	if ( !(vehicleRadio instanceof HTMLInputElement) || !vehicleRadio.name ) return null;

	const typeRadios = form.querySelectorAll(`input[type="radio"][name="${CSS.escape(vehicleRadio.name)}"]`);
	if ( !typeRadios.length ) return null;

	const radioValues = new Set(Array.from(typeRadios).map(r => r.value));
	if ( !hasRequiredActorTypeValues(radioValues) ) return null;
	return form;
}

function getTypeRadioName(form) {
	const vehicle = getVehicleTypeRadio(form);
	return vehicle instanceof HTMLInputElement ? vehicle.name : "";
}

function getTypeRadios(form) {
	const name = getTypeRadioName(form);
	return name ? Array.from(form.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)) : [];
}

function getVehicleTypeRadio(form) {
	return form.querySelector(VEHICLE_RADIO_SELECTOR);
}

function getStarshipTypeRadio(form) {
	const name = getTypeRadioName(form);
	return name
		? form.querySelector(`input[type="radio"][name="${CSS.escape(name)}"][value="${STARSHIP_CREATE_VALUE}"]`)
		: null;
}

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized === key ? fallback : localized;
}

function getStarshipOptionLabel() {
	return localizeOrFallback("TYPES.Actor.starship", "Starship");
}

function ensureStarshipSelectOption(typeSelect) {
	if ( !(typeSelect instanceof HTMLSelectElement) ) return;
	if ( typeSelect.querySelector(`option[value="${STARSHIP_CREATE_VALUE}"]`) ) return;

	const option = document.createElement("option");
	option.value = STARSHIP_CREATE_VALUE;
	option.textContent = getStarshipOptionLabel();

	const vehicleOption = typeSelect.querySelector('option[value="vehicle"]');
	if ( vehicleOption ) vehicleOption.insertAdjacentElement("afterend", option);
	else typeSelect.append(option);
}

/**
 * dnd5e 5.2.x `document-create.hbs` structure:
 * <ol class="unlist card">
 *   <li><label>{{ dnd5e-icon }}<span>{{ label }}</span><input type="radio" name="type" value="..."></label></li>
 * </ol>
 * Clone the entire `<li>` so icons, label layout, and radio match stock rows.
 */
function ensureStarshipRadioOption(form) {
	if ( getStarshipTypeRadio(form) ) {
		console.debug(`${DEBUG_PREFIX} Starship radio already in DOM; skipping row insert`);
		return;
	}

	const vehicleRadio = getVehicleTypeRadio(form);
	if ( !(vehicleRadio instanceof HTMLInputElement) ) {
		console.debug(`${DEBUG_PREFIX} Vehicle radio not found`, { selector: VEHICLE_RADIO_SELECTOR });
		return;
	}

	const vehicleRow =
		vehicleRadio.closest(`${TYPE_LIST_SELECTOR} > li`)
		?? vehicleRadio.closest("li");
	if ( !vehicleRow ) {
		console.debug(`${DEBUG_PREFIX} Vehicle row <li> not found (expected ${TYPE_LIST_SELECTOR} > li)`);
		return;
	}

	console.debug(`${DEBUG_PREFIX} Vehicle row <li> found`, { vehicleRow, listSelector: TYPE_LIST_SELECTOR });

	const row = vehicleRow.cloneNode(true);
	console.debug(`${DEBUG_PREFIX} Full Vehicle row cloned (deep clone)`, row);

	const cloneRadio =
		row.querySelector(`input[type="radio"][name="${CSS.escape(vehicleRadio.name)}"][value="vehicle"]`)
		?? row.querySelector(VEHICLE_RADIO_SELECTOR);
	if ( !(cloneRadio instanceof HTMLInputElement) ) {
		console.debug(`${DEBUG_PREFIX} Cloned row has no vehicle radio to remap`);
		return;
	}

	row.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));

	const newId =
		(typeof foundry !== "undefined" && foundry.utils?.randomID)
			? foundry.utils.randomID()
			: `sw5e-starship-type-${Date.now()}`;

	cloneRadio.name = vehicleRadio.name;
	cloneRadio.value = STARSHIP_CREATE_VALUE;
	cloneRadio.checked = false;
	cloneRadio.required = vehicleRadio.required;
	cloneRadio.disabled = false;
	cloneRadio.id = newId;

	const labelEl = cloneRadio.closest("label");
	if ( labelEl instanceof HTMLLabelElement )
		labelEl.setAttribute("for", newId);

	const textSpan = labelEl?.querySelector(":scope > span");
	if ( textSpan ) {
		textSpan.textContent = getStarshipOptionLabel();
		console.debug(`${DEBUG_PREFIX} Label text set on label > span`, textSpan);
	} else {
		console.debug(`${DEBUG_PREFIX} No :scope > span under label; row structure may differ`, { labelEl });
	}

	vehicleRow.insertAdjacentElement("afterend", row);
	console.debug(`${DEBUG_PREFIX} Cloned row inserted after Vehicle <li>`, { after: vehicleRow, inserted: row });

	const starshipRadioVerify = getStarshipTypeRadio(form);
	console.debug(`${DEBUG_PREFIX} Starship radio present after insert`, { starshipRadioVerify, newId });
}

function getStarshipMarkerInput(form) {
	return form.querySelector(`input[type="hidden"][name="${STARSHIP_CREATE_FLAG}"]`);
}

function syncStarshipMarker(form, isStarship) {
	const existingInput = getStarshipMarkerInput(form);
	if ( !isStarship ) {
		existingInput?.remove();
		return;
	}

	if ( existingInput ) {
		existingInput.value = "true";
		return;
	}

	const input = document.createElement("input");
	input.type = "hidden";
	input.name = STARSHIP_CREATE_FLAG;
	input.value = "true";
	form.append(input);
}

function prepareStarshipSubmission(form) {
	const typeSelect = form.querySelector('select[name="type"]');
	if ( typeSelect instanceof HTMLSelectElement ) {
		const isStarship = typeSelect.value === STARSHIP_CREATE_VALUE;
		syncStarshipMarker(form, isStarship);
		if ( isStarship ) {
			console.debug(`${DEBUG_PREFIX} submit remap (select): starship -> vehicle + createStarship flag`);
			typeSelect.value = "vehicle";
		}
		return;
	}

	const starshipRadio = getStarshipTypeRadio(form);
	const vehicleRadio = getVehicleTypeRadio(form);
	if ( !(starshipRadio instanceof HTMLInputElement) || !(vehicleRadio instanceof HTMLInputElement) ) return;

	const isStarship = starshipRadio.checked;
	syncStarshipMarker(form, isStarship);
	if ( isStarship ) {
		starshipRadio.checked = false;
		vehicleRadio.checked = true;
		console.debug(`${DEBUG_PREFIX} submit remap (radio): __sw5e_starship__ -> vehicle + createStarship flag`);
	}
}

function isPendingStarshipCreate(document, data = {}) {
	return data?.flags?.sw5e?.createStarship
		?? document?._source?.flags?.sw5e?.createStarship
		?? false;
}

function isSw5eStarshipActorData(data) {
	return data?.type === "vehicle" && data?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

function getStarshipActorSizeKey(data) {
	return data?.system?.traits?.size
		?? data?.flags?.sw5e?.legacyStarshipActor?.system?.traits?.size
		?? "med";
}

function syncStarshipPrototypeTokenSource(document, data = {}) {
	if ( !document?.updateSource ) return false;
	const mergedData = foundry.utils.mergeObject(document.toObject(), data ?? {}, {
		inplace: false,
		insertKeys: true,
		insertValues: true,
		overwrite: true
	});
	if ( !isSw5eStarshipActorData(mergedData) ) return false;
	const { width, height } = getStarshipPrototypeTokenDimensions(getStarshipActorSizeKey(mergedData));
	if ( mergedData?.prototypeToken?.width === width && mergedData?.prototypeToken?.height === height ) return false;
	document.updateSource({
		prototypeToken: {
			width,
			height
		}
	});
	return true;
}

function applyBlankStarshipSeed(document) {
	const source = createBlankLegacyStarshipActorData(document.toObject());
	applyStarshipPrototypeTokenDimensions(source, source.system?.traits?.size);
	document.updateSource(source);

	if ( document._source?.flags?.sw5e ) delete document._source.flags.sw5e.createStarship;
	if ( document.flags?.sw5e ) delete document.flags.sw5e.createStarship;
}

async function repairCreatedStarshipPrototypeToken(actor) {
	if ( !actor || actor.pack || !actor.isOwner ) return false;
	const actorData = actor.toObject();
	if ( !isSw5eStarshipActorData(actorData) ) return false;
	const { width, height } = getStarshipPrototypeTokenDimensions(getStarshipActorSizeKey(actorData));
	if ( actor.prototypeToken?.width === width && actor.prototypeToken?.height === height ) return false;
	await actor.update({
		"prototypeToken.width": width,
		"prototypeToken.height": height
	});
	return true;
}

function syncStarshipMarkerFromForm(form) {
	const typeSelect = form.querySelector('select[name="type"]');
	if ( typeSelect instanceof HTMLSelectElement ) {
		syncStarshipMarker(form, typeSelect.value === STARSHIP_CREATE_VALUE);
		return;
	}

	const starshipRadio = getStarshipTypeRadio(form);
	syncStarshipMarker(form, starshipRadio instanceof HTMLInputElement && starshipRadio.checked);
}

function attachStarshipCreateListeners(form) {
	if ( form.dataset.sw5eStarshipCreateListeners === "true" ) return;
	form.dataset.sw5eStarshipCreateListeners = "true";

	const typeSelect = form.querySelector('select[name="type"]');
	if ( typeSelect instanceof HTMLSelectElement ) {
		typeSelect.addEventListener("change", () => syncStarshipMarkerFromForm(form));
	} else {
		form.addEventListener("change", ev => {
			const name = getTypeRadioName(form);
			if ( !name || !(ev.target instanceof HTMLInputElement) ) return;
			if ( ev.target.name !== name || ev.target.type !== "radio" ) return;
			syncStarshipMarkerFromForm(form);
		});
	}

	form.addEventListener("submit", () => prepareStarshipSubmission(form), { capture: true });
}

/**
 * Duplicate row prevention: {@link ensureStarshipRadioOption} exits early if
 * `input[type="radio"][value="__sw5e_starship__"]` already exists.
 *
 * Listener duplication: {@link attachStarshipCreateListeners} uses
 * `form.dataset.sw5eStarshipCreateListeners`.
 */
function injectStarshipCreateOption(app, html) {
	const root = getHtmlRoot(html);
	const form = getActorCreateForm(root);
	if ( !form ) return;

	const typeSelect = form.querySelector('select[name="type"]');
	if ( typeSelect instanceof HTMLSelectElement ) {
		ensureStarshipSelectOption(typeSelect);
		syncStarshipMarkerFromForm(form);
		attachStarshipCreateListeners(form);
		return;
	}

	ensureStarshipRadioOption(form);
	syncStarshipMarkerFromForm(form);
	attachStarshipCreateListeners(form);
}

export function patchStarshipCreate() {
	Hooks.on("renderApplicationV2", injectStarshipCreateOption);
	Hooks.on("preCreateActor", (document, data) => {
		if ( isPendingStarshipCreate(document, data) ) applyBlankStarshipSeed(document);
		syncStarshipPrototypeTokenSource(document, data);
	});
	Hooks.on("createActor", (actor, _options, userId) => {
		if ( game.user?.id !== userId ) return;
		void repairCreatedStarshipPrototypeToken(actor).catch(err => {
			console.warn(`${DEBUG_PREFIX} Failed to repair created starship token dimensions`, err);
		});
	});
}
