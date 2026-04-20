# AGENTS.md

## Goal
Write code that is readable, maintainable, testable, and consistent with the existing project.

## Core Rules
- Prefer clarity over brevity.
- Follow existing project patterns before introducing new ones.
- Keep changes minimal and scoped to the task.
- Avoid unrelated refactors.
- One function should do one thing.
- One module/class should have one clear responsibility.
- Avoid magic numbers; extract constants.
- Avoid vague names like helper, manager, util, common unless truly justified.
- Reduce nesting with early returns.
- Do not hide complex logic in one-liners.
- Handle errors explicitly; do not silently ignore them.
- Add comments only when they explain why, not what.
- Avoid duplicated logic, but do not over-abstract prematurely.
- Keep external dependencies minimal.
- Do not introduce global hidden state.
- Prefer pure logic extraction before large structural refactors.
- Any performance optimization must be justified by a real bottleneck.

## Review Checklist
Before finishing, check:
- Is the naming accurate?
- Is the responsibility clear?
- Is there any unnecessary coupling?
- Is there any hidden side effect?
- Is error handling adequate?
- Is the change easy to review?
- Does it match the existing project style?

## AI Agent Behavior
- Understand the requirement and boundaries first.
- Reuse existing patterns when possible.
- Do not create oversized classes or catch-all utilities.
- Do not rewrite large areas without necessity.
- Summarize changes, impact, risks, and validation steps after modification.