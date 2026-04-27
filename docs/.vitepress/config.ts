import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Put It Out There',
  description: 'Polyglot release orchestrator for crates.io, PyPI, and npm.',
  base: '/putitoutthere/',
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', href: '/putitoutthere/favicon.svg' }],
  ],
  themeConfig: {
    nav: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Guide', link: '/guide/concepts' },
      { text: 'Library shapes', link: '/guide/shapes/' },
      { text: 'GitHub', link: 'https://github.com/thekevinscott/putitoutthere' },
    ],
    sidebar: {
      '/guide/shapes/': [
        {
          text: 'Library shapes',
          items: [
            { text: 'Overview', link: '/guide/shapes/' },
            { text: 'Polyglot Rust library', link: '/guide/shapes/polyglot-rust' },
            { text: 'Bundled-CLI npm family', link: '/guide/shapes/bundled-cli' },
          ],
        },
      ],
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Concepts', link: '/guide/concepts' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Authentication', link: '/guide/auth' },
            { text: 'Release trailer', link: '/guide/trailer' },
            { text: 'Cascade', link: '/guide/cascade' },
            { text: 'Troubleshooting publish failures', link: '/guide/troubleshooting' },
            { text: 'npm platform packages', link: '/guide/npm-platform-packages' },
            { text: 'Dynamic versions', link: '/guide/dynamic-versions' },
            { text: 'Migrations', link: '/guide/migrations' },
            { text: 'Known gaps', link: '/guide/gaps' },
          ],
        },
        {
          text: 'Library shapes',
          items: [
            { text: 'Overview', link: '/guide/shapes/' },
            { text: 'Polyglot Rust library', link: '/guide/shapes/polyglot-rust' },
            { text: 'Bundled-CLI npm family', link: '/guide/shapes/bundled-cli' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/thekevinscott/putitoutthere' },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Kevin Scott',
    },
  },
});
