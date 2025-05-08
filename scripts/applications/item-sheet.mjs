import { reloadBlaster } from './blaster-reload.mjs';

export class ItemSheetSW5E extends globalThis.dnd5e.applications.item.ItemSheet5e {
	/** @inheritdoc */
	get template() {
		return `modules/sw5e/templates/items/${this.item.type.substring(5)}.hbs`;
	}

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Handle the reload blaster button click
    html.on('click', '.reload-blaster', this._onReloadBlaster.bind(this));
  }

  async _onReloadBlaster(event) {
    event.preventDefault();
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.item; // 'this.item' refers to the Item being displayed in the sheet
    const actor = item.parent; // Get the Actor who owns the item

    if (item?.type === 'weapon' && ['simpleBL', 'martialBL', 'exoticBL'].includes(item?.data?.data?.weaponType)) {
      reloadBlaster(actor, item);
    }
  }
}
