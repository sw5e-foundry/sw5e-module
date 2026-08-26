![](https://img.shields.io/badge/Foundry-v14-informational)
![](https://img.shields.io/badge/DND5e-v5.3.3-informational)
![](https://img.shields.io/badge/lib--wrapper-1.13.5.1-informational)
![Latest Release Download Count](https://img.shields.io/github/downloads/sw5e-foundry/sw5e-module/latest/module.zip)

# SW5E

Implementation of the **Star Wars 5e** ruleset as a module for **dnd5e**.

## Compatibility (2.x line)

| Component | Requirement |
|-----------|-------------|
| Foundry VTT | **14** (minimum and verified) |
| dnd5e | minimum **5.0.0**, verified **5.3.3** |
| lib-wrapper | minimum and verified **1.13.5.1** |

The **2.x** release line is Foundry **14**-oriented and does **not** claim Foundry **13** compatibility. The public **1.x** line remains the Foundry 13 / dnd5e 5.2.5 family.

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

### Upgrade from 1.x to 2.x (Foundry 14)

1. Back up every world.
2. Move to Foundry **14** with **dnd5e 5.3.3**.
3. Install **lib-wrapper 1.13.5.1** (or newer meeting the declared minimum).
4. Install SW5e **2.0.0** from the published release when available.
5. Run **dnd5e system migration**, then **SW5e module migration**.
6. Confirm character portraits, prototype tokens, scene tokens, and starship Hull/Shields after migration.

## Known limitations

- **Launcher compatibility** is a deferred known issue. Prefer a verified portable or harness install path for Foundry 14 validation and upgrades.
- Tech Recovery is not implemented.
- Review `CHANGELOG.md` for release-line details and deferred cleanup items.
