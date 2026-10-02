---
title: Topic Name
covers:
  - path/to/module
touchpoints: []
updated: YYYY-MM-DD
---

# Topic Name

## Overview

What is implemented today and where it lives.

## Components

| Path | Responsibility |
| --- | --- |
| `path/to/module` | ... |

## Data and Control Flow

How requests, data, or events move through the components.

## Configuration

Settings, environment variables, and defaults that affect this topic.

## Upstream Touchpoints

Upstream-owned files this topic edits. Each is a potential conflict on an upstream sync, and each must also be listed in the `touchpoints` front matter. Write "None." when every change is in net-new files.

| Upstream file | Edit | Why it could not be a net-new file |
| --- | --- | --- |
| `path/to/upstream-file` | ... | ... |

## Upstream Dependencies

Upstream exports, interfaces, and behaviors this topic relies on. Re-check each on an upstream sync.

| Upstream path | Relied on for |
| --- | --- |
| `path/to/upstream-module` | ... |

## Divergences from Design

Where the implementation differs from [the design](../design/topic-name.md). Write "None." when it matches.

## Open Questions

- None.
