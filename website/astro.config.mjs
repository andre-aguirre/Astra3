// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE_URL / BASE_PATH let the same code deploy to GitHub Pages (default) or a custom domain.
//   GitHub Pages:  SITE_URL=https://andre-aguirre.github.io  BASE_PATH=/Astra3
//   Custom domain: SITE_URL=https://astra3.example.org      BASE_PATH=/
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://andre-aguirre.github.io',
  base: process.env.BASE_PATH ?? '/Astra3',
  integrations: [sitemap()],
  build: { format: 'directory' },
});
