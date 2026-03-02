---
id: memory-flush
title: memory_flush
sidebar_label: memory_flush
sidebar_position: 1
---

:::warning Work in Progress This skill is currently under development and may change significantly.
:::

**Type**: Shared Skill  
**Scope**: All agents  
**Location**: `/skills/memory_flush/SKILL.md`

---

## Copy This Skill

<pre id="skill-content-memory-flush" style={{display: 'none'}}>{`---
name: memory_flush
description: Clear the agent's working memory and context for a clean slate
---

# Memory Flush

Clear the agent's working memory and context, providing a clean slate for the next task or conversation.

## Usage

Invoke with: /memory_flush

## When to Use

- Starting a completely new task unrelated to previous work
- When the agent seems confused by accumulated context
- To reset after a long conversation thread
- Before switching to a different topic or project

## Behavior

When invoked, the agent will:

1. Acknowledge the memory flush
2. Discard accumulated conversation context
3. Reset any temporary state from the current session
4. Confirm readiness for new instructions

## Output

🧠 Memory flushed. I'm ready for your next task.

## Notes

- This does not affect persistent data (tasks, files, long-term memory)
- Only clears the current conversation context window
- Useful for preventing context pollution between unrelated tasks
`}</pre>

<div style={{position: 'relative'}}>
  <button
    id="copy-btn-memory-flush"
    onClick={() => {
      const content = document.getElementById('skill-content-memory-flush').textContent;
      navigator.clipboard.writeText(content);
      const btn = document.getElementById('copy-btn-memory-flush');
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
name: memory_flush
description: Clear the agent's working memory and context for a clean slate
---

# Memory Flush

Clear the agent's working memory and context, providing a clean slate for the next task or
conversation.

## Usage

Invoke with: /memory_flush

## When to Use

- Starting a completely new task unrelated to previous work
- When the agent seems confused by accumulated context
- To reset after a long conversation thread
- Before switching to a different topic or project

## Behavior

When invoked, the agent will:

1. Acknowledge the memory flush
2. Discard accumulated conversation context
3. Reset any temporary state from the current session
4. Confirm readiness for new instructions

## Output

🧠 Memory flushed. I'm ready for your next task.

## Notes

- This does not affect persistent data (tasks, files, long-term memory)
- Only clears the current conversation context window
- Useful for preventing context pollution between unrelated tasks `}</code></pre>
    </div>

    </details>
  </div>

---

## Description

Clears the agent's working memory and context, providing a clean slate for the next task or
conversation.

## Usage

```
/memory_flush
```

## When to Use

- Starting a completely new task unrelated to previous work
- When the agent seems confused by accumulated context
- To reset after a long conversation thread
- Before switching to a different topic or project

## Behavior

When invoked, the agent will:

1. Acknowledge the memory flush
2. Discard accumulated conversation context
3. Reset any temporary state from the current session
4. Confirm readiness for new instructions

## Output

```
🧠 Memory flushed. I'm ready for your next task.
```

## Notes

- This does not affect persistent data (tasks, files, long-term memory)
- Only clears the current conversation context window
- Useful for preventing context pollution between unrelated tasks
