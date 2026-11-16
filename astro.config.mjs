import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://rfdnnr.github.io',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
