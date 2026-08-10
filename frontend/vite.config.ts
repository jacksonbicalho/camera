import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/stream': 'http://localhost:8080',
      '/recordings': 'http://localhost:8080',
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'happy-dom',
    // Sem isso, o Vitest sobe 1 worker por CPU visível (16 no container
    // Docker de scripts/frontend-check.sh) — flakiness real e recorrente
    // confirmada (waitFor com timeout de 1s estourando por contenção de
    // CPU, sempre um teste diferente, sempre passando isolado). Limitar a
    // concorrência troca wall-clock por confiabilidade — ver
    // work_progress/analysis (história chore/limpeza-followups-e-flakiness-testes).
    maxWorkers: 4,
  },
})
