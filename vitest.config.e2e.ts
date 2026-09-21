import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-e2e.ts'],
    // cada arquivo cria um schema + roda migrations + sobe o Nest; com todos em
    // paralelo o Postgres/CPU saturam e o beforeAll estoura o timeout
    maxWorkers: 4,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
  plugins: [
    tsConfigPaths(),
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
})
