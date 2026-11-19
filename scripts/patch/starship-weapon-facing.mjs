import { getModuleId } from "../module-support.mjs";
import { isStarshipWeaponItem } from "../starship-weapon-rolls.mjs";

const HOST_CLASS = "sw5e-starship-weapon-facing";
const MENU_CLASS = "sw5e-firing-arc-menu";
const OPTION_CLASS = "sw5e-firing-arc-option";
const TOGGLE_CLASS = "sw5e-firing-arc-toggle";
const INPUT_NAME = "system.firingArc";

const FACING_SUGGESTIONS = [
	["SW5E.StarshipWeaponFacingForward", "Forward"],
	["SW5E.StarshipWeaponFacingAft", "Aft"],
	["SW5E.StarshipWeaponFacingPort", "Port"],
	["SW5E.StarshipWeaponFacingStarboard", "Starboard"]
];

let renderHtmlWrapped = false;

/**
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function label(key, fallback) {
	const localized = game.i18n?.localize?.(key);
	return !localized || localized === key ? fallback : localized;
}

/**
 * @param {object} app
 * @returns {{ sheetAbort: AbortController|null, menuAbort: AbortController|null, onPosition: ((event: Event) => void)|null }}
 */
function facingUiState(app) {
	app._sw5eFacingUi ??= { sheetAbort: null, menuAbort: null, onPosition: null };
	return app._sw5eFacingUi;
}

/**
 * @param {object} app
 * @returns {number}
 */
function frameScale(app) {
	const scale = Number(app?.position?.scale);
	return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * @param {object} app
 * @returns {HTMLElement|null}
 */
function facingInput(app) {
	const input = app?.element?.querySelector(`.${HOST_CLASS} input[name="${INPUT_NAME}"]`);
	return input instanceof HTMLInputElement ? input : null;
}

/**
 * @param {object} app
 * @returns {HTMLElement|null}
 */
function detailsScroller(app) {
	const details = app?.element?.querySelector("[data-application-part=\"details\"]");
	return details instanceof HTMLElement ? details : null;
}

/**
 * Drop the open menu and every listener owned by this sheet.
 * @param {object} app
 */
function releaseFacingUi(app) {
	if ( !app ) return;
	const state = app._sw5eFacingUi;
	state?.sheetAbort?.abort();
	state?.menuAbort?.abort();
	if ( state?.onPosition ) app.removeEventListener?.("position", state.onPosition);
	if ( state ) {
		state.sheetAbort = null;
		state.menuAbort = null;
		state.onPosition = null;
	}
	app.element?.querySelector(`.${MENU_CLASS}`)?.remove();
}

/**
 * Close the suggestion menu without removing the toggle listener.
 * @param {object} app
 */
function closeFacingMenu(app) {
	const state = facingUiState(app);
	state.menuAbort?.abort();
	state.menuAbort = null;
	if ( state.onPosition ) {
		app.removeEventListener?.("position", state.onPosition);
		state.onPosition = null;
	}
	app.element?.querySelector(`.${MENU_CLASS}`)?.remove();
	app.element?.querySelector(`.${TOGGLE_CLASS}`)?.setAttribute("aria-expanded", "false");
}

/**
 * Place the menu in the sheet frame's layout coordinates, including window scale.
 * @param {object} app
 * @param {HTMLElement} menu
 * @param {HTMLInputElement} input
 */
function placeFacingMenu(app, menu, input) {
	const frame = app.element;
	const details = detailsScroller(app);
	if ( !(frame instanceof HTMLElement) || !input.isConnected ) {
		closeFacingMenu(app);
		return;
	}
	if ( details instanceof HTMLElement ) {
		const inputRect = input.getBoundingClientRect();
		const detailsRect = details.getBoundingClientRect();
		const visible = inputRect.bottom > detailsRect.top + 1 && inputRect.top < detailsRect.bottom - 1;
		if ( !visible ) {
			closeFacingMenu(app);
			return;
		}
	}

	const scale = frameScale(app);
	const inputRect = input.getBoundingClientRect();
	const frameRect = frame.getBoundingClientRect();
	const frameStyle = getComputedStyle(frame);
	const borderLeft = Number.parseFloat(frameStyle.borderLeftWidth) || 0;
	const borderTop = Number.parseFloat(frameStyle.borderTopWidth) || 0;
	const left = ((inputRect.left - frameRect.left) / scale) - borderLeft;
	const inputHeight = inputRect.height / scale;
	const below = ((inputRect.bottom - frameRect.top) / scale) - borderTop;
	menu.style.left = `${left}px`;
	menu.style.minWidth = `${inputRect.width / scale}px`;
	menu.style.top = `${below}px`;
	const menuHeight = menu.offsetHeight;
	const roomBelow = frame.clientHeight - below;
	if ( menuHeight > roomBelow && below - inputHeight > menuHeight ) {
		menu.style.top = `${below - inputHeight - menuHeight}px`;
	}
}

/**
 * @param {object} app
 * @param {HTMLInputElement} input
 * @param {string} value
 */
function chooseFacing(app, input, value) {
	input.value = value;
	closeFacingMenu(app);
	input.focus();
	input.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * @param {object} app
 * @param {HTMLElement} menu
 * @param {HTMLInputElement} input
 * @param {AbortSignal} signal
 */
function bindFacingMenuKeys(app, menu, input, signal) {
	menu.addEventListener("keydown", event => {
		const options = [...menu.querySelectorAll(`.${OPTION_CLASS}`)];
		const index = options.indexOf(document.activeElement);
		if ( event.key === "Escape" ) {
			event.preventDefault();
			event.stopPropagation();
			closeFacingMenu(app);
			input.focus();
			return;
		}
		if ( event.key === "ArrowDown" ) {
			event.preventDefault();
			const next = index < 0 ? 0 : Math.min(options.length - 1, index + 1);
			options[next]?.focus();
		} else if ( event.key === "ArrowUp" ) {
			event.preventDefault();
			const next = index < 0 ? 0 : Math.max(0, index - 1);
			options[next]?.focus();
		} else if ( event.key === "Home" ) {
			event.preventDefault();
			options[0]?.focus();
		} else if ( event.key === "End" ) {
			event.preventDefault();
			options.at(-1)?.focus();
		}
	}, { signal });
}

/**
 * @param {object} app
 * @param {HTMLInputElement} input
 */
function openFacingMenu(app, input) {
	const frame = app.element;
	if ( !(frame instanceof HTMLElement) || input.disabled ) return;
	closeFacingMenu(app);

	const menu = document.createElement("div");
	menu.className = MENU_CLASS;
	menu.setAttribute("role", "listbox");
	menu.tabIndex = -1;
	for ( const [key, fallback] of FACING_SUGGESTIONS ) {
		const text = label(key, fallback);
		const option = document.createElement("button");
		option.type = "button";
		option.className = OPTION_CLASS;
		option.setAttribute("role", "option");
		option.textContent = text;
		option.addEventListener("mousedown", event => event.preventDefault());
		option.addEventListener("click", event => {
			event.preventDefault();
			chooseFacing(app, input, text);
		});
		menu.append(option);
	}

	const state = facingUiState(app);
	const menuAbort = new AbortController();
	state.menuAbort = menuAbort;
	const signal = menuAbort.signal;
	frame.append(menu);
	placeFacingMenu(app, menu, input);
	bindFacingMenuKeys(app, menu, input, signal);

	frame.addEventListener("pointerdown", event => {
		const target = event.target;
		if ( !(target instanceof Node) ) return;
		if ( menu.contains(target) ) return;
		if ( target instanceof Element && target.closest(`.${TOGGLE_CLASS}`) ) return;
		closeFacingMenu(app);
	}, { capture: true, signal });

	const details = detailsScroller(app);
	details?.addEventListener("scroll", () => {
		if ( !menu.isConnected ) return;
		placeFacingMenu(app, menu, input);
	}, { passive: true, signal });

	const onPosition = () => {
		if ( !menu.isConnected ) return;
		placeFacingMenu(app, menu, input);
	};
	state.onPosition = onPosition;
	app.addEventListener("position", onPosition);

	app.element?.querySelector(`.${TOGGLE_CLASS}`)?.setAttribute("aria-expanded", "true");
	menu.querySelector(`.${OPTION_CLASS}`)?.focus();
}

/**
 * Bind the toggle after the live frame and Facing input exist.
 * @param {object} app
 */
function initializeFacingMenu(app) {
	releaseFacingUi(app);
	const frame = app?.element;
	const item = app?.item ?? app?.document;
	if ( !(frame instanceof HTMLElement) || !frame.isConnected || !isStarshipWeaponItem(item) ) return;

	const input = facingInput(app);
	const toggle = frame.querySelector(`.${HOST_CLASS} .${TOGGLE_CLASS}`);
	if ( !(input instanceof HTMLInputElement) || !(toggle instanceof HTMLButtonElement) ) return;

	const sheetAbort = new AbortController();
	facingUiState(app).sheetAbort = sheetAbort;
	toggle.addEventListener("click", () => {
		if ( frame.querySelector(`.${MENU_CLASS}`) ) closeFacingMenu(app);
		else openFacingMenu(app, input);
	}, { signal: sheetAbort.signal });
	toggle.addEventListener("keydown", event => {
		if ( event.key !== "ArrowDown" ) return;
		if ( frame.querySelector(`.${MENU_CLASS}`) ) return;
		event.preventDefault();
		openFacingMenu(app, input);
	}, { signal: sheetAbort.signal });
}

/**
 * Markup only. The returned Details element is not the live sheet yet.
 * @param {object} sheet
 * @param {HTMLElement} details
 */
function appendFacingFieldset(sheet, details) {
	const item = sheet?.item ?? sheet?.document;
	details.querySelector(`.${HOST_CLASS}`)?.remove();
	if ( !isStarshipWeaponItem(item) ) return;

	const facing = typeof item.system?.firingArc === "string" ? item.system.firingArc : "";
	const turreted = item.system?.turreted === true;
	const editable = sheet.isEditable !== false;
	const facingText = label("SW5E.StarshipWeaponFacing", "Facing");
	const turretText = label("SW5E.StarshipWeaponTurreted", "Turreted");

	const host = document.createElement("fieldset");
	host.className = HOST_CLASS;

	const legend = document.createElement("legend");
	legend.textContent = facingText;

	const facingGroup = document.createElement("div");
	facingGroup.className = "form-group";
	const facingLabel = document.createElement("label");
	facingLabel.textContent = facingText;
	facingLabel.htmlFor = `sw5e-firing-arc-${item.id ?? "item"}`;
	const facingFields = document.createElement("div");
	facingFields.className = "form-fields";
	const control = document.createElement("div");
	control.className = "sw5e-firing-arc-control";
	const facingInput = document.createElement("input");
	facingInput.type = "text";
	facingInput.name = INPUT_NAME;
	facingInput.id = facingLabel.htmlFor;
	facingInput.value = facing;
	facingInput.disabled = !editable;
	const toggle = document.createElement("button");
	toggle.type = "button";
	toggle.className = TOGGLE_CLASS;
	toggle.setAttribute("aria-haspopup", "listbox");
	toggle.setAttribute("aria-expanded", "false");
	toggle.setAttribute("aria-label", facingText);
	toggle.disabled = !editable;
	toggle.textContent = "\u25BE";
	control.append(facingInput, toggle);
	facingFields.append(control);
	facingGroup.append(facingLabel, facingFields);

	const turretGroup = document.createElement("div");
	turretGroup.className = "form-group";
	const turretLabel = document.createElement("label");
	turretLabel.textContent = turretText;
	const turretFields = document.createElement("div");
	turretFields.className = "form-fields";
	const turretInput = document.createElement("input");
	turretInput.type = "checkbox";
	turretInput.name = "system.turreted";
	turretInput.checked = turreted;
	turretInput.disabled = !editable;
	turretFields.append(turretInput);
	turretGroup.append(turretLabel, turretFields);

	host.append(legend, facingGroup, turretGroup);
	details.append(host);
}

function registerFacingRenderWrapper() {
	if ( renderHtmlWrapped ) return;
	renderHtmlWrapped = true;
	try {
		libWrapper.register(getModuleId(), "dnd5e.applications.item.ItemSheet5e.prototype._renderHTML", async function (wrapped, context, options) {
			const rendered = await wrapped.call(this, context, options);
			const details = rendered?.details;
			if ( details instanceof HTMLElement ) appendFacingFieldset(this, details);
			return rendered;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap ItemSheet5e._renderHTML for starship weapon facing.", err);
	}
}

/** Register facing markup and the post-render suggestion menu. Schema registration stays in `patchDataModels`. */
export function patchStarshipWeaponFacing() {
	registerFacingRenderWrapper();
	Hooks.on("renderItemSheet5e", app => initializeFacingMenu(app));
	Hooks.on("closeItemSheet5e", app => releaseFacingUi(app));
}
