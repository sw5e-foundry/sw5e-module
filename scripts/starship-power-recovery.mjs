import {
	STARSHIP_POWER_DIE_SLOTS,
	buildStarshipLegacyAttributeMirrorUpdate,
	getLegacyStarshipActorSystem,
	getStarshipPowerRecoverySlots,
	getStarshipPowerRecoverySummary,
	recordStarshipPowerSlotPeak
} from "./starship-data.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

function localizeOrFallback(key, fallback, data = {}) {
	const formatted = game?.i18n?.format?.(key, data);
	if ( formatted && formatted !== key ) return formatted;
	const localized = game?.i18n?.localize?.(key);
	if ( localized && localized !== key ) return localized;
	return Object.entries(data).reduce(
		(text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
		fallback
	);
}

function escapeHtml(text) {
	return globalThis.foundry?.utils?.escapeHTML?.(String(text ?? "")) ?? String(text ?? "");
}

function isValidRecoveryFormula(formula) {
	if ( typeof formula !== "string" ) return false;
	const trimmed = formula.trim().toLowerCase();
	if ( !trimmed || trimmed === "1d1" || trimmed === "d1" || trimmed === "0" ) return false;
	return true;
}

function findEquippedReactor(actor) {
	const items = actor?.items?.contents ?? [];
	return items.find(item => {
		const typeVal = item.system?.type?.value ?? item._source?.system?.type?.value;
		const equipped = item.system?.equipped ?? item._source?.system?.equipped;
		return typeVal === "reactor" && equipped !== false;
	}) ?? null;
}

export async function getStarshipPowerRecoveryFormula(actor) {
	const reactor = findEquippedReactor(actor);
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const candidates = [
		reactor?.system?.attributes?.powerdicerec?.value,
		reactor?._source?.system?.attributes?.powerdicerec?.value,
		legacySystem?.attributes?.equip?.reactor?.powerRecDie,
		reactor?.flags?.sw5e?.legacyStarshipEquipment?.attributes?.powerdicerec?.value
	];
	for ( const candidate of candidates ) {
		if ( isValidRecoveryFormula(candidate) ) return String(candidate).trim();
	}

	const compendiumSource = reactor?._stats?.compendiumSource ?? reactor?.flags?.core?.sourceId;
	if ( compendiumSource ) {
		try {
			const doc = await fromUuid(compendiumSource);
			const fromPack = doc?.system?.attributes?.powerdicerec?.value;
			if ( isValidRecoveryFormula(fromPack) ) return String(fromPack).trim();
		} catch {
			// Compendium lookup is best-effort only.
		}
	}

	return null;
}

async function promptManualRecoveryAmount() {
	const label = localizeOrFallback(
		"SW5E.StarshipSheet.AdvancedPowerManualRecoveryAmount",
		"Recovered dice"
	);
	const hint = localizeOrFallback(
		"SW5E.StarshipSheet.AdvancedPowerManualRecoveryHint",
		"Manual recovery — no equipped reactor recovery formula was found."
	);
	const content = `<form class="sw5e-starship-power-recovery-manual">
		<p class="notes">${escapeHtml(hint)}</p>
		<div class="form-group">
			<label for="sw5e-power-recovery-amount">${escapeHtml(label)}</label>
			<input id="sw5e-power-recovery-amount" name="recovered" type="number" min="1" step="1" value="1" />
		</div>
	</form>`;

	const result = await DialogV2.wait({
		window: {
			title: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerManualRecoveryTitle", "Manual Power Recovery")
		},
		content,
		position: { width: 380 },
		buttons: [
			{ action: "recover", label: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerRecover", "Recover Power"), icon: "fas fa-bolt", default: true },
			{ action: "cancel", label: localizeOrFallback("Cancel", "Cancel"), icon: "fas fa-times" }
		],
		submit: (action, dialog) => {
			if ( action !== "recover" ) return null;
			const form = dialog.form ?? dialog.element?.querySelector?.("form");
			const raw = form?.querySelector?.("[name='recovered']")?.value;
			const amount = Math.max(0, Math.trunc(Number(raw)));
			return Number.isFinite(amount) && amount > 0 ? amount : null;
		}
	});

	return result;
}

async function rollRecoveryFormula(actor, formula) {
	const roll = await new Roll(formula, actor?.getRollData?.() ?? {}).evaluate();
	const flavor = localizeOrFallback("SW5E.PowerDiceRecovery", "Power Dice Recovery");
	await roll.toMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: `${flavor}: ${actor?.name ?? ""}`.trim(),
		flags: { sw5e: { roll: { type: "pwrDieRec" } } }
	});
	return Math.max(0, Math.trunc(roll.total));
}

async function promptCheckboxAllocation(actor, slots, count) {
	const allocatable = slots.filter(slot => !slot.isFull);
	if ( !allocatable.length ) return null;

	const intro = localizeOrFallback(
		"SW5E.StarshipSheet.AdvancedPowerAllocateIntro",
		"Allocate {count} recovered power dice to available subsystem pools.",
		{ count }
	);
	const rows = allocatable.map(slot => {
		const fullLabel = localizeOrFallback(
			"SW5E.StarshipSheet.AdvancedPowerSlotFull",
			"{label} is full ({current}/{max})",
			{ label: slot.label, current: slot.value, max: slot.allocationMax }
		);
		const poolLabel = localizeOrFallback(
			"SW5E.StarshipSheet.AdvancedPowerSlotPool",
			"{label}: {current} / {max}",
			{ label: slot.label, current: slot.value, max: slot.allocationMax }
		);
		if ( slot.isFull ) {
			return `<div class="form-group sw5e-starship-power-alloc-row">
				<label>${escapeHtml(slot.label)}</label>
				<input type="checkbox" name="${escapeHtml(slot.key)}" disabled title="${escapeHtml(fullLabel)}" />
			</div>`;
		}
		return `<div class="form-group sw5e-starship-power-alloc-row">
			<label for="sw5e-power-alloc-${escapeHtml(slot.key)}">${escapeHtml(poolLabel)}</label>
			<input id="sw5e-power-alloc-${escapeHtml(slot.key)}" type="checkbox" name="${escapeHtml(slot.key)}" />
		</div>`;
	}).join("");

	const content = `<form class="sw5e-starship-power-recovery-allocate">
		<p class="notes">${escapeHtml(intro)}</p>
		${rows}
	</form>`;

	return DialogV2.wait({
		window: {
			title: localizeOrFallback("SW5E.AllocatePowerDice", "Allocate Power Dice") + `: ${actor.name}`
		},
		content,
		position: { width: 420 },
		buttons: [
			{ action: "allocate", label: localizeOrFallback("SW5E.AllocatePowerDice", "Allocate Power Dice"), icon: "fas fa-wrench", default: true },
			{ action: "cancel", label: localizeOrFallback("Cancel", "Cancel"), icon: "fas fa-times" }
		],
		submit: (action, dialog) => {
			if ( action !== "allocate" ) return null;
			const form = dialog.form ?? dialog.element?.querySelector?.("form");
			if ( !form ) return null;
			const allocation = allocatable
				.filter(slot => form.querySelector(`[name="${slot.key}"]`)?.checked)
				.map(slot => slot.key);
			if ( allocation.length !== count ) {
				ui.notifications?.warn?.(localizeOrFallback(
					"SW5E.StarshipSheet.AdvancedPowerAllocateCountMismatch",
					"Select exactly {count} subsystem pools.",
					{ count }
				));
				return null;
			}
			return allocation;
		}
	});
}

async function applyPowerDiceRecovery(actor, recoveredAmount) {
	const slots = getStarshipPowerRecoverySlots(actor);
	const byKey = Object.fromEntries(slots.map(slot => [slot.key, slot]));
	const totalMissing = slots.reduce((sum, slot) => sum + slot.missing, 0);
	const updates = {};

	if ( recoveredAmount >= totalMissing ) {
		for ( const slot of slots ) updates[slot.key] = slot.allocationMax;
	} else if ( (byKey.central?.missing ?? 0) >= recoveredAmount ) {
		updates.central = (byKey.central?.value ?? 0) + recoveredAmount;
	} else {
		updates.central = byKey.central?.allocationMax ?? 0;
		const toAllocate = recoveredAmount - (byKey.central?.missing ?? 0);
		if ( toAllocate > 0 ) {
			const nonCentral = slots.filter(slot => slot.key !== "central" && !slot.isFull);
			if ( !nonCentral.length ) {
				ui.notifications?.warn?.(localizeOrFallback(
					"SW5E.StarshipSheet.AdvancedPowerNoAllocatableSlots",
					"No subsystem pools can accept recovered dice."
				));
				return false;
			}
			const allocation = await promptCheckboxAllocation(actor, nonCentral, toAllocate);
			if ( !allocation ) return false;
			for ( const slotKey of allocation ) {
				updates[slotKey] = (byKey[slotKey]?.value ?? 0) + 1;
			}
		}
	}

	let payload = {};
	for ( const [slotKey, newValue] of Object.entries(updates) ) {
		if ( !STARSHIP_POWER_DIE_SLOTS.includes(slotKey) ) continue;
		await recordStarshipPowerSlotPeak(actor, slotKey, newValue);
		payload = { ...payload, ...buildStarshipLegacyAttributeMirrorUpdate(`system.attributes.power.${slotKey}.value`, newValue) };
	}
	if ( !Object.keys(payload).length ) return false;
	await actor.update(payload);
	return true;
}

export async function recoverStarshipPowerDice(actor) {
	if ( !actor ) return false;

	const { totalMissing } = getStarshipPowerRecoverySummary(actor);
	if ( totalMissing <= 0 ) {
		ui.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipSheet.AdvancedPowerRecoveryFull",
			"All power die pools are already at capacity."
		));
		return false;
	}

	const formula = await getStarshipPowerRecoveryFormula(actor);
	let recoveredAmount = 0;
	if ( formula ) {
		recoveredAmount = await rollRecoveryFormula(actor, formula);
	} else {
		const manual = await promptManualRecoveryAmount();
		if ( manual === null || manual === undefined ) return false;
		recoveredAmount = manual;
	}
	if ( !Number.isFinite(recoveredAmount) || recoveredAmount <= 0 ) {
		ui.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipSheet.AdvancedPowerRecoveryNone",
			"No power dice were recovered."
		));
		return false;
	}

	return applyPowerDiceRecovery(actor, recoveredAmount);
}
