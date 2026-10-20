# Project installation

This project vendors Impeccable skill **4.5.0**, copied from the existing local
installation at `~/.agents/skills/impeccable`. The launcher pins engine **0.1.11**
in `scripts/VERSION`. The upstream project is
[pbakaus/impeccable](https://github.com/pbakaus/impeccable).

Run `./.agents/skills/impeccable/scripts/impeccable` from the project root.
On Windows without a POSIX shell, use `scripts/impeccable.cmd` instead.

The skill references, agent configurations, browser helpers, license, notices,
and both launchers are vendored. Platform-specific executables under
`scripts/bin/` are local runtime caches and are ignored by Git. The existing
macOS arm64 engine is cached there for this checkout. On other machines, the
launcher finds a compatible installed engine or downloads the pinned platform
engine into the user's Impeccable cache and verifies its SHA-256 sidecar.
First use may require network access and cache write permission. No Node.js
runtime is needed by the launcher.

`IMPECCABLE_BIN` can point to an existing engine, and `IMPECCABLE_HOME` can select
a writable cache directory. See the launcher for its full resolution order.
