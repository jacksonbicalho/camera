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
    // No CI (runners ubuntu-latest do GitHub Actions, 2 vCPUs reais) o `4`
    // local é 2x oversubscription — mesma classe de flakiness, confirmada
    // de novo no job Frontend do PR #708 (história
    // fix/maxworkers-ci-flakiness-frontend). `process.env.CI` é mais
    // confiável que introspecção de hardware (os.cpus() pode reportar o
    // host inteiro, não a cota real do container/runner).
    maxWorkers: process.env.CI ? 2 : 4,
  },
})
