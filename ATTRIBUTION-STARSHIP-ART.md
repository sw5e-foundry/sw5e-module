# Starship Art Attribution

**Last updated:** 2026-06-24

## Bundled starship artwork

Drake's Shipyard and related starship actor/token images under `icons/packs/Starship/` are **bundled module assets** shipped with `sw5e-module`. Sheet portraits restored in Phase 1 (2026-06-24) reference existing local `*.Token.webp` files already used for prototype tokens.

## Provenance

- Starship token and avatar WebP files in `icons/packs/Starship/` were carried forward from the legacy SW5E Foundry system release artifacts into this module's asset tree.
- **Maintainers should confirm and document original art sources, creators, and license terms** before treating this artwork as fully cleared for redistribution beyond the module's existing distribution model.
- This file does **not** assert third-party copyright clearance. It records that restoration uses **only local bundled paths**, not re-hosted external URLs.

## What is not restored

The following external portrait hotlinks are **intentionally not** used in compendium source data:

- Fandom / Wikia (`static.wikia.nocookie.net`, etc.)
- imgur and other third-party image hosts
- ArtStation hotlinks

Phase 1 restoration wires blank or imgur `img` fields to local `modules/sw5e-module/icons/packs/Starship/{slug}.Token.webp` when that file exists in the repository.

## Related attribution

- HGTTG species art: see `ATTRIBUTION-HGTTG-ART.md`
- Game icon SVGs (legacy system): see upstream `static/icons/LICENSE` in the `sw5e` repository

## Maintainer follow-up

- [ ] Confirm starship art provenance and add credited sources where known
- [ ] Add dedicated `*.Avatar.webp` portraits where distinct sheet art is available and approved
