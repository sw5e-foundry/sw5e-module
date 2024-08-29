const { NumberField, SchemaField, SetField, StringField } = foundry.data.fields;

/**
 * Produce the schema field for a points resource.
 * @param {object} [schemaOptions]    Options passed to the outer schema.
 * @returns {PowerCastingData}
 */
function makePointsResource(schemaOptions = {}) {
	const baseLabel = schemaOptions.label;
	const schemaObj = {
		value: new NumberField({
			nullable: false,
			integer: true,
			min: 0,
			initial: 0,
			label: `${baseLabel}Current`
		}),
		max: new NumberField({
			nullable: true,
			integer: true,
			min: 0,
			initial: null,
			label: `${baseLabel}Override`
		}),
		bonuses: new SchemaField({
			level: new game.dnd5e.dataModels.fields.FormulaField({ deterministic: true, label: `${baseLabel}BonusLevel` }),
			overall: new game.dnd5e.dataModels.fields.FormulaField({ deterministic: true, label: `${baseLabel}BonusOverall` })
		})
	};
	if (schemaOptions.hasTemp) schemaObj.temp = new NumberField({
		integer: true,
		initial: 0,
		min: 0,
		label: `${baseLabel}Temp`
	});
	if (schemaOptions.hasTempMax) schemaObj.tempmax = new NumberField({
		integer: true,
		initial: 0,
		label: `${baseLabel}TempMax`
	});
	return new SchemaField(schemaObj, schemaOptions);
}
function addProgression(wrapped, ...args) {
	const result = wrapped(...args);
	result.spellcasting.fields.forceProgression = new StringField({
		required: true, initial: "none", blank: false, label: "SW5E.Powercasting.Force.Prog.Label"
	});
	result.spellcasting.fields.techProgression = new StringField({
		required: true, initial: "none", blank: false, label: "SW5E.Powercasting.Tech.Prog.Label"
	});
	return result;
}
function addPowercasting(result) {
	result.powercasting = new SchemaField({
		force: new SchemaField({
			known: new SchemaField({
				max: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.Known.Max.Override" })
			}),
			level: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.Level.Override" }),
			limit: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.Limit.Override" }),
			maxPowerLevel: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.MaxPowerLevel.Override" }),
			points: makePointsResource({ label: "SW5E.Powercasting.Force.Point.Label", hasTemp: true }),
			schools: new SchemaField({
				lgt: new SchemaField({
					attr: new StringField({ nullable: true, initial: null, label: "SW5E.Powercasting.Force.School.Lgt.Attr.Override" }),
					dc: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.School.Lgt.Dc.Override" })
				}),
				uni: new SchemaField({
					attr: new StringField({ nullable: true, initial: null, label: "SW5E.Powercasting.Force.School.Uni.Attr.Override" }),
					dc: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.School.Uni.Dc.Override" })
				}),
				drk: new SchemaField({
					attr: new StringField({ nullable: true, initial: null, label: "SW5E.Powercasting.Force.School.Drk.Attr.Override" }),
					dc: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Force.School.Drk.Dc.Override" })
				})
			}, { label: "SW5E.Powercasting.Force.School.Label" }),
			used: new SetField(new NumberField(), { label: "SW5E.Powercasting.Force.Used" })
		}, { label: "SW5E.Powercasting.Force.Label" }),
		tech: new SchemaField({
			known: new SchemaField({
				max: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Tech.Known.Max.Override" })
			}),
			level: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Tech.Level.Override" }),
			limit: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Tech.Limit.Override" }),
			maxPowerLevel: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Tech.MaxPowerLevel.Override" }),
			points: makePointsResource({ label: "SW5E.Powercasting.Tech.Point.Label", hasTemp: true }),
			schools: new SchemaField({
				tec: new SchemaField({
					attr: new StringField({ nullable: true, initial: null, label: "SW5E.Powercasting.Tech.School.Tec.Attr.Override" }),
					dc: new NumberField({ nullable: true, min: 0, initial: null, label: "SW5E.Powercasting.Tech.School.Tec.Dc.Override" })
				})
			}, { label: "SW5E.Powercasting.Tech.School.Label" }),
			used: new SetField(new NumberField(), { label: "SW5E.Powercasting.Tech.Used" })
		}, { label: "SW5E.Powercasting.Tech.Label" })
	}, { label: "SW5E.Powercasting.Label" });
}
function changeProficiency(result, type) {
	if (type === "creature") {
		result.skills.model.fields.value.max = 5;
		result.abilities.model.fields.proficient.max = 5;
	} else {
		if (type !== "weapon") result.proficient.max = 5;
		result.proficient.integer = false;
		result.proficient.step = 0.5;
	}
}

export function patchDataModels() {
	// Powercasting
	libWrapper.register('sw5e', 'dnd5e.dataModels.item.ClassData.defineSchema', addProgression, 'WRAPPER');
	libWrapper.register('sw5e', 'dnd5e.dataModels.item.SubclassData.defineSchema', addProgression, 'WRAPPER');
	libWrapper.register('sw5e', 'dnd5e.dataModels.actor.CreatureTemplate.defineSchema', function (wrapped, ...args) {
		const result = wrapped(...args);
		addPowercasting(result);
		changeProficiency(result, "creature");
		return result;
	}, 'WRAPPER');
	libWrapper.register('sw5e', 'dnd5e.dataModels.item.ToolData.defineSchema', function (wrapped, ...args) {
		const result = wrapped(...args);
		changeProficiency(result, "tool");
		return result;
	}, 'WRAPPER');
	libWrapper.register('sw5e', 'dnd5e.dataModels.item.WeaponData.defineSchema', function (wrapped, ...args) {
		const result = wrapped(...args);
		changeProficiency(result, "weapon");
		return result;
	}, 'WRAPPER');

}
