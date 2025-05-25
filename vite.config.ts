import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import * as fs from 'node:fs';
import * as path from 'node:path';

// Custom plugin to copy index.html to 404.html for SPA routing on GitHub Pages
function copyIndexTo404Plugin() {
  let outDir = 'dist'; // Default Vite output directory
  return {
    name: 'vite-plugin-copy-index-to-404',
    apply: 'build', // Apply only during build
    configResolved(resolvedConfig) {
      // Store the resolved output directory from the Vite config
      outDir = resolvedConfig.build.outDir;
    },
    closeBundle() {
      const indexPath = path.join(outDir, 'index.html');
      const notFoundPath = path.join(outDir, '404.html');
      try {
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, notFoundPath);
          console.log(`[vite-plugin-copy-index-to-404] Copied ${indexPath} to ${notFoundPath}`);
        } else {
          console.warn(`[vite-plugin-copy-index-to-404] ${indexPath} not found. Skipping copy to 404.html.`);
        }
      } catch (error) {
        console.error(`[vite-plugin-copy-index-to-404] Error copying index.html to 404.html:`, error);
      }
    }
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    copyIndexTo404Plugin(),
    viteStaticCopy({
      targets: [
        {
          src: 'CNAME', // path relative to the project root
          dest: '.'     // path relative to the build output directory (dist)
        }
      ]
    })
  ],
})
