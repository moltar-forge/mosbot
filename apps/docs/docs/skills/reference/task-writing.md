---
id: task-writing
title: task_writing
sidebar_label: task_writing
sidebar_position: 5
---

:::warning Work in Progress This skill is currently under development and may change significantly.
:::

**Type**: Agent-Specific Skill  
**Scope**: Project Manager agent  
**Location**: `/workspace-pm/skills/task_writing/SKILL.md`

---

## Copy This Skill

<pre id="skill-content-task-writing" style={{display: 'none'}}>{`---
name: task_writing
description: Create well-structured, actionable tasks from descriptions
---

# Task Writing

Creates well-structured, actionable tasks from vague descriptions, meetings, or PRD requirements.

## Usage

Invoke with: /task_writing [description or context]

## Examples

/task_writing From the sprint planning meeting:
- Need to update the login page
- Fix the API rate limiting issue
- Add export functionality to reports

/task_writing Extract tasks from PRD-123

/task_writing Break down: "Implement user dashboard with analytics"

## Task Structure

Each generated task includes:

- Title: Clear, actionable title
- Description: Detailed explanation with context
- Acceptance Criteria: Checklist of what "done" means
- Estimated Effort: Story points or time estimate
- Dependencies: Links to related tasks
- Assignee Suggestion: Recommended agent/role

## Output

## Created Tasks

### TASK-456: Update Login Page UI
Priority: High | Effort: 3 points

Update the login page to match the new design system.

Acceptance Criteria:
- [ ] Implement new color scheme
- [ ] Add company logo
- [ ] Update form validation messages
- [ ] Mobile responsive

Depends on: TASK-123 (design mockups)
Suggested Assignee: Frontend Developer

---

### TASK-457: Implement API Rate Limiting
Priority: Critical | Effort: 5 points

Add rate limiting to prevent API abuse...

## Options

- --from-meeting [meeting notes] - Extract tasks from meeting notes
- --from-prd [prd-id] - Extract tasks from a PRD
- --break-down [epic-description] - Break down an epic into tasks
- --with-estimates - Include effort estimates
- --suggest-assignees - Suggest assignees based on task type

## Notes

- Tasks are automatically added to the task tracking system
- The PM agent considers team capacity when suggesting assignees
- Large features are broken down into manageable chunks (typically < 5 points)
`}</pre>

<div style={{position: 'relative'}}>
  <button
    id="copy-btn-task-writing"
    onClick={() => {
      const content = document.getElementById('skill-content-task-writing').textContent;
      navigator.clipboard.writeText(content);
      const btn = document.getElementById('copy-btn-task-writing');
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
name: task_writing
description: Create well-structured, actionable tasks from descriptions
---

# Task Writing

Creates well-structured, actionable tasks from vague descriptions, meetings, or PRD requirements.

## Usage

Invoke with: /task_writing [description or context]

## Examples

/task_writing From the sprint planning meeting:

- Need to update the login page
- Fix the API rate limiting issue
- Add export functionality to reports

/task_writing Extract tasks from PRD-123

/task_writing Break down: "Implement user dashboard with analytics"

## Task Structure

Each generated task includes:

- Title: Clear, actionable title
- Description: Detailed explanation with context
- Acceptance Criteria: Checklist of what "done" means
- Estimated Effort: Story points or time estimate
- Dependencies: Links to related tasks
- Assignee Suggestion: Recommended agent/role

## Output

## Created Tasks

### TASK-456: Update Login Page UI

Priority: High | Effort: 3 points

Update the login page to match the new design system.

Acceptance Criteria:

- [ ] Implement new color scheme
- [ ] Add company logo
- [ ] Update form validation messages
- [ ] Mobile responsive

Depends on: TASK-123 (design mockups) Suggested Assignee: Frontend Developer

---

### TASK-457: Implement API Rate Limiting

Priority: Critical | Effort: 5 points

Add rate limiting to prevent API abuse...

## Options

- --from-meeting [meeting notes] - Extract tasks from meeting notes
- --from-prd [prd-id] - Extract tasks from a PRD
- --break-down [epic-description] - Break down an epic into tasks
- --with-estimates - Include effort estimates
- --suggest-assignees - Suggest assignees based on task type

## Notes

- Tasks are automatically added to the task tracking system
- The PM agent considers team capacity when suggesting assignees
- Large features are broken down into manageable chunks (typically < 5 points) `}</code></pre>
    </div>

    </details>
  </div>

---

## Description

Creates well-structured, actionable tasks from vague descriptions, meetings, or PRD requirements.

## Usage

```text
/task_writing [description or context]
```

## Examples

```text
/task_writing From the sprint planning meeting:
- Need to update the login page
- Fix the API rate limiting issue
- Add export functionality to reports

/task_writing Extract tasks from PRD-123

/task_writing Break down: "Implement user dashboard with analytics"
```

## Task Structure

Each generated task includes:

- **Title**: Clear, actionable title
- **Description**: Detailed explanation with context
- **Acceptance Criteria**: Checklist of what "done" means
- **Estimated Effort**: Story points or time estimate
- **Dependencies**: Links to related tasks
- **Assignee Suggestion**: Recommended agent/role

## Output

```markdown
## Created Tasks

### TASK-456: Update Login Page UI

**Priority**: High | **Effort**: 3 points

Update the login page to match the new design system.

**Acceptance Criteria**:

- [ ] Implement new color scheme
- [ ] Add company logo
- [ ] Update form validation messages
- [ ] Mobile responsive

**Depends on**: TASK-123 (design mockups) **Suggested Assignee**: Frontend Developer

---

### TASK-457: Implement API Rate Limiting

**Priority**: Critical | **Effort**: 5 points

Add rate limiting to prevent API abuse...
```

## Options

```text
/task_writing --from-meeting [meeting notes]
/task_writing --from-prd [prd-id]
/task_writing --break-down [epic-description]
/task_writing --with-estimates
/task_writing --suggest-assignees
```

## Notes

- Tasks are automatically added to the task tracking system
- The PM agent considers team capacity when suggesting assignees
- Large features are broken down into manageable chunks (typically < 5 points)
