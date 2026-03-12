// @ts-check

const { themes: prismThemes } = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'MosBot OS',
  tagline: 'A self-hosted operating system for AI agent work',
  favicon: 'img/favicon.ico',

  url: 'https://bymosdev.github.io',
  baseUrl: '/mosbot/',

  organizationName: 'ByMosDev',
  projectName: 'mosbot',
  trailingSlash: false,

  onBrokenLinks: 'throw',

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          routeBasePath: '/',
          editUrl: 'https://github.com/ByMosDev/mosbot-os/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  plugins: ['docusaurus-plugin-image-zoom'],

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/mosbot/img/favicon-16x16.png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/mosbot/img/favicon-32x32.png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/mosbot/img/apple-touch-icon.png',
      },
    },
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/mosbot-social-card.png',
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'MosBot OS',
        logo: {
          alt: 'MosBot OS Logo',
          src: 'img/logo.png',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docsSidebar',
            position: 'left',
            label: 'Docs',
          },
          {
            type: 'doc',
            docId: 'changelog',
            position: 'left',
            label: 'Changelog',
          },
          {
            type: 'doc',
            docId: 'known-issues',
            position: 'left',
            label: 'Known Issues',
          },
          {
            href: 'https://github.com/ByMosDev/mosbot-os/tree/main/api',
            label: 'API',
            position: 'right',
          },
          {
            href: 'https://github.com/ByMosDev/mosbot-os/tree/main/web',
            label: 'Web',
            position: 'right',
          },
          {
            href: 'https://github.com/ByMosDev/mosbot-os',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Documentation',
            items: [
              { label: 'Getting Started', to: '/getting-started/overview' },
              { label: 'OpenClaw Integration', to: '/openclaw/overview' },
              { label: 'Configuration Reference', to: '/configuration/openclaw-json' },
              { label: 'Skills', to: '/skills/overview' },
            ],
          },
          {
            title: 'Repositories',
            items: [
              {
                label: 'api',
                href: 'https://github.com/ByMosDev/mosbot-os/tree/main/api',
              },
              {
                label: 'web',
                href: 'https://github.com/ByMosDev/mosbot-os/tree/main/web',
              },
              {
                label: 'workspace-server',
                href: 'https://github.com/ByMosDev/mosbot-os/tree/main/workspace-server',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} MosBot OS. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['bash', 'json', 'yaml', 'docker'],
      },
      zoom: {
        selector: '.markdown img',
        background: {
          light: 'rgb(255, 255, 255)',
          dark: 'rgb(20, 20, 20)',
        },
        config: {
          margin: 24,
          scrollOffset: 0,
        },
      },
    }),
};

module.exports = config;
