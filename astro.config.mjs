// @ts-check
import { defineConfig } from 'astro/config';

// Pure static site: no adapter, no server. All database traffic happens in the
// browser, so this deploys to GitHub Pages, Netlify, Vercel, or any folder
// served over HTTP.
export default defineConfig({
  // Deploying to a GitHub *project page* (user.github.io/caronas)? Uncomment the
  // line below. Internal links use import.meta.env.BASE_URL, so they follow this
  // change on their own.
  // base: '/caronas',
});
