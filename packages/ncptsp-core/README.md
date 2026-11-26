# @ncptsp/core

Bundle logic từ `ncptsp/src/lib` cho **Nest worker** (Phase 1: `sync`).

```bash
node build.mjs && node build-auth.mjs
# → dist/sync-bundle.cjs
```

Shim Next/React/session trong `shim/` — không đổi quy tắc nghiệp vụ trong `src/lib`.