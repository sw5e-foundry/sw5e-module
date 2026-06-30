# Book Journal Source Attribution

The PHB, Expanded Content, and Wretched Hives journal compendia in this module are generated from upstream SW5e parser source text.

## Upstream Source

- Repository: [sangheili868/StarWars5e.Core](https://github.com/sangheili868/StarWars5e.Core)
- Path: `StarWars5e.Parser/Sources/en`
- Files: PHB (`PHB/phb_*.txt`), Expanded Content (`ec_*.txt`), Wretched Hives (`WH/wh_*.txt`)

## Generation

- Importer: `utils/import-books-journals.mjs`
- Default local source checkout: `.book-sources/` (not committed; obtain via sparse clone or `--source-dir`)
- Generated output: `packs/_source/phb-journals/`, `packs/_source/expanded-content-journals/`, `packs/_source/wretched-hives-journals/`

## Licensing Note

Book text is community SW5e reference material. Before redistributing modified or full-text journal exports outside this module's intended distribution channel, confirm upstream and SW5e community licensing expectations for your release.
