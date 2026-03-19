---
name: rules-reference-check
description: Check SW5E PDF rules intent without overusing the docs. Use when the user asks what the intended SW5E rule behavior is, whether an item/class/power/archetype/species should work a certain way, or whether current code matches rules intent.
---

# Rules Reference Check

## Purpose

Use this skill when the answer depends on SW5E rules intent, not just current code behavior.

The goal is to consult the SW5E docs only when needed, pull the minimum rule concept, and translate it into implementation guidance without bloating the prompt.

## When To Use

Apply this skill for questions like:

- "What is the intended SW5E rule behavior here?"
- "Does this item work the way the current code implies?"
- "Should this class feature or power behave like this?"
- "Is this species/archetype behavior a rules requirement or just a code choice?"

Do not use this skill when repo code, Foundry compatibility, or current module conventions already answer the question well enough.

## Source Priority

When sources disagree, prefer them in this order:

1. Target runtime compatibility
2. Current repo conventions
3. Legacy behavior only as reference
4. SW5E docs for rules intent and terminology

Use the PDFs to clarify intent, not to override runtime constraints.

If the current module and the PDFs differ, explain whether the gap looks like:

- a bug
- a simplification
- a migration gap
- an intentional implementation choice

## Workflow

1. Define the question in plain English.
   Reduce it to the smallest rules concept involved.

2. Check the current repo first.
   Identify the current data fields, UI behavior, labels, or automation that appear relevant.

3. Decide whether the PDFs are actually needed.
   Only consult them if the code is ambiguous, the user asks about intended rules behavior, or terminology needs validation.

4. Identify the most relevant PDF.
   Pick the narrowest source that matches the concept:
   - class or archetype questions -> class docs
   - species questions -> species docs
   - power questions -> power docs
   - equipment or item behavior -> equipment or item docs
   - general terminology or subsystem behavior -> the closest general rules source

5. Pull only the minimum concept needed.
   Do not quote long passages. Extract only the short rule idea needed to answer the question.

6. Summarize the rule in plain English.
   Explain what the rule is trying to do from a player-facing perspective.

7. Separate intent from implementation.
   Distinguish:
   - rules intent: what the SW5E rule appears to require
   - implementation choice: how the current module represents or simplifies that rule

8. Map the rule to code-facing implications.
   Suggest the likely data fields, validations, labels, or UI behavior that may need to reflect the rule.

9. Flag uncertainty.
   If the PDF language is broad or the current implementation target is unclear, say so instead of inventing certainty.

## What To Look For

When mapping rules intent into the module, gather only what is relevant:

- The specific feature, item, power, class feature, archetype, or species trait
- The current data fields that store the behavior
- The current sheet or UI elements that display it
- Whether the behavior is descriptive only or needs automation
- Whether Foundry or DnD5e compatibility limits the implementation
- Whether the current behavior appears intentional, simplified, or incomplete

## Response Format

Use this structure in the final answer:

### Rules Reference

- Relevant source: which PDF or doc type is most relevant
- Rule summary: plain-English summary of the minimum concept needed
- Rules intent: what the game rule appears to mean
- Current implementation: what the repo currently does
- Gap assessment: bug, simplification, migration gap, or intentional choice
- Likely data/UI impact: fields, labels, validation, display, or automation that may need to change
- Risk: low, medium, or high
- Confidence: low, medium, or high

### Source Labels

Label each major claim with one of:

- current repo
- SW5E docs
- legacy V11 system
- inferred reasoning

## Guardrails

- Do not open PDFs by default.
- Do not reproduce long rules text.
- Do not treat PDF wording as implementation instructions.
- Do not assume every rule needs automation; some rules only need correct wording or display.
- Always explain the difference between rules intent and current code behavior in plain English.
- If runtime compatibility or current repo patterns conflict with ideal rules modeling, say so explicitly.

## Example Triggers

- Check whether this power's duration behavior matches the SW5E rules.
- Verify whether this archetype feature should alter the sheet UI or just its description.
- Confirm whether this item property is a rules requirement or a legacy implementation detail.
