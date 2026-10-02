# Care Buddy: hackathon fit and WorkBuddy requirements

Checked 30 September 2026. Separate friends’ project. Requirements below distinguish organizer statements, product choices, working local behavior and unverified runtime integration.

## The decision that matters

Care Buddy’s current strengths are routine organisation, family coordination, appointment preparation and plan explanation. It fits **Healthcare Challenge 2: AI Healthier Every Day — Intelligent Support for Long-Term Self-Care** more directly than the previously selected **Challenge 1: AI Grandma Knows Best — Intelligent Self-Triage and Care Navigation**. This is an assessment of product fit, not a change to team registration. Challenge 1 remains selected until the team decides otherwise. An attractive PWA and more skill files will not close the symptom-assessment gap.

The app does not assess symptoms, recommend urgency or select a clinical destination. Do not invent rules to fill that gap. For Challenge 1, obtain the full partner problem statement, an approved clinical routing source and domain review, then evaluate actual outcomes. Until then, describe the product as care organisation and routine navigation. No claim of improved winning odds is supported by the evidence.

## Triangulated sources

| Source | Verified content | Boundary |
| --- | --- | --- |
| [Tencent organizer event page](https://luma.com/26fqf3hy) | Both exact healthcare challenges; practical agentic applications using Tencent products; submission date 16 October; demo day 3 November | Does not give a mandatory skill count, a required list of skills, detailed healthcare acceptance criteria or scoring weights |
| [Organizer-linked submission form](https://docs.google.com/forms/d/e/1FAIpQLScr54QzuASZyUPhYYGwZ3tQ1DpU4_FEAIPsVATDrMv4I4fYbw/viewform) | First section observed by independent read-only browser review: deadline 16 October 2026, 23:59 GMT+8; team/captain/contact/track/exact-challenge fields; public storage links allowed for large project files | Later pages require identity fields before access; no data entered or submission made; later deliverable fields unverified |
| [Tencent WorkBuddy Skills](https://cloud.tencent.com/document/product/1831/134432) | Local package upload and skill invocation; skills can execute workflows/tools within granted scope | Import is not proof that this PWA is connected, nor proof of execution |
| [WorkBuddy Open Platform Skill guide](https://open.workbuddy.cn/en/docs/skill) | SKILL.md + optional scripts/references/templates; required description, description_zh, description_en, version, author | Publishing-path metadata requirements; exact installed client import remains untested |
| [WorkBuddy connector guide](https://open.workbuddy.cn/docs/connector) | MCP + Skill recommended for network APIs; stdio supported for local processes; remote HTTPS/SSE or Streamable HTTP; clear schemas/errors and authorization | A connector must actually be implemented, configured and tested before claiming live integration |
| [WorkBuddy Open API](https://open.workbuddy.cn/en/docs/openapi) | OAuth 2.1 app authorization; third-party app/developer registration and credentials are prerequisites | No registration, secrets or live API calls performed |
| Supplied Care Buddy v1.1 PDF + current app | Product flows and action contracts, validated fictional local state | PDF requirements do not prove working features; current request overrides repeated demo chrome |

Documentation conflict: the [beginner custom-skill example](https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Practice-Cases/Create-Skills) describes skill.yml. The current Open Platform guide specifies SKILL.md. Packages follow the latter; no undocumented skill.yml schema was invented. Test the actual target client before submission.

## What skills this product needs

These are architecture recommendations inferred from the app and official capabilities, **not an organizer-mandated checklist**.

| Capability | Inputs and outcome | Delivered status |
| --- | --- | --- |
| Appointment preparation | Current person, appointment ID, current checklist, explicit reminder time before appointment; propose a linked reminder; reuse existing active preparation | Existing package updated; local scripts tested; browser checks duplicates and confirmation |
| Requested reminder changes | Reminder ID, person, explicit requested time, occurrence/future scope; preserve medication instructions, reject recorded/view-only/stale sources | Existing package updated; local scripts tested; source snapshots and idempotent action IDs enforced |
| Evidence-grounded benefit explanation | Requested service/category and selected person; source, conditions, policy date and uncertainty; never invent allowances or eligibility | Existing package updated; local scripts tested; app chooses requested category instead of first-row fallback |
| Current-context read and day organisation | Read selected person’s current records and reference time; count only actual reports; order upcoming items by time | App state-driven summary and Settings export implemented; a live WorkBuddy read connector remains unimplemented |
| Safe care navigation | Clarify purpose, retain explicit confirmation, explain limits and provide routine-access preview | Local guardrails implemented; clinical self-triage and evaluated clinical routing remain absent |

Three product packages are sufficient for the current bounded capabilities. Adding arbitrary skills is not evidence of agentic execution. The strongest next proof is one complete WorkBuddy run against current context: correct skill selection → source-labelled proposal → PWA confirmation → actual local change → receipt → retry/duplicate/stale refusal.

## Working local roundtrip

1. In Settings open **WorkBuddy handoff** and **Export skill context**. The JSON contains fictional browser records, selected profile, reference time and a fresh action ID.
2. In an extracted appointment/reminder skill, supply the exact source ID and explicit scheduledAt. Reminder changes also require scope and userRequestedTime:true. Ask WorkBuddy to use the installed skill, or run the script locally for a deterministic package check.
3. Save its JSON proposal. It must retain status:proposal, executed:false, the current expectedClock and source snapshots in action.expectedSources.
4. In Settings use **Import reminder proposal**. The app validates the supported command, current recipient/access/source, clock, recurrence scope and duplicate action ID. It previews the change without saving.
5. Confirm in the PWA. Only then does local execution produce a Saved receipt. Cancel makes no change; stale/invalid proposals are refused; save failure keeps input for retry.

The browser test performs this roundtrip using the actual reminder-package script. It proves local export/package/import/confirmation behavior. **It does not prove that WorkBuddy imported or executed the package.** Benefit explanations are informational; they are not imported as mutations. Live AI, backend, booking and deployment remain separate.

## What to capture before claiming live WorkBuddy

Record exact client/version, successful package import, intended skill selection for unfamiliar wording, tool execution, source IDs, proposal and PWA confirmation/receipt. Test view-only access, different recipients, stale context, cancellation, retry and repeated requests. For network integration, implement an authenticated connector with read/propose tools and a PWA-owned confirmation boundary. Keep credentials outside browser code.

No healthcare scoring rubric or later submission fields were verified. Reopen the organizer’s full challenge pack and submission form with the team’s actual information before calling the project submission-ready.
