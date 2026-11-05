# 图递 / ImageRelay（English）

[中文版见 README.md](README.md)

Register a local image into an Operit conversation so the model can actually see it.

**Version:** 1.0.2 · **Package ID:** `com.operit.image_feeder` · **Name:** 图递 / ImageRelay

---

## The problem

Passing a file path in a chat message does not make the model see the image. A chat backend can carry image *references*, but the model only sees pixels once the image is registered into the conversation's image pool through the host's native layer.

This package does that one step. Nothing else.

## This is not another vision plugin

Search "MCP vision" and you will hit a pile of projects: `mcp-vision-server`, `llm-vision-mcp`, `vision-mcp-server`, `Visual-Enhancement-mcp` and more. They are all named "vision" and all advertise that they "let the AI see images".

**They all take the proxy route. This package takes the injection route. These are not the same thing.**

**Proxy route** (those projects):

```
path → read from disk → base64 → send to a separate vision model → get back a text description → hand that text to the main model
```

The main model does not receive the image. It receives someone else's account of the image.

**Injection route** (this package):

```
path → register into the conversation image pool → return <link type="image" id="..."> → the main model sees the original pixels
```

No middleman. The main model sees the image itself.

### The difference

| | Proxy | Injection (this package) |
|---|---|---|
| What the model receives | A text description | The original image |
| Information | Lossy, loss is irreversible | Lossless |
| Follow-up questions | Another round trip | Ask anything about the same image |
| Extra dependency | Another vision API, another key | None |
| Main model requirement | Works with text-only models | Must be multimodal |
| Host requirement | Any ordinary tool | Must natively support pool registration |

Put simply: proxy **describes the image to the model**; injection **hands the image to the model**.

### Why nobody else does injection

Not for lack of imagination — they cannot. The proxy route runs entirely within the MCP tool layer. Injection requires the host to open that channel itself: image content blocks returned by a tool are silently dropped by many clients (there are open issues in GitHub Copilot CLI and OpenAI Codex describing exactly this).

This package can do it because Operit's native layer exposes a registration interface, and this package uses that channel — the same rendering path that user-attached images go through.

> Background: an issue on Operit2 (`AAswordman/Operit2#319`) documents this problem. Its author tried four alternative paths, none worked, and concluded that a plugin reading images on its own requires native host support. That issue is still open. This package is one implementation that makes the route work.

## What it does not do

No gallery. No categories. No search. No OCR. No image processing. No format conversion. No sending.

If you want a library with browsing and search, that is a different package. This one is the smallest possible implementation of `path → pool → model`.

---

## Install

Copy this directory into your Operit `toolpkg` location and install, or install the packaged `.toolpkg` if one is attached to a release.

If you get an `already exists` error, uninstall the previous version of `com.operit.image_feeder` first. Operit rejects duplicate `toolpkg_id` installs rather than overwriting them.

After install, the two tools `feed_image` and `check_image` become available to the model.

---

## API at a glance

### `feed_image`

Registers an image into the current conversation's image pool.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Absolute path (`/sdcard/...`) or `file://` prefix. `content://` URIs are **not** accepted by the host. |
| `_debug` | boolean | no | Return the diagnostic `debug` block. |

Returns `ok:true` only when the image actually entered the pool. Every failure returns `ok:false` with an `error` describing the cause and a `note` telling the model not to guess the image content.

### `check_image`

Cheap pre-flight check: does the path exist, is it a file, does the extension look like an image. Runs before you spend a native call.

---

## Two things that trip people up

**`ok:true` means "entered the pool", not "the model saw it".**

Whether the model can describe the image depends on the model's own vision capability and on whether the image survives into the outgoing request. This package guarantees the registration step only.

**`content://` URIs do not work.**

The host rejects them. Use a real file path. If your source is a content provider, resolve it to a filesystem path first.

---

## Verifying your install

Operit's internals are not a public contract, so a host upgrade can break the registration call without warning. After every host upgrade, run one check:

1. Take a real image file whose content you know.
2. Call `feed_image` with `_debug: true`.
3. Confirm `ok:true` and that `debug.build` reads `v1.0.2-selfreport`.
4. Ask the model something about the image that it could only answer by seeing it.

If step 3 returns `ok:false` with `api_missing`, the host no longer exposes the interface this package depends on.

---

## Documentation

Full technical reference: [`docs/TECHNICAL.en.md`](docs/TECHNICAL.en.md) — scope, parameters, return fields, the complete failure table, host compatibility notes, and known limitations.

## License

MIT. See [`LICENSE`](LICENSE).

## Maintainer

Maintained by the repository owner. If something is broken, open an issue here — please include the full return value from `feed_image`, including the `debug` block if you enabled it. Without that, most failures cannot be diagnosed.
