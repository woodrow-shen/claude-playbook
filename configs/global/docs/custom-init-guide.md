# /custom-init Command Guide

Generate or refresh a CLAUDE.md file with comprehensive codebase analysis.

## Usage

```
/custom-init
```

## What It Does

1. **Initialize** - Detects project type, tools, and existing docs
2. **Analyze** - Scans architecture, tech stack, dependencies
3. **Generate** - Creates structured CLAUDE.md sections
4. **Sync** - Reconciles with docs/ directory content
5. **Validate** - Verifies paths, commands, and markdown syntax

## Phases

- **Phase 1**: Project discovery (build files, framework, structure)
- **Phase 2**: Core sections (overview, architecture, tech stack, development)
- **Phase 3**: Feature analysis via sub-agents (auth, domain, data, infra)
- **Phase 4**: Additional sections (testing, deployment, troubleshooting)
- **Phase 5**: Assembly and quality checks

## Key Features

- Backs up existing CLAUDE.md before overwriting
- Syncs with docs/ directory (treats docs/ as authoritative)
- Detects project patterns (MVC, DDD, Clean Architecture)
- Parallel sub-agent analysis for speed

## Agents Used

- general-solution-architect (architecture analysis)
- general-technical-writer (documentation generation)
- general-purpose (file searching and multi-step analysis)
