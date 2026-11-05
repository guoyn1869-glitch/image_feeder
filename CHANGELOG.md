# Changelog

## Unreleased

Documentation only. **No behavioral change** — no code edits, no new tools, no version bump.

### Added
- README (zh + en) gains a section explaining how this package differs from the many "MCP vision" projects (`mcp-vision-server`, `llm-vision-mcp`, `vision-mcp-server`, etc.). Those take a **proxy** route: read the file, encode it, send it to a separate vision model, and hand the main model a *text description* of the image. This package takes an **injection** route: register the image into the conversation's pool so the main model sees the original pixels. The difference is lossy-vs-lossless, repeatable follow-up questions, an extra vision API dependency, and whether the main model must itself be multimodal.
- The section also records why the proxy route is the common choice — injection requires native host support, since image content blocks returned by tools are silently dropped by many MCP clients (open issues in GitHub Copilot CLI and OpenAI Codex), and references `AAswordman/Operit2#319`, where the problem is documented and the route remains unsolved upstream.

### Notes
- Existing `1.0.2` behavior and `debug.build` value (`v1.0.2-selfreport`) are unchanged; a `1.0.2` install matches this documentation as well.

## 1.0.2

Documentation and messaging release. **No behavioral change** — no new tools, no new branches, no logic edits.

### Fixed
- `feed_image` tool description previously claimed `content://` prefixes were supported. The host rejects `content://` URIs, so the description was wrong and would have sent developers down a dead end. Now states absolute paths and `file://` only, with `content://` explicitly marked unsupported.
- Host-unavailable error message no longer claims a specific upstream version removed the interface. It now states plainly that the interface is unavailable in the current host version.
- `fail.hint` reworded to describe the dependency as a non-public interface that can break across host upgrades, rather than referencing internal implementation details.

### Notes
- Install over an existing copy will fail with `already exists`. Uninstall the previous version first.
- `debug.build` now reports `v1.0.2-selfreport`, so a returned value can be matched against this release.

## 1.0.1

Initial release.

- `feed_image` — register a local image path into the conversation's image pool.
- `check_image` — pre-flight validation of path, file type, and extension.
- Fail-loud contract: `ok:true` is returned only when registration actually succeeded; all failure paths return `ok:false` with an `error` string and a `note` instructing the model not to guess image content.
- Optional `_debug` block for diagnosing what the native layer actually returned.