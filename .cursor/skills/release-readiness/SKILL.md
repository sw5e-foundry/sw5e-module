---
name: release-readiness
description: Review a change before committing or packaging it. Summarizes changed files, notes compatibility assumptions, flags risky edits, drafts plain-English release notes, and reports whether the change depends on legacy reference material or SW5E rules-doc interpretation. Use before commits, release prep, packaging, or when the user asks whether a change is ready for Foundry V13 and DnD5e 5.2.5.
---

# Release Readiness

## Purpose

Use this skill before committing, packaging, or handing off a change.

The goal is to produce a short release-readiness report that explains what changed, what assumptions the change makes, what looks risky, and what still needs verification in Foundry V13 and DnD5e 5.2.5.

## When To Use

Apply this skill for requests like:

- "Is this ready to commit?"
- "Give me release notes for this change."
- "What changed and what still needs testing?"
- "Before I package this, what looks risky?"
- "Summarize this branch for release."

## Source Priority

When sources disagree, prefer them in this order:

1. Target runtime compatibility
2. Current repo conventions
3. Legacy behavior only as reference
4. SW5E docs for rules intent and terminology

If a change depends on legacy code or rules-doc interpretation, say so directly instead of implying the behavior is fully confirmed.

## Workflow

1. Identify the exact change set.
   Review the files changed for the current task, commit, or branch under discussion.

2. Summarize changed files in plain English.
   Group files by purpose when useful:
   - scripts or logic
   - templates or UI
   - localization
   - compendium or content data
   - styles or assets
   - config or packaging files

3. Note compatibility assumptions.
   Call out any assumption tied to:
   - Foundry V13 APIs or hooks
   - DnD5e 5.2.5 data shape or sheet behavior
   - current repo patterns that were treated as the modern standard
   - migration gaps where behavior is not fully verified yet

4. Flag risky edits.
   Mark edits as higher risk when they touch:
   - Foundry or DnD5e integration points
   - actor or item data models
   - sheet rendering, templates, or event wiring
   - compendium generation or migration-sensitive data
   - broad search-and-replace changes
   - behavior adapted from legacy V11 patterns

5. State the implementation basis.
   Report whether the change was based on:
   - current repo patterns
   - legacy V11 reference
   - SW5E rules-doc interpretation
   - inferred reasoning

6. Separate confidence from verification.
   A change can look reasonable in code and still need runtime verification.
   Always list what still needs confirmation in Foundry V13 / DnD5e 5.2.5.

7. Draft release notes in plain English.
   Write short user-facing notes focused on outcome, not internal file churn.

## What To Look For

When preparing the report, gather only the details needed to judge release readiness:

- Which user-visible behaviors changed
- Which files or artifact types were touched
- Whether the change introduces compatibility assumptions
- Whether the logic was adapted from legacy reference material
- Whether rules-doc interpretation influenced labels, behavior, or terminology
- Whether the change lacks live verification in Foundry V13 / DnD5e 5.2.5

## Response Format

Use this structure in the final answer:

### Release Readiness

- Change summary: plain-English overview of what changed
- Changed files: short grouped summary of the touched files and their roles
- Compatibility assumptions: runtime, API, sheet, data-model, or repo-pattern assumptions
- Risk level: low, medium, or high with a short explanation
- Risky edits: the specific changes most likely to cause regressions
- Based on legacy reference: yes, no, or partial with a short explanation
- Based on rules-doc interpretation: yes, no, or partial with a short explanation
- Still needs verification: exact checks still needed in Foundry V13 / DnD5e 5.2.5
- Confidence: low, medium, or high

### Release Notes Draft

- Write 2-5 bullets in plain English
- Focus on user-facing outcomes or maintainer-relevant behavior changes
- Avoid internal implementation jargon unless it matters for release risk

### Source Labels

Label each major claim with one of:

- current repo
- legacy V11 system
- SW5E docs
- inferred reasoning

## Guardrails

- Do not treat "changed files" as "safe files." Small edits in integration points can be high risk.
- Do not assume legacy-derived behavior is correct for modern Foundry or DnD5e.
- Do not assume rules-doc intent is already implemented correctly just because the wording looks right.
- Do not write release notes as a raw diff summary; translate the change into plain English.
- If runtime verification was not performed, say so clearly.
- If the change touches version-sensitive APIs or data structures, explicitly call that out.

## Example Triggers

- Review this change before I commit it.
- Draft release notes for these edits.
- Tell me what still needs testing before packaging.
- Summarize this branch and flag anything risky for Foundry V13.
