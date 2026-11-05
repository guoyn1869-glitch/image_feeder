# 图递 / ImageRelay — Technical Documentation

[中文版：TECHNICAL.md](TECHNICAL.md)

- **Version:** 1.0.2
- **Package ID:** `com.operit.image_feeder`
- **Name:** 图递 / ImageRelay
- **Target platform:** Operit (Android)
- **Maintainer:** report issues on this repository

---

## 0. What this package does

**Given a local image path, register it into the current conversation's image pool so the model can actually see the image.**

That is the entire job. This package is deliberately minimal — no library, no categories, no search, no OCR, no image processing, no format conversion. It is the smallest possible implementation of the path → pool → model pipeline.

The rationale: many chat backends can handle image *references*, but a model only truly "sees" an image if it has been registered into the conversation's image pool through the host's native layer. Pasting a path into a message does not achieve this. This package closes that specific gap.

---

## 1. Scope

### 1.1 What it does

| Capability | Detail |
|---|---|
| Path normalization | Accepts `/sdcard/...` absolute paths and `file://` prefixes |
| Pre-flight validation | Existence, is-it-a-directory, image extension check |
| Pool registration | Calls the host's native image registration API |
| Fail-loud contract | Never returns `ok:true` when registration did not actually happen |

### 1.2 What it explicitly does NOT do

- **No gallery, no categorization, no search.** Other packages handle that.
- **No sending or displaying.** This package only registers into the pool. Whether the image gets attached to the outgoing message is handled by the host, not by this package.
- **No OCR, no image processing, no format conversion.**
- **No model-side guarantees.** See §5.

---

## 2. Requirements

| Requirement | Value |
|---|---|
| Host | Operit 1.12.2 (versionCode 51) — tested |
| minSdk | 26 |
| targetSdk | 34 |
| Model capability | Must support visual (image) input — see §5 |
| Dependency | The host must expose its native image-registration API — see §6 |

**Version note:** minSdk / targetSdk reflect the environment this package was built and tested against. They are not a tested compatibility matrix. If you run on a different host version, run the self-check in §6.3.

---

## 3. Installation

Install the `.toolpkg` bundle through Operit's package manager.

**Before installing an update, uninstall the previous version first.** Installing over an existing package will fail with:

```
A package with name 'com.operit.image_feeder' already exists in available packages
```

If you see this error, the new package did **not** install — you are still running the old code. This failure mode is a common cause of "my changes had no effect" confusion.

A single `toolpkg_id` cannot be installed twice simultaneously.

---

## 4. API Reference

### 4.1 `image_feeder:feed_image`

Validates a path and registers the image into the current conversation's image pool.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Local image path. Absolute (`/sdcard/Download/a.jpg`) or `file:///sdcard/...`. |

**Returns**

| Field | Type | Present when | Description |
|---|---|---|---|
| `success` | boolean | always | Transport-level success. **Always `true`** for this package — check `ok`, not `success`. |
| `ok` | boolean | always | `true` only if the image was actually registered into the pool. |
| `path` | string | always | The normalized path that was used. |
| `name` | string | success / native returned failed-sentinel | Basename of the file; not present on empty-id or validation-failure paths. |
| `image_id` | string | success / native-failure | Registration ID returned by the host. See §4.3 — **an empty-looking value does not mean failure.** |
| `error` | string | failure | Machine-readable-ish failure reason. |
| `hint` | string | some failures | Actionable suggestion for the caller. |
| `note` | string | most failures | Instruction to the model: *do not describe the image from guesswork.* |
| `is_dir` | boolean | directory rejection | `true` only for the directory-rejected path. |
| `api_missing` | boolean | host API unavailable | `true` when the host does not expose the registration API. |
| `debug` | object | after native call | Diagnostic block — see §4.4. |

---

### 4.2 `image_feeder:check_image`

Validates whether a path is a usable image file. **Does not register, does not enter the pool.** Use it to probe before feeding.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Path to verify. |

**Returns**

| Field | Type | Description |
|---|---|---|
| `ok` | boolean | `true` if the path is an existing, non-directory file with a recognized image extension. |
| `path` | string | Normalized path. |
| `name` | string | Basename. |
| `looks_like_image` | boolean | Extension check result, independent of existence. |
| `size` | number | Only returned when the path exists; the field is absent (not null) when the path is missing or unverifiable. |
| `error` | string | Reason when `ok` is `false`. |
| `note` | string | Human-readable explanation. |

**Important:** `check_image` returning `ok:true` means the file *looks* feedable. It does **not** guarantee that `feed_image` will succeed — native-layer registration is a separate step that can still fail.

---

### 4.3 `image_id` may look empty but still be valid

A successful registration can return an `image_id` that appears to be an empty string. This is a **display artifact, not a failure.**

The native layer may return a string consisting of non-printing characters. `JSON.stringify` does not escape these, so they render as visually empty, while the string length is non-zero and the value is truthy.

**Do not write logic like `if (!image_id) { fail }`.** Use a length check:

```js
if (image_id == null || String(image_id).length === 0) { /* treat as empty */ }
```

The `debug` block in the response lets you confirm this situation — see §4.4.
**How this package does it:** the source uses `var idStr = (id === undefined || id === null) ? null : String(id); if (!idStr) { ... }` — the `!idStr` test works because the string is non-empty and therefore truthy, which is equivalent to the length check above but shorter to write.

---

### 4.4 `debug` block

Present on every return path that follows the native call. Intended for verifying that the installed package matches the source you are reading.

| Field | Meaning |
|---|---|
| `build` | Self-identifier string of the build. |
| `id_typeof` | `typeof` of the raw native return value. |
| `id_tag` | `Object.prototype.toString.call` of the raw value — distinguishes `String` / `Object` / etc. When the value is `undefined` or `null`, this is not the `[object ...]` form but the literal strings `"undefined"` / `"null"` (the source special-cases those two first). |
| `id_json` | `JSON.stringify` of the raw value. May appear empty — see §4.3. If the value cannot be serialised, returns the literal string `"<unserializable>"`. |
| `id_str_len` | `String(id).length`. **`-1`** if the value was `null`/`undefined` — not `0`, and not `4` (the length of the string `"null"`). |

`id_tag: "[object String]"` with `id_json: ""` and `id_str_len: 68` is the signature of a valid registration returning non-printing characters.

---

## 5. Complete exit-path reference

`feed_image` has exactly **7 failure paths and 1 success path.** Each returns an unambiguous `ok` value.

| # | Trigger | `ok` | Distinguishing fields |
|---|---|---|---|
| 1 | Empty path, or not absolute / not starting with `file://` | `false` | `error` |
| 2 | Path does not exist | `false` | `error: "该路径不存在"` |
| 3 | Path is a directory | `false` | `is_dir: true`, `hint` (note: **no** `note`) |
| 4 | Extension not in jpg/jpeg/png/gif/webp/bmp | `false` | `hint` |
| 5 | Native interface missing or threw | `false` | `api_missing: true`, `hint` (only the *missing* case sets `api_missing`; a throw only carries `error`) |
| 6 | Native layer returned empty | `false` | `debug`, `error` |
| 7 | Native layer returned a failure sentinel | `false` | `image_id`, `error` |
| ✅ | All checks passed | `true` | `image_id`, `name` |

> **On the count of "7":** `feed_image` actually contains 6 failure `return` statements. "Missing native interface" and "native call threw" share the same `if (err)` branch and the same `return fail`, but they carry different fields (the former adds `api_missing` and `hint`), so they are distinguishable at the call site and are listed above as 7 cases.

**Note on case 3:** directory rejection goes through `_dirReject()`, whose return object has **no `note`** — every other failure path includes one. If you classify by "has `note`", the directory case is the sole exception.

**Note on case 5:** `api_missing: true` only appears when the host does **not** provide `NativeInterface.registerImageFromPath` at all. If the interface exists but throws during the call, the response carries only `error` (value `THROW: ...`) and **no** `api_missing`. Do not conflate the two — the former means the host version is too old, the latter is a runtime error.

**Note on path 7:** the native layer does not throw on failure — it returns a sentinel string containing `failed`. The package detects this case-insensitively and converts it into `ok:false`. This is why `ok:true` can be trusted.

**Note on `content://`:** a path starting with `content://` **skips all three of** the existence check, the directory check, and the extension check, and goes straight to registration (in source: `if (target.indexOf("content://") !== 0) { ...all three checks... }` wraps all three). Cases 1–4 above therefore **do not apply** to `content://`. This is not an endorsement — see §7.

---

## 6. Host compatibility

### 6.1 The registration API is not a public contract

This package depends on an image-registration interface exposed by the host. **That interface is not part of a publicly committed third-party API contract.** It follows that:

- Package availability is tied to how the host implements this interface.
- Any host upgrade may break it, with no advance warning and no way to test in advance on your device.
- There is no "this version is fine, so the next one will be too" guarantee.

**Conclusion: this package can follow host changes, but cannot promise stability across them.** The correct response is a self-check after every host upgrade, not an assumption that it will keep working.

### 6.2 Self-check after every host upgrade

One call, one decision — no need to read source or compare version numbers.

Call `feed_image` with any real image file path, then read the result:

| Result | Meaning | Action |
|---|---|---|
| `ok: true` | Interface works | Normal use |
| `ok: false` + `api_missing: true` | Interface unavailable on this host | Package cannot work on this host; implementation must change |
| `ok: false` + `error` containing native registration failure | Interface present, but rejects this path form | Use a real filesystem path (see §7) |

### 6.3 Model-side compatibility

See §8.

---

## 7. Known limitations

### 7.1 `content://` URIs are not supported

A `content://` URI (gallery records, addresses obtained by forwarding from other apps) **is not caught by any check in this package** — it skips the existence and extension checks entirely and is handed straight to the host's native layer for registration. Whether that succeeds or fails is entirely up to how the host's `registerImageFromPath` handles such a path: **the package itself makes no judgement at all**.
In practice it is usually rejected by the native layer, returning `ok:false` with a native registration-failure error — but that is host behaviour, not a promise made by this package. So do not expect it to "always fail", and do not expect it to "always work".

The package does not block this path at the entry — it attempts registration and reports the honest result. This is intentional: the package does not pretend to support something it cannot deliver, and it does not pre-judge host behaviour.

**Why this does not limit practical use:** all three common image-acquisition routes — finding a file yourself, receiving a path from the user, downloading from the network — end up as real filesystem paths, all of which work. A `content://` URI is a shortcut that does not work; route around it.

### 7.2 Batch image attachment is subject to a host-side limit

When multiple images are attached in a single turn, the host assembles the image links itself, and that assembly is bounded by an internal limit. If that limit is exceeded, trailing content may be dropped **silently** — no error is raised, because the truncation happens after this package has already returned `ok:true`. The package has no visibility into it.

Practical consequence: **this package cannot promise that all images in a batch will be attached.** Feed images one at a time to avoid the issue.

### 7.3 The model must support visual input

See §8.

### 7.4 This package does not send images

It registers images into the conversation's pool. Sending, displaying, and attachment behaviour belong to the host. If an image registers successfully (`ok:true`) but no attachment appears in the conversation, that is a host-side or model-side matter, not a registration failure.

---

## 8. Model compatibility

This package only places images into the conversation's image pool. Whether the model can actually *read* the image depends on whether that model supports visual input — which is independent of this package.

- **Any model with vision support:** works normally. No configuration change required.
- **A model without vision support:** the package still returns `ok:true`, because registration genuinely succeeded. The model will not be able to read the content, and may guess from the filename.

**Therefore: `ok:true` means "the image entered the pool". It does not mean "the model saw it".**

**Troubleshooting:** if a model's description of an image clearly does not match the actual content, first confirm whether that model supports visual input — before suspecting this package.

---

## 9. Return-value contract for callers

When integrating this package, follow these rules:

1. **Branch on `ok`, not on `success`.** `success` is transport-level and is always `true` here.
2. **Never describe image content when `ok` is `false`.** Almost every failure carries a `note` saying exactly this. **Note the one exception: directory rejection (§5, case 3) carries no `note`** — detect it by `is_dir: true`. `ok:false` is itself the do-not-describe signal; do not rely on `note` alone.
3. **Never treat `image_id` looking empty as failure.** See §4.3.
4. **`ok:true` does not guarantee visible attachment.** Check whether the attachment actually appeared before describing the image.
5. **Call `check_image` first if the path source is untrusted.** It is cheap and catches most failures before they cost a native call.

---

## 10. Design principles

This package is built around one rule: **never report success that did not happen.**

- Failures return `ok:false` with a specific reason, never an ambiguous or thrown exception.
- The native layer's silent-failure sentinel is detected and converted to `ok:false`.
- Every failure path carries a `note` instructing the model not to guess.
- The `debug` block exists so that "the code says X" can be verified against "the device did X".

If you find a path where this package returns `ok:true` without an image having entered the pool, that is a bug — please report it.

---

## License

See `LICENSE` in the repository root.
