---
name: refactoring
description: Safely restructure, rename, extract, or move code without breaking existing functionality. Use when reorganizing modules, extracting functions, renaming symbols across the IPC boundary, or cleaning up code structure.
---

# Refactoring

Guidelines for safely restructuring code without breaking existing functionality.

## Before Starting

1. **Identify the goal** — What is the refactor achieving?
2. **Map dependencies** — Read all callers, consumers. Grep for every reference.
3. **Verify current behavior** — Build succeeds, feature works correctly before touching anything.

## Safe Refactoring Patterns

### Extract function/module
- Move logic into a new function or file
- Keep original as thin wrapper initially
- Verify build at each step
- Remove wrapper once all callers updated

### Rename
- Use semantic rename tools when available
- If renaming across IPC (Rust → TypeScript), update both in same commit
- Grep for string references tools might miss (event names, invoke strings)

### Move file
- Update all imports and `mod.rs` exports
- Check `lib.rs` registration
- Verify build

### Change function signature
- Update function + every caller
- If IPC: update TypeScript wrapper + Rust command + `lib.rs`
- Build both frontend and backend

## Rules

- **One refactor per commit.** Don't mix with feature work.
- **Build after every step.** Break = went too far.
- **Never refactor and change behavior simultaneously.**
- **Don't refactor code you don't understand.**
- **Preserve public interface** unless that's the purpose.
- **Never amend or force-push a pushed commit** to tidy a multi-step refactor —
  add follow-up commits instead. See "Never rewrite pushed history" in
  `AGENTS.md` (Section 10).

## Documentation & Comparative Flowcharts

- Non-trivial refactors, performance overhauls, or architectural reorganizations must update or create dedicated Living Architecture Documentation under `docs/research/<feature>/`:
  - `research.md`: Include an **Old vs. New comparative flowchart** (contrasting the legacy flawed flow with the modern solution) and a parameter/behavior comparison table.
  - Adhere to Mermaid node tree formatting rules (explicit `<br/>` line breaks under ~35 chars/line, quoted labels).
  - `progress.md`: Living progress board and test coverage.
  - Indexed in `docs/research/README.md`.

## Verification

- `cargo check` passes (zero warnings)
- `pnpm exec tsc --noEmit` / `pnpm build` passes
- Feature works same as before
- No dead code introduced
- Commit uses `refactor:` prefix
