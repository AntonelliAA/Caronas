// @ts-check
import { defineConfig } from 'astro/config';

// Pure static site: no adapter, no server. All database traffic happens in the
// browser, so this deploys to GitHub Pages, Netlify, Vercel, or any folder
// served over HTTP.
export default defineConfig({
  // Published as a GitHub project page under the same domain as the portfolio:
  // antonelliaa.github.io/Caronas/. Internal links read
  // import.meta.env.BASE_URL, so they follow this on their own. The path is
  // case sensitive and has to match the repository name.
  base: '/Caronas',
});
