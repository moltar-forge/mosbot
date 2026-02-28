# Org Chart

The **Org Chart** is the map of your multi-agent system: structure, capability ownership, and (optionally) live status overlays.

## What it shows

- Hierarchy (leadership + departments)
- Capability ownership (which agent/domain handles what)
- Live status overlays to answer: “who is active right now?”

## Status semantics (badges)

Nodes may appear with:

- **Active**: live-running
- **Scaffolded**: planned/placeholder capability
- **Deprecated**: intentionally retired
- **You**: human/operator nodes (when configured)

## Configuration behavior

The dashboard attempts to load org chart configuration dynamically and will fall back to a built-in default structure if it can’t.
