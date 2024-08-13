import { getFlag, makeElement } from "../../utils.mjs";
import CheckboxSelect from "../../../applications/checkbox-select.mjs";

function buildReloadNode(item, app) {
	const actor = item.actor;
	const reload = item.system.reload;
	reload.label = game.i18n.localize(`SW5E.WeaponAmmo.Type.${reload.type.capitalize()}.Label`);
	reload.action = game.i18n.localize(`SW5E.WeaponAmmo.Type.${reload.type.capitalize()}.Action`);
	reload.usesAmmo = !!reload.types.length;
	reload.ammoChoices = {
		"": "",
		...(actor?.itemTypes?.consumable?.reduce((list, ammo) => {
			if (ammo.system.type.value === "ammo" && reload.types.includes(ammo.system.type.subtype)) {
				list[ammo.id] = `${ammo.name} (${ammo.system.quantity})`;
			}
			return list;
		}, {}) ?? {}),
	};
	reload.hasChoices = reload.usesAmmo && (Object.keys(reload.ammoChoices).length > 1);
    reload.disabled = reload.usesAmmo && !reload.target;
    reload.full = reload.value === reload.max;
	// TODO: Readd this
	// if (actor.type === "npc" && !game.settings.get("sw5e", "npcConsumeAmmo")) reload.disabled = false;

	const numInputListener = app.isEditable ? { "change": (event) => {
		const input = event.target;
		const result = dnd5e.utils.parseInputDelta( input, item );
		if ( result !== undefined ) item.update( { [input.dataset.name]: result } );
	} } : {};
	const disabled = (cond) => { return cond ? { disabled: null } : {}; };

	return makeElement("div", {
		class: "form-group uses-per",
		_children: [
			// Accepted Ammo Types
			["label", {
				_children: [
					["a", {
						class: "weapon-configure-ammo",
						"data-tooltip": game.i18n.localize("SW5E.WeaponAmmo.Configure.Title"),
						_children: [ ["i", { class: "fas fa-tasks" }] ],
						_listeners: (app.isEditable ? { click: (event) => { item.system.configureAmmo(); } } : {}),
						// _listeners: clickListener(item.system.configureAmmo, item.system),
					}],
					["text", reload.label],
				]
			}],
			// Select Loaded Ammo
			...(reload.usesAmmo ? [["select", {
				class: "weapon-select-ammo",
				name: "flags.sw5e-module-test.reload.target",
				"data-tooltip": game.i18n.localize("SW5E.WeaponAmmo.Hint.Target"),
				...disabled(!reload.hasChoices),
				_children: Object.entries(reload.ammoChoices).map(([key,val]) => {
					return ["option", {
						value: key,
						...(reload.target === key ? { selected: null } : {}),
						_children: [ ["text", val] ],
					}];
				}),
				_listeners: (app.isEditable ? { change: (event) => {
					const target = event.currentTarget;
					const index = target.selectedIndex;
					const ammoID = target[index].value;
					item.system.ammo = ammoID;
				}} : {}),
			}]] : []),
			// Loaded Ammo Ammount
			["input", {
				type: "text",
				name: "flags.sw5e-module-test.reload.value",
				value: reload.value === null ? "" : reload.value,
				"data-dtype": "Number",
				"data-tooltip": game.i18n.localize("SW5E.WeaponAmmo.Hint.Value"),
				...(disabled(reload.disabled)),
				_listeners: numInputListener,
			}],
			// Separator
			["span", {
				class: "sep",
				_children: [ ["text", "/"] ],
			}],
			// Max Ammo Ammount
			["span", {
				"data-tooltip": game.i18n.localize("SW5E.WeaponAmmo.Hint.Max"),
				_children: [ ["text", reload.max]],
			}],
			// Reload Button
			["a", {
				class: "weapon-reload",
				...disabled(reload.disabled || reload.full),
				"data-tooltip": game.i18n.localize(`SW5E.WeaponAmmo.Type.${reload.type.capitalize()}.Hint.${reload.disabled ? "NoAmmo" : reload.full ? "Full" : "Default"}`),
				_children: [ ["text", reload.action] ],
				_listeners: (app.isEditable ? { click: (event) => { item.system.reloadWeapon(); } } : {}),
				// _listeners: clickListener(item.system.reloadWeapon, item.system),
			}],
			// Ammo Spent per Shot
			["input", {
				type: "text",
				name: "flags.sw5e-module-test.reload.use",
				value: reload.use ?? "",
				placeholder: reload.baseUse,
				"data-dtype": "Number",
				"data-tooltip": game.i18n.localize("SW5E.WeaponAmmo.Hint.ConsumeAmount"),
				_listeners: numInputListener,
			}],
		],
	});
}

function patchSheet() {
	Hooks.on("renderItemSheet5e", (app, html, data) => {
		const item = app.item;
		if (item.system.reload?.max) {
			html.find(`.weapon-properties`).each(async (idx, el) => {
				const sibling = el.nextElementSibling;
				const parentNode = sibling.parentNode;

				const reloadNode = buildReloadNode(item, app);

				parentNode.insertBefore(reloadNode, sibling);
			});
		}
	});	
}

function addAmmoHelpers() {
	Object.defineProperty(dnd5e.dataModels.item.WeaponData.prototype, "reload", {
		get: function () {
			return {
				target: getFlag(this.parent, "reload.target") ?? null,
				value: getFlag(this.parent, "reload.value") ?? null,
				max: (this.getProperty("rel") || this.getProperty("overheat")) ?? 0,
				use: getFlag(this.parent, "reload.use"),
				baseUse: this.actionType === "save" ? Math.max(this.getProperty("burst"), this.getProperty("rapid"), 1) : 1,
				types: getFlag(this.parent, "reload.types") ?? [ "powerCell"],
				type: this.getProperty("overheat") ? "overheat" : "reload",
			};
		}
	});
	Object.defineProperty(dnd5e.dataModels.item.WeaponData.prototype, "ammo", {
		set: async function (newAmmoID) {
			const wpn = this.parent;
			const reload = this.reload;
			const oldLoad = reload.value;
			const oldAmmo = this.ammo;

			if (newAmmoID === reload.target) return;

			const wpnUpdates = {
				"flags.sw5e-module-test.reload.target": newAmmoID,
				"flags.sw5e-module-test.reload.value": 0,
			};

			if (oldAmmo && oldLoad) {
				const ammoUpdates = {};
				switch (oldAmmo.system.type.subtype) {
					case "cartridge":
					case "dart":
					case "missile":
					case "rocket":
					case "snare":
					case "torpedo":
						ammoUpdates["system.quantity"] = (oldAmmo.system.quantity ?? 0) + oldLoad;
						break;
					case "powerCell":
					case "flechetteClip":
					case "flechetteMag":
					case "powerGenerator":
					case "projectorCanister":
					case "projectorTank":
						if (oldLoad === reload.max) ammoUpdates["system.quantity"] = (oldAmmo.system.quantity ?? 0) + 1;
						else {
							const confirm = await Dialog.confirm({
								title: game.i18n.localize("SW5E.WeaponAmmo.Eject.Title"),
								content: game.i18n.localize("SW5E.WeaponAmmo.Eject.Content"),
								defaultYes: true
							});
							if (!confirm) {
								wpn.update({"flags.sw5e-module-test.reload.target": reload.target});
								return;
							}
						}
						break;
				}
				if (!foundry.utils.isEmpty(ammoUpdates)) await oldAmmo.update(ammoUpdates);
			}

			await wpn.update(wpnUpdates);
		},
		get: function() { return this.reload.target ? this.parent.actor?.items?.get(this.reload.target) : null; },
	});

	dnd5e.dataModels.item.WeaponData.prototype.reloadWeapon = async function() {
		const ammo = this.ammo;
		const reload = this.reload;
		// TODO: Readd this
		const freeShot = false;
		// const freeShot = this.parent?.actor?.type === "npc" && !game.settings.get("sw5e", "npcConsumeAmmo");

		let toReload = reload.max - reload.value;
		const wpnUpdates = {};

		if (ammo && (toReload > 0)) {
			const ammoUpdates = {};
			if (!reload.types.includes(ammo.system.type.subtype)) return;
			if (ammo.system.quantity <= 0) return;

			switch (ammo.system.type.subtype) {
				case "cartridge":
				case "dart":
				case "missile":
				case "rocket":
				case "snare":
				case "torpedo":
				case "ssmissile":
				case "ssrocket":
				case "sstorpedo":
				case "ssbomb":
					toReload = Math.min(toReload, ammo.system.quantity);
					if (!freeShot) ammoUpdates["system.quantity"] = ammo.system.quantity - toReload;
					break;
				case "powerCell":
				case "flechetteClip":
				case "flechetteMag":
				case "powerGenerator":
				case "projectorCanister":
				case "projectorTank":
					if (!freeShot) ammoUpdates["system.quantity"] = ammo.system.quantity - 1;
					break;
			}
			if (!foundry.utils.isEmpty(ammoUpdates)) await ammo.update(ammoUpdates);
		}

		if (toReload !== 0) wpnUpdates["flags.sw5e-module-test.reload.value"] = reload.value + toReload;

		if (!foundry.utils.isEmpty(wpnUpdates)) await this.parent.update(wpnUpdates);
	};

	dnd5e.dataModels.item.WeaponData.prototype.configureAmmo = async function() {
		const disabled = [];
		const ammo = this.ammo;
		const reload = this.reload;
		if (ammo) disabled.push(ammo.system.type.subtype);
		const result = await CheckboxSelect.checkboxSelect({
			title: game.i18n.localize("SW5E.WeaponAmmo.Configure.Title"),
			content: game.i18n.localize("SW5E.WeaponAmmo.Configure.Content"),
			checkboxes: CONFIG.DND5E.consumableTypes.ammo.subtypes,
			defaultSelect: reload.types,
			disabled
		});
		if (result) this.parent.update({ "flags.sw5e-module-test.reload.types": result });
	};

	dnd5e.dataModels.item.WeaponData.prototype.canUseAmmo = function({amount, error, warn} = { warn: true }) {
		const reload = this.reload;
		if (reload.max === 0) return true;
		amount = amount ?? reload.use ?? reload.baseUse;
		if (amount > (reload.value ?? 0)) {
			if (error) ui.notifications.error(game.i18n.localize("SW5E.WeaponAmmo.Error.NoAmmo"));
			else if (warn) ui.notifications.warn(game.i18n.localize("SW5E.WeaponAmmo.Warn.NoAmmo"));
			return false;
		}
		return true;
	}

	dnd5e.dataModels.item.WeaponData.prototype.useAmmo = function({amount, error, warn, update, force} = { error: true, update: true }) {
		const reload = this.reload;
		if (reload.max === 0) return false;
		amount = amount ?? reload.use ?? reload.baseUse;
		if (!force && (amount > (reload.value ?? 0))) {
			if (error) ui.notifications.error(game.i18n.localize("SW5E.WeaponAmmo.Error.NoAmmo"));
			else if (warn) ui.notifications.warn(game.i18n.localize("SW5E.WeaponAmmo.Warn.NoAmmo"));
			return false;
		}
		const updates = { "flags.sw5e-module-test.reload.value": Math.clamp(reload.value - amount, 0, reload.max) };
		if (update) this.parent.update(updates);
		else return updates;
	}
}

function addAmmoConsumption() {
	Hooks.on("dnd5e.preUseItem", (item, config, options) => {
		return (item.type !== "weapon") || item.hasAttack || item.system.canUseAmmo();
	});
	Hooks.on("dnd5e.useItem", (item, config, options, templates, effects, summoned) => {
		if (item.type !== "weapon") return;
		if (!item.hasAttack) item.system?.useAmmo();
	});
	Hooks.on("dnd5e.preRollAttack", (item, rollConfig) => {
		return (item.type !== "weapon") || item.system.canUseAmmo();
	});
	Hooks.on("dnd5e.rollAttack", (item, roll, ammoUpdate) => {
		if (item.type !== "weapon") return;
		ammoUpdate.push({
			...item.system.useAmmo({ update: false }),
			_id: item.id,
		});
	});
}

export function patchReload() {
	addAmmoHelpers();
	addAmmoConsumption();
	patchSheet();
}
