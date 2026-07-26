import { getFlag } from "../utils.mjs";

/**
 * Read the configured numeric discount for the actor for a cast type.
 * Returns a non-negative number (0 if unset).
 */
function getActorPowerPointDiscount(actor, powercastingType) {
  if (!actor) return 0;
  try {
    const flagKey = powercastingType === "tech" ? "techPowerDiscount" : "forcePowerDiscount";
    const raw = (typeof getFlag === "function")
      ? (getFlag(actor, flagKey) ?? 0)
      : (actor?.flags?.sw5e?.[flagKey] ?? 0);
    const n = Number(raw) || 0;
    return Math.max(0, n);
  } catch (err) {
    console.warn("SW5E | Failed to read power point discount flag", err);
    return 0;
  }
}

function getPowercastingTypeFromItem(item) {
  return item?.system?.school === "tec" ? "tech" : "force";
}

function getNumericValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Compute the base and discounted power point cost for a power item & activity.
 * Mirrors the existing logic used in powercasting.mjs for base cost, then subtracts actor discount.
 */
function computeDiscountedPowerPointCost(item, activity, castLevel) {
  const powercastingType = getPowercastingTypeFromItem(item);
  const targetPath = `powercasting.${powercastingType}.points.value`;
  const activityTarget = activity?.consumption?.targets?.find(target =>
    target?.type === "attribute" && target?.target === targetPath
  );
  const baseCostValue = activityTarget?.value ?? item?.system?.consume?.amount ?? 0;
  const baseCost = Number.isFinite(Number(baseCostValue)) ? Number(baseCostValue) : 0;
  const itemLevel = Number.isFinite(Number(item?.system?.level)) ? Number(item.system.level) : 0;
  const selectedLevel = Number.isFinite(Number(castLevel)) ? Number(castLevel) : itemLevel;
  const rawCost = baseCost + Math.max(0, selectedLevel - itemLevel);

  const actor = activity?.actor ?? item?.parent ?? null;
  const discount = getActorPowerPointDiscount(actor, powercastingType);
  const finalCost = Math.max(0, Math.round(rawCost - (Number(discount) || 0)));
  return finalCost;
}

/**
 * Adjust the Activity Usage Dialog's spell slot options to show discounted costs.
 * Runs after the dialog prepares its scaling context and rewrites the option.cost/affordable/disabled.
 */
Hooks.on('sw5e.ActivityUsageDialog._prepareScalingContext', function (_this, result, config, ...args) {
  const context = config.result;
  try {
    if (!context?.spellSlots?.options || !_this?.item) return;
    const item = _this.item;
    const activity = _this.activity;
    const powercastingType = getPowercastingTypeFromItem(item);
    const powercasting = _this.actor?.system?.powercasting?.[powercastingType];
    const currentPoints = Number.isFinite(Number(powercasting?.points?.value)) ? Number(powercasting.points.value) : 0;

    for (const opt of context.spellSlots.options) {
      const lvl = Number(opt.value) || 0;
      const discounted = computeDiscountedPowerPointCost(item, activity, lvl);
      opt.cost = discounted;
      opt.affordable = discounted <= currentPoints;
      // preserve already used/other disables but ensure affordability affects disabled state
      opt.disabled = Boolean(opt.disabled) || discounted > currentPoints;
    }
  } catch (err) {
    console.error('SW5E | Failed to apply discounted cost to ActivityUsageDialog options', err);
  }
});

/**
 * Mutate the activity consumption targets before Foundry applies consumption.
 * Hook into dnd5e.preUseActivity so the Activity object sent into the consumption pipeline
 * has its targets updated to the discounted value.
 */
Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
  try {
    if (!activity || !activity.item) return true;
    const item = activity.item;
    // Only handle SW5E powercasting items
    const isPower = (item.system?.method === "powerCasting")
      || /^powercasting\.(force|tech)\.points\.value$/.test(String(item.system?.consume?.target ?? ""));
    if (!isPower) return true;

    const castLevel = Number(usageConfig?.spell?.slot ?? dialogConfig?.spell?.slot) || 0;
    const powercastingType = getPowercastingTypeFromItem(item);
    const discounted = computeDiscountedPowerPointCost(item, activity, castLevel);
    const targetPath = `powercasting.${powercastingType}.points.value`;

    // Update the runtime item's consume.amount if present
    if (item.system?.consume && item.system.consume.type === "attribute" && item.system.consume.target === targetPath) {
      item.system.consume.amount = discounted;
    }

    // Update activity.consumption.targets used by the engine
    const consTargets = activity?.consumption?.targets ?? activity?.system?.consumption?.targets ?? [];
    for (const t of consTargets) {
      if (t?.type === "attribute" && t?.target === targetPath) {
        t.value = String(discounted);
      }
    }
    if (activity.system && Array.isArray(activity.system.consumption?.targets)) {
      for (const t of activity.system.consumption.targets) {
        if (t?.type === "attribute" && t?.target === targetPath) {
          t.value = String(discounted);
        }
      }
    }

    return true;
  } catch (err) {
    console.error("SW5E | Error applying power point discount pre-consume:", err);
    return true;
  }
});
