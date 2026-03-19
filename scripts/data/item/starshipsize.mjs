const { ArrayField, NumberField, ObjectField, SchemaField, StringField } = foundry.data.fields;

export default class StarshipSizeData extends dnd5e.dataModels.item.FeatData {
	static defineSchema() {
		const schema = super.defineSchema();

		schema.identifier = new StringField({ initial: "" });
		schema.tier = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.size = new StringField({ initial: "" });

		schema.hullDice = new StringField({ initial: "d6" });
		schema.hullDiceStart = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.hullDiceUsed = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.shldDice = new StringField({ initial: "d6" });
		schema.shldDiceStart = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.shldDiceUsed = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });

		schema.buildBaseCost = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.buildMinWorkforce = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.upgrdCostMult = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.upgrdMinWorkforce = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.baseSpaceSpeed = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.baseTurnSpeed = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.crewMinWorkforce = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.modBaseCap = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.modMaxSuitesBase = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.modMaxSuitesMult = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.modCostMult = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.modMinWorkforce = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.hardpointMult = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.equipCostMult = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.equipMinWorkforce = new NumberField({ nullable: false, integer: true, min: 0, initial: 0 });
		schema.cargoCap = new NumberField({ nullable: false, min: 0, initial: 0 });
		schema.foodCap = new NumberField({ nullable: false, min: 0, initial: 0 });
		schema.fuelCap = new NumberField({ nullable: false, min: 0, initial: 0 });
		schema.fuelCost = new NumberField({ nullable: false, min: 0, initial: 0 });

		schema.startingEquipment = new ArrayField(new ObjectField());
		schema.advancement = new ArrayField(new ObjectField());

		return schema;
	}
}
