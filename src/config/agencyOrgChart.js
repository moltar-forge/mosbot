// Agency Organization Chart Configuration (Fallback)
// This defines the hierarchical structure of the multi-agent system
// Used when /org-chart.json is not available from the workspace

export const agencyOrgChart = {
  leadership: [
    {
      id: 'ceo',
      title: 'CEO',
      label: 'mosbot-ceo',
      displayName: 'Marcelo Oliveira',
      description: 'Vision - Strategy - Final Decisions',
      status: 'scaffolded',
      reportsTo: null,
    },
    {
      id: 'coo',
      title: 'COO',
      label: 'mosbot-coo',
      displayName: 'MosBot',
      description: 'Research - Delegation - Execution - Orchestration',
      status: 'scaffolded',
      reportsTo: 'ceo',
    },
    {
      id: 'cto',
      title: 'CTO',
      label: 'mosbot-cto',
      displayName: 'Elon',
      description: 'Tech architecture, infrastructure, and security posture',
      status: 'scaffolded',
      reportsTo: 'coo',
    },
    {
      id: 'cpo',
      title: 'CPO',
      label: 'mosbot-cpo',
      displayName: 'Alex',
      description: 'Product vision, market opportunities, and product-market fit',
      status: 'scaffolded',
      reportsTo: 'coo',
    },
    {
      id: 'cmo',
      title: 'CMO',
      label: 'mosbot-cmo',
      displayName: 'Gary',
      description: 'Digital strategy, content creation, and social amplification',
      status: 'scaffolded',
      reportsTo: 'coo',
    },
  ],

  departments: [
    {
      id: 'backend-security',
      name: 'Backend & Security',
      leadId: 'cto',
      description: 'APIs, business logic, data pipelines, vulnerability scanning',
      subagents: [
        {
          id: 'anvil',
          displayName: 'Anvil',
          label: 'mosbot-anvil',
          description: 'Backend engineer - API development',
          status: 'scaffolded',
        },
        {
          id: 'cypher',
          displayName: 'Cypher',
          label: 'mosbot-cypher',
          description: 'Security specialist - vulnerability scanning',
          status: 'scaffolded',
        },
      ],
    },
    {
      id: 'frontend-devops',
      name: 'Frontend & DevOps',
      leadId: 'cto',
      description: 'UI/UX, infrastructure, deployment, CI/CD',
      subagents: [
        {
          id: 'pixel',
          displayName: 'Pixel',
          label: 'mosbot-pixel',
          description: 'Frontend engineer - UI/UX development',
          status: 'scaffolded',
        },
        {
          id: 'sentry',
          displayName: 'Sentry',
          label: 'mosbot-sentry',
          description: 'DevOps & Infrastructure engineer',
          status: 'scaffolded',
        },
      ],
    },
    {
      id: 'qa',
      name: 'QA',
      leadId: 'cto',
      description: 'Quality assurance and testing',
      subagents: [
        {
          id: 'audit',
          displayName: 'Audit',
          label: 'mosbot-audit',
          description: 'QA and testing',
          status: 'scaffolded',
        },
      ],
    },
    {
      id: 'content',
      name: 'Content',
      leadId: 'cmo',
      description: 'YouTube scripts, research, newsletters, social media',
      subagents: [
        {
          id: 'rex',
          displayName: 'Rex',
          label: 'mosbot-rex',
          description: 'Content writer - documentation and articles',
          status: 'scaffolded',
        },
        {
          id: 'sage',
          displayName: 'Sage',
          label: 'mosbot-sage',
          description: 'Research analyst - data gathering',
          status: 'scaffolded',
        },
      ],
    },
    {
      id: 'products',
      name: 'Products',
      leadId: 'cpo',
      description: 'Product intelligence, go-to-market strategy, launch coordination',
      subagents: [
        {
          id: 'scout',
          displayName: 'Scout',
          label: 'mosbot-scout',
          description: 'Product strategist - market research',
          status: 'scaffolded',
        },
        {
          id: 'herald',
          displayName: 'Herald',
          label: 'mosbot-herald',
          description: 'Launch coordinator - product announcements',
          status: 'scaffolded',
        },
      ],
    },
    {
      id: 'growth',
      name: 'Growth',
      leadId: 'cpo',
      description: 'Growth hacking, community engagement',
      subagents: [
        {
          id: 'gemini',
          displayName: 'Gemini',
          label: 'mosbot-gemini',
          description: 'Community manager - engagement and support',
          status: 'scaffolded',
        },
      ],
    },
  ],
};

// Helper function to get all subagent labels
export const getAllSubagentLabels = () => {
  const labels = [];
  agencyOrgChart.departments.forEach((dept) => {
    dept.subagents.forEach((agent) => {
      labels.push(agent.label);
    });
  });
  return labels;
};

// Helper function to find a node by label
export const findNodeByLabel = (label) => {
  // Check leadership
  const leader = agencyOrgChart.leadership.find((l) => l.label === label);
  if (leader) return { ...leader, type: 'leadership' };

  // Check departments
  for (const dept of agencyOrgChart.departments) {
    const agent = dept.subagents.find((a) => a.label === label);
    if (agent) return { ...agent, type: 'subagent', department: dept.name };
  }

  return null;
};
