import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  root: 'demo',
  build: { outDir: '../dist', minify: 'terser' },
  plugins: [viteSingleFile()],
})
