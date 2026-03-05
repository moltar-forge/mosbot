---
id: task-pickup
title: task_pickup
sidebar_label: task_pickup
sidebar_position: 6
---

:::warning Work in Progress This skill is currently under development and may change significantly.
:::

**Type**: Agent-Specific Skill  
**Scope**: All specialized agents (Developer, Designer, QA, etc.)  
**Location**: `/workspace-<agent-id>/skills/task_pickup/SKILL.md`

---

## Copy This Skill

<pre id="skill-content-task-pickup" style={{display: 'none'}}>{`---
name: task_pickup
description: Help agents select the next task based on priority and workload
---

# Task Pickup

Helps agents select the next task to work on based on priority, dependencies, their skills, and current workload.

## Usage

Invoke with: /task_pickup

Or with filters:

/task_pickup --priority high --type bugfix
/task_pickup --project api-gateway

## Behavior

When invoked, the agent will:

1. Query available tasks assigned to or suitable for this agent
2. Check current workload and WIP limits
3. Evaluate task dependencies (skip blocked tasks)
4. Consider task priority and due dates
5. Present the best options with rationale

## Output

## Recommended Tasks

### 🎯 Top Pick: TASK-789 - Fix authentication bug
Why: Critical priority, all dependencies cleared, matches your expertise
Estimated: 2 hours
Due: Tomorrow

### Alternative Options:

2. TASK-790 - Update API documentation (Medium, ~3 hours)
3. TASK-791 - Refactor user service (Low, ~5 hours)

Your current WIP: 2 tasks (limit: 3)

## Options

| Option | Description |
|--------|-------------|
| --priority <level> | Filter by priority (critical, high, medium, low) |
| --type <type> | Filter by task type (feature, bugfix, chore, docs) |
| --project <name> | Filter by project |
| --sprint <id> | Show tasks from specific sprint |
| --auto-assign | Automatically assign the top pick to yourself |

## Example Commands

/task_pickup --priority high --auto-assign
/task_pickup --project mobile-app --type feature
/task_pickup --sprint sprint-24

## Notes

- Respects WIP limits - warns if you're at capacity
- Considers task dependencies and blocks
- Takes into account the agent's historical performance on similar tasks
- Can be invoked automatically during agent heartbeat if no active tasks
`}</pre>

<div style={{position: 'relative'}}>
  <button
    id="copy-btn-task-pickup"
    onClick={() => {
      const content = document.getElementById('skill-content-task-pickup').textContent;
      navigator.clipboard.writeText(content);
      const btn = document.getElementById('copy-btn-task-pickup');
      btn.textContent = '✅';
      setTimeout(() => { btn.textContent = '📋'; }, 2000);
    }}
    style={{
      position: 'absolute',
      top: '8px',
      right: '8px',
      zIndex: 10,
      background: 'var(--ifm-color-primary)',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      padding: '2px 8px',
      fontSize: '16px',
      cursor: 'pointer',
      lineHeight: '1.6',
      title: 'Copy SKILL.md',
    }}
  >📋</button>

  <details>
  <summary style={{cursor: 'pointer', userSelect: 'none', paddingRight: '140px'}}>📋 Click to view SKILL.md content</summary>

  <div style={{marginTop: '1rem'}}>
    <pre style={{margin: 0, padding: '1rem', background: 'var(--ifm-code-background)'}}><code style={{whiteSpace: 'pre-wrap'}}>{`---
name: task_pickup
description: Help agents select the next task based on priority and workload
---

# Task Pickup

Helps agents select the next task to work on based on priority, dependencies, their skills, and
current workload.

## Usage

Invoke with: /task_pickup

Or with filters:

/task_pickup --priority high --type bugfix /task_pickup --project api-gateway

## Behavior

When invoked, the agent will:

1. Query available tasks assigned to or suitable for this agent
2. Check current workload and WIP limits
3. Evaluate task dependencies (skip blocked tasks)
4. Consider task priority and due dates
5. Present the best options with rationale

## Output

## Recommended Tasks

### 🎯 Top Pick: TASK-789 - Fix authentication bug

Why: Critical priority, all dependencies cleared, matches your expertise Estimated: 2 hours Due:
Tomorrow

### Alternative Options

2. TASK-790 - Update API documentation (Medium, ~3 hours)
3. TASK-791 - Refactor user service (Low, ~5 hours)

Your current WIP: 2 tasks (limit: 3)

## Options

| Option             | Description                                        |
| ------------------ | -------------------------------------------------- |
| --priority <level> | Filter by priority (critical, high, medium, low)   |
| --type <type>      | Filter by task type (feature, bugfix, chore, docs) |
| --project <name>   | Filter by project                                  |
| --sprint <id>      | Show tasks from specific sprint                    |
| --auto-assign      | Automatically assign the top pick to yourself      |

## Example Commands

/task_pickup --priority high --auto-assign /task_pickup --project mobile-app --type feature
/task_pickup --sprint sprint-24

## Notes

- Respects WIP limits - warns if you're at capacity
- Considers task dependencies and blocks
- Takes into account the agent's historical performance on similar tasks
- Can be invoked automatically during agent heartbeat if no active tasks `}</code></pre>
    </div>

    </details>
  </div>

---

## Description

Helps agents select the next task to work on based on priority, dependencies, their skills, and
current workload.

## Usage

```
/task_pickup
```

Or with filters:

```
/task_pickup --priority high --type bugfix
/task_pickup --project api-gateway
```

## Behavior

When invoked, the agent will:

1. Query available tasks assigned to or suitable for this agent
2. Check current workload and WIP limits
3. Evaluate task dependencies (skip blocked tasks)
4. Consider task priority and due dates
5. Present the best options with rationale

## Output

```markdown
## Recommended Tasks

### 🎯 Top Pick: TASK-789 - Fix authentication bug

**Why**: Critical priority, all dependencies cleared, matches your expertise **Estimated**: 2 hours
**Due**: Tomorrow

### Alternative Options:

2. **TASK-790** - Update API documentation (Medium, ~3 hours)
3. **TASK-791** - Refactor user service (Low, ~5 hours)

**Your current WIP**: 2 tasks (limit: 3)
```

## Options

| Option               | Description                                        |
| -------------------- | -------------------------------------------------- |
| `--priority <level>` | Filter by priority (critical, high, medium, low)   |
| `--type <type>`      | Filter by task type (feature, bugfix, chore, docs) |
| `--project <name>`   | Filter by project                                  |
| `--sprint <id>`      | Show tasks from specific sprint                    |
| `--auto-assign`      | Automatically assign the top pick to yourself      |

## Example Commands

```
/task_pickup --priority high --auto-assign
/task_pickup --project mobile-app --type feature
/task_pickup --sprint sprint-24
```

## Notes

- Respects WIP limits - warns if you're at capacity
- Considers task dependencies and blocks
- Takes into account the agent's historical performance on similar tasks
- Can be invoked automatically during agent heartbeat if no active tasks
