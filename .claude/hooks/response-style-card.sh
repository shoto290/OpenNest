#!/bin/sh
if [ "${SHOTO_RESPONSE_STYLE_CARD:-}" = "0" ]; then
  exit 0
fi

event="${1:-UserPromptSubmit}"

card='[response-style] ANSWER CONTRACT (core:response-style).\n1. Line 1 = verdict: DONE / BLOCKED / FAILED + one clause + counts when the tree was touched (6 files, 0 broken). No preamble. BLOCKED/FAILED is never softened; the decision and your leaning go on line 2.\n2. Work reported = a visual, shape picked by the payload, never two carrying the same data; the broken or deferred item goes inside it. Changed files -> fenced diff block, one line per file: glyph + ~ -, path, then 4 words max, 12 entries max. Shared attributes -> table. Sequence -> A -> B -> C. Question / handback / chat -> verdict line only.\n3. CANVAS: a mermaid flowchart only when the connection IS the answer - the question was how parts relate, flow, or fail, or the change only makes sense as a new path through the system - AND 3+ nodes AND every arrow is sayable as A calls/gates/becomes B AND something branches or merges. A turn that merely delivers requested work is the diff block however real the imports are; in doubt, the list. TD only; LR only for a before/after subgraph pair.\n4. Count before sending, an over-wide graph renders at 5px type: 6 nodes max, 3 per row max. Labels quoted, parent/basename or symbol, 24 chars max - never a path, :line, or metric; those go on the delta line or in the table. Failing a check, delete the canvas, never shrink labels. Colors: only the classDef set of core:response-style.\n5. Budget: 8 lines simple, 15 with a visual - prose and table lines only, fenced blocks exempt and no diff block or table past 12 content lines. Numbers, not adjectives. Cut narration, Let me know if, apologies, next-step menus. Lifts on why / explain / in detail - then lead with the visual.\n6. A co-loaded contract adds CONTENT; this shape wins. operator-profile overrides tone, language, emoji ONLY - never the verdict or the visual.'

palette='[response-style] canvas palette - use only these classDef lines, never an invented color:\nclassDef add fill:#166534,stroke:#22c55e,color:#fff\nclassDef chg fill:#854d0e,stroke:#eab308,color:#fff\nclassDef del fill:#450a0a,stroke:#991b1b,color:#d4d4d4\nclassDef blocker fill:#b91c1c,stroke:#fca5a5,color:#fff,stroke-width:3px\nclassDef ctx fill:#27272a,stroke:#52525b,color:#a1a1aa'

if [ "$event" = "SessionStart" ]; then
  printf '%b\n' "$card\n$palette"
else
  printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$event" "$card"
fi
