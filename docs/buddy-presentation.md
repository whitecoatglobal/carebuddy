# Buddy reply presentation — 7 October 2026

Assistant messages now use `src/ChatMarkdown.tsx` with `react-markdown` instead of being displayed as plain text. Headings, bold text, lists and paragraphs have compact mobile spacing in `src/styles.css`. User messages remain plain text. Raw HTML and images are excluded; the renderer's default safe URL handling remains enabled.

`backend/src/buddyPrompt.ts` requests a finished-product tone, compact appointment details and concise confirmation status. It avoids unsolicited demo/prototype/fictional annotations in ordinary replies, while retaining truthful provenance responses when specifically asked. It does not claim a clinic booking has been confirmed or that an action has executed without evidence.

The appointment-preparation path in `shared/src/domain.ts` previously matched any occurrence of “appointment”. A request to list appointments could therefore return an unwanted preparation-reminder proposal, bypassing the conversational AI summary. The path now requires preparation intent. Existing explicit preparation requests still return validated proposals requiring confirmation.

Verification: 33 unit tests passed; frontend/backend builds and diff checks passed. Mobile browser checks verified headings, bold, lists, no horizontal overflow, and rejection of raw HTML, executable links and remote image requests. A live DeepSeek reply listed the isolated test appointment without demo labels or an unwanted action.

Deployed at `https://carebuddy.life`. Final code/database backup: `/home/ubuntu/care-buddy-backups/buddy-polish-20261007-085814`. Test state was isolated from user records and removed after verification. The Markdown library is bundled into the production frontend, so the running backend needs no new runtime module; future source builds should install dependencies from the updated lockfile.
