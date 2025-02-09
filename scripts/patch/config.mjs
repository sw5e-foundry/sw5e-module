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
		simpleBL: "sbl",
		simpleLW: "slw",
		simpleVW: "svb",
		martialBL: "mbl",
		martialLW: "mlw",
		martialVW: "mvb",
		exoticBL: "ebl",
		exoticLW: "elw",
		exoticVW: "evw"
	};
	if (strict) config.weaponIds = {
		// Blasters
		"affixedrifle": "Compendium.sw5e.blasters.Item.ZKM6kkOgHXGnXMgi",
		"anti-materielblaster": "Compendium.sw5e.blasters.Item.xxbqOdjKYp7aJyPW",
		"anti-materielrifle": "Compendium.sw5e.blasters.Item.LXfN4Frdg9Neip42",
		"arccaster": "Compendium.sw5e.blasters.Item.xGH5V5Dh3Xd8yRZr",
		"assaultcannon": "Compendium.sw5e.blasters.Item.mXu2wQEqg6czu3X1",
		"beamrifle": "Compendium.sw5e.blasters.Item.eU07RkTEbHfAkaCn",
		"bkg": "Compendium.sw5e.blasters.Item.ZFpQK4ESemqB1t2C",
		"blastercannon": "Compendium.sw5e.blasters.Item.Vv4dApl6faYAwijP",
		"blastercarbine": "Compendium.sw5e.blasters.Item.PoGaGtinF97I9fQ0",
		"blasterpistol": "Compendium.sw5e.blasters.Item.rz0YqUmRxFl79W0K",
		"blasterrifle": "Compendium.sw5e.blasters.Item.Nww9kzfPy9D246fg",
		"bo-rifle": "Compendium.sw5e.blasters.Item.AohJSYDPWfhsAqHM",
		"bolt-thrower": "Compendium.sw5e.blasters.Item.9VhsUL3z9o62lUsT",
		"bowcaster": "Compendium.sw5e.blasters.Item.WeVSJ3sJaeIAnnvc",
		"carbinerifle": "Compendium.sw5e.blasters.Item.TaTZBUpykWuUtejN",
		"chaingun": "Compendium.sw5e.blasters.Item.pJxx1oaNmTaKgbyB",
		"compoundbow": "Compendium.sw5e.blasters.Item.45PDLB373AvNUyJT",
		"cryocannon": "Compendium.sw5e.blasters.Item.EgG7GDchK8ICHjcA",
		"cryocarbine": "Compendium.sw5e.blasters.Item.PkRIfISeSwgqXOBf",
		"cryopistol": "Compendium.sw5e.blasters.Item.btSGBSe1oW54ekiK",
		"cryorifle": "Compendium.sw5e.blasters.Item.4Jw4d9459nFSSsUF",
		"cyclerrifle": "Compendium.sw5e.blasters.Item.yaFeefXN5oCNhZns",
		"disruptorcarbine": "Compendium.sw5e.blasters.Item.9ayhGXQJLdIiaTMF",
		"disruptorpistol": "Compendium.sw5e.blasters.Item.7d9jf8kTjKtzIals",
		"disruptorrifle": "Compendium.sw5e.blasters.Item.yOsWMLHMEtzucKDC",
		"disruptorsniper": "Compendium.sw5e.blasters.Item.wQvskhxKbF3itdx8",
		"energybow": "Compendium.sw5e.blasters.Item.lb1KS1SOtmf384Xv",
		"energyslingshot": "Compendium.sw5e.blasters.Item.FZTA1E9Os0RE1p0k",
		"flechettecannon": "Compendium.sw5e.blasters.Item.lzJCdT9fuPVW5S44",
		"grenadelauncher": "Compendium.sw5e.blasters.Item.1PtYUVAzIi5e2x4H",
		"handbkg": "Compendium.sw5e.blasters.Item.dHVGZmcv4QblKIhU",
		"handblaster": "Compendium.sw5e.blasters.Item.6aTkk5EqFsVKECbn",
		"handcannon": "Compendium.sw5e.blasters.Item.jeBtqq1xgKnDpqwC",
		"heavyblasterrifle": "Compendium.sw5e.blasters.Item.lawuC5DlTMgma6P8",
		"heavybowcaster": "Compendium.sw5e.blasters.Item.Jf8Or7nDFSHPic54",
		"heavycarbine": "Compendium.sw5e.blasters.Item.YK7Nzdui6FW7dNjE",
		"heavypistol": "Compendium.sw5e.blasters.Item.6S2Lb686mrKTQMTp",
		"heavyrepeater": "Compendium.sw5e.blasters.Item.iVExqc7VtLDTqETL",
		"heavyshotgun": "Compendium.sw5e.blasters.Item.TSOf2xTMf792t4af",
		"heavyslugpistol": "Compendium.sw5e.blasters.Item.HXyrCz4Kun53F4kK",
		"hold-out": "Compendium.sw5e.blasters.Item.V7uuRrAqCINlkgFk",
		"huntingrifle": "Compendium.sw5e.blasters.Item.E1qrlNHZ9VtE0lky",
		"incineratorcarbine": "Compendium.sw5e.blasters.Item.BFsQzs9kgBwTWMzJ",
		"incineratorpistol": "Compendium.sw5e.blasters.Item.EY3jaFiEsO9UzEz9",
		"incineratorrifle": "Compendium.sw5e.blasters.Item.66PqJG2lNxMNCg5C",
		"incineratorsniper": "Compendium.sw5e.blasters.Item.l1vS9YRrwQktdgbI",
		"ioncannon": "Compendium.sw5e.blasters.Item.XdzPCQqlF97NDSn3",
		"ioncarbine": "Compendium.sw5e.blasters.Item.FJMwehrWtdagwsqn",
		"ionpistol": "Compendium.sw5e.blasters.Item.4CdI8yfutf7ZggfY",
		"ionrifle": "Compendium.sw5e.blasters.Item.aXCB2Uap09IIAV0p",
		"iws": "Compendium.sw5e.blasters.Item.EmpVpcgRewUPxdJr",
		"lightbow": "Compendium.sw5e.blasters.Item.gIGxUwvW06msv36V",
		"lightningcannon": "Compendium.sw5e.blasters.Item.DVGS3sXfo73Hb5SP",
		"lightningcarbine": "Compendium.sw5e.blasters.Item.Aq421AKVuVHZjFJQ",
		"lightningpistol": "Compendium.sw5e.blasters.Item.tAzbTqCc6S6aeCvc",
		"lightningrifle": "Compendium.sw5e.blasters.Item.es7oacLob9VulqVC",
		"lightpistol": "Compendium.sw5e.blasters.Item.3MuBVRCfB4j2pmm1",
		"lightrepeater": "Compendium.sw5e.blasters.Item.iKTCOo5LZpBXpwS6",
		"lightslugpistol": "Compendium.sw5e.blasters.Item.md4uo61mzq3xBFh0",
		"marksmanblaster": "Compendium.sw5e.blasters.Item.iY4iRHbLcx10OgRQ",
		"mortarlauncher": "Compendium.sw5e.blasters.Item.jWIMqI3Wg3EJZjMv",
		"needler": "Compendium.sw5e.blasters.Item.tzlA3eYfQSOLVlUw",
		"nightstingerrifle": "Compendium.sw5e.blasters.Item.9h8aYCXd9O2aJThy",
		"radiationcannon": "Compendium.sw5e.blasters.Item.Kv2ENVsbFMsU7XW3",
		"radrifle": "Compendium.sw5e.blasters.Item.i1d3IODE5XVAeLuw",
		"railgun": "Compendium.sw5e.blasters.Item.zuPhwZGH0j2ovgG7",
		"repeatingblaster": "Compendium.sw5e.blasters.Item.K1YmAWmG1bR4o5CG",
		"revolver": "Compendium.sw5e.blasters.Item.Fd6o5uHTGQCNBQP3",
		"rocketlauncher": "Compendium.sw5e.blasters.Item.pYsmiZ98tXTfdbt0",
		"rocketrifle": "Compendium.sw5e.blasters.Item.q5JrhC2pyO64xhbu",
		"rotarycannon": "Compendium.sw5e.blasters.Item.i1xzHcuxKjWm7J3z",
		"scatterblaster": "Compendium.sw5e.blasters.Item.aEhiMrl8fQ4uE3od",
		"scattergun": "Compendium.sw5e.blasters.Item.Ul4lKHTI2TocCqBm",
		"sentrygun": "Compendium.sw5e.blasters.Item.O2CMHIk0z1iv5rvq",
		"shattercannon": "Compendium.sw5e.blasters.Item.9IBmtJNH1vmtLwIQ",
		"shatterpistol": "Compendium.sw5e.blasters.Item.yVgru3dfq2S3HzVB",
		"shatterrifle": "Compendium.sw5e.blasters.Item.Ger4Tz2ZQHBsvIdD",
		"shortbow": "Compendium.sw5e.blasters.Item.bwGON0wPMPw4L2QJ",
		"shotgun": "Compendium.sw5e.blasters.Item.twTqep64yEvD27WD",
		"shoulderblaster": "Compendium.sw5e.blasters.Item.W9dZwJA9S6GuupCx",
		"shouldercannon": "Compendium.sw5e.blasters.Item.FxHxjPlEzGyWRFJu",
		"slugpistol": "Compendium.sw5e.blasters.Item.nFL3lIO5cZyGdi7h",
		"slugthrower": "Compendium.sw5e.blasters.Item.UnQu0tKV6bRU8fcE",
		"smartcannon": "Compendium.sw5e.blasters.Item.QSYdAFTMq5E4Ojzc",
		"smartpistol": "Compendium.sw5e.blasters.Item.Z3zN5LhPEBnA2gB3",
		"sniperrifle": "Compendium.sw5e.blasters.Item.Q45OrdLhguL9OWNU",
		"soniccannon": "Compendium.sw5e.blasters.Item.6cQyUA1TgCwFTJzJ",
		"soniccarbine": "Compendium.sw5e.blasters.Item.efeQYIZhTk6GGTv4",
		"sonicpistol": "Compendium.sw5e.blasters.Item.8EKfBUh1sNYcdyxQ",
		"sonicrifle": "Compendium.sw5e.blasters.Item.Iv36Kvf4Twtr0WQf",
		"stealthcarbine": "Compendium.sw5e.blasters.Item.Gq8Xo1CEp8m1HLEa",
		"subrepeater": "Compendium.sw5e.blasters.Item.5G4BTuYkl4IcdMw0",
		"switchcannon": "Compendium.sw5e.blasters.Item.KO4QzzK90ddtTCeP",
		"switchcarbine": "Compendium.sw5e.blasters.Item.OZhhFSXfVaTxlvMy",
		"switchpistol": "Compendium.sw5e.blasters.Item.BF0DbpSuicX8qHhb",
		"switchrifle": "Compendium.sw5e.blasters.Item.TGpxeKGTfalYK5SA",
		"switchsniper": "Compendium.sw5e.blasters.Item.UZqJABEq0NUKU2Uf",
		"torpedolauncher": "Compendium.sw5e.blasters.Item.WUI1B0CvfWXMUABR",
		"tranquilizerrifle": "Compendium.sw5e.blasters.Item.kTknGaMyXROkwRvm",
		"vaporprojector": "Compendium.sw5e.blasters.Item.PhJpjuTtS0E2dR5M",
		"wristblaster": "Compendium.sw5e.blasters.Item.TlrVX9tsQfnzmyo6",
		"wristlauncher": "Compendium.sw5e.blasters.Item.fhQ3oxD0XojwKnVN",
		"wristrifle": "Compendium.sw5e.blasters.Item.4j1MM03ja8KDnRU2",
		// Lightweapons
		"bitesaber": "Compendium.sw5e.lightweapons.Item.R438U6CVFIcKQUj4",
		"blightsaber": "Compendium.sw5e.lightweapons.Item.SnVUeLTVdJyu6FLA",
		"brightsaber": "Compendium.sw5e.lightweapons.Item.izAkWbwSJEmH6NhS",
		"broadsaber": "Compendium.sw5e.lightweapons.Item.58STrK1evawiWDxe",
		"bustersaber": "Compendium.sw5e.lightweapons.Item.NcPqEgYr26QVzPrs",
		"chainedlightdagger": "Compendium.sw5e.lightweapons.Item.LzWg0JRhhyedB9bi",
		"claymoresaber": "Compendium.sw5e.lightweapons.Item.Zy8993dOg0rOsXoS",
		"crossguardsaber": "Compendium.sw5e.lightweapons.Item.TzLXYpz7oWOPvZQR",
		"crosssaber": "Compendium.sw5e.lightweapons.Item.qfg0n9Yz1aZykKcM",
		"doublesaber": "Compendium.sw5e.lightweapons.Item.T3eHzkaSMMpLuBbr",
		"doubleshoto": "Compendium.sw5e.lightweapons.Item.AVDPyImR6l9E2JEi",
		"dual-phasesaber": "Compendium.sw5e.lightweapons.Item.btN7KpXTNmkCSNCr",
		"great-saber": "Compendium.sw5e.lightweapons.Item.mSZS5YaRrV0VEjDc",
		"guardshoto": "Compendium.sw5e.lightweapons.Item.xYrgfBXhWqh7jsU5",
		"lightaxe": "Compendium.sw5e.lightweapons.Item.Ncx7KBa8wBn9KztD",
		"lightbaton": "Compendium.sw5e.lightweapons.Item.l5JZlEuy2sDFmsxT",
		"lightblade": "Compendium.sw5e.lightweapons.Item.QYOc47JL2U2OCFnM",
		"lightclub": "Compendium.sw5e.lightweapons.Item.OJmYglDcsfSbzuyK",
		"lightcutlass": "Compendium.sw5e.lightweapons.Item.f2Gs7BXTGRANoziO",
		"lightdagger": "Compendium.sw5e.lightweapons.Item.Ri7R7WyapR2CDE9S",
		"lightfist": "Compendium.sw5e.lightweapons.Item.I0DFU813iysKiYCj",
		"lightfoil": "Compendium.sw5e.lightweapons.Item.s3PoP2XP6eNKibCh",
		"lightglaive": "Compendium.sw5e.lightweapons.Item.A2LrY6YdgNv4JL74",
		"lightkatana": "Compendium.sw5e.lightweapons.Item.U1nekOEjEnj6zztB",
		"lightnodachi": "Compendium.sw5e.lightweapons.Item.dHlqXZ0f51MsuNO3",
		"lightring": "Compendium.sw5e.lightweapons.Item.T81gCX274rZCwcUF",
		"lightsaber": "Compendium.sw5e.lightweapons.Item.TjTDmB8pIYSLkQvw",
		"lightsaberpike": "Compendium.sw5e.lightweapons.Item.NKFT1tIzfAAZHsHn",
		"lightstaff": "Compendium.sw5e.lightweapons.Item.TIoL50LbonErh2Zx",
		"martiallightsaber": "Compendium.sw5e.lightweapons.Item.ZAvRnvSdsRnz9CGQ",
		"phaseknife": "Compendium.sw5e.lightweapons.Item.ZaubWVQfostRNL56",
		"pikesaber": "Compendium.sw5e.lightweapons.Item.J0CdF65GSK1tlWr2",
		"retrosaber": "Compendium.sw5e.lightweapons.Item.L47ZLQgshik5X5ea",
		"saberaxe": "Compendium.sw5e.lightweapons.Item.gj2EIKC9sEvLvc2E",
		"sabergauntlet": "Compendium.sw5e.lightweapons.Item.QsWyd6ML0hMEavZT",
		"sabermace": "Compendium.sw5e.lightweapons.Item.bfKWgOJsnedKQZMT",
		"saberspear": "Compendium.sw5e.lightweapons.Item.NvHrxWiR8wiUeEhO",
		"saberstaff": "Compendium.sw5e.lightweapons.Item.8VjKAKu1UfvGU3t5",
		"saberwhip": "Compendium.sw5e.lightweapons.Item.gaFajnxdTGFGVOki",
		"shotosaber": "Compendium.sw5e.lightweapons.Item.RjQEzblykRC6Qn8E",
		"sicklesaber": "Compendium.sw5e.lightweapons.Item.gciw8MclS0kQ40S3",
		"sithsaber": "Compendium.sw5e.lightweapons.Item.AoO7yHMOrYlG67fa",
		"splitsaber": "Compendium.sw5e.lightweapons.Item.2bOBHr15ltB32A46",
		"splitshoto": "Compendium.sw5e.lightweapons.Item.1koRC40oNszzz4oz",
		"sunsaber": "Compendium.sw5e.lightweapons.Item.0Mwf5lFw326kCXaP",
		"warsaber": "Compendium.sw5e.lightweapons.Item.aJmL8jD1ZbmurHGe",
		"wristsaber": "Compendium.sw5e.lightweapons.Item.tct3YIDnft6YS1zm",
    	// Vibroweapons
		"atlatl": "Compendium.sw5e.vibroweapons.Item.NWifgokJSFzhq181",
		"bolas": "Compendium.sw5e.vibroweapons.Item.OPGMDrcn02FOCZia",
		"cesta": "Compendium.sw5e.vibroweapons.Item.BfV4LUJHoOrQTu6N",
		"chaineddagger": "Compendium.sw5e.vibroweapons.Item.lj2Ac5TNN17dzqO1",
		"chakram": "Compendium.sw5e.vibroweapons.Item.WNdBiAgjJ2OweaJq",
		"diresword": "Compendium.sw5e.vibroweapons.Item.eJDETh7Y6pktJIMu",
		"direvibroblade": "Compendium.sw5e.vibroweapons.Item.LjcbRzt4OKcqLTh2",
		"disguisedblade": "Compendium.sw5e.vibroweapons.Item.cWm1U2JsCtS4Lc0m",
		"disruptorshiv": "Compendium.sw5e.vibroweapons.Item.sDwWLdC1Vh1UGKx7",
		"doubleblade": "Compendium.sw5e.vibroweapons.Item.4uqEmrg7kYEQwBvH",
		"doublesword": "Compendium.sw5e.vibroweapons.Item.DDq7CFXPPd72xMO1",
		"echostaff": "Compendium.sw5e.vibroweapons.Item.Xam0lDxRXZxC8MDF",
		"electrobaton": "Compendium.sw5e.vibroweapons.Item.2cIp9LguuQCNMK5L",
		"electrohammer": "Compendium.sw5e.vibroweapons.Item.54tx6Akk0zgga9t7",
		"electroprod": "Compendium.sw5e.vibroweapons.Item.fLc9HA5kRIFA1gIM",
		"electrostaff": "Compendium.sw5e.vibroweapons.Item.Jts0lNqKNG1T6SCe",
		"electrovoulge": "Compendium.sw5e.vibroweapons.Item.Mo0wecw4GamnaZ0A",
		"electrowhip": "Compendium.sw5e.vibroweapons.Item.RraZhaFWTJ4WeDUZ",
		"hiddenblade": "Compendium.sw5e.vibroweapons.Item.rlDrDtvyD7t4FT0M",
		"hookedvibroblade": "Compendium.sw5e.vibroweapons.Item.vHRaNC6nKgNxBqTo",
		"jaggedvibroblade": "Compendium.sw5e.vibroweapons.Item.plzIeYrDtjaATwAM",
		"mancatcher": "Compendium.sw5e.vibroweapons.Item.RxdwCbimr7Ui4mQi",
		"martialarts": "Compendium.sw5e.vibroweapons.Item.znScsGBnRkIijapl",
		"nervebaton": "Compendium.sw5e.vibroweapons.Item.7pk36cb2PRiGAB6F",
		"net": "Compendium.sw5e.vibroweapons.Item.wsVMOyR5QaVKjQgb",
		"neuronicwhip": "Compendium.sw5e.vibroweapons.Item.IQCGTo7CwK91sWOz",
		"riotbaton": "Compendium.sw5e.vibroweapons.Item.eF8C7QvmQeWrYspM",
		"riotshocker": "Compendium.sw5e.vibroweapons.Item.d0EHliz063hXRwI7",
		"shockwhip": "Compendium.sw5e.vibroweapons.Item.DpLxR3D4saT1BSFM",
		"stungauntlet": "Compendium.sw5e.vibroweapons.Item.L8gExg0T6yY1AdWK",
		"techaxe": "Compendium.sw5e.vibroweapons.Item.WhLbnsnz8ee4kkpu",
		"techblade": "Compendium.sw5e.vibroweapons.Item.Ds6DLXoNyRIHPGV4",
		"techstaff": "Compendium.sw5e.vibroweapons.Item.THeSyLakA2GQjCDQ",
		"unarmedstrike": "Compendium.sw5e.vibroweapons.Item.FCj6NN8vS19NEb9w",
		"vibroaxe": "Compendium.sw5e.vibroweapons.Item.K65Mon3IlNoCVGel",
		"vibrobaton": "Compendium.sw5e.vibroweapons.Item.QwQDg9M0vER4KU4O",
		"vibrobattleaxe": "Compendium.sw5e.vibroweapons.Item.eWViIziY3WnF8GAm",
		"vibroblade": "Compendium.sw5e.vibroweapons.Item.nPm9GPg97XybQJ1u",
		"vibrobuster": "Compendium.sw5e.vibroweapons.Item.6mAX46oU2wo1O0PZ",
		"vibroclaw": "Compendium.sw5e.vibroweapons.Item.TU8WRrfFZih8adhm",
		"vibroclaymore": "Compendium.sw5e.vibroweapons.Item.cI346Xc9uCBNlDNt",
		"vibrocutlass": "Compendium.sw5e.vibroweapons.Item.vgTCxwCF8xlWBqU2",
		"vibrocutter": "Compendium.sw5e.vibroweapons.Item.XuOFMQCwr7Rn65ys",
		"vibrodagger": "Compendium.sw5e.vibroweapons.Item.V5O5qbragpM9iUs4",
		"vibrodart": "Compendium.sw5e.vibroweapons.Item.VdakW2NjzGq1IU8J",
		"vibroflail": "Compendium.sw5e.vibroweapons.Item.kgASekRYYKo4Z5Wm",
		"vibroglaive": "Compendium.sw5e.vibroweapons.Item.T4hqmxfsDEP8qnG6",
		"vibrohammer": "Compendium.sw5e.vibroweapons.Item.5h8BtmxLWoevRIOv",
		"vibrokatana": "Compendium.sw5e.vibroweapons.Item.8iXtbbR9GVLFmT5L",
		"vibroknife": "Compendium.sw5e.vibroweapons.Item.6phFf5TrAqic0zIG",
		"vibroknuckler": "Compendium.sw5e.vibroweapons.Item.xQzxcdDcFIBtS3Nr",
		"vibrolance": "Compendium.sw5e.vibroweapons.Item.eECvAHTGLjajlQZ5",
		"vibromace": "Compendium.sw5e.vibroweapons.Item.g29wbWGPwmHiKDAY",
		"vibronodachi": "Compendium.sw5e.vibroweapons.Item.C3Ecqi0qi9J4PEwD",
		"vibropike": "Compendium.sw5e.vibroweapons.Item.aeWrrLHykeDJe3wb",
		"vibrorapier": "Compendium.sw5e.vibroweapons.Item.vrm8NuJPsKTTGSRa",
		"vibrosabre": "Compendium.sw5e.vibroweapons.Item.fdRjSKyG3YNhSfTM",
		"vibroshield": "Compendium.sw5e.vibroweapons.Item.CpV5I4T3SwsqyF2S",
		"vibrospear": "Compendium.sw5e.vibroweapons.Item.skYlTL4WV9pcMLRG",
		"vibrostaff": "Compendium.sw5e.vibroweapons.Item.XaWdPLOR9ufOg1lA",
		"vibrostiletto": "Compendium.sw5e.vibroweapons.Item.e3dkWzTi9DLiWkU3",
		"vibrosword": "Compendium.sw5e.vibroweapons.Item.fGmREzOTvQ2CQYHl",
		"vibrotonfa": "Compendium.sw5e.vibroweapons.Item.MQ8dYXV7wIUNsZOi",
		"vibrowhip": "Compendium.sw5e.vibroweapons.Item.RpliZqbwKROc20oP",
		"warhat": "Compendium.sw5e.vibroweapons.Item.R2Mkp4Val8DHfHEv",
		"warsword": "Compendium.sw5e.vibroweapons.Item.VzCZvULJMfoY1f5P",
		"wristblade": "Compendium.sw5e.vibroweapons.Item.p8AoTEx9ySGHmJZu",
	};
	if (strict) config.ammoIds = {
		arrow: "Compendium.sw5e.ammo.Item.kW97lhvo8rYMypG0",
		arrowcombustive: "Compendium.sw5e.ammo.Item.n1gjy0mheXViYfsE",
		arrowelectroshock: "Compendium.sw5e.ammo.Item.q5XpHt4TEi7JY4IM",
		arrownoisemaker: "Compendium.sw5e.ammo.Item.rWNnt31Qc8vijcUb",
		bolt: "Compendium.sw5e.ammo.Item.bXgrfvShJWyNygV0",
		boltdeafening: "Compendium.sw5e.ammo.Item.dmodQxWAT6Bfrhns",
		boltelectrifying: "Compendium.sw5e.ammo.Item.NNjJbfRx67JdirSR",
		boltpanic: "Compendium.sw5e.ammo.Item.z7ztMrbJCh3cl5LM",
		corrosivecartridge: "Compendium.sw5e.ammo.Item.eNEdlWIHLR3yflJM",
		cryocell: "Compendium.sw5e.ammo.Item.0gGP4fOTbT5Nr0UP",
		dart: "Compendium.sw5e.ammo.Item.ld3OaEeYKbfHUtUC",
		deafeningcalibrator: "Compendium.sw5e.ammo.Item.4PPbZh3aWNVgkGEE",
		deafeningcell: "Compendium.sw5e.ammo.Item.HwoQydBMvGIrHcxI",
		deafeningcollimator: "Compendium.sw5e.ammo.Item.21IMgkOdo3vPnJlo",
		deafeningdart: "Compendium.sw5e.ammo.Item.9Fgu4ImgnUh3nALy",
		electrifyingcalibrator: "Compendium.sw5e.ammo.Item.Ir6H3twcOBgEKEVe",
		electrifyingcartridge: "Compendium.sw5e.ammo.Item.Ebbb4CPzKhzF1hNk",
		electrifyingcollimator: "Compendium.sw5e.ammo.Item.CFAPdZKogjI5VDsC",
		electrifyingdart: "Compendium.sw5e.ammo.Item.PhZJjeGTlaftiIX5",
		flechetteclipfragmentation: "Compendium.sw5e.ammo.Item.S0hF8VlOBRPiKzJc",
		flechetteclipion: "Compendium.sw5e.ammo.Item.AhnNsZEaSyt5vQoa",
		flechetteclipplasma: "Compendium.sw5e.ammo.Item.JhA6Fk0CmRAhWQqs",
		flechettemagfragmentation: "Compendium.sw5e.ammo.Item.WFGBHjctJW2G8Ous",
		flechettemagion: "Compendium.sw5e.ammo.Item.mZ0ZWeKLLAPTWzos",
		flechettemagplasma: "Compendium.sw5e.ammo.Item.YpAiDCFvnJ9DFH0q",
		fluxcollimator: "Compendium.sw5e.ammo.Item.8pm1jGUlEEcYXXZG",
		gascartridge: "Compendium.sw5e.ammo.Item.HLuN9PeH3L2SEV01",
		incendiarycell: "Compendium.sw5e.ammo.Item.aIRzZOPc6kfGQjpQ",
		missilefragmentation: "Compendium.sw5e.ammo.Item.dP1OJg8DNYwKRbbN",
		missileincendiary: "Compendium.sw5e.ammo.Item.NtAv7g53vVoHGGbQ",
		missileion: "Compendium.sw5e.ammo.Item.I8TXYDvGwMmBcYuS",
		oscillationcalibrator: "Compendium.sw5e.ammo.Item.sPAXclp1H3d1OinS",
		paniccalibrator: "Compendium.sw5e.ammo.Item.SrUO28T2x6jeNReS",
		paniccollimator: "Compendium.sw5e.ammo.Item.F89IDxtKvqG9MIbD",
		panicdart: "Compendium.sw5e.ammo.Item.LlVD11rEsLRXu6M3",
		powercell: "Compendium.sw5e.ammo.Item.oeJaLYngzLX0x6Yj",
		powergenerator: "Compendium.sw5e.ammo.Item.yeyBmy7LpYNzP5GN",
		projectorcanistercorrosive: "Compendium.sw5e.ammo.Item.DTHeXNdbxQNWCSuR",
		projectorcanistercryo: "Compendium.sw5e.ammo.Item.F6zNyxxWi8TiUb4m",
		projectorcanisterincendiary: "Compendium.sw5e.ammo.Item.F1uipGbRDApT0sMX",
		projectortankcorrosive: "Compendium.sw5e.ammo.Item.FFHbfcWjrvgf8ld6",
		projectortankcryo: "Compendium.sw5e.ammo.Item.A2Dpmn2IDuhwFgS4",
		projectortankincendiary: "Compendium.sw5e.ammo.Item.YcEOLA1eLtDmlJOI",
		rocketfragmentation: "Compendium.sw5e.ammo.Item.JcaUDwCQIjqhvHUn",
		rocketincendiary: "Compendium.sw5e.ammo.Item.0bQtnYFq1LxRqNeJ",
		rocketion: "Compendium.sw5e.ammo.Item.eRVG9TORFV6YGuA0",
		slugcartridge: "Compendium.sw5e.ammo.Item.td6veREVMHQB6kiU",
		snare: "Compendium.sw5e.ammo.Item.pyFkRdUK4sZZrJtG",
		torpedofragmentation: "Compendium.sw5e.ammo.Item.rkYFnv2yNA9mh8Jk",
		torpedoplasma: "Compendium.sw5e.ammo.Item.6fDA5yg8WAoCBGlk",
	};
	// Tools
	config.toolTypes.kit = config.toolProficiencies.kit = "SW5E.ToolSpecialistKit";
	if (strict) config.toolIds = {
		// Gaming Sets
		chancecubes: "Compendium.sw5e.gamingsets.Item.kqt52rtjpaz6jiCf",
		dejarikset: "Compendium.sw5e.gamingsets.Item.dKho3HXE7XfS4iRU",
		kirgatzset: "Compendium.sw5e.gamingsets.Item.vKrWBDhbSZDtdiTv",
		pazaakdeck: "Compendium.sw5e.gamingsets.Item.XfClqzNPbjJxHqil",
		sabaccdeck: "Compendium.sw5e.gamingsets.Item.RvFP7y8VWPMROQWv",
		// Artisan's Implements
		armormechsimplements: "Compendium.sw5e.implements.Item.sjsX3NYk7eZ4udlw",
		armstechsimplements: "Compendium.sw5e.implements.Item.Mrwh3CEneCPnPP1T",
		artificersimplements: "Compendium.sw5e.implements.Item.w7lWDrGgZeYbwiSH",
		artistsimplements: "Compendium.sw5e.implements.Item.OXlKtbL29bLUluf2",
		astrotechsimplements: "Compendium.sw5e.implements.Item.RlQ4zlWA7EdohcEh",
		audiotechsimplements: "Compendium.sw5e.implements.Item.VNto9t3diElKRHWG",
		biotechsimplements: "Compendium.sw5e.implements.Item.QTg2sCpSdPfyUoCq",
		constructorsimplements: "Compendium.sw5e.implements.Item.5HKxptQKBFED544u",
		cybertechsimplements: "Compendium.sw5e.implements.Item.9w7V1PCf2aD4caVP",
		gadgeteersimplements: "Compendium.sw5e.implements.Item.GJrYc9KQ22o7qTlz",
		geneticistsimplements: "Compendium.sw5e.implements.Item.80xuLufR1m7kpNRs",
		jewelersimplements: "Compendium.sw5e.implements.Item.EYpkyPlywQaH9Ivy",
		surveyorsimplements: "Compendium.sw5e.implements.Item.SvureMOX5qo6LqGt",
		synthweaversimplements: "Compendium.sw5e.implements.Item.uP1rZHmbOmg8BUaX",
		tinkersimplements: "Compendium.sw5e.implements.Item.IkmQFQjGc4xq0Czd",
		writersimplements: "Compendium.sw5e.implements.Item.tkJEw4ZB5EbFJHPG",
		// Specialist's Kit
		alchemistskit: "Compendium.sw5e.kits.Item.9DWrsRqwXfHN47Nk",
		archaeologistkit: "Compendium.sw5e.kits.Item.WrJhpfymps4yRBdk",
		artilleristskit: "Compendium.sw5e.kits.Item.jJ1CiyKVXOlyjn8h",
		bioanalysiskit: "Compendium.sw5e.kits.Item.fWoNUuZCNLG8W67s",
		biochemistskit: "Compendium.sw5e.kits.Item.pq0o4lUKg8Nl08yf",
		brewerskit: "Compendium.sw5e.kits.Item.OAt131yAvZYPlUmO",
		chefskit: "Compendium.sw5e.kits.Item.BnhGtUc9G7issUcW",
		demolitionskit: "Compendium.sw5e.kits.Item.gyhyVW4PEUWLpZTL",
		disguisekit: "Compendium.sw5e.kits.Item.ChmVrypurts3VY7i",
		forgerykit: "Compendium.sw5e.kits.Item.ksrKs7yvm7X7CMxA",
		mechanicskit: "Compendium.sw5e.kits.Item.NubaMVVv3vNwbtuj",
		munitionskit: "Compendium.sw5e.kits.Item.VJL0ue7Bpl3s0MHx",
		poisonerskit: "Compendium.sw5e.kits.Item.ofea5VziX4jBg5So",
		scavengingkit: "Compendium.sw5e.kits.Item.NVxy5wBSpJcHxPEm",
		securitykit: "Compendium.sw5e.kits.Item.nqf9reJDGplVaeac",
		slicerskit: "Compendium.sw5e.kits.Item.Yonb0zHFV9asPJHq",
		spicerskit: "Compendium.sw5e.kits.Item.NlppEcEGpDVDyPiH",
		trapperskit: "Compendium.sw5e.kits.Item.cIfzetKEwhczahBr",
		// Musical Instruments
		bandfill: "Compendium.sw5e.musicalinstruments.Item.ic6PBK7VxBLk24rZ",
		chindinkaluhorn: "Compendium.sw5e.musicalinstruments.Item.NgKMduBdltQQqgnC",
		drum: "Compendium.sw5e.musicalinstruments.Item.sryr7sQ5IeUny6cd",
		fanfar: "Compendium.sw5e.musicalinstruments.Item.wASdyFsdQEJHhXeC",
		fizzz: "Compendium.sw5e.musicalinstruments.Item.IZEi9N6YzWFBHpNh",
		flute: "Compendium.sw5e.musicalinstruments.Item.mumHDhvGww117xoq",
		kloohorn: "Compendium.sw5e.musicalinstruments.Item.PfxeK6e5htdyzDEP",
		lute: "Compendium.sw5e.musicalinstruments.Item.BE1Tg7LCM7yfwypT",
		mandoviol: "Compendium.sw5e.musicalinstruments.Item.9hYtv8pguNI8aae9",
		ommnibox: "Compendium.sw5e.musicalinstruments.Item.e9nNVlBmPvPD6cbU",
		shawm: "Compendium.sw5e.musicalinstruments.Item.BLDVxPfj8jQw1DUN",
		slitherhorn: "Compendium.sw5e.musicalinstruments.Item.WZbBxDVRLynROWbf",
		traz: "Compendium.sw5e.musicalinstruments.Item.XwLhLqUJMahD3fo6",
		valahorn: "Compendium.sw5e.musicalinstruments.Item.sNnvwOZrUp5xJuHe",
		xantha: "Compendium.sw5e.musicalinstruments.Item.WVSGXxzBoTUoPvi9",
	};
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
	if (strict) config.armorIds = {
		combatsuit: "Compendium.sw5e.armor.Item.iJXWiOLOQcVohJBN",
		fiberarmor: "Compendium.sw5e.armor.Item.zAkvWO8lEohqewbB",

		compositearmor: "Compendium.sw5e.armor.Item.mToMe4McIkZRIeCN",
		mesharmor: "Compendium.sw5e.armor.Item.WalIq3DWny0Ud4Vn",
		weavearmor: "Compendium.sw5e.armor.Item.hpN14Vhgw82PHeEz",

		assaultarmor: "Compendium.sw5e.armor.Item.GO4yvhWLgLTrU0xb",
		battlearmor: "Compendium.sw5e.armor.Item.wafF3SF4zQBOs34y",
		heavyexoskeleton: "Compendium.sw5e.armor.Item.ggFMzbQrwkGZCoaQ",
	};
	if (strict) config.shieldIds = {
		lightphysicalshield: "Compendium.sw5e.armor.Item.k1pOOCzZoWEr5Dia",
		lightshieldgenerator: "Compendium.sw5e.armor.Item.eMXpw3HIVMnaNFQ1",

		mediumphysicalshield: "Compendium.sw5e.armor.Item.4vGeVWgLIUfN9YiB",
		mediumshieldgenerator: "Compendium.sw5e.armor.Item.R2GRWrNHmAZzksg5",

		heavyphysicalshield: "Compendium.sw5e.armor.Item.KvzKRKNWATwdzxjz",
		heavyshieldgenerator: "Compendium.sw5e.armor.Item.2u9493AUhrh2AfES",
	};
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
	config.consumableTypes.explosive = {
		label: "SW5E.ConsumableExplosive",
		subtypes: {
			charge: "SW5E.ConsumableExplosiveCharge",
			grenade: "SW5E.ConsumableExplosiveGrenade",
			mine: "SW5E.ConsumableExplosiveMine",
			thermal: "SW5E.ConsumableExplosiveThermal",
		},
	}
	preLocalize( `consumableTypes.explosive.subtypes`, { sort: true } );
	// Containers
	if (strict) config.containerTypes = {
		backpack: "Compendium.sw5e.adventuringgear.Item.PN7A13FrDSyo2Neg",
		bottle: "Compendium.sw5e.adventuringgear.Item.WmT9R9tLTJ9yRTfP",
		bucket: "Compendium.sw5e.adventuringgear.Item.b3D7Wid3bik2Xlst",
		camtono: "Compendium.sw5e.adventuringgear.Item.XuAbKi14AZTKnouv",
		canteen: "Compendium.sw5e.adventuringgear.Item.diDeGGcu9chi0Sys",
		chest: "Compendium.sw5e.adventuringgear.Item.MjUTZY5SnDWCaX0o",
		crate: "Compendium.sw5e.adventuringgear.Item.Y3cPZev6cVmfYpDz",
		flask: "Compendium.sw5e.adventuringgear.Item.3IZ4M5tgF6sVeleY",
		hovercart: "Compendium.sw5e.adventuringgear.Item.NV7w8EsXcNOjGfdy",
		jug: "Compendium.sw5e.adventuringgear.Item.9ssHBQvPFrSeB9nu",
		pitcher: "Compendium.sw5e.adventuringgear.Item.tNDMj0ofQupjYbUP",
		pot: "Compendium.sw5e.adventuringgear.Item.V6HwYvTHkJiubxJS",
		pouch: "Compendium.sw5e.adventuringgear.Item.3hZYvPRii0zqaOdh",
		sack: "Compendium.sw5e.adventuringgear.Item.7ahkqGMiHMWRFtg3",
		smugglepack: "Compendium.sw5e.adventuringgear.Item.xxl1lBqJaegzesdU",
		tankard: "Compendium.sw5e.adventuringgear.Item.9hOQLERdixohVRLB",
		vial: "Compendium.sw5e.adventuringgear.Item.VONgs3pCXP5fPWYc",
	};
	if (strict) config.focusTypes = {};
	config.focusTypes = {
		...config.focusTypes,
		force: {
			label: "SW5E.Focus.Force",
			itemIds: {
				focusgenerator: "Compendium.sw5e.adventuringgear.Item.mcGJhS8B2IJgomSB",
			}
		},
		tech: {
			label: "SW5E.Focus.Tech",
			itemIds: {
				wristpad: "Compendium.sw5e.adventuringgear.Item.1t8Bxbq4vlbkAUzo",
			}
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
		hvy: {
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
		rel: {
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
		fin: {
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
		lgt: {
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
		rch: {
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
		ret: {
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
		thr: {
			label: "SW5E.Item.Property.Thrown",
			full: "SW5E.Item.Property.ThrownFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.ThrownDesc",
			isCharacter: true
		},
		two: {
			label: "SW5E.Item.Property.TwoHanded",
			full: "SW5E.Item.Property.TwoHandedFull",
			type: "Boolean",
			reference: "SW5E.Item.Property.TwoHandedDesc",
			isCharacter: true
		},
		ver: {
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
			"hvy",
			"hidden",
			"keen",
			"piercing",
			"range",
			"rapid",
			"rel",
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
			"fin",
			"fixed",
			"interlockingWeapon",
			"lgt",
			"luminous",
			"mighty",
			"modal",
			"neuralizing",
			"penetrating",
			"powerCell",
			"rch",
			"reckless",
			"ret",
			"shocking",
			"silentWeapon",
			"slug",
			"sonorous",
			"specialized",
			"strRq",
			"switch",
			"thr",
			"two",
			"ver",
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
	config.spellPreparationModes.powerCasting = {
		label: "SW5E.Powercasting.Label",
		usesPoints: true,
		upcast: true,
	};	
	config.powerCasting = {
		force: {
			label: "SW5E.Powercasting.Force.Label",
			img: "systems/dnd5e/icons/power-tiers/{id}.webp",
			attr: ["wis", "cha"],
			focus: {
				label: "SW5E.Powercasting.Force.Focus",
				id: "focusgenerator",
				property: "bolstering"
			},
			progression: {
				full: {
					label: "SW5E.Powercasting.Force.Prog.Full",
					powerPoints: 4,
					powerMaxLevel: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9],
					powerLimit: 6,
					divisor: 1,
					powersKnown: [0, 9, 11, 13, 15, 17, 19, 21, 23, 25, 26, 28, 29, 31, 32, 34, 35, 37, 38, 39, 40]
				},
				"3/4": {
					label: "SW5E.Powercasting.Force.Prog.3/4",
					powerPoints: 3,
					powerMaxLevel: [0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 7],
					powerLimit: 5,
					divisor: 9 / 7,
					powersKnown: [0, 7, 9, 11, 13, 15, 17, 18, 19, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 34, 35]
				},
				half: {
					label: "SW5E.Powercasting.Force.Prog.Half",
					powerPoints: 2,
					powerMaxLevel: [0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5],
					powerLimit: 4,
					divisor: 9 / 5,
					powersKnown: [0, 5, 7, 9, 10, 12, 13, 14, 15, 17, 18, 19, 20, 22, 23, 24, 25, 27, 28, 29, 30]
				},
				arch: {
					label: "SW5E.Powercasting.Force.Prog.Arch",
					powerPoints: 1,
					powerMaxLevel: [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4],
					powerLimit: 4,
					divisor: 9 / 4,
					powersKnown: [0, 0, 0, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 22, 23, 24, 25]
				}
			},
			schools: {
				lgt: {
					label: "SW5E.Powercasting.Force.School.Lgt.Label",
					attr: ["wis"],
					fullKey: "light"
				},
				uni: {
					label: "SW5E.Powercasting.Force.School.Uni.Label",
					attr: ["wis", "cha"],
					fullKey: "universal"
				},
				drk: {
					label: "SW5E.Powercasting.Force.School.Drk.Label",
					attr: ["cha"],
					fullKey: "dark"
				}
			}
		},
		tech: {
			label: "SW5E.Powercasting.Tech.Label",
			img: "systems/sw5e/icons/power-tiers/{id}.webp",
			attr: ["int"],
			focus: {
				label: "SW5E.Powercasting.Tech.Focus",
				id: "wristpad",
				property: "surging"
			},
			progression: {
				full: {
					label: "SW5E.Powercasting.Tech.Prog.Full",
					powerPoints: 2,
					powerMaxLevel: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9],
					powerLimit: 6,
					divisor: 1,
					powersKnown: [0, 6, 7, 9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]
				},
				"3/4": {
					label: "SW5E.Powercasting.Tech.Prog.3/4",
					powerPoints: 1.5,
					powerMaxLevel: [0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 7],
					powerLimit: 5,
					divisor: 9 / 4,
					powersKnown: [0, 0, 0, 7, 8, 9, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
				},
				half: {
					label: "SW5E.Powercasting.Tech.Prog.Half",
					powerPoints: 1,
					powerMaxLevel: [0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5],
					powerLimit: 4,
					divisor: 9 / 5,
					powersKnown: [0, 0, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
				},
				arch: {
					label: "SW5E.Powercasting.Tech.Prog.Arch",
					powerPoints: 0.5,
					powerMaxLevel: [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4],
					powerLimit: 4,
					divisor: 9 / 4,
					powersKnown: [0, 0, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
				}
			},
			schools: {
				tec: {
					label: "SW5E.Powercasting.Tech.School.Tec.Label",
					attr: ["int"],
					fullKey: "tech"
				}
			},
			shortRest: true
		}
	};
	preLocalize( "powercasting", { key: "label", sort: true } );
	preLocalize( "powercasting.force.progression", { key: "label" } );
	preLocalize( "powercasting.tech.progression", { key: "label" } );
	preLocalize( "powercasting.force.schools", { key: "label", sort: true } );
	preLocalize( "powercasting.tech.schools", { key: "label", sort: true } );

	if (strict) config.spellSchools = {};
	config.spellSchools = {
		...config.spellSchools,
		...config.powerCasting.force.schools,
		...config.powerCasting.tech.schools
	};
	// Superiority
	config.superiority = {
		label: "SW5E.Superiority.Label",
		img: "systems/dnd5e/icons/power-tiers/{id}.webp",
		// focus: {
		// 	label: "SW5E.Superiority.Focus",
		// 	id: "superiorityfocus",
		// 	property: "superior"
		// },
		progression: {
			full: {
				label: "SW5E.Superiority.Prog.Full",
				quant: [0, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12],
				size: [0, 4, 4, 4, 4, 6, 6, 6, 6, 8, 8, 8, 8, 10, 10, 10, 10, 12, 12, 12, 12],
				known: [0, 1, 2, 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24],
				divisor: 1,
			},
			half: {
				label: "SW5E.Superiority.Prog.Half",
				quant: [0, 0, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6],
				size: [0, 0, 4, 4, 4, 6, 6, 6, 6, 8, 8, 8, 8, 10, 10, 10, 10, 12, 12, 12, 12],
				known: [0, 0, 1, 2, 2, 4, 4, 5, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12],
				divisor: 2,
			}
		},
		types: {
			physical: {
				label: "SW5E.Superiority.Type.Physical.Label",
				attr: ["str", "dex", "con"]
			},
			mental: {
				label: "SW5E.Superiority.Type.Mental.Label",
				attr: ["int", "wis", "cha"]
			},
			general: {
				label: "SW5E.Superiority.Type.General.Label",
				attr: ["str", "dex", "con", "int", "wis", "cha"]
			}
		}
	};
	preLocalize( "superiority.progression", { key: "label" } );
	preLocalize( "superiority.types", { key: "label" } );
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
	};
	// Compendium Packs
	config.sourcePacks.BACKGROUNDS = "sw5e.backgrounds";
	config.sourcePacks.CLASSES = "sw5e.classes";
	config.sourcePacks.ITEMS = "sw5e.items";
	config.sourcePacks.RACES = "sw5e.species";
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
