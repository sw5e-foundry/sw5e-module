export class ItemSheetSW5E extends globalThis.dnd5e.applications.item.ItemSheet5e {
	/** @inheritdoc */
	get template() {
		return `modules/sw5e/templates/items/${this.item.type.substring(5)}.hbs`;
	}
}
