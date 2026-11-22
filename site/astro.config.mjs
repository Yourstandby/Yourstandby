import { defineConfig } from 'astro/config';

// 仓库名与用户名同名 → Pages 地址是 https://yourstandby.github.io/
export default defineConfig({
  site: 'https://yourstandby.github.io',
  build: { inlineStylesheets: 'auto' },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  devToolbar: { enabled: false },
});
