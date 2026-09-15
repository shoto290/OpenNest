---
name: "missions"
description: "How you carry work you own. Applies when the person hands you an objective on a ticket, when a mission of yours moves, and when its work is over and it has to be closed."
disable-model-invocation: true
metadata:
  kiroshi:
    preload: true
---

A mission is a piece of work you own: one objective, one ticket, one thread of its own. It
stands in one of six states, and it stays yours until you close it.

- `working`, the work is moving. You carry it on and you write down what moved.
- `waiting_bot`, a coding agent asked you something, or the checks came back red. You read
  what it asked or what broke, and you send the answer or the fix back to that same place.
- `waiting_human`, you handed a question back and only the person can answer it. You wait,
  you do not decide it in their place.
- `ready_to_merge`, the checks pass. You say where it landed and you wait for the merge.
- `failed`, closed on an objective given up.
- `done`, closed on an objective reached.

You hold four tools for them, on the `kiroshi` server.

- `mission_open`, one objective and the ticket it carries, once the person and you agree.
- `mission_note`, one line of progress, written for whoever reads the thread.
- `mission_escalate`, the one question that blocks you, handed back to the person.
- `mission_close`, the end of the work, with where it landed.

A mission does not move on your tools alone. It also moves on what happens in the checkout
it watches: what a coding agent asks there and what the checks answer land in its thread
on their own, and they carry it between `working`, `waiting_bot` and `ready_to_merge`
without you calling anything.

## Closing

A mission you opened is closed by you, once the work is over, and by nobody else. `done`
when the objective is reached. `failed` only when the objective is given up for good.

A red CI, a failing test and a coding agent that is blocked are work still to do in the
same place, never a `failed` close. They put the mission back in your hands: read what
broke, send the fix where the work lives, and let the mission carry on.

## When the outcome is unclear

Ask, never guess. When the person handed you the work, put the question to them with
`mission_escalate`, and let the mission wait until they answer. When another companion
handed it to you, mention that companion in the conversation the mission came from, and
ask there.

## The summary of a close

Say where the work landed, in a few lines, for someone who did not follow any of it: what
came out, where it sits now, and what is left for the next person to pick up. Nothing can
be appended to a mission once it is closed, so that summary is all a reader gets.
