# Agent Collaboration Guide

This project uses AI agents for development assistance. This document provides guidance on how agents should work in this repository.

## Workflow Standard

All agent work must follow the workflow defined in [agents-workflow.md](./agents-workflow.md).

## Quick Reference

| Step | Action |
|------|--------|
| 1 | Discuss and align scope with user |
| 2 | Create/refine GitHub issue with subtasks and acceptance criteria |
| 3 | Create branch from `develop`: `issue-<number>-<short-slug>` |
| 4 | Implement in small, logical commits |
| 5 | Run linting/checks before completion |
| 6 | Verify acceptance criteria with evidence |
| 7 | Open PR with summary and validation notes |

## Issue Requirements

Every implementation issue must include:
- Problem statement and goal
- Scope (in/out)
- Subtasks as checkboxes
- Acceptance criteria as checkboxes
- Priority label (P0, P1, etc.)
- Assignee

## Branch Naming

```
issue-<number>-<short-slug>
```

Examples:
- `issue-001-eslint-cleanup`
- `issue-002-sdk-exports`
- `issue-004-blockchain-package`

## Commit Standards

Keep commits small and meaningful. Each commit should:
- Be logically atomic
- Pass all linting/checks
- Include a clear message following conventional commits

## PR Requirements

PRs must include:
- What changed
- Why it changed
- How it was validated
- Any follow-up work

## Quality Standards

### TypeScript (SDK)
```bash
cd packages/photoverifier-sdk
yarn build
```

### React App
```bash
cd photo-verifier
npx eslint .
```

### All checks must pass before claiming completion

## Definition of Done

Work is complete when:
- [ ] All subtasks completed
- [ ] All acceptance criteria met
- [ ] Required checks pass
- [ ] Issue checklist updated
- [ ] PR opened with validation evidence
