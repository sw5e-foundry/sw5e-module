# Starting Equipment for SW5e Classes

This module uses the DnD5e system’s built-in starting equipment mechanism.

How it works
- DnD5e class items can declare system.startingEquipment as a list of entries that define equipment choices presented when the class is added to an actor.
- Entries can be:
  - OR / AND grouping nodes
  - linked items: direct references to compendium items by UUID (Compendium.sw5e.<pack>.Item.<_id>)
  - Other system-defined selectors (weapon, armor, focus) — note these are tailored for DnD5e’s categories and generally won’t match SW5e categories. Use linked items for SW5e.

What we’re adding
- A generator script (utils/generate-starting-equipment.mjs) that reads a mapping file and writes system.startingEquipment into packs/src/classes/*.yml.
- A mapping file you fill out with your class equipment options (by item name and pack). The script resolves names to item _id and writes the proper compendium UUIDs.

Quick start
1) Create data/starting-equipment.yml based on the example that appears at data/starting-equipment.example.yml (generated the first time you run the script with no mapping).
2) For each class key (matches the file name in packs/src/classes, e.g. fighter, guardian), define groups of choices.
   Example structure:

   classes:
     fighter:
       groups:
         - type: OR
           options:
             - and:
                 - { pack: blasters, name: "Affixed Rifle", count: 1 }
                 - { pack: ammo, name: "Power cell", count: 20 }
             - and:
                 - { pack: vibroweapons, name: "Vibroblade", count: 2 }
         - type: OR
           options:
             - { and: [ { pack: kits, name: "Explorer's Pack", count: 1 } ] }
             - { and: [ { pack: kits, name: "Dungeoneer's Pack", count: 1 } ] }

3) Run the generator:
   npm run gen:starting-eq

4) Build packs (if needed):
   npm run build:db

Notes and tips
- pack refers to a top-level pack directory under packs/src (e.g., blasters, vibroweapons, adventuringgear, kits, etc.).
- name must exactly match the item’s name within that pack subtree.
- If multiple items share the same name, rename one in the source packs or adjust to a more specific item.
- The script replaces any existing system.startingEquipment entries for the classes you specify in the mapping.
- DnD5e also supports system.wealth for an “alternate wealth” option; we’ll add those later once SW5e starting wealth rules are finalized.

