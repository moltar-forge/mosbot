// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docsSidebar: [
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/overview',
        'getting-started/prerequisites',
        'getting-started/quickstart',
        'getting-started/configuration',
        'getting-started/first-login',
      ],
    },
    {
      type: 'category',
      label: 'OpenClaw Integration',
      items: [
        'openclaw/overview',
        'openclaw/setup',
        'openclaw/integration',
        'openclaw/workspace-service',
        'openclaw/gateway',
        'openclaw/local-development',
        'openclaw/kubernetes',
        'openclaw/troubleshooting',
      ],
    },
    {
      type: 'category',
      label: 'Configuration Reference',
      items: [
        'configuration/openclaw-json',
        'configuration/sample-config',
        'configuration/mosbot-required-config',
        'configuration/best-practices',
      ],
    },
    {
      type: 'category',
      label: 'Skills',
      items: [
        'skills/overview',
        'skills/shared-vs-agent',
        'skills/creating-skills',
        'skills/skill-structure',
        'skills/examples',
        {
          type: 'category',
          label: 'Skill Reference',
          collapsed: true,
          items: [
            'skills/reference/skills-reference-overview',
            'skills/reference/memory-flush',
            'skills/reference/reminder-create',
            'skills/reference/audio-transcribe',
            'skills/reference/create-prd',
            'skills/reference/task-writing',
            'skills/reference/task-pickup',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Features',
      items: [
        'features/agent-monitor',
        'features/task-management',
        'features/agents',
        'features/workspaces',
        'features/standups',
        'features/scheduler',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: ['deployment/docker', 'deployment/kubernetes', 'deployment/production'],
    },
    {
      type: 'category',
      label: 'Security',
      items: ['security/authentication', 'security/roles-permissions', 'security/secrets'],
    },
    {
      type: 'category',
      label: 'Troubleshooting',
      items: ['troubleshooting/common-issues', 'troubleshooting/faq', 'known-issues'],
    },
    {
      type: 'doc',
      id: 'changelog',
      label: 'Changelog',
    },
  ],
};

module.exports = sidebars;
