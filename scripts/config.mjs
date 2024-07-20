export function patchConfig(config, strict=true) {
	const preLocalize = game.dnd5e.utils.preLocalize;

	// Default Abilities
	config.defaultAbilities.hullPoints = "con";
	config.defaultAbilities.shieldPoints = "str";

	// Skills
	if (strict) {
		delete config.skills.arc;
		delete config.skills.his;
		delete config.skills.rel;
	}
	config.skills.lor = {
		label: "SW5E.SkillLor",
		ability: "int",
		fullKey: "lore"
	};
	config.skills.pil = {
		label: "SW5E.SkillPil",
		ability: "int",
		fullKey: "pilloting"
	};
	config.skills.tec = {
		label: "SW5E.SkillTec",
		ability: "int",
		fullKey: "technology"
	};
	// Starship Skills
	config.starshipSkills = {
		ast: {
			label: "SW5E.StarshipSkillAst",
			ability: "int",
			fullKey: "astrogation"
		},
		bst: {
			label: "SW5E.StarshipSkillBst",
			ability: "str",
			fullKey: "boost"
		},
		dat: {
			label: "SW5E.StarshipSkillDat",
			ability: "int",
			fullKey: "data"
		},
		hid: {
			label: "SW5E.StarshipSkillHid",
			ability: "dex",
			fullKey: "hide"
		},
		imp: {
			label: "SW5E.StarshipSkillImp",
			ability: "cha",
			fullKey: "impress"
		},
		inf: {
			label: "SW5E.StarshipSkillInf",
			ability: "cha",
			fullKey: "interfere"
		},
		man: {
			label: "SW5E.StarshipSkillMan",
			ability: "dex",
			fullKey: "maneuvering"
		},
		men: {
			label: "SW5E.StarshipSkillMen",
			ability: "cha",
			fullKey: "menace"
		},
		pat: {
			label: "SW5E.StarshipSkillPat",
			ability: "con",
			fullKey: "patch"
		},
		prb: {
			label: "SW5E.StarshipSkillPrb",
			ability: "int",
			fullKey: "probe"
		},
		ram: {
			label: "SW5E.StarshipSkillRam",
			ability: "str",
			fullKey: "ram"
		},
		reg: {
			label: "SW5E.StarshipSkillReg",
			ability: "con",
			fullKey: "regulation"
		},
		scn: {
			label: "SW5E.StarshipSkillScn",
			ability: "wis",
			fullKey: "scan"
		},
		swn: {
			label: "SW5E.StarshipSkillSwn",
			ability: "cha",
			fullKey: "swindle"
		}
	};
	preLocalize( "starshipSkills", { key: "label", sort: true } );
	// Weapon proficiencies
	if (strict) config.weaponProficiencies = {};
	config.weaponProficiencies = {
		...config.weaponProficiencies,
		ebl: "SW5E.WeaponExoticBlasterProficiency",
		elw: "SW5E.WeaponExoticLightweaponProficiency",
		evw: "SW5E.WeaponExoticVibroweaponProficiency",
		mbl: "SW5E.WeaponMartialBlasterProficiency",
		mlw: "SW5E.WeaponMartialLightweaponProficiency",
		mvb: "SW5E.WeaponMartialVibroweaponProficiency",
		sbl: "SW5E.WeaponSimpleBlasterProficiency",
		slw: "SW5E.WeaponSimpleLightweaponProficiency",
		svb: "SW5E.WeaponSimpleVibroweaponProficiency"
	}
	if (strict) config.weaponProficienciesMap = {};
	config.weaponProficienciesMap = {
		...config.weaponProficienciesMap,
		simpleB: "sbl",
		simpleLW: "slw",
		simpleVW: "svb",
		martialB: "mbl",
		martialLW: "mlw",
		martialVW: "mvb",
		exoticB: "ebl",
		exoticLW: "elw",
		exoticVW: "evw"
	};
	if (strict) config.weaponIds = {}; // TODO
	if (strict) config.ammoIds = {}; // TODO
	// Tools
	config.toolTypes.kit = config.toolProficiencies.kit = "SW5E.ToolSpecialistKit";
	if (strict) config.toolIds = {}; // TODO
	// Ability Consumption
	config.abilityConsumptionTypes.powerDice = "SW5E.PowerDice";
	config.abilityConsumptionTypes.shieldDice = "SW5E.ShieldDice";
	// Creature Types
	if (strict) {
		delete config.creatureTypes.celestial;
		delete config.creatureTypes.dragon;
		delete config.creatureTypes.elemental;
		delete config.creatureTypes.fey;
		delete config.creatureTypes.fiend;
		delete config.creatureTypes.giant;
		delete config.creatureTypes.monstrosity;
		delete config.creatureTypes.ooze;
	}
	config.creatureTypes.droid = {
		label: "SW5E.CreatureDroid",
		plural: "SW5E.CreatureDroidPl"
	};
	config.creatureTypes.force = {
		label: "SW5E.CreatureForce",
		plural: "SW5E.CreatureForcePl"
	};
	// Equipment
	config.armorTypes.starship = "SW5E.EquipmentStarshipArmor";
	config.castingEquipmentTypes = {
		wristpad: "SW5E.EquipmentWristpad",
		focusgenerator: "SW5E.EquipmentFocusGenerator"
	};
	preLocalize( "castingEquipmentTypes", { sort: true } );
	config.ssEquipmentTypes = {
		hyper: "SW5E.EquipmentHyperdrive",
		powerc: "SW5E.EquipmentPowerCoupling",
		reactor: "SW5E.EquipmentReactor",
		ssshield: "SW5E.EquipmentStarshipShield"
	};
	preLocalize( "ssEquipmentTypes", { sort: true } );
	config.miscEquipmentTypes = { ...config.miscEquipmentTypes, ...config.castingEquipmentTypes };
	config.equipmentTypes = { ...config.miscEquipmentTypes, ...config.ssEquipmentTypes, ...config.armorTypes };
	if (strict) config.armorIds = {}; // TODO
	if (strict) config.shieldIds = {}; // TODO
	config.armorClasses.unarmoredMonk.formula = "10 + @abilities.dex.mod + max(@abilities.wis.mod, @abilities.cha.mod)"
	// Consumables
	if (strict) {
		delete config.consumableTypes.ammo.blowgunNeedle;
		delete config.consumableTypes.ammo.slingBullet;
	}
	config.ammoStandardTypes = {
		...config.consumableTypes.ammo.subtypes,
		cartridge: "SW5E.ConsumableAmmoCartridge",
		dart: "SW5E.ConsumableAmmoDart",
		flechetteClip: "SW5E.ConsumableAmmoFlechetteClip",
		flechetteMag: "SW5E.ConsumableAmmoFlechetteMag",
		missile: "SW5E.ConsumableAmmoMissile",
		powerCell: "SW5E.ConsumableAmmoPowerCell",
		powerGenerator: "SW5E.ConsumableAmmoPowerGenerator",
		projectorCanister: "SW5E.ConsumableAmmoProjectorCanister",
		projectorTank: "SW5E.ConsumableAmmoProjectorTank",
		rocket: "SW5E.ConsumableAmmoRocket",
		snare: "SW5E.ConsumableAmmoSnare",
		torpedo: "SW5E.ConsumableAmmoTorpedo"
	};
	preLocalize( "ammoStandardTypes", { sort: true } );
	config.ammoStarshipTypes = {
		sscluster: "SW5E.ConsumableAmmoSsCluster",
		ssmissile: "SW5E.ConsumableAmmoSsMissile",
		sstorpedo: "SW5E.ConsumableAmmoSsTorpedo",
		ssbomb: "SW5E.ConsumableAmmoSsBomb"
	};
	preLocalize( "ammoStarshipTypes", { sort: true } );
	config.consumableTypes.ammo.subtypes = {
		...config.ammoStandardTypes,
		...config.ammoStarshipTypes
	}
	// Containers
	if (strict) config.containerTypes = {}; // TODO
	if (strict) config.focusTypes = {};
	config.focusTypes = {
		...config.focusTypes,
		force: {
			label: "SW5E.Focus.Force",
			itemIds: {} // TODO
		},
		tech: {
			label: "SW5E.Focus.Tech",
			itemIds: {} // TODO
		}
	}
	// Features
	if (strict) config.featureTypes.class.subtypes = {};
	config.featureTypes.class.subtypes = {
		...config.featureTypes.class.subtypes,
		berserkerInvocation: "SW5E.Feature.Class.BerserkerInstinct",
		consularForceAffinity: "SW5E.Feature.Class.ConsularForceAffinity",
		consularInvocation: "SW5E.Feature.Class.ConsularFEC",
		engineerInvocation: "SW5E.Feature.Class.EngineerModification",
		fighterInvocation: "SW5E.Feature.Class.FighterStrategy",
		guardianInvocation: "SW5E.Feature.Class.GuardianAura",
		guardianCTF: "SW5E.Feature.Class.GuardianCTF",
		monkFocus: "SW5E.Feature.Class.MonkFocus",
		monkInvocation: "SW5E.Feature.Class.MonkVow",
		multiattack: "SW5E.Feature.Class.Multiattack",
		operativeInvocation: "SW5E.Feature.Class.OperativeExploit",
		scholarInvocation: "SW5E.Feature.Class.ScholarDiscovery",
		scoutInvocation: "SW5E.Feature.Class.ScoutRoutine",
		sentinelInvocation: "SW5E.Feature.Class.SentinelIdeal",
		sentinelFES: "SW5E.Feature.Class.SentinelFES"
  	};
  	config.featureTypes.customizationOption = {
		label: "SW5E.Feature.CustomizationOption.Label",
		subtypes: {
			classImprovement: "SW5E.Feature.CustomizationOption.ClassImprovement",
			fightingMastery: "SW5E.Feature.CustomizationOption.FightingMastery",
			fightingStyle: "SW5E.Feature.CustomizationOption.FightingStyle",
			lightsaberForm: "SW5E.Feature.CustomizationOption.LightsaberForm",
			multiclassImprovement: "SW5E.Feature.CustomizationOption.MulticlassImprovement",
			splashclassImprovement: "SW5E.Feature.CustomizationOption.SplashclassImprovement",
			weaponFocus: "SW5E.Feature.CustomizationOption.WeaponFocus",
			weaponSupremacy: "SW5E.Feature.CustomizationOption.WeaponSupremacy"
		}
	};
	config.featureTypes.deployment = {
		label: "SW5E.Feature.Deployment.Label",
		subtypes: {
			venture: "SW5E.Feature.Deployment.Venture"
		}
	};
	config.featureTypes.starship = {
		label: "SW5E.Feature.Starship.Label",
		subtypes: {
			role: "SW5E.Feature.Starship.Role",
			roleSpecialization: "SW5E.Feature.Starship.RoleSpecialization",
			roleMastery: "SW5E.Feature.Starship.RoleMastery"
		}
	};
	config.featureTypes.starshipAction = {
		label: "SW5E.Feature.StarshipAction.Label",
		subtypes: {
			pilot: "SW5E.Feature.StarshipAction.Pilot",
			crew: "SW5E.Feature.StarshipAction.Crew",
			passenger: "SW5E.Feature.StarshipAction.Passenger"
		}
	};
	for ( const key of ["customizationOption", "deployment", "starship", "starshipAction"] ) {
		preLocalize( `featureTypes.${key}.subtypes`, { sort: true } );
	}
	// Properties
	if (strict) config.itemProperties = {};
	config.itemProperties = {
		...config.itemProperties,
		auto: {
			label: "SW5E.Item.Property.Auto",
			full: "SW5E.Item.Property.AutoFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.AutoDesc",
			isCharacter: true,
			isStarship: true
		},
		burst: {
			label: "SW5E.Item.Property.Burst",
			full: "SW5E.Item.Property.BurstFull",
			type: "Number",
			reference: "SW5E.Item.Property.BurstDesc",
			min: 2,
			isCharacter: true,
			isStarship: true
		},
		dire: {
			label: "SW5E.Item.Property.Dire",
			full: "SW5E.Item.Property.DireFull",
			type: "Number",
			reference: "SW5E.Item.Property.DireDesc",
			min: 0,
			max: 3,
			isCharacter: true,
			isStarship: true
		},
		heavy: {
			label: "SW5E.Item.Property.Heavy",
			full: "SW5E.Item.Property.HeavyFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.HeavyDesc",
			isCharacter: true,
			isStarship: true
		},
		hidden: {
			label: "SW5E.Item.Property.Hidden",
			full: "SW5E.Item.Property.HiddenFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.HiddenDesc",
			isCharacter: true,
			isStarship: true
		},
		keen: {
			label: "SW5E.Item.Property.Keen",
			full: "SW5E.Item.Property.KeenFull",
			type: "Number",
			reference: "SW5E.Item.Property.KeenDesc",
			min: 0,
			max: 3,
			isCharacter: true,
			isStarship: true
		},
		piercing: {
			label: "SW5E.Item.Property.Piercing",
			full: "SW5E.Item.Property.PiercingFull",
			type: "Number",
			reference: "SW5E.Item.Property.PiercingDesc",
			min: 0,
			max: 3,
			isCharacter: true,
			isStarship: true
		},
		range: {
			label: "SW5E.Item.Property.Range",
			full: "SW5E.Item.Property.RangeFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.RangeDesc",
			isCharacter: true,
			isStarship: true
		},
		rapid: {
			label: "SW5E.Item.Property.Rapid",
			full: "SW5E.Item.Property.RapidFull",
			type: "Number",
			reference: "SW5E.Item.Property.RapidDesc",
			min: 2,
			isCharacter: true,
			isStarship: true
		},
		reload: {
			label: "SW5E.Item.Property.Reload",
			full: "SW5E.Item.Property.ReloadFull",
			type: "Number",
			reference: "SW5E.Item.Property.ReloadDesc",
			min: 0,
			isCharacter: true,
			isStarship: true
		},
		smart: {
			label: "SW5E.Item.Property.Smart",
			full: "SW5E.Item.Property.SmartFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.SmartDesc",
			isCharacter: true,
			isStarship: true
		},
		special: {
			label: "SW5E.Item.Property.Special",
			full: "SW5E.Item.Property.SpecialFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.SpecialDesc",
			isCharacter: true,
			isStarship: true
		},
		vicious: {
			label: "SW5E.Item.Property.Vicious",
			full: "SW5E.Item.Property.ViciousFull",
			type: "Number",
			reference: "SW5E.Item.Property.ViciousDesc",
			min: 0,
			max: 3,
			isCharacter: true,
			isStarship: true
		},
		biting: {
			label: "SW5E.Item.Property.Biting",
			full: "SW5E.Item.Property.BitingFull",
			type: "Number",
			reference: "SW5E.Item.Property.BitingDesc",
			min: 0,
			isCharacter: true
		},
		bright: {
			label: "SW5E.Item.Property.Bright",
			full: "SW5E.Item.Property.BrightFull",
			type: "Number",
			reference: "SW5E.Item.Property.BrightDesc",
			min: 0,
			isCharacter: true
		},
		brutal: {
			label: "SW5E.Item.Property.Brutal",
			full: "SW5E.Item.Property.BrutalFull",
			type: "Number",
			reference: "SW5E.Item.Property.BrutalDesc",
			min: 0,
			max: 3,
			isCharacter: true
		},
		corruption: {
			label: "SW5E.Item.Property.Corruption",
			full: "SW5E.Item.Property.CorruptionFull",
			type: "Number",
			reference: "SW5E.Item.Property.CorruptionDesc",
			min: 0,
			isCharacter: true
		},
		defensive: {
			label: "SW5E.Item.Property.Defensive",
			full: "SW5E.Item.Property.DefensiveFull",
			type: "Number",
			reference: "SW5E.Item.Property.DefensiveDesc",
			min: 0,
			max: 3,
			isCharacter: true
		},
		dexRq: {
			label: "SW5E.Item.Property.DexRq",
			full: "SW5E.Item.Property.DexRqFull",
			type: "Number",
			reference: "SW5E.Item.Property.DexRqDesc",
			min: 0,
			isCharacter: true
		},
		disarming: {
			label: "SW5E.Item.Property.Disarming",
			full: "SW5E.Item.Property.DisarmingFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.DisarmingDesc",
			isCharacter: true
		},
		disguised: {
			label: "SW5E.Item.Property.Disguised",
			full: "SW5E.Item.Property.DisguisedFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.DisguisedDesc",
			isCharacter: true
		},
		disintegrate: {
			label: "SW5E.Item.Property.Disintegrate",
			full: "SW5E.Item.Property.DisintegrateFull",
			type: "Number",
			reference: "SW5E.Item.Property.DisintegrateDesc",
			min: 0,
			isCharacter: true
		},
		disruptive: {
			label: "SW5E.Item.Property.Disruptive",
			full: "SW5E.Item.Property.DisruptiveFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.DisruptiveDesc",
			isCharacter: true
		},
		double: {
			label: "SW5E.Item.Property.Double",
			full: "SW5E.Item.Property.DoubleFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.DoubleDesc",
			isCharacter: true
		},
		finesse: {
			label: "SW5E.Item.Property.Finesse",
			full: "SW5E.Item.Property.FinesseFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.FinesseDesc",
			isCharacter: true
		},
		fixed: {
			label: "SW5E.Item.Property.Fixed",
			full: "SW5E.Item.Property.FixedFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.FixedDesc",
			isCharacter: true
		},
		interlockingWeapon: {
			label: "SW5E.Item.Property.InterlockingWeapon",
			full: "SW5E.Item.Property.InterlockingWeaponFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.InterlockingWeaponDesc",
			isCharacter: true
		},
		light: {
			label: "SW5E.Item.Property.Light",
			full: "SW5E.Item.Property.LightFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.LightDesc",
			isCharacter: true
		},
		luminous: {
			label: "SW5E.Item.Property.Luminous",
			full: "SW5E.Item.Property.LuminousFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.LuminousDesc",
			isCharacter: true
		},
		mighty: {
			label: "SW5E.Item.Property.Mighty",
			full: "SW5E.Item.Property.MightyFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.MightyDesc",
			isCharacter: true
		},
		modal: {
			label: "SW5E.Item.Property.Modal",
			full: "SW5E.Item.Property.ModalFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.ModalDesc",
			isCharacter: true
		},
		neuralizing: {
			label: "SW5E.Item.Property.Neuralizing",
			full: "SW5E.Item.Property.NeuralizingFull",
			type: "Number",
			reference: "SW5E.Item.Property.NeuralizingDesc",
			min: 0,
			isCharacter: true
		},
		penetrating: {
			label: "SW5E.Item.Property.Penetrating",
			full: "SW5E.Item.Property.PenetratingFull",
			type: "Number",
			reference: "SW5E.Item.Property.PenetratingDesc",
			min: 0,
			isCharacter: true
		},
		powerCell: {
			label: "SW5E.Item.Property.PowerCell",
			full: "SW5E.Item.Property.PowerCellFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.PowerCellDesc",
			isCharacter: true
		},
		reach: {
			label: "SW5E.Item.Property.Reach",
			full: "SW5E.Item.Property.ReachFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.ReachDesc",
			isCharacter: true
		},
		reckless: {
			label: "SW5E.Item.Property.Reckless",
			full: "SW5E.Item.Property.RecklessFull",
			type: "Number",
			reference: "SW5E.Item.Property.RecklessDesc",
			min: 0,
			isCharacter: true
		},
		returning: {
			label: "SW5E.Item.Property.Returning",
			full: "SW5E.Item.Property.ReturningFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.ReturningDesc",
			isCharacter: true
		},
		shocking: {
			label: "SW5E.Item.Property.Shocking",
			full: "SW5E.Item.Property.ShockingFull",
			type: "Number",
			reference: "SW5E.Item.Property.ShockingDesc",
			min: 0,
			isCharacter: true
		},
		silentWeapon: {
			label: "SW5E.Item.Property.SilentWeapon",
			full: "SW5E.Item.Property.SilentWeaponFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.SilentWeaponDesc",
			isCharacter: true
		},
		slug: {
			label: "SW5E.Item.Property.Slug",
			full: "SW5E.Item.Property.SlugFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.SlugDesc",
			isCharacter: true
		},
		sonorous: {
			label: "SW5E.Item.Property.Sonorous",
			full: "SW5E.Item.Property.SonorousFull",
			type: "Number",
			reference: "SW5E.Item.Property.SonorousDesc",
			min: 0,
			isCharacter: true
		},
		specialized: {
			label: "SW5E.Item.Property.Specialized",
			full: "SW5E.Item.Property.SpecializedFull",
			type: "Number",
			reference: "SW5E.Item.Property.SpecializedDesc",
			min: 0,
			isCharacter: true
		},
		strRq: {
			label: "SW5E.Item.Property.StrRq",
			full: "SW5E.Item.Property.StrRqFull",
			type: "Number",
			reference: "SW5E.Item.Property.StrRqDesc",
			min: 0,
			isCharacter: true
		},
		switch: {
			label: "SW5E.Item.Property.Switch",
			full: "SW5E.Item.Property.SwitchFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.SwitchDesc",
			isCharacter: true
		},
		thrown: {
			label: "SW5E.Item.Property.Thrown",
			full: "SW5E.Item.Property.ThrownFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.ThrownDesc",
			isCharacter: true
		},
		twoHanded: {
			label: "SW5E.Item.Property.TwoHanded",
			full: "SW5E.Item.Property.TwoHandedFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.TwoHandedDesc",
			isCharacter: true
		},
		versatileWeapon: {
			label: "SW5E.Item.Property.VersatileWeapon",
			full: "SW5E.Item.Property.VersatileWeaponFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.VersatileWeaponDesc",
			isCharacter: true
		},
		conRq: {
			label: "SW5E.Item.Property.ConRq",
			full: "SW5E.Item.Property.ConRqFull",
			type: "Number",
			reference: "SW5E.Item.Property.ConRqDesc",
			min: 0,
			isStarship: true
		},
		explosive: {
			label: "SW5E.Item.Property.Explosive",
			full: "SW5E.Item.Property.ExplosiveFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.ExplosiveDesc",
			isStarship: true
		},
		homing: {
			label: "SW5E.Item.Property.Homing",
			full: "SW5E.Item.Property.HomingFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.HomingDesc",
			isStarship: true
		},
		ionizing: {
			label: "SW5E.Item.Property.Ionizing",
			full: "SW5E.Item.Property.IonizingFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.IonizingDesc",
			isStarship: true
		},
		melt: {
			label: "SW5E.Item.Property.Melt",
			full: "SW5E.Item.Property.MeltFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.MeltDesc",
			isStarship: true
		},
		overheat: {
			label: "SW5E.Item.Property.Overheat",
			full: "SW5E.Item.Property.OverheatFull",
			type: "Number",
			reference: "SW5E.Item.Property.OverheatDesc",
			min: 0,
			isStarship: true
		},
		power: {
			label: "SW5E.Item.Property.Power",
			full: "SW5E.Item.Property.PowerFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.PowerDesc",
			isStarship: true
		},
		saturate: {
			label: "SW5E.Item.Property.Saturate",
			full: "SW5E.Item.Property.SaturateFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.SaturateDesc",
			isStarship: true
		},
		zone: {
			label: "SW5E.Item.Property.Zone",
			full: "SW5E.Item.Property.ZoneFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.ZoneDesc",
			isStarship: true
		},
		concentration: {
			label: "DND5E.Item.Property.Concentration",
			abbreviation: "DND5E.ConcentrationAbbr",
			icon: "systems/dnd5e/icons/svg/statuses/concentrating.svg",
			reference: "Compendium.dnd5e.rules.JournalEntry.NizgRXLNUqtdlC1s.JournalEntryPage.ow58p27ctAnr4VPH",
			isTag: true
		},
		freeLearn: {
			label: "SW5E.FreeLearn",
			full: "SW5E.FreeLearn",
			type: "Boolean",
			abbreviation: "SW5E.FreeLearnAbbr",
			isTag: true
		},
		material: {
			label: "SW5E.Item.Property.Material",
			full: "SW5E.Item.Property.Material",
			type: "Boolean",
			abbreviation: "SW5E.ComponentMaterialAbbr"
		},
		mgc: {
			label: "SW5E.Item.Property.Enhanced",
			full: "SW5E.Item.Property.EnhancedFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.EnhancedDesc",
			icon: "systems/sw5e/icons/svg/properties/enhanced.svg",
			isPhysical: true
		},
		ritual: {
			label: "SW5E.Item.Property.Ritual",
			full: "SW5E.Item.Property.Ritual",
			type: "Boolean",
			abbreviation: "SW5E.RitualAbbr",
			icon: "systems/sw5e/icons/svg/items/power.svg",
			isTag: true
		},
		somatic: {
			label: "SW5E.Item.Property.Somatic",
			full: "SW5E.Item.Property.Somatic",
			type: "Boolean",
			abbreviation: "SW5E.ComponentSomaticAbbr"
		},
		stealthDisadvantage: {
			label: "SW5E.Item.Property.StealthDisadvantage"
		},
		vocal: {
			label: "SW5E.Item.Property.Verbal",
			full: "SW5E.Item.Property.Verbal",
			type: "Boolean",
			abbreviation: "SW5E.ComponentVerbalAbbr"
		},
		absorptive: {
			label: "SW5E.Item.Property.Absorptive",
			full: "SW5E.Item.Property.AbsorptiveFull",
			reference: "SW5E.Item.Property.AbsorptiveDesc",
			type: "Number",
			min: 0,
			max: 3
		},
		agile: {
			label: "SW5E.Item.Property.Agile",
			full: "SW5E.Item.Property.AgileFull",
			reference: "SW5E.Item.Property.AgileDesc",
			type: "Number",
			min: 0
		},
		anchor: {
			label: "SW5E.Item.Property.Anchor",
			full: "SW5E.Item.Property.AnchorFull",
			reference: "SW5E.Item.Property.AnchorDesc",
			type: "Boolean"
		},
		avoidant: {
			label: "SW5E.Item.Property.Avoidant",
			full: "SW5E.Item.Property.AvoidantFull",
			reference: "SW5E.Item.Property.AvoidantDesc",
			type: "Number",
			min: 0,
			max: 3
		},
		barbed: {
			label: "SW5E.Item.Property.Barbed",
			full: "SW5E.Item.Property.BarbedFull",
			reference: "SW5E.Item.Property.BarbedDesc",
			type: "Boolean"
		},
		bulky: {
			label: "SW5E.Item.Property.Bulky",
			full: "SW5E.Item.Property.BulkyFull",
			reference: "SW5E.Item.Property.BulkyDesc",
			type: "Boolean"
		},
		charging: {
			label: "SW5E.Item.Property.Charging",
			full: "SW5E.Item.Property.ChargingFull",
			reference: "SW5E.Item.Property.ChargingDesc",
			type: "Number",
			min: 0,
			max: 3
		},
		concealing: {
			label: "SW5E.Item.Property.Concealing",
			full: "SW5E.Item.Property.ConcealingFull",
			reference: "SW5E.Item.Property.ConcealingDesc",
			type: "Boolean"
		},
		cumbersome: {
			label: "SW5E.Item.Property.Cumbersome",
			full: "SW5E.Item.Property.CumbersomeFull",
			reference: "SW5E.Item.Property.CumbersomeDesc",
			type: "Boolean"
		},
		gauntleted: {
			label: "SW5E.Item.Property.Gauntleted",
			full: "SW5E.Item.Property.GauntletedFull",
			reference: "SW5E.Item.Property.GauntletedDesc",
			type: "Boolean"
		},
		imbalanced: {
			label: "SW5E.Item.Property.Imbalanced",
			full: "SW5E.Item.Property.ImbalancedFull",
			reference: "SW5E.Item.Property.ImbalancedDesc",
			type: "Boolean"
		},
		impermeable: {
			label: "SW5E.Item.Property.Impermeable",
			full: "SW5E.Item.Property.ImpermeableFull",
			reference: "SW5E.Item.Property.ImpermeableDesc",
			type: "Boolean"
		},
		insulated: {
			label: "SW5E.Item.Property.Insulated",
			full: "SW5E.Item.Property.InsulatedFull",
			reference: "SW5E.Item.Property.InsulatedDesc",
			type: "Number",
			min: 0,
			max: 3
		},
		interlockingEquipment: {
			label: "SW5E.Item.Property.InterlockingEquipment",
			full: "SW5E.Item.Property.InterlockingEquipmentFull",
			reference: "SW5E.Item.Property.InterlockingEquipmentDesc",
			type: "Boolean"
		},
		lambent: {
			label: "SW5E.Item.Property.Lambent",
			full: "SW5E.Item.Property.LambentFull",
			reference: "SW5E.Item.Property.LambentDesc",
			type: "Boolean"
		},
		lightweight: {
			label: "SW5E.Item.Property.Lightweight",
			full: "SW5E.Item.Property.LightweightFull",
			reference: "SW5E.Item.Property.LightweightDesc",
			type: "Boolean"
		},
		magnetic: {
			label: "SW5E.Item.Property.Magnetic",
			full: "SW5E.Item.Property.MagneticFull",
			reference: "SW5E.Item.Property.MagneticDesc",
			type: "Number"
		},
		obscured: {
			label: "SW5E.Item.Property.Obscured",
			full: "SW5E.Item.Property.ObscuredFull",
			reference: "SW5E.Item.Property.ObscuredDesc",
			type: "Boolean"
		},
		obtrusive: {
			label: "SW5E.Item.Property.Obtrusive",
			full: "SW5E.Item.Property.ObtrusiveFull",
			reference: "SW5E.Item.Property.ObtrusiveDesc",
			type: "Boolean"
		},
		powered: {
			label: "SW5E.Item.Property.Powered",
			full: "SW5E.Item.Property.PoweredFull",
			reference: "SW5E.Item.Property.PoweredDesc",
			type: "Number",
			min: 0
		},
		reactive: {
			label: "SW5E.Item.Property.Reactive",
			full: "SW5E.Item.Property.ReactiveFull",
			reference: "SW5E.Item.Property.ReactiveDesc",
			type: "Number",
			min: 0,
			max: 3
		},
		regulated: {
			label: "SW5E.Item.Property.Regulated",
			full: "SW5E.Item.Property.RegulatedFull",
			reference: "SW5E.Item.Property.RegulatedDesc",
			type: "Boolean"
		},
		reinforced: {
			label: "SW5E.Item.Property.Reinforced",
			full: "SW5E.Item.Property.ReinforcedFull",
			reference: "SW5E.Item.Property.ReinforcedDesc",
			type: "Boolean"
		},
		responsive: {
			label: "SW5E.Item.Property.Responsive",
			full: "SW5E.Item.Property.ResponsiveFull",
			reference: "SW5E.Item.Property.ResponsiveDesc",
			type: "Number",
			min: 0,
			max: 3
		},
		rigid: {
			label: "SW5E.Item.Property.Rigid",
			full: "SW5E.Item.Property.RigidFull",
			reference: "SW5E.Item.Property.RigidDesc",
			type: "Boolean"
		},
		silentEquipment: {
			label: "SW5E.Item.Property.SilentEquipment",
			full: "SW5E.Item.Property.SilentEquipmentFull",
			reference: "SW5E.Item.Property.SilentEquipmentDesc",
			type: "Boolean"
		},
		spiked: {
			label: "SW5E.Item.Property.Spiked",
			full: "SW5E.Item.Property.SpikedFull",
			reference: "SW5E.Item.Property.SpikedDesc",
			type: "Boolean"
		},
		strength: {
			label: "SW5E.Item.Property.Strength",
			full: "SW5E.Item.Property.StrengthFull",
			reference: "SW5E.Item.Property.StrengthDesc",
			type: "Number",
			min: 0
		},
		steadfast: {
			label: "SW5E.Item.Property.Steadfast",
			full: "SW5E.Item.Property.SteadfastFull",
			reference: "SW5E.Item.Property.SteadfastDesc",
			type: "Boolean"
		},
		versatileEquipment: {
			label: "SW5E.Item.Property.VersatileEquipment",
			full: "SW5E.Item.Property.VersatileEquipmentFull",
			reference: "SW5E.Item.Property.VersatileEquipmentDesc",
			type: "Number"
		},
		absorbing: {
			label: "SW5E.Item.Property.Absorbing",
			full: "SW5E.Item.Property.AbsorbingFull",
			reference: "SW5E.Item.Property.AbsorbingDesc",
			type: "Number",
			isCasting: true
		},
		accessing: {
			label: "SW5E.Item.Property.Accessing",
			full: "SW5E.Item.Property.AccessingFull",
			reference: "SW5E.Item.Property.AccessingDesc",
			type: "Number",
			isCasting: true
		},
		amplifying: {
			label: "SW5E.Item.Property.Amplifying",
			full: "SW5E.Item.Property.AmplifyingFull",
			reference: "SW5E.Item.Property.AmplifyingDesc",
			type: "Number",
			isCasting: true
		},
		bolstering: {
			label: "SW5E.Item.Property.Bolstering",
			full: "SW5E.Item.Property.BolsteringFull",
			reference: "SW5E.Item.Property.BolsteringDesc",
			type: "Number",
			isCasting: true
		},
		constitution: {
			label: "SW5E.Item.Property.Constitution",
			full: "SW5E.Item.Property.ConstitutionFull",
			dreferenceesc: "SW5E.Item.Property.ConstitutionDesc",
			type: "Number",
			isCasting: true
		},
		dispelling: {
			label: "SW5E.Item.Property.Dispelling",
			full: "SW5E.Item.Property.DispellingFull",
			reference: "SW5E.Item.Property.DispellingDesc",
			type: "Number",
			isCasting: true
		},
		elongating: {
			label: "SW5E.Item.Property.Elongating",
			full: "SW5E.Item.Property.ElongatingFull",
			reference: "SW5E.Item.Property.ElongatingDesc",
			type: "Number",
			isCasting: true
		},
		enlarging: {
			label: "SW5E.Item.Property.Enlarging",
			full: "SW5E.Item.Property.EnlargingFull",
			reference: "SW5E.Item.Property.EnlargingDesc",
			type: "Number",
			isCasting: true
		},
		expanding: {
			label: "SW5E.Item.Property.Expanding",
			full: "SW5E.Item.Property.ExpandingFull",
			reference: "SW5E.Item.Property.ExpandingDesc",
			type: "Number",
			isCasting: true
		},
		extending: {
			label: "SW5E.Item.Property.Extending",
			full: "SW5E.Item.Property.ExtendingFull",
			reference: "SW5E.Item.Property.ExtendingDesc",
			type: "Number",
			isCasting: true
		},
		fading: {
			label: "SW5E.Item.Property.Fading",
			full: "SW5E.Item.Property.FadingFull",
			reference: "SW5E.Item.Property.FadingDesc",
			type: "Number",
			isCasting: true
		},
		focused: {
			label: "SW5E.Item.Property.Focused",
			full: "SW5E.Item.Property.FocusedFull",
			reference: "SW5E.Item.Property.FocusedDesc",
			type: "Number",
			isCasting: true
		},
		increasing: {
			label: "SW5E.Item.Property.Increasing",
			full: "SW5E.Item.Property.IncreasingFull",
			reference: "SW5E.Item.Property.IncreasingDesc",
			type: "Number",
			isCasting: true
		},
		inflating: {
			label: "SW5E.Item.Property.Inflating",
			full: "SW5E.Item.Property.InflatingFull",
			reference: "SW5E.Item.Property.InflatingDesc",
			type: "Number",
			isCasting: true
		},
		mitigating: {
			label: "SW5E.Item.Property.Mitigating",
			full: "SW5E.Item.Property.MitigatingFull",
			reference: "SW5E.Item.Property.MitigatingDesc",
			type: "Number",
			isCasting: true
		},
		ranging: {
			label: "SW5E.Item.Property.Ranging",
			full: "SW5E.Item.Property.RangingFull",
			reference: "SW5E.Item.Property.RangingDesc",
			type: "Number",
			isCasting: true
		},
		rending: {
			label: "SW5E.Item.Property.Rending",
			full: "SW5E.Item.Property.RendingFull",
			reference: "SW5E.Item.Property.RendingDesc",
			type: "Number",
			isCasting: true
		},
		repelling: {
			label: "SW5E.Item.Property.Repelling",
			full: "SW5E.Item.Property.RepellingFull",
			reference: "SW5E.Item.Property.RepellingDesc",
			type: "Number",
			isCasting: true
		},
		storing: {
			label: "SW5E.Item.Property.Storing",
			full: "SW5E.Item.Property.StoringFull",
			reference: "SW5E.Item.Property.StoringDesc",
			type: "Number",
			isCasting: true
		},
		surging: {
			label: "SW5E.Item.Property.Surging",
			full: "SW5E.Item.Property.SurgingFull",
			reference: "SW5E.Item.Property.SurgingDesc",
			type: "Number",
			isCasting: true
		},
		withering: {
			label: "SW5E.Item.Property.Withering",
			full: "SW5E.Item.Property.WitheringFull",
			reference: "SW5E.Item.Property.WitheringDesc",
			type: "Number",
			isCasting: true
		},
		weightlessContents: {
			label: "SW5E.Item.Property.WeightlessContents"
		}
	};
	if (strict) config.validProperties = {};
	config.validProperties = {
		...config.validProperties,
		consumable: new Set( [
			"mgc"
		] ),
		container: new Set( [
			"mgc",
			"weightlessContents"
		] ),
		equipment: new Set( [
			"concentration",
			"mgc",
			"absorptive",
			"agile",
			"anchor",
			"avoidant",
			"barbed",
			"bulky",
			"charging",
			"concealing",
			"cumbersome",
			"gauntleted",
			"imbalanced",
			"impermeable",
			"insulated",
			"interlockingEquipment",
			"lambent",
			"lightweight",
			"magnetic",
			"obscured",
			"obtrusive",
			"powered",
			"reactive",
			"regulated",
			"reinforced",
			"responsive",
			"rigid",
			"silentEquipment",
			"spiked",
			"strength",
			"steadfast",
			"versatileEquipment",
			"absorbing",
			"accessing",
			"amplifying",
			"bolstering",
			"constitution",
			"dispelling",
			"elongating",
			"enlarging",
			"expanding",
			"extending",
			"fading",
			"focused",
			"increasing",
			"inflating",
			"mitigating",
			"ranging",
			"rending",
			"repelling",
			"storing",
			"surging",
			"withering",
			"stealthDisadvantage"
		] ),
		feat: new Set( [
			"concentration",
			"mgc"
		] ),
		loot: new Set( [
			"mgc"
		] ),
		weapon: new Set( [
			"mgc",
			"auto",
			"burst",
			"dire",
			"heavy",
			"hidden",
			"keen",
			"piercing",
			"range",
			"rapid",
			"reload",
			"smart",
			"special",
			"vicious",
			"biting",
			"bright",
			"brutal",
			"corruption",
			"defensive",
			"dexRq",
			"disarming",
			"disguised",
			"disintegrate",
			"disruptive",
			"double",
			"finesse",
			"fixed",
			"interlockingWeapon",
			"light",
			"luminous",
			"mighty",
			"modal",
			"neuralizing",
			"penetrating",
			"powerCell",
			"reach",
			"reckless",
			"returning",
			"shocking",
			"silentWeapon",
			"slug",
			"sonorous",
			"specialized",
			"strRq",
			"switch",
			"thrown",
			"twoHanded",
			"versatileWeapon",
			"conRq",
			"explosive",
			"homing",
			"ionizing",
			"melt",
			"overheat",
			"power",
			"saturate",
			"zone"
		] ),
		spell: new Set( [
			"concentration",
			"ritual",
			"freeLearn"
		] ),
		tool: new Set( [
			"concentration",
			"mgc"
		] )
	};
	// Currencies
	if (strict) config.currencies = {};
	config.currencies.gc = {
		label: "SW5E.CurrencyGC",
		abbreviation: "SW5E.CurrencyAbbrGC",
		conversion: 1
	};
	// Damage
	if (strict) {
		delete config.damageTypes.bludgeoning;
		delete config.damageTypes.slashing;
		delete config.damageTypes.piercing;
		delete config.damageTypes.radiant;
	}
	// config.damageTypes.force.reference = ""; // TODO
	// config.damageTypes.thunder.reference = ""; // TODO
	config.damageTypes = {
		...config.damageTypes,
		energy: {
			label: "SW5E.DamageEnergy",
			icon: "systems/sw5e/icons/svg/damage/energy.svg",
			// reference: "", // TODO
			color: new Color(0x800080),
		},
		ion: {
			label: "SW5E.DamageIon",
			icon: "systems/sw5e/icons/svg/damage/ion.svg",
			// reference: "", // TODO
			color: new Color(0x1E90FF)
		},
		kinetic: {
			label: "SW5E.DamageKinetic",
			icon: "systems/sw5e/icons/svg/damage/kinetic.svg",
			// reference: "", // TODO
			color: new Color(0x8B0000)
		}
	};
	// Powercasting
	if (strict) config.spellSchools = {};
	config.powerSchoolsForce = {
		lgt: {
			label: "SW5E.SchoolLgt",
			fullKey: "light"
		},
		uni: {
			label: "SW5E.SchoolUni",
			fullKey: "universal"
		},
		drk: {
			label: "SW5E.SchoolDrk",
			fullKey: "dark"
		}
	};
	preLocalize( "powerSchoolsForce", { key: "label", sort: true } );
	config.powerSchoolsTech = {
		tec: {
			label: "SW5E.SchoolTec",
			fullKey: "tech"
		}
	};
	preLocalize( "powerSchoolsTech", { key: "label", sort: true } );
	config.spellSchools = {
		...config.spellSchools,
		...config.powerSchoolsForce,
		...config.powerSchoolsTech
	};
	// Weapons
	if (strict) {
		delete config.weaponTypes.simpleM;
		delete config.weaponTypes.simpleR;
		delete config.weaponTypes.martialM;
		delete config.weaponTypes.martialR;
	}
	config.weaponStandardTypes = {
		...config.weaponTypes,
		exoticBL: "SW5E.WeaponExoticBL",
		exoticLW: "SW5E.WeaponExoticLW",
		exoticVW: "SW5E.WeaponExoticVW",
		martialBL: "SW5E.WeaponMartialBL",
		martialLW: "SW5E.WeaponMartialLW",
		martialVW: "SW5E.WeaponMartialVW",
		simpleBL: "SW5E.WeaponSimpleBL",
		simpleLW: "SW5E.WeaponSimpleLW",
		simpleVW: "SW5E.WeaponSimpleVW"
	};
	preLocalize( "weaponStandardTypes" );
	config.weaponStarshipTypes = {
		"primary (starship)": "SW5E.WeaponPrimarySS",
		"secondary (starship)": "SW5E.WeaponSecondarySS",
		"tertiary (starship)": "SW5E.WeaponTertiarySS",
		"quaternary (starship)": "SW5E.WeaponQuaternarySS"
	};
	preLocalize( "weaponStarshipTypes" );
	config.weaponTypes = {
		...config.weaponStandardTypes,
		...config.weaponStarshipTypes
	}
	// Compendium Packs
	config.sourcePacks.BACKGROUNDS = "sw5e-module-test.backgrounds";
	config.sourcePacks.CLASSES = "sw5e-module-test.classes";
	config.sourcePacks.ITEMS = "sw5e-module-test.items";
	config.sourcePacks.RACES = "sw5e-module-test.species";
	// Proficiency
	config.proficiencyLevels = {
		...config.proficiencyLevels,
		3: "SW5E.Mastery",
		4: "SW5E.HighMastery",
		5: "SW5E.GrandMastery",
	};
	// Cover
	config.cover[.25] = "SW5E.CoverOneQuarter";
	// Conditions
	config.conditionTypes = {
		...config.conditionTypes,
		corroded: {
			label: "SW5E.ConCorroded",
			icon: "systems/sw5e/icons/svg/statuses/corroded.svg"
			// reference: "" // TODO
		},
		ignited: {
			label: "SW5E.ConIgnited",
			icon: "systems/sw5e/icons/svg/statuses/ignited.svg"
			// reference: "" // TODO
		},
		shocked: {
			label: "SW5E.ConShocked",
			icon: "systems/sw5e/icons/svg/statuses/shocked.svg",
			reference: "Compendium.sw5e.conditions.JournalEntry.HBSJojgAGu9Gsctd.JournalEntryPage.0000000000000000"
			// reference: "" // TODO
		},
		slowed: {
			label: "SW5E.ConSlowed",
			icon: "systems/sw5e/icons/svg/statuses/slowed.svg",
			// reference: "", // TODO
			levels: 4,
			speedReduction: [
				{
					ft: 0,
					m: 0
				},
				{
					ft: 15,
					m: 4.5
				},
				{
					ft: 25,
					m: 7.5
				},
				{
					ft: 30,
					m: 9
				}
			]
		},
		weakened: {
			label: "SW5E.ConWeakened",
			icon: "systems/sw5e/icons/svg/statuses/weakened.svg"
			// reference: "" // TODO
		}
	};
	config.conditionEffects = {
		...config.conditionEffects,
		slowedMovement1: new Set( ["slowed-1"] ),
		slowedMovement2: new Set( ["slowed-2"] ),
		slowedMovement3: new Set( ["slowed-3"] )
	};
	// Languages
	if (strict) config.languages = {
		standard: {
			label: config.languages.standard.label,
			children: {
				common: config.languages.standard.children.common
			}
		},
		exotic: {
			label: config.languages.exotic.label,
			children: {}
		}
	};
	config.languages.standard.children = {
		...config.languages.standard.children,
		abyssin: "SW5E.LanguagesAbyssin",
		aleena: "SW5E.LanguagesAleena",
		antarian: "SW5E.LanguagesAntarian",
		anzellan: "SW5E.LanguagesAnzellan",
		aqualish: "SW5E.LanguagesAqualish",
		arconese: "SW5E.LanguagesArconese",
		ardennian: "SW5E.LanguagesArdennian",
		arkanian: "SW5E.LanguagesArkanian",
		balosur: "SW5E.LanguagesBalosur",
		barabel: "SW5E.LanguagesBarabel",
		besalisk: "SW5E.LanguagesBesalisk",
		binary: "SW5E.LanguagesBinary",
		bith: "SW5E.LanguagesBith",
		bocce: "SW5E.LanguagesBocce",
		bothese: "SW5E.LanguagesBothese",
		catharese: "SW5E.LanguagesCatharese",
		cerean: "SW5E.LanguagesCerean",
		"chadra-fan": "SW5E.LanguagesChadra-Fan",
		chagri: "SW5E.LanguagesChagri",
		cheunh: "SW5E.LanguagesCheunh",
		chevin: "SW5E.LanguagesChevin",
		chironan: "SW5E.LanguagesChironan",
		clawdite: "SW5E.LanguagesClawdite",
		codruese: "SW5E.LanguagesCodruese",
		colicoid: "SW5E.LanguagesColicoid",
		dashadi: "SW5E.LanguagesDashadi",
		defel: "SW5E.LanguagesDefel",
		devaronese: "SW5E.LanguagesDevaronese",
		dosh: "SW5E.LanguagesDosh",
		draethos: "SW5E.LanguagesDraethos",
		durese: "SW5E.LanguagesDurese",
		dug: "SW5E.LanguagesDug",
		ewokese: "SW5E.LanguagesEwokese",
		falleen: "SW5E.LanguagesFalleen",
		felucianese: "SW5E.LanguagesFelucianese",
		gamorrese: "SW5E.LanguagesGamorrese",
		gand: "SW5E.LanguagesGand",
		geonosian: "SW5E.LanguagesGeonosian",
		givin: "SW5E.LanguagesGivin",
		gran: "SW5E.LanguagesGran",
		gungan: "SW5E.LanguagesGungan",
		hapan: "SW5E.LanguagesHapan",
		harchese: "SW5E.LanguagesHarchese",
		herglese: "SW5E.LanguagesHerglese",
		honoghran: "SW5E.LanguagesHonoghran",
		huttese: "SW5E.LanguagesHuttese",
		iktotchese: "SW5E.LanguagesIktotchese",
		ithorese: "SW5E.LanguagesIthorese",
		jawaese: "SW5E.LanguagesJawaese",
		kaleesh: "SW5E.LanguagesKaleesh",
		kaminoan: "SW5E.LanguagesKaminoan",
		karkaran: "SW5E.LanguagesKarkaran",
		keldor: "SW5E.LanguagesKelDor",
		kharan: "SW5E.LanguagesKharan",
		killik: "SW5E.LanguagesKillik",
		klatooinian: "SW5E.LanguagesKlatooinian",
		kubazian: "SW5E.LanguagesKubazian",
		kushiban: "SW5E.LanguagesKushiban",
		kyuzo: "SW5E.LanguagesKyuzo",
		lannik: "SW5E.LanguagesLannik",
		lasat: "SW5E.LanguagesLasat",
		lowickese: "SW5E.LanguagesLowickese",
		lurmese: "SW5E.LanguagesLurmese",
		mandoa: "SW5E.LanguagesMandoa",
		miralukese: "SW5E.LanguagesMiralukese",
		mirialan: "SW5E.LanguagesMirialan",
		moncal: "SW5E.LanguagesMonCal",
		mustafarian: "SW5E.LanguagesMustafarian",
		muun: "SW5E.LanguagesMuun",
		nautila: "SW5E.LanguagesNautila",
		ortolan: "SW5E.LanguagesOrtolan",
		pakpak: "SW5E.LanguagesPakPak",
		pyke: "SW5E.LanguagesPyke",
		quarrenese: "SW5E.LanguagesQuarrenese",
		rakata: "SW5E.LanguagesRakata",
		rattataki: "SW5E.LanguagesRattataki",
		rishii: "SW5E.LanguagesRishii",
		rodese: "SW5E.LanguagesRodese",
		ryn: "SW5E.LanguagesRyn",
		selkatha: "SW5E.LanguagesSelkatha",
		semblan: "SW5E.LanguagesSemblan",
		shistavanen: "SW5E.LanguagesShistavanen",
		shyriiwook: "SW5E.LanguagesShyriiwook",
		sith: "SW5E.LanguagesSith",
		squibbian: "SW5E.LanguagesSquibbian",
		sriluurian: "SW5E.LanguagesSriluurian",
		"ssi-ruuvi": "SW5E.LanguagesSsi-ruuvi",
		sullustese: "SW5E.LanguagesSullustese",
		talzzi: "SW5E.LanguagesTalzzi",
		tarasinese: "SW5E.LanguagesTarasinese",
		thisspiasian: "SW5E.LanguagesThisspiasian",
		togorese: "SW5E.LanguagesTogorese",
		togruti: "SW5E.LanguagesTogruti",
		toydarian: "SW5E.LanguagesToydarian",
		tusken: "SW5E.LanguagesTusken",
		"twi'leki": "SW5E.LanguagesTwileki",
		ugnaught: "SW5E.LanguagesUgnaught",
		umbaran: "SW5E.LanguagesUmbaran",
		utapese: "SW5E.LanguagesUtapese",
		verpine: "SW5E.LanguagesVerpine",
		vong: "SW5E.LanguagesVong",
		voss: "SW5E.LanguagesVoss",
		yevethan: "SW5E.LanguagesYevethan",
		zabraki: "SW5E.LanguagesZabraki",
		zygerrian: "SW5E.LanguagesZygerrian"
	};
	// Traits
	config.traits = {
		...config.traits,
		sdi: {
			labels: {
				title: "SW5E.ShieldDamImm",
				localization: "SW5E.TraitSDIPlural"
			},
			icon: "systems/sw5e/icons/svg/trait-damage-immunities.svg",
			configKey: "damageTypes"
		},
		sdr: {
			labels: {
				title: "SW5E.ShieldDamRes",
				localization: "SW5E.TraitSDRPlural"
			},
			icon: "systems/sw5e/icons/svg/trait-damage-resistances.svg",
			configKey: "damageTypes"
		},
		sdv: {
			labels: {
				title: "SW5E.ShieldDamVuln",
				localization: "SW5E.TraitSDVPlural"
			},
			icon: "systems/sw5e/icons/svg/trait-damage-vulnerabilities.svg",
			configKey: "damageTypes"
		},
	};
	// Character Flags
	config.characterFlags = {
		...config.characterFlags,
		maneuverCriticalThreshold: {
			name: "SW5E.FlagsManeuverCritThreshold",
			hint: "SW5E.FlagsManeuverCritThresholdHint",
			section: "SW5E.Features",
			type: Number,
			placeholder: 20
		},
		forcePowerDiscount: {
			name: "SW5E.FlagsForcePowerDiscount",
			hint: "SW5E.FlagsForcePowerDiscountHint",
			section: "SW5E.Features",
			type: Number,
			placeholder: 0
		},
		techPowerDiscount: {
			name: "SW5E.FlagsTechPowerDiscount",
			hint: "SW5E.FlagsTechPowerDiscountHint",
			section: "SW5E.Features",
			type: Number,
			placeholder: 0
		},
		supremeAptitude: {
			name: "SW5E.FlagsSupremeAptitude",
			hint: "SW5E.FlagsSupremeAptitudeHint",
			section: "SW5E.Features",
			abilities: ["str", "dex", "con", "int"],
			type: Boolean
		},
		supremeDurability: {
			name: "SW5E.FlagsSupremeDurability",
			hint: "SW5E.FlagsSupremeDurabilityHint",
			section: "SW5E.Features",
			abilities: ["str", "con", "wis", "cha"],
			type: Boolean
		},
		encumbranceMultiplier: {
			name: "SW5E.FlagsEncumbranceMultiplier",
			hint: "SW5E.FlagsEncumbranceMultiplierHint",
			section: "SW5E.Features",
			type: Number,
			placeholder: 1
		}
	};
	// Source Books
	if (strict) config.sourceBooks = {};
	config.sourceBooks = {
		...config.sourceBooks,
		PHB: "SOURCE.BOOK.PHB",
		SnV: "SOURCE.BOOK.SnV",
		SotG: "SOURCE.BOOK.SotG",
		WH: "SOURCE.BOOK.WH",
		EC: "SOURCE.BOOK.EC"
	}
}
