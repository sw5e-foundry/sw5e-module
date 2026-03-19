---
name: legacy-feature-trace
description: Compare legacy SW5e V11 behavior to the current module structure. Use when asking whether the old system already did something, where a feature used to live, what legacy logic is worth preserving, or how to safely adapt old behavior into the modern module.
---

# Legacy Feature Trace

## Purpose

Use this skill to trace a feature across the legacy SW5e V11 system and the current module, then recommend the smallest safe modern path.

Legacy files are reference-only. Do not mass-copy old code.

## When To Use

Apply this skill when the user asks things like:

- "Did the old system already do this?"
- "Where did this feature live before?"
- "What logic from the legacy system is worth preserving?"
- "How should this old behavior map into the current module?"

## Source Priority

When sources disagree, prefer them in this order:

1. Target runtime compatibility
2. Current repo conventions
3. Legacy V11 behavior
4. SW5E docs for rules intent and terminology

If the legacy system and current module disagree, explain the difference before recommending code changes.

## Workflow

1. Define the feature in plain English.
   Capture the user-facing behavior, not just a filename or symbol.

2. Search the current module first.
   Identify the modern files, templates, models, hooks, sheets, or compendium structures that appear related.

3. Search the legacy SW5e V11 reference second.
   Find the old files, functions, templates, data shape, and UI logic tied to the feature.

4. Summarize the legacy behavior.
   Explain what the old system actually did, what data it depended on, and where the behavior lived.

5. Compare old and current structure.
   Map the old implementation area to the most likely modern equivalent.
   Note API, template, hook, or data-model differences that make direct porting unsafe.

6. Recommend the safest path.
   Prefer the smallest compatible adaptation that preserves intent without copying obsolete patterns.

7. Flag risk clearly.
   Warn when the old logic depends on version-specific Foundry or DnD5e behavior, deprecated sheet patterns, or incompatible data assumptions.

## What To Look For

When tracing a feature, gather as many of these as are relevant:

- Related scripts, classes, helpers, and hooks
- Related templates and partials
- Related localization keys
- Related compendium or JSON data
- Data fields the feature reads or writes
- User-visible behavior in sheets or chat output
- Version-sensitive Foundry or DnD5e APIs

## Response Format

Use this structure in the final answer:

### Legacy Trace

- Current location: where the feature appears to live now
- Legacy location: where the feature lived before
- Legacy behavior: plain-English summary of what the old system did
- Modern mapping: safest equivalent place to implement or preserve behavior
- Porting risk: low, medium, or high with a short explanation
- Confidence: low, medium, or high

### Source Labels

Label each major claim with one of:

- current repo
- legacy V11 system
- SW5E docs
- inferred reasoning

## Guardrails

- Do not assume legacy code is directly portable.
- Do not recommend large rewrites when a narrow adaptation will do.
- Use SW5E docs only to validate intent or terminology when the code alone is unclear.
- If you cannot find a modern equivalent, say so and suggest the most likely integration point instead of inventing certainty.
- If a claim depends on outdated APIs, call that out explicitly.

## Example Triggers

- Compare the old importer flow to the current import pipeline.
- Check whether the V11 sheet already supported this action.
- Trace how the old system handled this item property and whether the module still needs that behavior.
