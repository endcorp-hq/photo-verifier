# Agent Workflow Standard

This is the default delivery workflow for agents working in this repository.

For infrastructure tasks, also follow:

- `/Users/andrew/Documents/projects/end/docs/infra-workflow.md`

## Core Workflow

1. Discuss and align scope.
2. Create or refine a GitHub issue.
3. Ensure the issue includes explicit subtasks and acceptance criteria.
4. Create a new branch from `develop` for that issue.
5. Implement in small, logical commits.
6. Run linting/checks/tests before claiming completion.
7. Verify every acceptance criterion with evidence.
8. Open a PR with a clear summary and validation notes.
9. Close the issue only after acceptance criteria are satisfied.

## Issue Standard

Every implementation issue should contain:

- Problem statement and goal.
- Scope (in/out).
- Subtasks as checkboxes.
- Acceptance criteria as checkboxes.
- Priority label (`P0`, `P1`, etc.).
- Assignee.

### Minimal issue template

```md
## Priority
P1

## Context
What is broken/missing and why it matters.

## Scope
What this issue includes and excludes.

## Subtasks
- [ ] ...
- [ ] ...

## Acceptance Criteria
- [ ] ...
- [ ] ...
```

## Branch and PR Standard

- Branch naming: `issue-<number>-<short-slug>`.
- Keep commits small and meaningful.
- PR must include:
  - what changed
  - why it changed
  - how it was validated
  - any follow-up work

## Spec-First Data Pipeline Standard (Medallion)

For data pipeline work, design contracts before implementation.

### Bronze (raw)

- Define exact expected input shape per ingest type.
- Keep raw data minimally transformed.
- Document schema and path conventions.

### Silver (processed)

- Define canonical output shape and types.
- Define merge/upsert semantics.
- Define validation rules and required invariants.

### Contract requirements

- Contracts must be documented in-repo.
- Validation must be automated in tests/scripts.
- Breaking contract changes require explicit versioning/migration notes.

Reference:

- `apps/databreaker/docs/noaa_sst_data_contract.md`

## Linting and Quality Defaults

Linting/checking is required by default for Python and TypeScript changes.

### Python (Databreaker)

From `apps/databreaker/` run:

- `ruff check .`
- `pytest`

### Python (Brain)

From `apps/brain/` run:

- `ruff check .`
- `mypy .`
- `pytest tests/ -v -s`

Notes:

- `apps/brain/pytest.ini` excludes expensive markers (`github_webhook`, `fal_live`, `e2e`) by default.
- Run those marked suites manually when the task explicitly touches those integrations.

### TypeScript (Backend)

From `apps/backend/` run:

- `pnpm run lint`
- `pnpm run build`
- `pnpm run test`
- `pnpm run test:critical`
- `pnpm run test:e2e`

### JavaScript/React (Dashboards)

From `apps/dashboards/` run:

- `npm run lint`
- `npm run build`
- `npm run contract:check`

## Definition of Done

Work is done when:

- Subtasks are completed.
- Acceptance criteria are fully met.
- Required checks pass.
- Issue checklist is updated accurately.
- PR is opened with validation evidence.
