import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Regenerate icons with `npm run icons -w client` after changing public/favicon.svg.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#FBF6EE' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#FBF6EE' } },
  },
  images: ['public/favicon.svg'],
});
