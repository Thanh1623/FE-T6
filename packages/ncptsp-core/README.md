# @ncptsp/core

Bundle logic từ `ncptsp/src/lib` cho **Nest worker** (Phase 1: `sync`; Phase 2: `spu-summary`, `videos`; Phase 3: shim `revalidateTag` → `APP_URL/api/internal/revalidate`).

```bash
node build.mjs && node build-auth.mjs && node build-spu-summary.mjs && node build-videos.mjs
# → dist/sync-bundle.cjs, sync-auth.cjs, spu-summary-bundle.cjs, videos-bundle.cjs
```

Shim Next/React/session trong `shim/` — không đổi quy tắc nghiệp vụ trong `src/lib`.