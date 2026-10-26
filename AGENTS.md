# AGENTS.md

Guidance for coding agents working in this repository.

**Read [`CONTRIBUTING.md`](CONTRIBUTING.md) first.** It holds everything
about the project (documents, commands, architecture, rules for behaviour,
schema, tests and documentation, implementation decisions) and applies to
agents as well. This file adds only the working agreement with the
maintainer.

## Working agreement with the maintainer

- Tasks come from the maintainer. Work autonomously within a task. Stop only
  for decisions that belong to the maintainer: behaviour the task does not
  ask for, changes to `docs/schema/`, and code that disagrees with the spec.
- At the end of a task: finish it as _Making a change_ in `CONTRIBUTING.md`
  describes, then report and stop.
- A larger undertaking may get a short plan file of its own; remove it when
  the work is done and keep what stays relevant in `CONTRIBUTING.md`.
- **Do not commit on your own.** The maintainer reviews the uncommitted diff
  first and then asks for the commit.
- Talk to the maintainer in German.
- The real Obsidian app does not run in the dev container. Everything is
  verified through the test suite; manual testing in Obsidian is the
  maintainer's job.
