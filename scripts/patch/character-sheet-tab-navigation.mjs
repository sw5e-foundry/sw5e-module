const ABILITY_SCORES_PART_SELECTOR = "[data-application-part=\"abilityScores\"]";
const ABILITY_SCORES_SECTION_SELECTOR = "section.ability-scores";
const ABILITY_SCORE_INPUT_SELECTOR = "input[name^=\"system.abilities.\"][name$=\".value\"]";
const PENDING_ABILITY_FOCUS = new Map();

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function isActorSheetEditMode(app) {
	const MODES = app?.constructor?.MODES;
	if ( MODES && ("EDIT" in MODES) && ("PLAY" in MODES) ) return app._mode === MODES.EDIT;
	return Boolean(app?.isEditable);
}

function getPendingFocusKey(app, actor) {
	return app?.id ?? app?.appId ?? actor?.uuid ?? null;
}

function clearPendingAbilityFocus(app, actor) {
	const key = getPendingFocusKey(app, actor);
	if ( key ) PENDING_ABILITY_FOCUS.delete(key);
}

function queuePendingAbilityFocus(app, actor, inputName) {
	const key = getPendingFocusKey(app, actor);
	if ( !key || !inputName ) return;
	PENDING_ABILITY_FOCUS.set(key, inputName);
}

function resolveAbilityScoresRoot(html, app) {
	const hookRoot = getHtmlRoot(html);
	const appEl = app?.element;
	const appRoot = appEl instanceof HTMLElement ? appEl : appEl?.[0];

	for ( const candidate of [hookRoot, appRoot] ) {
		if ( !(candidate instanceof HTMLElement) ) continue;
		const partRoot = candidate.matches?.(ABILITY_SCORES_PART_SELECTOR)
			? candidate
			: candidate.querySelector?.(ABILITY_SCORES_PART_SELECTOR);
		if ( partRoot instanceof HTMLElement ) return partRoot;

		const sectionRoot = candidate.matches?.(ABILITY_SCORES_SECTION_SELECTOR)
			? candidate
			: candidate.querySelector?.(ABILITY_SCORES_SECTION_SELECTOR);
		if ( sectionRoot instanceof HTMLElement ) return sectionRoot;
	}

	return null;
}

function getAbilityScoreInputs(root) {
	if ( !(root instanceof HTMLElement) ) return [];
	return Array.from(root.querySelectorAll(ABILITY_SCORE_INPUT_SELECTOR))
		.filter(input => input instanceof HTMLInputElement);
}

function restorePendingAbilityFocus(app, html, actor) {
	const key = getPendingFocusKey(app, actor);
	if ( !key ) return false;
	const targetName = PENDING_ABILITY_FOCUS.get(key);
	if ( !targetName ) return false;

	const root = resolveAbilityScoresRoot(html, app);
	const inputs = getAbilityScoreInputs(root);
	PENDING_ABILITY_FOCUS.delete(key);
	if ( !inputs.length ) return false;

	const targetInput = inputs.find(input => input.name === targetName);
	if ( !(targetInput instanceof HTMLInputElement) ) return false;
	targetInput.focus();
	return true;
}

async function handleAbilityScoreTab(event, app, actor) {
	if ( event.key !== "Tab" ) return;
	if ( event.altKey || event.ctrlKey || event.metaKey ) return;

	const currentInput = event.currentTarget;
	if ( !(currentInput instanceof HTMLInputElement) ) return;

	const root = currentInput.closest(ABILITY_SCORES_PART_SELECTOR)
		?? currentInput.closest(ABILITY_SCORES_SECTION_SELECTOR)
		?? resolveAbilityScoresRoot(app?.element, app);
	const inputs = getAbilityScoreInputs(root);
	const currentIndex = inputs.indexOf(currentInput);
	if ( currentIndex < 0 ) return;

	const targetInput = inputs[currentIndex + (event.shiftKey ? -1 : 1)];
	if ( !(targetInput instanceof HTMLInputElement) ) return;

	event.preventDefault();
	event.stopPropagation();

	if ( currentInput.value === currentInput.defaultValue ) {
		targetInput.focus();
		return;
	}

	queuePendingAbilityFocus(app, actor, targetInput.name);
	try {
		if ( typeof app?.submit === "function" ) {
			await app.submit();
			restorePendingAbilityFocus(app, app.element, actor);
		}
		else currentInput.dispatchEvent(new Event("change", { bubbles: true }));
	} catch ( err ) {
		clearPendingAbilityFocus(app, actor);
		console.warn("SW5E | Ability score Tab navigation submit failed.", err);
		targetInput.focus();
	}
}

function bindAbilityScoreTabHandlers(app, actor, root) {
	for ( const input of getAbilityScoreInputs(root) ) {
		if ( input.dataset.sw5eAbilityTabBound === "true" ) continue;
		input.dataset.sw5eAbilityTabBound = "true";
		input.addEventListener("keydown", event => {
			void handleAbilityScoreTab(event, app, actor);
		});
	}
}

function injectCharacterAbilityTabNavigation(app, html) {
	const actor = app?.actor ?? app?.document;
	if ( actor?.type !== "character" ) {
		clearPendingAbilityFocus(app, actor);
		return;
	}

	const root = resolveAbilityScoresRoot(html, app);
	if ( !(root instanceof HTMLElement) ) {
		clearPendingAbilityFocus(app, actor);
		return;
	}

	if ( !isActorSheetEditMode(app) ) {
		clearPendingAbilityFocus(app, actor);
		return;
	}

	bindAbilityScoreTabHandlers(app, actor, root);
	restorePendingAbilityFocus(app, html, actor);
}

export function patchCharacterSheetTabNavigation() {
	Hooks.on("renderActorSheetV2", injectCharacterAbilityTabNavigation);
}
