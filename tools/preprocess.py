#!/usr/bin/env python3
import argparse
import json
import re
from html import escape
from pathlib import PurePosixPath
from urllib.parse import quote

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
URL_RE = re.compile(r"^(https?://|mailto:)")

def has_arabic(text: str) -> bool:
    return bool(ARABIC_RE.search(text or ""))

def first_strong_direction(text: str) -> str:
    """Paragraph-level rule: first Arabic letter => RTL, first Latin letter => LTR.
    If Arabic exists but appears after neutral chars and no Latin appeared first, RTL.
    """
    for ch in text or "":
        if ARABIC_RE.match(ch):
            return "rtl"
        if ("A" <= ch <= "Z") or ("a" <= ch <= "z"):
            return "ltr"
    return "rtl" if has_arabic(text) else "ltr"

def paragraph_class(text: str) -> str:
    return ' class="ar-block" lang="ar"' if first_strong_direction(text) == "rtl" else ""

def split_paragraphs(text: str):
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    # Keep single line breaks inside a paragraph, split on blank lines.
    parts = re.split(r"\n\s*\n+", text.strip())
    return [p.strip("\n") for p in parts if p.strip()]

def inline_html(text: str) -> str:
    return escape(text).replace("\n", "<br>")

def paragraphs_html(text: str, block_tag="p") -> str:
    paras = split_paragraphs(text)
    if not paras:
        return ""
    out = []
    for p in paras:
        direction = first_strong_direction(p)
        cls = paragraph_class(p)
        out.append(f'<{block_tag} dir="{direction}"{cls}>{inline_html(p)}</{block_tag}>')
    return "".join(out)

def text_to_plain(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        out = []
        for part in value:
            if isinstance(part, str):
                out.append(part)
            elif isinstance(part, dict):
                out.append(part.get("text", ""))
        return "".join(out)
    return str(value)

def ent_to_inline(ent):
    typ = ent.get("type", "plain")
    txt = ent.get("text", "")
    safe = inline_html(txt)
    if typ == "bold":
        return f"<strong>{safe}</strong>"
    if typ == "italic":
        return f"<em>{safe}</em>"
    if typ == "underline":
        return f"<u>{safe}</u>"
    if typ == "strikethrough":
        return f"<s>{safe}</s>"
    if typ in ("code", "pre"):
        return f"<code>{safe}</code>"
    if typ == "link":
        href = txt if URL_RE.match(txt) else ent.get("href", txt)
        return f'<a href="{escape(href, quote=True)}" target="_blank" rel="noopener noreferrer">{safe}</a>'
    if typ == "text_link":
        href = ent.get("href", txt)
        return f'<a href="{escape(href, quote=True)}" target="_blank" rel="noopener noreferrer">{safe}</a>'
    return safe

def flush_inline_paragraph(buffer):
    raw = "".join(part["plain"] for part in buffer)
    if not raw.strip():
        return ""
    rendered = "".join(part["html"] for part in buffer)
    # Split rendered paragraphs only when the raw text has blank lines. This keeps formatting entities intact enough.
    raw_paras = split_paragraphs(raw)
    if len(raw_paras) <= 1:
        direction = first_strong_direction(raw)
        cls = paragraph_class(raw)
        return f'<p dir="{direction}"{cls}>{rendered.strip()}</p>'

    # If the inline run contains formatting across paragraphs, reconstruct from raw safely.
    # This sacrifices inline formatting only for multi-paragraph mixed runs, but preserves block accuracy.
    return paragraphs_html(raw)

def entities_to_html(entities):
    if not entities:
        return ""

    out = []
    buffer = []
    for ent in entities:
        typ = ent.get("type", "plain")
        txt = ent.get("text", "")
        if typ == "blockquote":
            out.append(flush_inline_paragraph(buffer))
            buffer = []
            # Apply paragraph logic inside blockquote.
            body = paragraphs_html(txt)
            qdir = first_strong_direction(txt)
            cls = paragraph_class(txt)
            out.append(f'<blockquote dir="{qdir}"{cls}>{body}</blockquote>')
        else:
            buffer.append({"plain": txt, "html": ent_to_inline(ent)})
    out.append(flush_inline_paragraph(buffer))
    return "".join(out)

def text_to_html(msg):
    entities = msg.get("text_entities") or []
    if entities:
        return entities_to_html(entities)
    return paragraphs_html(text_to_plain(msg.get("text", "")))

def message_direction(text):
    # This is only a fallback for the entry wrapper. Paragraphs carry real direction.
    return "rtl" if first_strong_direction(text) == "rtl" else "ltr"

def archive_url(base, path, flatten=False):
    if not path or path.startswith("("):
        return None
    filename = PurePosixPath(path).name if flatten else path
    encoded = "/".join(quote(seg) for seg in filename.split("/"))
    return base.rstrip("/") + "/" + encoded

def media_kind(msg, source_key):
    mt = msg.get("media_type", "")
    mime = msg.get("mime_type", "") or ""
    path = msg.get(source_key, "") or ""
    if source_key == "photo":
        return "image"
    if source_key == "video_file" or mt == "video_file" or mime.startswith("video/"):
        return "video"
    if mt in ("audio_file", "voice_message") or mime.startswith("audio/"):
        return "audio"
    if mime.startswith("image/"):
        return "image"
    low = path.lower()
    if low.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
        return "image"
    if low.endswith((".mp4", ".webm", ".mov")):
        return "video"
    if low.endswith((".mp3", ".m4a", ".ogg", ".opus", ".wav")):
        return "audio"
    return "file"

def build_media(msg, media_base, flatten=False):
    media = []
    for key in ("photo", "file", "video_file", "thumbnail"):
        path = msg.get(key)
        if not path or not isinstance(path, str) or path.startswith("("):
            continue
        kind = media_kind(msg, key)
        title = msg.get("title") or msg.get("file_name") or PurePosixPath(path).name
        media.append({
            "kind": kind,
            "sourceKey": key,
            "path": path,
            "url": archive_url(media_base, path, flatten),
            "fileName": msg.get("file_name") or PurePosixPath(path).name,
            "title": title,
            "titleDir": first_strong_direction(title),
            "mime": msg.get("mime_type"),
            "durationSeconds": msg.get("duration_seconds"),
            "width": msg.get("width"),
            "height": msg.get("height"),
            "size": msg.get("file_size") or msg.get("photo_file_size"),
        })
    return media

def normalize(raw, media_base, flatten=False):
    out = {
        "name": raw.get("name", "Telegram Archive"),
        "type": raw.get("type"),
        "sourceId": raw.get("id"),
        "generatedWith": "alqaddari-archive-preprocess-v6",
        "mediaMode": "flattened" if flatten else "folders",
        "messages": []
    }
    for msg in raw.get("messages", []):
        if msg.get("type") != "message":
            continue
        plain = text_to_plain(msg.get("text", ""))
        html_text = text_to_html(msg)
        media = build_media(msg, media_base, flatten)
        if not plain.strip() and not media:
            continue
        item = {
            "id": msg.get("id"),
            "anchor": f"m{msg.get('id')}",
            "date": msg.get("date", ""),
            "timestamp": int(msg.get("date_unixtime", 0) or 0),
            "author": msg.get("author") or msg.get("from") or raw.get("name"),
            "forwardedFrom": msg.get("forwarded_from"),
            "forwardedDir": first_strong_direction(msg.get("forwarded_from", "")),
            "replyTo": msg.get("reply_to_message_id"),
            "edited": msg.get("edited"),
            "dir": message_direction(plain),
            "html": html_text,
            "plain": plain,
            "media": media,
            "tags": []
        }
        if media:
            item["tags"].extend(sorted(set(m["kind"] for m in media)))
        else:
            item["tags"].append("text")
        if msg.get("forwarded_from"):
            item["tags"].append("forwarded")
        out["messages"].append(item)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--media-base", default="")
    ap.add_argument("--flatten-media", action="store_true")
    args = ap.parse_args()

    raw = json.loads(open(args.input, encoding="utf-8").read())
    data = normalize(raw, args.media_base, args.flatten_media)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Wrote {args.output} with {len(data['messages'])} messages; media mode={data['mediaMode']}")

if __name__ == "__main__":
    main()
