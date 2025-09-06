// SW5E Starship overlay for dnd5e Vehicle actors
// This sheet renders a Starship-focused UI when the actor is flagged as a starship.

const get = (obj, path) => foundry.utils.getProperty(obj, path);

function baseVehicleSheetClass() {
  // Prefer dnd5e v4+ path
  const cls = get(globalThis, "dnd5e.applications.actor.ActorSheet5eVehicle")
    ?? get(globalThis, "dnd5e.applications.actor.AppSheet5eVehicle")
    ?? get(globalThis, "dnd5e.applications.actor.ActorSheet5e")
    ?? ActorSheet;
  return cls;
}

export default class StarshipVehicleSheet extends baseVehicleSheetClass() {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sw5e", "sheet", "actor", "vehicle", "starship"],
      width: 900,
      height: 750,
      tabs: [{ navSelector: ".root-tabs", contentSelector: ".sheet-body", initial: "starship" }],
      dragDrop: [{ dragSelector: ".items-list .item", dropSelector: ".sheet-body" }]
    });
  }

  get template() {
    const enabled = this.actor.getFlag("sw5e", "starship.enabled") ?? false;
    if (!enabled) return super.template;
    return "modules/sw5e/templates/actors/vehicle-starship-sheet.hbs";
  }

  async getData(options = {}) {
    const context = await super.getData(options);

    // Starship flags container
    const flags = foundry.utils.duplicate(this.actor.getFlag("sw5e", "starship") ?? {});

    // Provide sane defaults for display
    const defaultPower = {
      central: 0,
      comms: 0,
      engines: 0,
      sensors: 0,
      shields: 0,
      weapons: 0,
      die: flags?.power?.die ?? "d6",
    };
    const power = Object.assign(defaultPower, flags.power ?? {});

    const routing = flags.routing ?? "none"; // engines | shields | weapons | none

    // Routing effects helper strings for tooltip/display
    const makeRouteTooltip = (route) => {
      const key = ["engines", "shields", "weapons", "none"].includes(route) ? route : "none";
      const rt = (k) => game.i18n.localize(`SW5E.Starship.RouteEffects.${key}.${k}`);
      return [rt("Positive"), rt("Neutral"), rt("Negative")]\
        .filter((s) => !!String(s).trim())\
        .join(" | ");
    };
    const routingEffects = {
      positive: game.i18n.localize(`SW5E.Starship.RouteEffects.${["engines","shields","weapons"].includes(routing) ? routing : "none"}.Positive`),
      neutral: game.i18n.localize(`SW5E.Starship.RouteEffects.${["engines","shields","weapons"].includes(routing) ? routing : "none"}.Neutral`),
      negative: game.i18n.localize(`SW5E.Starship.RouteEffects.${["engines","shields","weapons"].includes(routing) ? routing : "none"}.Negative`),
      tooltip: makeRouteTooltip(routing)
    };
    const routeTooltips = {
      engines: makeRouteTooltip("engines"),
      shields: makeRouteTooltip("shields"),
      weapons: makeRouteTooltip("weapons"),
      none: makeRouteTooltip("none")
    };

    const fuel = Object.assign({ value: 0, cap: 10, cost: 50 }, flags.fuel ?? {});

    const shields = Object.assign({ value: 0, max: 0, depleted: false }, flags.shields ?? {});

    const config = this.#getRepairConfig();

    const skills = Object.assign(
      {
        ast: 0,
        man: 0,
        ram: 0,
        pat: 0,
        scn: 0,
      },
      flags.skills ?? {}
    );

    const movement = Object.assign({ space: 0, turn: 0, units: "km" }, flags.movement ?? {});

    const deployment = Object.assign({ pilot: "", crew: [], passenger: [], active: "" }, flags.deployment ?? {});

    // Group items into starship categories
    const cats = this.#prepareStarshipCategories();

    context.starship = {
      enabled: flags.enabled ?? false,
      power,
      routing,
      routingEffects,
      routeTooltips,
      fuel,
      shields,
      skills,
      movement,
      deployment,
      categories: cats,
      config,
    };

    return context;
  }

  /**
   * Build starship item categories from this.actor.items
   */
  #prepareStarshipCategories() {
    const items = this.actor.items.contents ?? Array.from(this.actor.items ?? []);

    const cats = {
      armor: [],
      equipment: { hyper: [], powerc: [], reactor: [], ssshield: [], other: [] },
      modifications: { engineering: [], operation: [], suite: [], universal: [], weapon: [], other: [] },
      weapons: {
        "primary (starship)": [],
        "secondary (starship)": [],
        "tertiary (starship)": [],
        "quaternary (starship)": [],
        other: []
      },
      actions: { pilot: [], crew: [], passenger: [], other: [] },
      features: { role: [], roleSpecialization: [], roleMastery: [], other: [] },
    };

    for (const item of items) {
      const t = item.type;
      const itype = item.system?.type?.value ?? item.system?.type ?? "";
      const isStarshipArmor = item.system?.armor?.type === "starship";

      if (t === "equipment") {
        if (isStarshipArmor) cats.armor.push(item);
        else if (["hyper", "powerc", "reactor", "ssshield"].includes(itype)) cats.equipment[itype].push(item);
        else cats.equipment.other.push(item);
        continue;
      }

      if (t === "weapon") {
        if (["primary (starship)", "secondary (starship)", "tertiary (starship)", "quaternary (starship)"].includes(itype)) cats.weapons[itype].push(item);
        else cats.weapons.other.push(item);
        continue;
      }

      if (t === "feat") {
        if (itype === "starshipAction") {
          const sub = item.system?.type?.subtype ?? "other";
          (cats.actions[sub] ?? cats.actions.other).push(item);
        } else if (itype === "starship") {
          const sub = item.system?.type?.subtype ?? "other";
          (cats.features[sub] ?? cats.features.other).push(item);
        }
        continue;
      }

      if (t === "loot") {
        // Heuristic for starship modifications
        const sub = (item.system?.type?.subtype ?? item.system?.modSystem ?? "").toLowerCase();
        if (["engineering", "operation", "suite", "universal", "weapon"].includes(sub)) cats.modifications[sub].push(item);
        else cats.modifications.other.push(item);
        continue;
      }
    }

    return cats;
  }

  async _onDropItem(event, data) {
    const created = await super._onDropItem(event, data);
    try { await this.#postProcessDrop(created); } catch(e) { console.warn("SW5E Starship post-drop failed", e); }
    return created;
  }

  async #postProcessDrop(created) {
    const items = Array.isArray(created) ? created : (created ? [created] : []);
    if (!items.length) return;

    const updates = [];
    let equipArmor = false;
    let equipShield = false;

    for (const it of items) {
      const item = this.actor.items.get(it.id ?? it._id);
      if (!item) continue;
      const t = item.type;
      const itype = item.system?.type?.value ?? item.system?.type ?? "";
      const isArmor = t === "equipment" && item.system?.armor?.type === "starship";
      const isShield = t === "equipment" && itype === "ssshield";

      if (isArmor || isShield) {
        if (Object.hasOwn(item.system ?? {}, "equipped") && !item.system.equipped) {
          updates.push({ _id: item.id, "system.equipped": true });
          if (isArmor) equipArmor = true;
          if (isShield) equipShield = true;
        }
      }
    }

    if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates);

    // Enforce uniqueness
    if (equipArmor) await this.#enforceUniqueEquip({ kind: "armor" });
    if (equipShield) await this.#enforceUniqueEquip({ kind: "shield" });

    // Recalculate shields if any shield was equipped
    if (equipShield) await this.#recalcShieldMaxAndClamp();
  }

  async #enforceUniqueEquip({ kind }) {
    const unequip = [];
    if (kind === "armor") {
      const armors = this.actor.items.filter((i) => i.type === "equipment" && i.system?.armor?.type === "starship" && i.system?.equipped);
      for (const a of armors.slice(1)) unequip.push({ _id: a.id, "system.equipped": false });
    } else if (kind === "shield") {
      const shields = this.actor.items.filter((i) => i.type === "equipment" && (i.system?.type?.value ?? i.system?.type) === "ssshield" && i.system?.equipped);
      for (const s of shields.slice(1)) unequip.push({ _id: s.id, "system.equipped": false });
    }
    if (unequip.length) await this.actor.updateEmbeddedDocuments("Item", unequip);
  }

  /** Derive shield max from equipped starship shield items */
  #computeDerivedShieldMax() {
    try {
      const shields = this.actor.items.filter((i) => i.type === "equipment" && (i.system?.type?.value ?? i.system?.type) === "ssshield" && i.system?.equipped);
      const valFrom = (it) => {
        const sys = it.system ?? {};
        const v = sys?.armor?.value ?? sys?.capacity?.value ?? sys?.capacity ?? sys?.ac?.value ?? 0;
        return Number.isFinite(v) ? Number(v) : 0;
      };
      return shields.reduce((n, it) => n + Math.max(0, valFrom(it)), 0);
    } catch (e) {
      console.warn("SW5E Starship: compute shield max failed", e);
      return 0;
    }
  }

  async #recalcShieldMaxAndClamp() {
    const cfg = this.#getRepairConfig();
    if (cfg?.shields?.autoDerive === false) return;
    const derived = this.#computeDerivedShieldMax();
    const curMax = Number(this.actor.getFlag("sw5e", "starship.shields.max") ?? 0);
    if (derived !== curMax) await this.actor.setFlag("sw5e", "starship.shields.max", derived);
    const curVal = Number(this.actor.getFlag("sw5e", "starship.shields.value") ?? 0);
    const clamped = Math.clamped(curVal, 0, derived);
    if (clamped !== curVal) await this.actor.setFlag("sw5e", "starship.shields.value", clamped);
    await this.actor.setFlag("sw5e", "starship.shields.depleted", (derived ?? 0) <= 0 || (clamped ?? 0) <= 0);
  }

  #getRepairConfig() {
    const def = {
      recharge: { cooldownHours: 1, costPerHP: 0, costPerShield: 0 },
      refit: { cooldownHours: 24, flatCost: 0 },
      currency: { path: null, allowNegative: false, factor: 1 },
      shields: { autoDerive: true, allowManualMax: false },
    };
    const cfg = this.actor.getFlag("sw5e", "starship.config") ?? {};
    return foundry.utils.mergeObject(def, cfg, { inplace: false });
  }

  async #deductCurrency(amount) {
    try {
      amount = Math.max(0, Number(amount || 0));
      if (!amount) return true;
      const cfg = this.#getRepairConfig();
      const path = cfg?.currency?.path;
      const factor = Number(cfg?.currency?.factor ?? 1) || 1;
      const allowNegative = !!cfg?.currency?.allowNegative;
      if (!path) {
        ui.notifications?.info?.(game.i18n.localize("SW5E.Starship.Cost.NotConfigured"));
        return false;
      }
      const cur = foundry.utils.getProperty(this.actor, path);
      const curNum = Number(cur ?? 0);
      if (!Number.isFinite(curNum)) {
        ui.notifications?.warn?.(game.i18n.localize("SW5E.Starship.Cost.NotConfigured"));
        return false;
      }
      const delta = Math.ceil(amount * factor);
      const next = curNum - delta;
      if (next < 0 && !allowNegative) {
        ui.notifications?.warn?.(game.i18n.format("SW5E.Starship.Cost.Insufficient", { amount: delta, currency: game.i18n.localize("SW5E.CurrencyAbbrGC") }));
        return false;
      }
      await this.actor.update({ [path]: next });
      ui.notifications?.info?.(game.i18n.format("SW5E.Starship.Cost.Deducted", { amount: delta, currency: game.i18n.localize("SW5E.CurrencyAbbrGC") }));
      return true;
    } catch (e) {
      console.warn("SW5E Starship: deduct currency failed", e);
      return false;
    }
  }

  activateListeners(html) {
    super.activateListeners?.(html);
    if (!this.actor?.isOwner) return;

    // Toggle starship mode
    html.find("[data-action='toggle-starship']").on("click", async (event) => {
      event.preventDefault();
      const enabled = !(this.actor.getFlag("sw5e", "starship.enabled") ?? false);
      await this.actor.setFlag("sw5e", "starship.enabled", enabled);
      this.render(true);
    });

    // Routing buttons
    html.find("[data-action='set-routing']").on("click", async (event) => {
      const route = event.currentTarget?.dataset?.route ?? "none";
      await this.actor.setFlag("sw5e", "starship.routing", route);
      this.render(false);
    });

    // Fuel inputs
    html.find("input[name^='flags.sw5e.starship.fuel']").on("change", async (event) => {
      const input = event.currentTarget;
      const value = Number(input.value);
      const key = input.name.replace(/^flags\./, "");
      await this.actor.update({ [key]: isNaN(value) ? 0 : value });
    });

    // Shield inputs
    html.find("input[name^='flags.sw5e.starship.shields']").on("change", async (event) => {
      const input = event.currentTarget;
      const num = Number(input.value);
      const key = input.name.replace(/^flags\./, "");
      await this.actor.update({ [key]: isNaN(num) ? 0 : num });
    });

    html.find("[data-action='set-shields-depleted']").on("click", async () => {
      const cur = !!(this.actor.getFlag("sw5e", "starship.shields.depleted") ?? false);
      await this.actor.setFlag("sw5e", "starship.shields.depleted", !cur);
      this.render(false);
    });

    // Power inputs
    html.find("input[name^='flags.sw5e.starship.power']").on("change", async (event) => {
      const input = event.currentTarget;
      const num = Number(input.value);
      const key = input.name.replace(/^flags\./, "");
      await this.actor.update({ [key]: isNaN(num) ? 0 : num });
    });

    // Skill inputs
    html.find("input[name^='flags.sw5e.starship.skills']").on("change", async (event) => {
      const input = event.currentTarget;
      const num = Number(input.value);
      const key = input.name.replace(/^flags\./, "");
      await this.actor.update({ [key]: isNaN(num) ? 0 : num });
    });

    // Movement inputs
    html.find("input[name^='flags.sw5e.starship.movement']").on("change", async (event) => {
      const input = event.currentTarget;
      const num = input.name.endsWith("units") ? input.value : Number(input.value);
      const key = input.name.replace(/^flags\./, "");
      await this.actor.update({ [key]: typeof num === "number" && isNaN(num) ? 0 : num });
    });

    // Repairs controls
    html.find("[data-action='recharge']").on("click", async () => {
      const now = Date.now();
      const cfg = this.#getRepairConfig();
      const next = (await this.actor.getFlag("sw5e", "starship.timestamps.rechargeAt")) ?? 0;
      if (now < next) {
        const until = new Date(next).toLocaleString();
        ui.notifications?.warn?.(game.i18n.format("SW5E.Starship.Cooldown", { action: game.i18n.localize("SW5E.Recharge"), until }));
        return;
      }

      const hpMax = get(this.actor, "system.attributes.hp.max") ?? 0;
      const hpCur = get(this.actor, "system.attributes.hp.value") ?? 0;
      const shMax = this.actor.getFlag("sw5e", "starship.shields.max") ?? 0;
      const shCur = this.actor.getFlag("sw5e", "starship.shields.value") ?? 0;
      const hpGain = Math.max(0, hpMax - hpCur);
      const shGain = Math.max(0, shMax - shCur);
      const cost = (hpGain * (cfg.recharge.costPerHP ?? 0)) + (shGain * (cfg.recharge.costPerShield ?? 0));

      const ok = await Dialog.confirm({
        title: game.i18n.localize("SW5E.Starship.Recharge.Title"),
        content: `<p>${game.i18n.format("SW5E.Starship.Recharge.Confirm", { hpGain, shGain, cost, currency: game.i18n.localize("SW5E.CurrencyAbbrGC") })}</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: true
      });
      if (!ok) return;

      const updates = {};
      if (hpMax) updates["system.attributes.hp.value"] = hpMax;
      await this.actor.update(updates);
      await this.actor.setFlag("sw5e", "starship.shields.value", shMax);
      await this.actor.setFlag("sw5e", "starship.shields.depleted", shMax <= 0);
      // Deduct cost, if configured
      if (cost > 0) await this.#deductCurrency(cost);
      const nextAt = now + ((cfg.recharge.cooldownHours ?? 1) * 3600 * 1000);
      await this.actor.setFlag("sw5e", "starship.timestamps.rechargeAt", nextAt);
      ui.notifications?.info?.(game.i18n.localize("SW5E.Starship.Recharge.Done"));
      this.render(false);
    });

    html.find("[data-action='refitting']").on("click", async () => {
      const now = Date.now();
      const cfg = this.#getRepairConfig();
      const next = (await this.actor.getFlag("sw5e", "starship.timestamps.refitAt")) ?? 0;
      if (now < next) {
        const until = new Date(next).toLocaleString();
        ui.notifications?.warn?.(game.i18n.format("SW5E.Starship.Cooldown", { action: game.i18n.localize("SW5E.Refitting"), until }));
        return;
      }
      const cost = cfg.refit.flatCost ?? 0;
      const ok = await Dialog.confirm({
        title: game.i18n.localize("SW5E.Starship.Refitting.Title"),
        content: `<p>${game.i18n.format("SW5E.Starship.Refitting.Confirm", { cost, currency: game.i18n.localize("SW5E.CurrencyAbbrGC") })}</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: true
      });
      if (!ok) return;
      // Deduct cost, if configured
      if (cost > 0) await this.#deductCurrency(cost);
      const nextAt = now + ((cfg.refit.cooldownHours ?? 24) * 3600 * 1000);
      await this.actor.setFlag("sw5e", "starship.timestamps.refitAt", nextAt);
      ui.notifications?.info?.(game.i18n.localize("SW5E.Starship.Refitting.Done"));
    });

    html.find("[data-action='shield-regen']").on("click", async () => {
      const cur = this.actor.getFlag("sw5e", "starship.shields.value") ?? 0;
      const max = this.actor.getFlag("sw5e", "starship.shields.max") ?? 0;
      const amtStr = await Dialog.prompt({
        title: "Shield Regeneration",
        content: `<p>Enter amount to regenerate:</p><input type="number" value="1" min="0" style="width:100%"/>`,
        label: "Apply",
        callback: (html) => html[0]?.querySelector("input")?.value
      });
      const amt = Math.max(0, Number(amtStr ?? 0));
      const nv = Math.clamped(cur + amt, 0, max);
      await this.actor.setFlag("sw5e", "starship.shields.value", nv);
      await this.actor.setFlag("sw5e", "starship.shields.depleted", nv <= 0);
      this.render(false);
    });

    // Item toggle (equip) for equipment/armor
    html.find(".item-toggle").on("click", async (event) => {
      const li = event.currentTarget.closest(".item");
      const id = li?.dataset?.itemId;
      const item = this.actor.items.get(id);
      if (!item) return;
      const canToggle = Object.hasOwn(item.system ?? {}, "equipped");
      if (!canToggle) return;
      const wasEquipped = !!item.system.equipped;
      await item.update({ "system.equipped": !wasEquipped });
      // Enforce uniqueness when equipping
      const itype = item.system?.type?.value ?? item.system?.type ?? "";
      if (item.type === "equipment" && item.system?.armor?.type === "starship" && !wasEquipped) await this.#enforceUniqueEquip({ kind: "armor" });
      if (item.type === "equipment" && itype === "ssshield" && !wasEquipped) await this.#enforceUniqueEquip({ kind: "shield" });
      // Recalc shields if this is a starship shield item
      if (item.type === "equipment" && itype === "ssshield") await this.#recalcShieldMaxAndClamp();
      this.render(false);
    });

    // Handle item use
    html.find(".item-use").on("click", async (event) => {
      event.preventDefault();
      const li = event.currentTarget.closest(".item");
      const id = li?.dataset?.itemId;
      const item = this.actor.items.get(id);
      if (!item) return;
      const fn = item.use ?? item.roll ?? item.displayCard;
      if (typeof fn === "function") {
        try { await fn.call(item); } catch (e) { console.warn("SW5E Starship: item use failed", e); }
      } else ui.notifications?.warn?.(game.i18n.localize("SW5E.Item.NoUseHandler"));
    });

    // Crew deployment fields
    html.find("input[name='flags.sw5e.starship.deployment.pilot']").on("change", async (e) => {
      const v = String(e.currentTarget.value || "").trim();
      await this.actor.setFlag("sw5e", "starship.deployment.pilot", v);
    });
    html.find("textarea[name='flags.sw5e.starship.deployment.crew']").on("change", async (e) => {
      const v = String(e.currentTarget.value || "").split(/\n|,/)?.map(s => s.trim()).filter(Boolean);
      await this.actor.setFlag("sw5e", "starship.deployment.crew", v);
    });
    html.find("textarea[name='flags.sw5e.starship.deployment.passenger']").on("change", async (e) => {
      const v = String(e.currentTarget.value || "").split(/\n|,/)?.map(s => s.trim()).filter(Boolean);
      await this.actor.setFlag("sw5e", "starship.deployment.passenger", v);
    });
    html.find("input[name='flags.sw5e.starship.deployment.active']").on("change", async (e) => {
      const v = String(e.currentTarget.value || "").trim();
      await this.actor.setFlag("sw5e", "starship.deployment.active", v);
    });
  }
}

