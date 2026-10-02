// The Workshop's dev server plus the local-harness launcher (src/features/local-harness). A
// separate config rather than an edit to vite.config.ts so the feature stays in files of its own;
// run it with `pnpm --filter @gadgets/cli dev:client`, in place of `pnpm dev-client`.
import { defineConfig, mergeConfig, type ConfigEnv, type Plugin, type UserConfig } from 'vite'
import baseConfig from './vite.config'

const injectLauncher = (): Plugin => ({
  name: 'gadgets-local-harness-launcher',
  apply: 'serve',
  transformIndexHtml: () => [
    { tag: 'script', attrs: { type: 'module', src: '/src/features/local-harness/mount.tsx' }, injectTo: 'body' },
  ],
})

export default defineConfig(async (env: ConfigEnv) => {
  const base = typeof baseConfig === 'function' ? await baseConfig(env) : await baseConfig
  return mergeConfig(base as UserConfig, { plugins: [injectLauncher()] })
})
