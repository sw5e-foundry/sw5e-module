export function patchKeen() {
	function useKeen(wrapped, ...args) {
		const keen = this.parent?.flags?.sw5e?.properties?.keen ?? 0;
		const result = wrapped(...args);
		return result === Infinity ? Math.max(15, 20 - keen) : result;
	}
	libWrapper.register('sw5e', 'dnd5e.dataModels.item.WeaponData.prototype._typeCriticalThreshold', useKeen, 'MIXED' );
	libWrapper.register('sw5e', 'dnd5e.dataModels.item.ConsumableData.prototype._typeCriticalThreshold', useKeen, 'MIXED' );
}
