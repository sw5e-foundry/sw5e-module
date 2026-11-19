import { getModuleId, HOOKS_NAMESPACE } from "../module-support.mjs";

const DEBUG = false;

function registerHook(id, callback, mode='WRAPPER') {
	try {
		libWrapper.register(getModuleId(), id, callback, mode);
		return true;
	} catch(err) {
		console.warn(`${HOOKS_NAMESPACE.toUpperCase()} | Skipping incompatible wrapper target '${id}'.`, err);
		return false;
	}
}

function addHook(id, hookID) {
	return registerHook(id, function (wrapped, ...args) {
		if (DEBUG) console.debug(`libWrapper hook '${id}' start`);
		const allowed = Hooks.call(`${HOOKS_NAMESPACE}.pre` + (hookID ?? id), this, ...args);
		if (allowed === false) return;
		const result = wrapped(...args);
		const config = { result };
		Hooks.call(`${HOOKS_NAMESPACE}.` + (hookID ?? id), this, result, config, ...args);
		if (DEBUG) console.debug(`libWrapper hook '${id}' end`);
		return config.result;
	});
}

function addHookAsync(id, hookID) {
	return registerHook(id, async function (wrapped, ...args) {
		if (DEBUG) console.debug(`libWrapper hook '${id}' start`);
		const allowed = Hooks.call(`${HOOKS_NAMESPACE}.pre` + (hookID ?? id), this, ...args);
		if (allowed === false) return;
		const result = await wrapped(...args);
		const config = { result };
		Hooks.call(`${HOOKS_NAMESPACE}.` + (hookID ?? id), this, result, config, ...args);
		if (DEBUG) console.debug(`libWrapper hook '${id}' end`);
		return config.result;
	});
}

export function addHooks() {
	//----------------//
	// Document Hooks //
	//----------------//

	// Actor5e Hooks
	addHook('dnd5e.documents.Actor5e.prototype._prepareSpellcasting', 'Actor5e._prepareSpellcasting');
	addHook('dnd5e.documents.Actor5e.prototype.spellcastingClasses', 'Actor5e.spellcastingClasses');
	// Item5e Hooks
	addHook('dnd5e.documents.Item5e.prototype.spellcasting', 'Item5e.spellcasting');
	addHookAsync('dnd5e.documents.Item5e.fromDropData', 'Item5e.fromDropData');

	//-----------------//
	// DataModel Hooks //
	//-----------------//

	// ActorData Hooks
	// ActorDataModel is not exported in dnd5e 6.1. CommonTemplate is the public parent that owns the method.
	addHook('dnd5e.dataModels.actor.CommonTemplate.prototype._prepareScaleValues', 'ActorDataModel._prepareScaleValues');
	// SpellData Hooks
	addHookAsync('dnd5e.dataModels.item.SpellData.prototype.getSheetData', 'SpellData.getSheetData');
	addHook('dnd5e.dataModels.item.SpellData.prototype.availableAbilities', 'SpellData.availableAbilities');
	addHook('dnd5e.dataModels.item.SpellData.prototype._typeAbilityMod', 'SpellData._typeAbilityMod');

	//-------------------//
	// Application Hooks //
	//-------------------//

	// ActorSheet5e Hooks
	addHook('dnd5e.applications.actor.BaseActorSheet.prototype._assignItemCategories', 'BaseActorSheet._assignItemCategories');
	addHook('dnd5e.applications.actor.BaseActorSheet.prototype._prepareSpellbook', 'ActorSheet5e._prepareSpellbook');
	// ItemSheet5e Hooks
	// ?
	// ActivityUsageDialog Hooks
	addHookAsync('dnd5e.applications.activity.ActivityUsageDialog.prototype._prepareScalingContext', 'ActivityUsageDialog._prepareScalingContext');
	addHookAsync('dnd5e.applications.activity.ActivityUsageDialog.prototype._prepareSubmitData', 'ActivityUsageDialog._prepareSubmitData');
}
