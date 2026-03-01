---
id: create-prd
title: create_prd
sidebar_label: create_prd
sidebar_position: 4
---

# create_prd

:::warning WIP - Work in Progress This skill is currently under development and may change
significantly. :::

**Type**: Agent-Specific Skill  
**Scope**: Product Manager agent  
**Location**: `/workspace-pm/skills/create_prd/SKILL.md`

---

## Copy This Skill

<pre id="skill-content-create-prd" style={{display: 'none'}}>{`---
name: create_prd
description: Create a comprehensive Product Requirements Document
---

# Create PRD

Creates a comprehensive Product Requirements Document (PRD) based on a feature description, user needs, and business goals.

## Usage

Invoke with: /create_prd [feature-name]

Or with initial context:

/create_prd User Authentication System

We need to allow users to sign up with email, Google, and GitHub.
Must include 2FA support and password recovery.

## PRD Structure

The generated PRD includes:

1. Overview
   - Feature summary
   - Goals and objectives
   - Success metrics

2. User Stories
   - Primary user personas
   - Key user stories (As a [user], I want [goal], so that [benefit])
   - Acceptance criteria

3. Requirements
   - Functional requirements
   - Non-functional requirements (performance, security, scalability)
   - Technical constraints

4. Design Considerations
   - UI/UX requirements
   - Accessibility needs
   - Mobile/responsive requirements

5. Implementation Plan
   - Phased approach
   - Dependencies
   - Estimated effort

6. Open Questions
   - Items requiring stakeholder input

## Output

The agent produces a markdown PRD document and:

1. Saves it to /workspace-pm/docs/prds/[feature-name]-prd.md
2. Creates a summary in the task tracking system
3. Notifies relevant stakeholders

## Notes

- The PM agent will ask clarifying questions if requirements are unclear
- PRDs follow the organization's template format
- Links to related PRDs are automatically added when detected
`}</pre>

<div style={{position: 'relative'}}>
  <button
    id="copy-btn-create-prd"
    onClick={() => {
      const content = document.getElementById('skill-content-create-prd').textContent;
      navigator.clipboard.writeText(content);
      const btn = document.getElementById('copy-btn-create-prd');
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
    }}
  >📋</button>

  <details>
  <summary style={{cursor: 'pointer', userSelect: 'none', paddingRight: '140px'}}>📋 Click to view SKILL.md content</summary>

  <div style={{marginTop: '1rem'}}>
    <pre style={{margin: 0, padding: '1rem', background: 'var(--ifm-code-background)'}}><code style={{whiteSpace: 'pre-wrap'}}>{`---
name: create_prd
description: Create a comprehensive Product Requirements Document
---

# Create PRD

Creates a comprehensive Product Requirements Document (PRD) based on a feature description, user
needs, and business goals.

## Usage

Invoke with: /create_prd [feature-name]

Or with initial context:

/create_prd User Authentication System

We need to allow users to sign up with email, Google, and GitHub. Must include 2FA support and
password recovery.

## PRD Structure

The generated PRD includes:

1. Overview
   - Feature summary
   - Goals and objectives
   - Success metrics

2. User Stories
   - Primary user personas
   - Key user stories (As a [user], I want [goal], so that [benefit])
   - Acceptance criteria

3. Requirements
   - Functional requirements
   - Non-functional requirements (performance, security, scalability)
   - Technical constraints

4. Design Considerations
   - UI/UX requirements
   - Accessibility needs
   - Mobile/responsive requirements

5. Implementation Plan
   - Phased approach
   - Dependencies
   - Estimated effort

6. Open Questions
   - Items requiring stakeholder input

## Output

The agent produces a markdown PRD document and:

1. Saves it to /workspace-pm/docs/prds/[feature-name]-prd.md
2. Creates a summary in the task tracking system
3. Notifies relevant stakeholders

## Notes

- The PM agent will ask clarifying questions if requirements are unclear
- PRDs follow the organization's template format
- Links to related PRDs are automatically added when detected `}</code></pre>
    </div>

    </details>
  </div>

---

## Description

Creates a comprehensive Product Requirements Document (PRD) based on a feature description, user
needs, and business goals.

## Usage

```
/create_prd [feature-name]
```

Or with initial context:

```
/create_prd User Authentication System

We need to allow users to sign up with email, Google, and GitHub.
Must include 2FA support and password recovery.
```

## PRD Structure

The generated PRD includes:

1. **Overview**
   - Feature summary
   - Goals and objectives
   - Success metrics

2. **User Stories**
   - Primary user personas
   - Key user stories (As a [user], I want [goal], so that [benefit])
   - Acceptance criteria

3. **Requirements**
   - Functional requirements
   - Non-functional requirements (performance, security, scalability)
   - Technical constraints

4. **Design Considerations**
   - UI/UX requirements
   - Accessibility needs
   - Mobile/responsive requirements

5. **Implementation Plan**
   - Phased approach
   - Dependencies
   - Estimated effort

6. **Open Questions**
   - Items requiring stakeholder input

## Output

The agent produces a markdown PRD document and:

1. Saves it to `/workspace-pm/docs/prds/[feature-name]-prd.md`
2. Creates a summary in the task tracking system
3. Notifies relevant stakeholders

## Example Output

```markdown
# PRD: User Authentication System

## Overview

Enable secure user authentication through multiple providers...

## Goals

- Reduce signup friction by 50%
- Support 3 authentication providers
- Maintain SOC2 compliance

## User Stories

- As a new user, I want to sign up with my Google account... ...
```

## Notes

- The PM agent will ask clarifying questions if requirements are unclear
- PRDs follow the organization's template format
- Links to related PRDs are automatically added when detected
