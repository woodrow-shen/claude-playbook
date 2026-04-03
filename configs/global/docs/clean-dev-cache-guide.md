# /clean-dev-cache Command Guide

Clean up development caches, build artifacts, Docker images, and temp files.

## Usage

```
/clean-dev-cache
```

## What It Does

1. Stops Docker Compose services (if running)
2. Removes root-owned directories (with sudo if needed)
3. Clears cache/build directories (Python, Node, test caches)
4. Removes stale files (*.pyc, .coverage, etc.)
5. Optionally prunes Docker dangling images and build cache

## Directories Cleaned

- `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`
- `node_modules/`, `.next/`, `dist/`, `build/`
- `.coverage`, `htmlcov/`
- Docker dangling images (optional)

## When to Use

- After switching branches with different dependencies
- When build artifacts are stale or causing issues
- To reclaim disk space
- Before a clean rebuild
