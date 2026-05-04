// patch/allowFeatsAndASI.mjs

import { SETTINGS_NAMESPACE } from "../module-support.mjs";
import { getModuleId } from "../module-support.mjs";

// Main function loads variant rule patches
export function patchVariantRules() {
    patchAllowFeatsAndASI();
}

// Feat and +1 ASI variant rule
function patchAllowFeatsAndASI() {
    // Check game setting allows for variant rule 
    function isEnabled() {
        return game.settings.get(SETTINGS_NAMESPACE, "allowFeatsAndASI");
    }

    // Use libWrapper for the advancement document class
    libWrapper.register(
        getModuleId(),
        "CONFIG.DND5E.advancementTypes.AbilityScoreImprovement.documentClass.prototype.allowFeat",
        function (wrapped) {
            return wrapped() || (this.item.type === "class" && isEnabled());
        },
        "WRAPPER"
    );

    // Directly patch the flow prototype since libWrapper can't reliably target it
    const Flow = dnd5e.applications.advancement.AbilityScoreImprovementFlow;

    const originalGetData = Flow.prototype.getData;
    Flow.prototype.getData = async function () {
        const data = await originalGetData.call(this);
        if ( !isEnabled() ) return data;

        const featMode = this.feat && !this.feat.isASI; // player has opted into feat mode

        // if adding a feat, change ASI points to 1
        if ( featMode ) {
            // Feat mode: 1 ASI point + feat picker
            data.points.total = 1;
            data.points.available = data.points.total - data.points.assigned;
            data.lockImprovement = false;
            data.showImprovement = true;

            // Recalculate abilities with 1 point
            for ( const ability of Object.values(data.abilities) ) {
                ability.isDisabled = false;
                ability.canIncrease = ability.value < ability.max
                    && data.points.available > 0
                    && (ability.value - ability.initial) < (data.points.cap ?? Infinity);
                ability.canDecrease = ability.value > ability.initial;
            }

            const pluralRules = new Intl.PluralRules(game.i18n.lang);
            data.pointsRemaining = game.i18n.format(
                `DND5E.ADVANCEMENT.AbilityScoreImprovement.PointsRemaining.${pluralRules.select(data.points.available)}`,
                { points: data.points.available }
            );
        }

        // Always show the ASI section and the toggle checkbox
        data.showImprovement = true;
        data.showASIFeat = this.advancement.allowFeat;
        data.lockImprovement = false;

        return data;
    };

    const originalUpdateObject = Flow.prototype._updateObject;
    Flow.prototype._updateObject = async function (event, formData) {
        // console.log("Updating object");
        if ( !isEnabled() || !this.feat || this.feat.isASI ) {
            return originalUpdateObject.call(this, event, formData);
        }
        await this.advancement.apply(this.level, {
            type: "both",
            assignments: this.assignments,
            featUuid: this.feat?.uuid,
            retainedItems: this.retainedData?.retainedItems
        });
    };

    //The Flows below reset the ASI points remaining to their starting value, otherwise users can assign 2 points, then select a feat on top.
    const originalOnChangeInput = Flow.prototype._onChangeInput;
    Flow.prototype._onChangeInput = async function (event) {
        // console.log("Input changing");
        if ( isEnabled() ) {
            const input = event.currentTarget;
            // If toggling the ASI checkbox, clear assignments
            if ( input.name === "asi-selected" ) this.assignments = {};
        }
        return originalOnChangeInput.call(this, event);
    };

    const originalOnBrowseCompendium = Flow.prototype._onBrowseCompendium;
    Flow.prototype._onBrowseCompendium = async function (event) {
        // console.log("Browsing compendium");
        if ( isEnabled() ) this.assignments = {};
        return originalOnBrowseCompendium.call(this, event);
    };

    
    const originalOnDrop = Flow.prototype._onDrop;
    Flow.prototype._onDrop = async function (event) {
        // console.log("Dropping feat");
        if ( isEnabled() ) this.assignments = {};
        return originalOnDrop.call(this, event);
    };

    const originalOnItemDelete = Flow.prototype._onItemDelete;
    Flow.prototype._onItemDelete = async function (event) {
        // console.log("Deleting feat");
        if ( isEnabled() ) this.assignments = {};
        return originalOnItemDelete.call(this, event);
    };

    // libWrapper for the apply method on the document class
    libWrapper.register(
        getModuleId(),
        "CONFIG.DND5E.advancementTypes.AbilityScoreImprovement.documentClass.prototype.apply",
        async function (wrapped, level, data) {
            if ( data.type !== "both" || !isEnabled() ) return wrapped(level, data);
            await wrapped(level, {
                type: "asi",
                assignments: data.assignments,
                retainedItems: data.retainedItems
            });
            await wrapped(level, {
                type: "feat",
                featUuid: data.featUuid,
                retainedItems: data.retainedItems
            });
        },
        "WRAPPER"
    );
}