"use strict";

/* ── State ─────────────────────────────────────────────── */
const state = {
  data: null, messages: [], filtered: [],
  query: "", filter: "all", month: "",
  view: "read",
  visible: 60, rendered: 0,
  lastDate: "", lastMonth: "",
  monthCounts: new Map(),
  galleryDirty: true, indexDirty: true,
};
const PAGE = 60;
const GALLERY_CAP = 600, INDEX_CAP = 500;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const els = {
  progress: $("#progress"), railPct: $("#rail-pct"),
  toc: $("#toc"), tocM: $("#toc-m"),
  drawer: $("#drawer"), backdrop: $("#drawer-backdrop"),
  contentsBtn: $("#contents-btn"),
  drawerClose: $("#drawer-close"), drawerTop: $("#drawer-top"), drawerEnd: $("#drawer-end"),
  masthead: $(".masthead"), chapterNow: $("#chapter-now"),
  status: $("#status"),
  search: $("#search-input"), clear: $("#clear-btn"),
  chips: $("#chips"), results: $("#results-count"), month: $("#month-filter"),
  timeline: $("#timeline"), noResults: $("#no-results"), resetFilters: $("#reset-filters"),
  sentinel: $("#sentinel"), sentinelLabel: $("#sentinel-label"), loadMore: $("#load-more"),
  gallery: $("#gallery"), indexBody: $("#index-body"), indexNote: $("#index-note"),
  views: { read: $("#view-read"), gallery: $("#view-gallery"), index: $("#view-index") },
  vsBtns: $$(".vs-btn"),
  colophon: $("#colophon-stats"),
  theme: $("#theme-toggle"), btnTop: $("#btn-top"),
  chip: $("#reading-chip"), chipText: $("#reading-chip-text"),
  lightbox: $("#lightbox"), lbImg: $("#lb-img"),
  lbCaption: $("#lb-caption-text"), lbCount: $("#lb-count"),
};

const desktopMQ = matchMedia("(min-width: 981px)");

/* ── Formatting ────────────────────────────────────────── */
const fmtDate   = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const fmtShort  = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtMonthY = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const fmtMonY   = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });
const fmtTime   = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

const parseDate = m => m.timestamp ? new Date(m.timestamp * 1000) : new Date(m.date);
const dateKey   = m => parseDate(m).toISOString().slice(0, 10);
const monthKey  = m => { const d = parseDate(m); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const esc       = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const permalink = m => `${location.href.split("#")[0]}#m${m.id}`;
function parseDateKey(k) { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1); }

function formatSize(size) {
  if (!size) return "";
  if (size < 1048576) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1048576).toFixed(1)} MB`;
}
function formatClock(s) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/* ── Tags ──────────────────────────────────────────────── */
function tagsOf(m) {
  if (m._tags) return m._tags;
  let t = Array.isArray(m.tags) && m.tags.length ? [...m.tags] : [];
  if (!t.length) {
    const kinds = (m.media || []).map(x => x.kind).filter(Boolean);
    if (kinds.includes("image")) t.push("image");
    if (kinds.includes("audio")) t.push("audio");
    if (kinds.includes("video")) t.push("video");
    if (kinds.some(k => !["image", "audio", "video"].includes(k))) t.push("file");
    if (!t.length) t.push("text");
  }
  if (m.forwardedFrom && !t.includes("forwarded")) t.push("forwarded");
  return (m._tags = [...new Set(t)]);
}
const TAG_LABELS = { all: "All", text: "Text", image: "Images", audio: "Audio", video: "Video", file: "Files", forwarded: "Forwarded", media: "Media" };
const TAG_ORDER  = ["text", "image", "audio", "video", "file", "forwarded"];

function buildChips() {
  const counts = new Map();
  state.messages.forEach(m => tagsOf(m).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
  const keys = [...counts.keys()].sort((a, b) => {
    const ia = TAG_ORDER.indexOf(a), ib = TAG_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const chip = (f, label, n) =>
  `<button class="chip${f === state.filter ? " active" : ""}" data-filter="${esc(f)}" type="button">${esc(label)}<span class="chip-count">${n}</span></button>`;
  const labelFor = k => TAG_LABELS[k] || k.charAt(0).toUpperCase() + k.slice(1);
  els.chips.innerHTML = chip("all", "All", state.messages.length) +
  keys.map(k => chip(k, labelFor(k), counts.get(k))).join("");
}

/* ── Contents (rail + drawer) + month select ───────────── */
const monthLabels = new Map();

function buildTocAndMonths() {
  const counts = new Map();
  state.messages.forEach(m => {
    const k = monthKey(m);
    counts.set(k, (counts.get(k) || 0) + 1);
    if (!monthLabels.has(k)) monthLabels.set(k, fmtMonthY.format(parseDate(m)));
  });
    const keys = [...counts.keys()].sort().reverse();

    const tocHTML = keys.map(k =>
    `<a class="toc-item" href="#ch-${k}" data-month="${k}">
    <span class="toc-label">${fmtMonY.format(parseDateKey(k))}</span>
    <span class="toc-count">${counts.get(k)}</span>
    </a>`).join("");
    els.toc.innerHTML = tocHTML;
    els.tocM.innerHTML = tocHTML;

    const byYear = new Map();
    keys.forEach(k => { const y = k.slice(0, 4); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(k); });
    els.month.innerHTML = `<option value="">All dates</option>` +
    [...byYear.entries()].map(([y, ks]) =>
    `<optgroup label="${y}">${ks.map(k => `<option value="${k}">${monthLabels.get(k)}</option>`).join("")}</optgroup>`).join("");
}

/* TOC clicks — rail and drawer share one handler */
document.addEventListener("click", e => {
  const a = e.target.closest(".toc-item");
  if (!a) return;
  e.preventDefault();
  closeDrawer();
  gotoMonth(a.dataset.month);
});

/* ── Drawer (mobile contents) ──────────────────────────── */
function openDrawer() {
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
  els.backdrop.classList.add("show");
  document.body.classList.add("drawer-open");
}
function closeDrawer() {
  if (!els.drawer.classList.contains("open")) return;
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
  els.backdrop.classList.remove("show");
  document.body.classList.remove("drawer-open");
}
els.contentsBtn.addEventListener("click", openDrawer);
els.drawerClose.addEventListener("click", closeDrawer);
els.backdrop.addEventListener("click", closeDrawer);
els.drawerTop.addEventListener("click", () => { closeDrawer(); scrollTo({ top: 0, behavior: "smooth" }); });
els.drawerEnd.addEventListener("click", () => { closeDrawer(); scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); });

/* ── Views ─────────────────────────────────────────────── */
function setView(v) {
  state.view = v;
  Object.entries(els.views).forEach(([name, el]) => { el.hidden = name !== v; });
  els.vsBtns.forEach(b => {
    const on = b.dataset.view === v;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  if (v === "gallery" && state.galleryDirty) renderGallery();
  if (v === "index" && state.indexDirty) renderIndex();
  closeLightbox();
}
els.vsBtns.forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

/* ── Filtering ─────────────────────────────────────────── */
function applyFilters() {
  const q = state.query.trim().toLowerCase();
  state.filtered = state.messages.filter(m => {
    if (q && !(m.plain || "").toLowerCase().includes(q)) return false;
    if (state.filter !== "all" && !tagsOf(m).includes(state.filter)) return false;
    if (state.month && monthKey(m) !== state.month) return false;
    return true;
  });
  state.monthCounts = new Map();
  state.filtered.forEach(m => { const k = monthKey(m); state.monthCounts.set(k, (state.monthCounts.get(k) || 0) + 1); });

  state.visible = PAGE;
  state.galleryDirty = true;
  state.indexDirty = true;

  if (state.view === "read") renderRead(true);
  else if (state.view === "gallery") renderGallery();
  else renderIndex();

  const n = state.filtered.length;
  els.results.textContent = `${n} ${n === 1 ? "entry" : "entries"}`;
  els.noResults.hidden = n > 0;
  els.sentinel.style.display = state.view === "read" && n ? "" : "none";
}

/* ── Read view (incremental) ───────────────────────────── */
let chapterIO = null;

function renderRead(reset) {
  if (reset) {
    chapterIO?.disconnect();
    els.timeline.innerHTML = "";
    state.rendered = 0; state.lastDate = ""; state.lastMonth = "";
  }
  const end = Math.min(state.visible, state.filtered.length);
  if (state.rendered >= end) { updateSentinel(); return; }

  let html = "";
  for (let i = state.rendered; i < end; i++) {
    const m = state.filtered[i];
    const mk = monthKey(m);
    if (mk !== state.lastMonth) { html += chapterHtml(mk); state.lastMonth = mk; state.lastDate = ""; }
    const dk = dateKey(m);
    if (dk !== state.lastDate) { html += dayHtml(m); state.lastDate = dk; }
    html += entryHtml(m);
  }
  els.timeline.insertAdjacentHTML("beforeend", html);
  state.rendered = end;

  updateSentinel();
  setupAudioPlayers();
  observeChapters();
}

function chapterHtml(mk) {
  const d = parseDateKey(mk);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const label = monthLabels.get(mk) || fmtMonthY.format(d);
  const [mName, ...rest] = label.split(" ");
  return `<section class="chapter" id="ch-${mk}" data-month="${mk}">
  <span class="chapter-num" aria-hidden="true">${mm}</span>
  <header class="chapter-head">
  <h2 class="chapter-title">${mName} <span class="chapter-year">${rest.join(" ")}</span></h2>
  <p class="chapter-meta">${state.monthCounts.get(mk) || 0} entries</p>
  </header>
  </section>`;
}
function dayHtml(m) {
  const d = parseDate(m);
  return `<div class="day-mark" data-date="${dateKey(m)}">
  <span class="day-label">${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "long" })} ${d.getFullYear()}</span>
  <span class="day-line" aria-hidden="true"></span>
  </div>`;
}
function entryHtml(m) {
  const d = parseDate(m);
  return `<article class="entry" id="m${m.id}" data-month="${monthKey(m)}">
  <div class="entry-meta">
  <span class="entry-stamp">
  <time datetime="${esc(m.date || d.toISOString())}">${fmtTime.format(d)}</time>
  <a class="entry-num" href="#m${m.id}" title="Permalink">№ ${m.id}</a>
  </span>
  ${metaPopoverHtml(m)}
  </div>
  <div class="entry-text">${m.html || ""}</div>
  ${mediaHtml(m.media)}
  </article>`;
}
function metaPopoverHtml(m) {
  const d = parseDate(m);
  const kinds = (m.media || []).map(x => x.kind).filter(Boolean);
  return `<div class="entry-tools">
  <button class="more-btn" type="button" aria-label="Entry details" aria-expanded="false">⋯</button>
  <div class="meta-popover" hidden>
  <p><span class="pop-label">Entry</span>№ ${m.id} — ${fmtDate.format(d)} · ${fmtTime.format(d)}</p>
  ${m.forwardedFrom ? `<p><span class="pop-label">Forwarded from</span><span dir="${esc(m.forwardedDir || "ltr")}">${esc(m.forwardedFrom)}</span></p>` : ""}
  ${m.edited ? `<p><span class="pop-label">Note</span>Edited after posting</p>` : ""}
  ${kinds.length ? `<p><span class="pop-label">Contains</span>${esc(kinds.join(", "))}</p>` : ""}
  <div class="pop-actions">
  <button class="copy-link" type="button" data-link="${esc(permalink(m))}">Copy link</button>
  <button class="copy-text" type="button" data-text="${esc(m.plain || "")}">Copy text</button>
  </div>
  </div>
  </div>`;
}
function mediaHtml(media) {
  if (!media || !media.length) return "";
  const items = media.map(m => {
    const url = m.url || "";
    const title = esc(m.title || m.fileName || m.path || "Media");
    const titleDir = esc(m.titleDir || "ltr");
    const details = [
      m.kind || "media",
      m.durationSeconds ? `${Math.round(m.durationSeconds)}s` : "",
                          (m.width && m.height) ? `${m.width}×${m.height}` : "",
                          m.size ? formatSize(m.size) : "",
    ].filter(Boolean).join(" · ");

    if (m.kind === "image") return `<figure class="media-box media-image">
      <a href="${esc(url)}" data-lightbox><img src="${esc(url)}" alt="${title}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>
      <figcaption class="media-caption">${esc(details)}</figcaption>
      </figure>`;

    if (m.kind === "audio") {
      const dur = m.durationSeconds ? formatClock(Number(m.durationSeconds)) : "0:00";
      return `<figure class="media-audio" data-audio-shell>
      <div class="custom-audio">
      <div class="audio-title" dir="${titleDir}">${title}</div>
      <audio class="native-audio" preload="metadata" src="${esc(url)}" referrerpolicy="no-referrer"></audio>
      <div class="audio-controls">
      <button class="audio-play" type="button" aria-label="Play audio">▶</button>
      <div class="audio-progress" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="audio-thumb"></span></div>
      <span class="audio-time"><span class="audio-current">0:00</span> / <span class="audio-duration">${dur}</span></span>
      </div>
      <p class="media-open"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open audio ↗</a></p>
      </div>
      </figure>`;
    }
    if (m.kind === "video") return `<figure class="media-box media-video">
      <video controls preload="metadata" src="${esc(url)}" referrerpolicy="no-referrer"></video>
      <figcaption class="media-caption">${title} · ${esc(details)}</figcaption>
      </figure>`;

    return `<div class="media-box media-file">
    <a class="file-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" dir="${titleDir}">
    <strong>${title}</strong><small>${esc(details)} · Open ↗</small>
    </a>
    </div>`;
  }).join("");
  return `<div class="media-list">${items}</div>`;
}

function updateSentinel() {
  const total = state.filtered.length;
  if (!total) { els.sentinelLabel.textContent = ""; els.loadMore.hidden = true; return; }
  if (state.rendered < total) {
    els.sentinelLabel.textContent = `Showing ${state.rendered} of ${total}`;
    els.loadMore.hidden = "IntersectionObserver" in window;
  } else {
    els.sentinelLabel.textContent = total > PAGE ? `⁂ End of the record — ${total} entries` : "";
    els.loadMore.hidden = true;
  }
}
function loadMore() {
  if (state.rendered >= state.filtered.length) return;
  state.visible += PAGE;
  renderRead(false);
}
if ("IntersectionObserver" in window) {
  new IntersectionObserver(es => { if (es[0].isIntersecting) loadMore(); }, { rootMargin: "700px 0px" })
  .observe(els.sentinel);
}
els.loadMore.addEventListener("click", loadMore);

/* ── Chapter tracking ──────────────────────────────────── */
function observeChapters() {
  if (!("IntersectionObserver" in window)) return;
  if (!chapterIO) {
    chapterIO = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) {
        const key = e.target.dataset.month;
        setActiveToc(key);
        els.chapterNow.textContent = monthLabels.get(key) || "";
        els.chipText.textContent = monthLabels.get(key) || "";
      }
    }, { rootMargin: "-15% 0px -70% 0px" });
  }
  chapterIO.disconnect();
  $$(".chapter").forEach(c => chapterIO.observe(c));
}
function setActiveToc(key) {
  const scrollRail = desktopMQ.matches;
  $$(".toc-item").forEach(a => {
    const on = a.dataset.month === key;
    a.classList.toggle("active", on);
    if (on && scrollRail && a.closest("#toc")) a.scrollIntoView({ block: "nearest" });
  });
}

/* ── Gallery view ──────────────────────────────────────── */
function renderGallery() {
  const imgs = [];
  outer: for (const m of state.filtered) {
    for (const med of (m.media || [])) {
      if (med.kind === "image" && med.url) {
        imgs.push({ url: med.url, msg: m });
        if (imgs.length >= GALLERY_CAP) break outer;
      }
    }
  }
  els.gallery.innerHTML = imgs.length
  ? imgs.map(o => `<figure class="g-card">
  <a href="${esc(o.url)}" data-lightbox><img src="${esc(o.url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>
  <figcaption>${fmtShort.format(parseDate(o.msg))} · № ${o.msg.id}</figcaption>
  </figure>`).join("")
  : `<p class="index-note">No images under these filters.</p>`;
  state.galleryDirty = false;
}

/* ── Index view ────────────────────────────────────────── */
function renderIndex() {
  const rows = state.filtered.slice(0, INDEX_CAP);
  els.indexBody.innerHTML = rows.map(m => {
    const excerpt = esc((m.plain || "").replace(/\s+/g, " ").trim()).slice(0, 160) || "—";
    return `<tr class="ix-row" data-id="${m.id}" tabindex="0">
    <td class="ix-date">${fmtShort.format(parseDate(m))}</td>
    <td class="ix-num">№ ${m.id}</td>
    <td class="ix-excerpt">${excerpt}</td>
    <td class="ix-tags">${esc(tagsOf(m).join(" · "))}</td>
    </tr>`;
  }).join("");
  els.indexNote.hidden = state.filtered.length <= INDEX_CAP;
  els.indexNote.textContent = `Showing the first ${INDEX_CAP} of ${state.filtered.length} — narrow your search to see the rest.`;
  state.indexDirty = false;
}
els.indexBody.addEventListener("click", e => {
  const row = e.target.closest(".ix-row");
  if (row) gotoEntry(row.dataset.id);
});
els.indexBody.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const row = e.target.closest(".ix-row");
  if (row) gotoEntry(row.dataset.id);
});

/* ── Navigation: entries, months, deep links ───────────── */
function gotoEntry(id, retryUnfiltered = true) {
  setView("read");
  let idx = state.filtered.findIndex(m => String(m.id) === String(id));
  if (idx < 0 && retryUnfiltered) {
    state.query = ""; els.search.value = ""; els.clear.classList.remove("visible");
    state.filter = "all"; state.month = ""; els.month.value = "";
    $$(".chip", els.chips).forEach(c => c.classList.toggle("active", c.dataset.filter === "all"));
    applyFilters();
    idx = state.filtered.findIndex(m => String(m.id) === String(id));
  }
  if (idx < 0) return;
  if (idx >= state.rendered) { state.visible = idx + PAGE; renderRead(false); }
  requestAnimationFrame(() => {
    const el = document.getElementById(`m${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  });
}
function gotoMonth(key) {
  if (state.month) { state.month = ""; els.month.value = ""; applyFilters(); }
  setView("read");
  const target = () => document.getElementById(`ch-${key}`);
  if (!target()) {
    const idx = state.filtered.findIndex(m => monthKey(m) === key);
    if (idx < 0) return;
    state.visible = Math.max(state.visible, idx + PAGE);
    renderRead(false);
  }
  requestAnimationFrame(() => target()?.scrollIntoView({ behavior: "smooth" }));
}
addEventListener("hashchange", () => {
  const m = location.hash.match(/^#m(\d+)$/);
  if (m) return gotoEntry(m[1], false);
  const c = location.hash.match(/^#ch-(\d{4}-\d{2})$/);
  if (c) gotoMonth(c[1]);
});

/* ── Audio players ─────────────────────────────────────── */
function setupAudioPlayers() {
  $$("#timeline [data-audio-shell]:not([data-ready])").forEach(shell => {
    shell.dataset.ready = "1";
    const audio = $(".native-audio", shell), play = $(".audio-play", shell),
                                                               progress = $(".audio-progress", shell), current = $(".audio-current", shell),
                                                               duration = $(".audio-duration", shell);
                                                               let dragging = false;
                                                               const paint = pct => {
                                                                 progress.style.setProperty("--progress", `${pct * 100}%`);
                                                                 progress.setAttribute("aria-valuenow", String(Math.round(pct * 100)));
                                                               };
                                                               const seekFromX = x => {
                                                                 const r = progress.getBoundingClientRect();
                                                                 const pct = Math.max(0, Math.min(1, (x - r.left) / r.width));
                                                                 paint(pct);
                                                                 if (Number.isFinite(audio.duration) && audio.duration > 0) {
                                                                   audio.currentTime = pct * audio.duration;
                                                                   current.textContent = formatClock(audio.currentTime);
                                                                 }
                                                               };
                                                               play.addEventListener("click", () => {
                                                                 $$("audio").forEach(a => { if (a !== audio) a.pause(); });
                                                                 if (audio.paused) audio.play().catch(() => {}); else audio.pause();
                                                               });
                                                               audio.addEventListener("play", () => { play.textContent = "Ⅱ"; });
                                                               audio.addEventListener("pause", () => { play.textContent = "▶"; });
                                                               audio.addEventListener("loadedmetadata", () => { duration.textContent = formatClock(audio.duration); });
                                                               audio.addEventListener("timeupdate", () => {
                                                                 if (dragging) return;
                                                                 paint(audio.duration ? audio.currentTime / audio.duration : 0);
                                                                 current.textContent = formatClock(audio.currentTime);
                                                               });
                                                               audio.addEventListener("ended", () => { play.textContent = "▶"; paint(0); current.textContent = "0:00"; });
                                                               progress.addEventListener("pointerdown", e => { dragging = true; progress.setPointerCapture?.(e.pointerId); seekFromX(e.clientX); e.preventDefault(); });
                                                               progress.addEventListener("pointermove", e => { if (dragging) seekFromX(e.clientX); });
                                                               const stop = e => {
                                                                 if (!dragging) return;
                                                                 dragging = false;
                                                                 try { progress.releasePointerCapture?.(e.pointerId); } catch {}
                                                                 seekFromX(e.clientX);
                                                               };
                                                               progress.addEventListener("pointerup", stop);
                                                               progress.addEventListener("pointercancel", stop);
                                                               progress.addEventListener("keydown", e => {
                                                                 if (!Number.isFinite(audio.duration)) return;
                                                                 if (e.key === "ArrowRight" || e.key === "ArrowUp") { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); e.preventDefault(); }
                                                                 if (e.key === "ArrowLeft" || e.key === "ArrowDown") { audio.currentTime = Math.max(0, audio.currentTime - 5); e.preventDefault(); }
                                                               });
  });
}

/* ── Lightbox ──────────────────────────────────────────── */
let lbGallery = [], lbIndex = 0, lbReturn = null;
function currentAnchors() { return $$(`#view-${state.view} [data-lightbox]`); }
function openLightbox(anchor) {
  lbGallery = currentAnchors();
  lbIndex = lbGallery.indexOf(anchor);
  if (lbIndex < 0) { lbGallery = [anchor]; lbIndex = 0; }
  lbReturn = anchor;
  showLightbox();
  els.lightbox.hidden = false;
  document.body.classList.add("lb-open");
  $(".lb-close", els.lightbox).focus();
}
function showLightbox() {
  const a = lbGallery[lbIndex];
  els.lbImg.src = a.href;
  els.lbImg.alt = $("img", a)?.alt || "";
  els.lbCaption.textContent =
  a.closest("figure")?.querySelector(".media-caption, figcaption")?.textContent || "";
  els.lbCount.textContent = lbGallery.length > 1 ? `${lbIndex + 1} of ${lbGallery.length}` : "";
  const multi = lbGallery.length > 1;
  $(".lb-prev", els.lightbox).style.visibility = multi ? "" : "hidden";
  $(".lb-next", els.lightbox).style.visibility = multi ? "" : "hidden";
}
function stepLightbox(dir) {
  if (lbGallery.length < 2) return;
  lbIndex = (lbIndex + dir + lbGallery.length) % lbGallery.length;
  showLightbox();
}
function closeLightbox() {
  if (els.lightbox.hidden) return;
  els.lightbox.hidden = true;
  document.body.classList.remove("lb-open");
  els.lbImg.src = "";
  lbReturn?.focus?.();
}
els.lightbox.addEventListener("click", e => {
  if (e.target === els.lightbox || e.target.closest(".lb-close")) closeLightbox();
  if (e.target.closest(".lb-prev")) stepLightbox(-1);
  if (e.target.closest(".lb-next")) stepLightbox(1);
});

/* ── Popovers & copy (delegated) ───────────────────────── */
function closePopovers() {
  $$(".meta-popover").forEach(p => { p.hidden = true; });
  $$(".more-btn").forEach(b => b.setAttribute("aria-expanded", "false"));
}
async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch { return false; }
  }
}
document.addEventListener("click", async e => {
  const img = e.target.closest("[data-lightbox]");
  if (img) { e.preventDefault(); openLightbox(img); return; }
  const more = e.target.closest(".more-btn");
  if (more) {
    const pop = more.parentElement.querySelector(".meta-popover");
    const was = pop.hidden;
    closePopovers();
    pop.hidden = !was;
    more.setAttribute("aria-expanded", String(!was));
    return;
  }
  const act = e.target.closest(".copy-link, .copy-text");
  if (act) {
    const isLink = act.classList.contains("copy-link");
    const ok = await copyToClipboard(isLink ? act.dataset.link : act.dataset.text);
    const old = act.textContent;
    act.textContent = ok ? (isLink ? "Copied" : "Text copied") : "Copy failed";
    setTimeout(() => { act.textContent = old; }, 900);
    return;
  }
  if (!e.target.closest(".entry-tools")) closePopovers();
});

/* ── Search / chips / month / reset ────────────────────── */
let searchTimer;
els.search.addEventListener("input", () => {
  state.query = els.search.value;
  els.clear.classList.toggle("visible", !!state.query);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 250);
});
els.search.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const first = $("#timeline .entry");
    if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
  }
});
els.clear.addEventListener("click", () => {
  els.search.value = ""; state.query = "";
  els.clear.classList.remove("visible");
  clearTimeout(searchTimer); applyFilters(); els.search.focus();
});
els.chips.addEventListener("click", e => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  state.filter = btn.dataset.filter;
  $$(".chip", els.chips).forEach(c => c.classList.toggle("active", c === btn));
  applyFilters();
});
els.month.addEventListener("change", () => { state.month = els.month.value; applyFilters(); });
els.resetFilters.addEventListener("click", () => {
  state.query = ""; els.search.value = ""; els.clear.classList.remove("visible");
  state.filter = "all"; state.month = ""; els.month.value = "";
  $$(".chip", els.chips).forEach(c => c.classList.toggle("active", c.dataset.filter === "all"));
  applyFilters();
});

/* ── Keyboard ──────────────────────────────────────────── */
document.addEventListener("keydown", e => {
  if (!els.lightbox.hidden) {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowRight") stepLightbox(1);
    if (e.key === "ArrowLeft") stepLightbox(-1);
    return;
  }
  if (e.key === "Escape") {
    if (!els.drawer.classList.contains("open")) { closeDrawer(); return; }
    closeDrawer();
    return;
  }
  const tag = document.activeElement?.tagName || "";
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag);
  if (e.key === "/" && !typing) { e.preventDefault(); els.search.focus(); }
  if (e.key === "Escape") {
    closePopovers();
    if (els.search.value) {
      els.search.value = ""; state.query = "";
      els.clear.classList.remove("visible");
      clearTimeout(searchTimer); applyFilters();
    } else if (document.activeElement === els.search) els.search.blur();
    return;
  }
  if (typing || state.view !== "read") return;
  if (e.key === "j" || e.key === "J") hopEntry(1);
  if (e.key === "k" || e.key === "K") hopEntry(-1);
});
function hopEntry(dir) {
  const entries = $$("#timeline .entry");
  if (!entries.length) return;
  const marker = scrollY + innerHeight * 0.3;
  let current = -1;
  entries.forEach((el, i) => { if (el.getBoundingClientRect().top + scrollY <= marker) current = i; });
  const next = Math.max(0, Math.min(entries.length - 1, current + dir));
  entries[next].scrollIntoView({ block: "start", behavior: "smooth" });
}

/* ── Theme (dark by default) ───────────────────────────── */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("archive-theme", t);
  els.theme.textContent = t === "dark" ? "☀" : "☾";
  els.theme.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
}
els.theme.addEventListener("click", () =>
setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
setTheme(localStorage.getItem("archive-theme") || "dark");

/* ── Scroll chrome ─────────────────────────────────────── */
let ticking = false;
function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const pct = max > 0 ? Math.min(1, scrollY / max) : 0;
  els.progress.style.transform = `scaleX(${pct})`;
  els.railPct.textContent = `${Math.round(pct * 100)}%`;
  els.btnTop.classList.toggle("visible", scrollY > 600);
  const past = scrollY > els.masthead.offsetTop + els.masthead.offsetHeight - 40;
  els.chapterNow.classList.toggle("on", past && state.view === "read");
  els.chip.hidden = !(past && state.view === "read" && els.chipText.textContent);
  ticking = false;
}
addEventListener("scroll", () => { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
addEventListener("resize", () => requestAnimationFrame(onScroll));
els.btnTop.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
els.chip.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));

/* ── Init ──────────────────────────────────────────────── */
async function init() {
  try {
    const res = await fetch("result.processed.json");
    if (!res.ok) throw new Error(`Could not load result.processed.json (HTTP ${res.status})`);
    state.data = await res.json();
    state.messages = state.data.messages || [];
    state.filtered = state.messages.slice();

    buildChips();
    buildTocAndMonths();
    applyFilters();

    els.status.textContent = state.data.name || "";
    els.status.style.display = state.data.name ? "" : "none";
    if (state.data.name) document.title = `${state.data.name} — Archive`;

    const mediaCount = state.messages.reduce((n, m) => n + ((m.media || []).length ? 1 : 0), 0);
    els.colophon.textContent =
    `${state.messages.length} entries · ${mediaCount} with media · ${state.data.mediaMode || "linked"} media`;

    const h = location.hash.match(/^#m(\d+)$/);
    if (h) setTimeout(() => gotoEntry(h[1], false), 60);
    onScroll();
  } catch (err) {
    els.status.textContent = err.message;
    els.timeline.innerHTML = `<p class="status-line">${esc(err.message)}</p>`;
  }
}
init();
