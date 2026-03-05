# Screenshots

This folder contains screenshots for the MosBot OS documentation.

## Available Screenshots

| Filename                                   | Description               | Used In                   |
| ------------------------------------------ | ------------------------- | ------------------------- |
| `mosbot-task-board.png`                    | Task board kanban view    | Homepage, Task Management |
| `mosbot-task-board-detail.png`             | Task detail modal         | Homepage, Task Management |
| `mosbot-agent-monitor.png`                 | Agent monitor dashboard   | Homepage, Agent Monitor   |
| `mosbot-agent-monitor-messages-drawer.png` | Real-time messages drawer | Homepage, Agent Monitor   |
| `mosbot-org-chart.png`                     | Agents page               | Homepage, Agents          |
| `mosbot-workspaces.png`                    | Workspace file browser    | Homepage, Workspaces      |
| `mosbot-standup.png`                       | Standup list view         | Homepage, Standups        |
| `mosbot-standup-notes.png`                 | Standup detail with notes | Homepage, Standups        |
| `mosbot-ascheduler.png`                    | Scheduler/cron jobs UI    | Homepage, Standups        |
| `mosbot-usage-and-cost.png`                | Usage and cost analytics  | Homepage, Agent Monitor   |
| `mosbot-model-fleet.png`                   | Model fleet overview      | Agent Monitor             |
| `mosbot-openclaw-config.png`               | OpenClaw configuration    | OpenClaw Integration      |

## How to add new screenshots

1. Take a screenshot of the feature (PNG format recommended)
2. Name it descriptively with the `mosbot-` prefix (e.g., `mosbot-new-feature.png`)
3. Place it in this folder
4. Reference it in documentation using the `/img/screenshots/` path:

   ```markdown
   ![Description](/img/screenshots/mosbot-new-feature.png)
   ```

## Tips for good screenshots

- Capture at 1440x900 or 1920x1080 resolution
- Use the dark theme (MosBot Dashboard default)
- Focus on the key feature being demonstrated
- Remove any sensitive/personal data before capturing
- Use descriptive captions when embedding in docs
