---
id: reminder-create
title: reminder_create
sidebar_label: reminder_create
sidebar_position: 2
---

:::warning Work in Progress This skill is currently under development and may change significantly.
:::

**Type**: Shared Skill  
**Scope**: All agents  
**Location**: `/skills/reminder_create/SKILL.md`

---

## Copy This Skill

<pre id="skill-content-reminder-create" style={{display: 'none'}}>{`---
name: reminder_create
description: Create scheduled reminders for agents to perform tasks
---

# Reminder Create

Creates a scheduled reminder for the agent to perform a task at a specific time or interval.

## Usage

Invoke with: /reminder_create [description] [at|in|every] [time]

## Examples

- /reminder_create Check server logs every day at 9am
- /reminder_create Review pull requests in 2 hours
- /reminder_create Send weekly report every Friday at 4pm

## Parameters

| Parameter | Description | Required |
|-----------|-------------|----------|
| description | What the agent should do when reminded | Yes |
| time | When to trigger (absolute or relative) | Yes |

## Time Formats

- Absolute: 9am, 14:30, tomorrow at noon
- Relative: in 30 minutes, in 2 hours, in 3 days
- Recurring: every day, every Monday, every 2 hours

## Output

✅ Reminder created: "Check server logs"
   Schedule: Every day at 09:00
   Next occurrence: Tomorrow at 09:00 AM

## Notes

- Reminders are stored in the agent's workspace
- The agent will receive a heartbeat notification at the scheduled time
- Recurring reminders continue until cancelled with /reminder_cancel
`}</pre>

<div style={{position: 'relative'}}>
  <button
    id="copy-btn-reminder-create"
    onClick={() => {
      const content = document.getElementById('skill-content-reminder-create').textContent;
      navigator.clipboard.writeText(content);
      const btn = document.getElementById('copy-btn-reminder-create');
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
name: reminder_create
description: Create scheduled reminders for agents to perform tasks
---

# Reminder Create

Creates a scheduled reminder for the agent to perform a task at a specific time or interval.

## Usage

Invoke with: /reminder_create [description] [at|in|every] [time]

## Examples

- /reminder_create Check server logs every day at 9am
- /reminder_create Review pull requests in 2 hours
- /reminder_create Send weekly report every Friday at 4pm

## Parameters

| Parameter   | Description                            | Required |
| ----------- | -------------------------------------- | -------- |
| description | What the agent should do when reminded | Yes      |
| time        | When to trigger (absolute or relative) | Yes      |

## Time Formats

- Absolute: 9am, 14:30, tomorrow at noon
- Relative: in 30 minutes, in 2 hours, in 3 days
- Recurring: every day, every Monday, every 2 hours

## Output

✅ Reminder created: "Check server logs" Schedule: Every day at 09:00 Next occurrence: Tomorrow at
09:00 AM

## Notes

- Reminders are stored in the agent's workspace
- The agent will receive a heartbeat notification at the scheduled time
- Recurring reminders continue until cancelled with /reminder_cancel `}</code></pre>
    </div>

    </details>
  </div>

---

## Description

Creates a scheduled reminder for the agent to perform a task at a specific time or interval.

## Usage

```
/reminder_create [description] [at|in|every] [time]
```

## Examples

```
/reminder_create Check server logs every day at 9am
/reminder_create Review pull requests in 2 hours
/reminder_create Send weekly report every Friday at 4pm
/reminder_create Follow up with team about blockers tomorrow morning
```

## Parameters

| Parameter     | Description                            | Required |
| ------------- | -------------------------------------- | -------- |
| `description` | What the agent should do when reminded | Yes      |
| `time`        | When to trigger (absolute or relative) | Yes      |

## Time Formats

- **Absolute**: `9am`, `14:30`, `tomorrow at noon`
- **Relative**: `in 30 minutes`, `in 2 hours`, `in 3 days`
- **Recurring**: `every day`, `every Monday`, `every 2 hours`

## Output

```
✅ Reminder created: "Check server logs"
   Schedule: Every day at 09:00
   Next occurrence: Tomorrow at 09:00 AM
```

## Notes

- Reminders are stored in the agent's workspace
- The agent will receive a heartbeat notification at the scheduled time
- Recurring reminders continue until cancelled with `/reminder_cancel`
