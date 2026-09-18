![](https://img.shields.io/badge/Foundry-v14-informational)
![](https://img.shields.io/badge/DND5e-v6.0.0-informational)
![](https://img.shields.io/badge/lib--wrapper-1.13.5.1-informational)
![Latest Release Download Count](https://img.shields.io/github/downloads/sw5e-foundry/sw5e-module/latest/module.zip)

# SW5E

Implementation of the **Star Wars 5e** ruleset as a module for **dnd5e**.

## Compatibility (2.x line)

| Component | Requirement |
|-----------|-------------|
| Foundry VTT | minimum **14.367**, verified **14.367** |
| dnd5e | **exactly 6.0.0** (minimum and verified) |
| lib-wrapper | minimum and verified **1.13.5.1** |

The **2.x** release line is Foundry **14**-oriented and does **not** claim Foundry **13** compatibility. **SW5e 1.4.3** is the last public **1.x** release and remains the Foundry 13 / dnd5e 5.2.5 line.

> [!IMPORTANT]
> This repository contains the **source** for the SW5E module.
>
> - **Most users** should install from the newest **published** GitHub Release that matches their Foundry major version
> - **Contributors** should use the active development branch for pull requests
> - Before installing or updating, always review the current **Release Notes** and `CHANGELOG.md` for compatibility and breaking changes
>
> SW5e **2.0.0** is prepared on the Foundry 14 development line and is **not** publicly installable until a separate ship authorization publishes it.

## Documentation

### For Users

The project wiki is the main home for end-user documentation.

- [Wiki Home](https://github.com/sw5e-foundry/sw5e-module/wiki)
- **Getting Started**
- **Troubleshooting**
- **FAQ**
- **Compatibility & Limitations**

Historical Foundry 13 beta guidance remains available for the 1.x line:

- [Beta Test Guide — v1.4.0](https://github.com/sw5e-foundry/sw5e-module/wiki/Beta-Test-Guide-v1.4.0) ([repo copy](docs/beta-test-1.4.0.md))

### For Contributors

- [Developer Guide](https://github.com/sw5e-foundry/sw5e-module/wiki/Developer-Guide)
- [Local Setup](https://github.com/sw5e-foundry/sw5e-module/wiki/Local-Setup-and-Workflow)
- [Active Effect Keys](https://github.com/sw5e-foundry/sw5e-module/wiki/Active-Effect-Keys)
- [Testing & Contribution](https://github.com/sw5e-foundry/sw5e-module/wiki/Testing-%26-Contribution)

## Installation

This module is **not listed** on Foundry's website or in the in-app Module Repository because it contains homebrew content.

### Install the Latest Published Release

Open Foundry's **Install Module** window and paste this URL into the **Manifest URL** box:

```text
https://github.com/sw5e-foundry/sw5e-module/releases/latest/download/module.json
```

That URL always points at the newest **published** GitHub release. Until **2.0.0** is shipped, `latest` may still resolve to a **1.x** Foundry 13 build.

### Upgrade from SW5e 1.4.3 to 2.x (Foundry 14)

**Copy-then-migrate.** Never migrate a production world in place. Copy the 1.4.3 world (Foundry 13 / dnd5e 5.2.5) and upgrade the copy.

1. Back up every world. Copy the world you will upgrade; leave the production original closed and unmigrated.
2. Install Foundry **14** (minimum **14.367**).
3. Install **dnd5e 6.x** (minimum **6.0.0**) and **lib-wrapper 1.13.5.1** (or newer meeting the declared minimum).
4. Install SW5e **2.x** from the published release when available. Until **2.0.0** is shipped, `latest` may still resolve to a **1.x** Foundry 13 build.
5. Run **dnd5e system migration first**, then **SW5e module migration**.
6. Confirm character portraits, prototype tokens, scene tokens, and starship Hull/Shields after migration.

## Known limitations

- **Launcher compatibility** is a deferred known issue. Prefer a verified portable or harness install path for Foundry 14 validation and upgrades.
- Tech Recovery is not implemented.
- Review `CHANGELOG.md` for release-line details and deferred cleanup items.
