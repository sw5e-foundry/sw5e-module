const DEBUG = false;

function addHook(id, hookID) {
	libWrapper.register('sw5e', id, function (wrapped, ...args) {
		if (DEBUG) console.debug(`libWrapper hook '${id}' start`);
		const allowed = Hooks.call('sw5e.pre' + (hookID ?? id), this, ...args);
		if (allowed === false) return;
		const result = wrapped(...args);
		const config = { result };
		Hooks.call('sw5e.' + (hookID ?? id), this, result, config, ...args);
		if (DEBUG) console.debug(`libWrapper hook '${id}' end`);
		return config.result;
	}, 'WRAPPER');
}

function addHookAsync(id, hookID) {
	libWrapper.register('sw5e', id, async function (wrapped, ...args) {
		if (DEBUG) console.debug(`libWrapper hook '${id}' start`);
		const allowed = Hooks.call('sw5e.pre' + (hookID ?? id), this, ...args);
		if (allowed === false) return;
		const result = await wrapped(...args);
		const config = { result };
		Hooks.call('sw5e.' + (hookID ?? id), this, result, config, ...args);
		if (DEBUG) console.debug(`libWrapper hook '${id}' end`);
		return config.result;
	}, 'WRAPPER');
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

	//-----------------//
	// DataModel Hooks //
	//-----------------//

	// ActorData Hooks
	addHook('dnd5e.dataModels.ActorDataModel.prototype._prepareScaleValues', 'ActorDataModel._prepareScaleValues');
	// SpellData Hooks
	addHookAsync('dnd5e.dataModels.item.SpellData.prototype.getSheetData', 'SpellData.getSheetData');
	addHook('dnd5e.dataModels.item.SpellData.prototype.availableAbilities', 'SpellData.availableAbilities');
	addHook('dnd5e.dataModels.item.SpellData.prototype._typeAbilityMod', 'SpellData._typeAbilityMod');

	//-------------------//
	// Application Hooks //
	//-------------------//

	// ActorSheet5e Hooks
	addHook('dnd5e.applications.actor.ActorSheet5e.prototype._onDropSpell', 'ActorSheet5e._onDropSpell');
	addHook('dnd5e.applications.actor.ActorSheet5e.prototype._prepareSpellbook', 'ActorSheet5e._prepareSpellbook');
	// ActorSheet5eCharacter Hooks
	addHookAsync('dnd5e.applications.actor.ActorSheet5eCharacter.prototype.getData', 'ActorSheet5eCharacter.getData');
	addHookAsync('dnd5e.applications.actor.ActorSheet5eCharacter2.prototype.getData', 'ActorSheet5eCharacter.getData');
	// ItemSheet5e Hooks
	// ?
	// ActivityUsageDialog Hooks
	addHookAsync('dnd5e.applications.activity.ActivityUsageDialog.prototype._prepareScalingContext', 'ActivityUsageDialog._prepareScalingContext');
	addHookAsync('dnd5e.applications.activity.ActivityUsageDialog.prototype._prepareSubmitData', 'ActivityUsageDialog._prepareSubmitData');
}
