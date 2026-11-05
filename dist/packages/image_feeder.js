"use strict";
/* METADATA
{
    "name": "image_feeder",
    "display_name": {
        "zh": "图递",
        "en": "ImageRelay"
    },
    "description": {
        "zh": "给一个本地图片路径，注册进当前对话的图片池，让模型真正看到画面。只做这一件事。",
        "en": "Given a local image path, register it into the current conversation's image pool so the model can actually see it. That's the only job."
    },
    "enabledByDefault": true,
    "tools": [
        {
            "name": "feed_image",
            "description": {
                "zh": "把一个本地图片文件注册进当前对话的图片池，使模型能在本轮真正看到画面。支持绝对路径（/sdcard/...）和 file:// 开头；content:// 形式宿主不接受。传入目录会被拒绝。返回 ok:true 表示已进池；ok:false 表示没进去，此时【不要凭猜测描述图片内容】。",
                "en": "Register a local image file into the current conversation's image pool so the model can actually see it this turn. Accepts absolute paths (/sdcard/...) and file:// prefixes; content:// URIs are not accepted by the host. Directories are rejected. ok:true means it entered the pool; ok:false means it did not — do NOT describe the image from guesswork in that case."
            },
            "parameters": [
                {
                    "name": "path",
                    "description": {
                        "zh": "图片的本地路径。绝对路径如 /sdcard/Download/a.jpg，也可写 file:///sdcard/...。",
                        "en": "Local path to the image. Absolute like /sdcard/Download/a.jpg, or file:///sdcard/..."
                    },
                    "type": "string",
                    "required": true
                }
            ]
        },
        {
            "name": "check_image",
            "description": {
                "zh": "只校验一个路径是不是可用的图片文件（是否存在、是否目录、扩展名是否图片），不注册、不进图片池。用于喂图前先探路。",
                "en": "Only verify whether a path is a usable image file (exists, not a directory, image extension). Does not register or feed. Use it to probe before feeding."
            },
            "parameters": [
                {
                    "name": "path",
                    "description": {
                        "zh": "要校验的路径。",
                        "en": "Path to verify."
                    },
                    "type": "string",
                    "required": true
                }
            ]
        }
    ]
}
*/
var IMG_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
var NO_SEE_NOTE = "图片未进图片池，本轮看不到画面。不要凭猜测描述这张图。";
// 把各种写法的路径归一成宿主可用的形式
function _normalize(raw) {
    var p = String(raw === undefined || raw === null ? "" : raw).trim();
    if (!p) return { ok: false, error: "path 为空" };
    if (p.charAt(0) === "'" && p.charAt(p.length - 1) === "'") p = p.slice(1, -1);
    if (p.charAt(0) === '"' && p.charAt(p.length - 1) === '"') p = p.slice(1, -1);
    if (p.indexOf("file://") === 0) {
        p = p.substring(7);
        // file:///sdcard/x -> /sdcard/x ; file://localhost/sdcard/x 也算
        if (p.indexOf("localhost/") === 0) p = p.substring(9);
        try { p = decodeURIComponent(p); } catch (e) { /* 保留原样 */ }
    }
    if (p.indexOf("/") !== 0 && p.indexOf("content://") !== 0) {
        return { ok: false, error: "需要绝对路径（以 / 开头）或 file:// 开头，收到: " + p };
    }
    return { ok: true, path: p };
}
function _isImg(name) {
    var low = String(name || "").toLowerCase();
    for (var i = 0; i < IMG_EXT.length; i++) {
        var ext = IMG_EXT[i];
        if (low.length > ext.length && low.lastIndexOf(ext) === low.length - ext.length) return true;
    }
    return false;
}
function _basename(p) {
    var s = String(p || "");
    var i = s.lastIndexOf("/");
    return i === -1 ? s : s.slice(i + 1);
}
// 探路：存在性 + 是否目录 + 扩展名
async function _probe(p) {
    var r;
    try { r = await Tools.Files.exists(p); }
    catch (e) { return { known: false, exists: false, err: "THROW: " + String(e) }; }
    if (!r) return { known: false, exists: false, err: "exists 返回空" };
    if (typeof r === "boolean") return { known: true, exists: r, isDir: false, size: null };
    if (typeof r.exists === "boolean") {
        return {
            known: true,
            exists: r.exists,
            isDir: (r.isDirectory === true) || (r.isDir === true),
            size: r.size === undefined ? null : r.size
        };
    }
    return { known: false, exists: false, err: "无法识别的 exists 返回结构" };
}
function _dirReject(p) {
    var name = _basename(String(p).replace(/\/+$/, ""));
    return {
        success: true,
        ok: false,
        is_dir: true,
        path: p,
        error: "这是一个目录，不是图片文件",
        hint: "本包只接受单个图片文件路径。目录里的图请自行拼出具体文件名再传。",
        name: name
    };
}
async function check_image(params) {
    var raw = params && params.path !== undefined ? params.path : "";
    var n = _normalize(raw);
    if (!n.ok) return { success: true, ok: false, error: n.error };
    var p = n.path;
    var pr = await _probe(p);
    var out = {
        success: true,
        ok: false,
        path: p,
        name: _basename(p),
        looks_like_image: _isImg(p)
    };
    if (!pr.known) {
        out.error = pr.err || "无法确认该路径是否存在";
        out.note = "存在性未知，不能当作可用。";
        return out;
    }
    if (!pr.exists) {
        out.error = "该路径不存在";
        return out;
    }
    if (pr.isDir) return _dirReject(p);
    if (!_isImg(p)) {
        out.error = "扩展名不在图片类型内（jpg/jpeg/png/gif/webp/bmp）";
        out.size = pr.size;
        out.note = "原生层可能仍能注册，但多半不是图片。";
        return out;
    }
    out.ok = true;
    out.size = pr.size;
    out.note = "是可用图片文件，可以喂。";
    return out;
}
async function feed_image(params) {
    var raw = params && params.path !== undefined ? params.path : "";
    var n = _normalize(raw);
    if (!n.ok) return { success: true, ok: false, error: n.error, note: NO_SEE_NOTE };
    var target = n.path;
    // 先探路：content:// 不走 exists，直接尝试注册
    if (target.indexOf("content://") !== 0) {
        var pr = await _probe(target);
        if (pr.known) {
            if (!pr.exists) {
                return { success: true, ok: false, path: target, error: "该路径不存在", note: NO_SEE_NOTE };
            }
            if (pr.isDir) return _dirReject(target);
        }
        if (!_isImg(target)) {
            return {
                success: true, ok: false, path: target,
                error: "扩展名不是图片类型（jpg/jpeg/png/gif/webp/bmp）",
                hint: "如果确认它是图片（比如无扩展名），请先重命名后再喂。",
                note: NO_SEE_NOTE
            };
        }
    }
    // ---- 核心：注册进当前对话的图片池 ----
    var id = null;
    var err = null;
    var apiMissing = false;
    try {
        if (typeof NativeInterface !== "undefined" && NativeInterface &&
            typeof NativeInterface.registerImageFromPath === "function") {
            id = NativeInterface.registerImageFromPath(target);
        } else {
            apiMissing = true;
            err = "NativeInterface.registerImageFromPath 不可用（宿主未提供该接口）";
        }
    } catch (e) {
        err = "THROW: " + String(e);
    }
    if (err) {
        var fail = { success: true, ok: false, path: target, error: err, note: NO_SEE_NOTE };
        if (apiMissing) {
            fail.api_missing = true;
            fail.hint = "当前宿主版本不提供该 API。本包依赖 Operit 内部接口 registerImageFromPath，非公开契约，宿主版本变动可能导致失效。";
        }
        return fail;
    }
    // ---- 自报身份：让返回值把真实情况说出来，便于核对「装的这份 = 源码这份」----
    var _dbg = {
        build: "v1.0.2-selfreport",
        id_typeof: typeof id,
        id_tag: (id === undefined) ? "undefined"
              : (id === null) ? "null"
              : Object.prototype.toString.call(id),
        id_json: (function () {
            try { return JSON.stringify(id); } catch (e) { return "<unserializable>"; }
        })(),
        id_str_len: (id === undefined || id === null) ? -1 : String(id).length
    };
    var idStr = (id === undefined || id === null) ? null : String(id);
    if (!idStr) {
        return { success: true, ok: false, path: target, debug: _dbg,
                 error: "原生层返回空，未拿到 image id", note: NO_SEE_NOTE };
    }
    // 原生层失败时不抛异常，而是回一个带 failed 的哨兵串，必须识别出来，不许谎报 ok:true
    if (idStr.toLowerCase().indexOf("failed") !== -1) {
        return {
            success: true,
            ok: false,
            path: target,
            name: _basename(target),
            image_id: idStr,
            debug: _dbg,
            error: "原生层注册失败: " + idStr,
            note: NO_SEE_NOTE
        };
    }
    return {
        success: true,
        ok: true,
        path: target,
        name: _basename(target),
        image_id: idStr,
        debug: _dbg,
        note: "图片已注册进图片池。若本轮顶部未出现图片附件，说明没挂上，此时不要描述画面内容。"
    };
}
exports.check_image = check_image;
exports.feed_image = feed_image;