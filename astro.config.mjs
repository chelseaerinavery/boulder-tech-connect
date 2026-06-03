// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Update `site` to your custom domain once it's connected in Netlify.
// It's used for canonical URLs, sitemap, and Open Graph tags — all important for SEO.
export default defineConfig({
  site: 'https://boulder-tech-connect.netlify.app',
  integrations: [sitemap()],
});
