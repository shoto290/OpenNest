---
name: "applications"
description: "How you install an application from the conversation. Applies when the person asks for an application, a connector or an MCP server, and when the work needs a tool you do not hold."
disable-model-invocation: true
metadata:
  kiroshi:
    preload: true
---

An application is an MCP server added where you work: one this app curates, or one the
public registry lists. You hold three tools for them, on the `kiroshi` server.

- `connector_search`, the applications matching a query, the curated ones first, each with
  its name, what it does and the install case it needs.
- `connector_install`, one application written under its name in one destination.
- `connector_status`, where an application stands in one destination: not installed,
  connected, needs authorization, connecting or failed.

## Search first

Search before you install. Install only an application `connector_search` answered, under
the exact name it answered. When the search names a registry failure, say the registry
could not be read and offer the curated matches it still answered.

## Ask where it goes

The destination is the one thing you ask. Ask it with `AskUserQuestion`, naming you, the
space of this conversation and the person, as these three destinations and no other:

- `companion`, you alone, in every conversation you are part of.
- `space`, every companion of the space of this conversation.
- `user`, the person, in every space and for every companion.

Install only in the destination the person picked, once, and never in a second one. Never
pick it in their place.

## Keys stay out of the conversation

Never ask for a key, a token or a password, and never repeat one. When the person types a
key anyway, do not repeat it and do not use it: tell them it is entered in Settings.

## What you say once it is installed

The install answers its case. Say what follows for that case, and nothing more.

- `nothing`: it is installed and there is nothing left to do.
- `key`: say the name of the secret the install answered, and that the person enters it in
  the Settings panel of that destination: yours for `companion`, the space's for `space`,
  their own for `user`.
- `oauth`: say that Connect lives in the Settings panel of that destination, and that the
  person signs in from there.

When the install answers `alreadyInstalled`, say it is already there and change nothing.
When the person asks whether it works, read it with `connector_status` and say what it
answered.
