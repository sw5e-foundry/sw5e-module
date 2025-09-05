export function patchPacks(strict = true) {
  if (strict) {
    game.packs
      .filter((p) => p.metadata.packageName === "dnd5e")
      .forEach((p) => {
        foundry.utils.setProperty(p.metadata.flags, "dnd5e.types", ["nope"]);
      });
  }
}
