---
name: clean-dev-cache
description: "Clean up dev caches, build artifacts, Docker dangling images, and temp files"
---

# Claude Code User Command: Clean Dev Cache

Clean up all development caches, build artifacts, and temporary files from the project.

## Steps

1. Stop Docker Compose if running to prevent caches from being recreated:

```bash
docker compose down 2>/dev/null || true
```

2. Remove root-owned directories created by Docker containers (e.g. `.next` from the frontend dev server). Use a disposable Alpine container to delete as root without requiring sudo:

```bash
docker run --rm -v "$(pwd)/frontend:/workspace" alpine rm -rf /workspace/.next 2>/dev/null || true
```

3. Remove all known cache and build artifact directories:

```bash
find . -maxdepth 4 -type d \( \
  -name "__pycache__" \
  -o -name ".pytest_cache" \
  -o -name ".mypy_cache" \
  -o -name ".ruff_cache" \
  -o -name "node_modules" \
  -o -name ".turbo" \
  -o -name ".eggs" \
  -o -name "*.egg-info" \
  -o -name ".tox" \
  -o -name ".coverage_cache" \
  -o -name "playwright-report" \
  -o -name "test-results" \
\) -exec rm -rf {} + 2>/dev/null
```

4. Remove stale temporary and generated files:

```bash
find . -type f \( \
  -name "*.pyc" \
  -o -name "*.pyo" \
  -o -name ".coverage" \
  -o -name "coverage.xml" \
  -o -name ".DS_Store" \
  -o -name "*.log" \
\) -delete 2>/dev/null
```

5. Optionally prune Docker build cache if disk space is a concern:

```bash
docker builder prune -f 2>/dev/null || true
```

6. Report what was cleaned.
