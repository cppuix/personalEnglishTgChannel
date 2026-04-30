const state = {
  data: null,
  messages: [],
  filtered: [],
  query: "",
  filter: "all",
  month: "",
};

const els = {
  status: document.getElementById("status"),
  timeline: document.getElementById("timeline"),
  noResults: document.getElementById("no-results"),
  search: document.getElementById("search-input"),
  clear: document.getElementById("clear-btn"),
  results: document.getElementById("results-count"),
  month: document.getElementById("month-filter"),
  theme: document.getElementById("theme-toggle"),
  scrollPct: document.getElementById("scroll-pct"),
};

const fmtDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const fmtMonth = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const fmtTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

function parseDate(msg) {
  return msg.timestamp ? new Date(msg.timestamp * 1000) : new Date(msg.date);
}
function dateKey(msg) {
  const d = parseDate(msg);
  return d.toISOString().slice(0, 10);
}
function monthKey(msg) {
  const d = parseDate(msg);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function escapeAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function formatSize(size) {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function mediaHtml(media) {
  if (!media || !media.length) return "";
  return `<div class="media-list">${media.map(m => {
    const url = m.url;
    const title = escapeAttr(m.title || m.fileName || m.path || "Media");
    const titleDir = m.titleDir || "ltr";
    const detailParts = [m.kind || "media"];
    if (m.durationSeconds) detailParts.push(`${Math.round(m.durationSeconds)}s`);
    if (m.width && m.height) detailParts.push(`${m.width}×${m.height}`);
    if (m.size) detailParts.push(formatSize(m.size));
    const caption = detailParts.join(" · ");

    if (m.kind === "image") {
      return `<figure class="media-box media-image">
        <a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
          <img src="${escapeAttr(url)}" alt="${title}" loading="lazy" referrerpolicy="no-referrer">
        </a>
        <figcaption class="media-caption">${escapeAttr(caption)}</figcaption>
      </figure>`;
    }
    if (m.kind === "audio") {
      const duration = m.durationSeconds ? formatClock(Number(m.durationSeconds)) : "0:00";
      return `<figure class="media-audio" data-audio-shell>
        <div class="custom-audio">
          <div class="audio-title" dir="${escapeAttr(titleDir)}">${title}</div>
          <audio class="native-audio" preload="metadata" src="${escapeAttr(url)}" referrerpolicy="no-referrer"></audio>
          <div class="audio-controls">
            <button class="audio-play" type="button" aria-label="Play audio">▶</button>
            <div class="audio-progress" role="slider" aria-label="Audio progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
            <span class="audio-time"><span class="audio-current">0:00</span> / <span class="audio-duration">${duration}</span></span>
          </div>
          <p class="media-open"><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">Open audio ↗</a></p>
        </div>
      </figure>`;
    }
    if (m.kind === "video") {
      return `<figure class="media-box media-video">
        <video controls preload="metadata" src="${escapeAttr(url)}" referrerpolicy="no-referrer"></video>
        <figcaption class="media-caption" dir="${escapeAttr(titleDir)}"><span class="media-title">${title}</span></figcaption>
      </figure>`;
    }
    return `<div class="media-box media-file">
      <a class="file-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" dir="${escapeAttr(titleDir)}">
        <strong>${title}</strong>
        <small>${caption} · Open file ↗</small>
      </a>
    </div>`;
  }).join("")}</div>`;
}
function metaPopoverHtml(msg, link) {
  const forwardedDir = msg.forwardedDir || "ltr";
  return `<div class="entry-tools">
    <button class="more-btn" type="button" aria-label="Message details" aria-expanded="false">⋯</button>
    <div class="meta-popover" hidden>
      <p>Message #${msg.id}</p>
      <p>${fmtDate.format(parseDate(msg))} · ${fmtTime.format(parseDate(msg))}</p>
      ${msg.forwardedFrom ? `<p dir="${escapeAttr(forwardedDir)}">Forwarded from ${escapeAttr(msg.forwardedFrom)}</p>` : ""}
      ${msg.edited ? `<p>Edited</p>` : ""}
      ${msg.media?.length ? `<p>${msg.media.map(m => m.kind).filter(Boolean).join(", ")}</p>` : ""}
      <p><a href="#m${msg.id}">Permalink</a></p>
      <p><button class="copy-link" data-link="${escapeAttr(link)}">Copy link</button></p>
      <p><button class="copy-text" data-text="${escapeAttr(msg.plain || "")}">Copy post text</button></p>
    </div>
  </div>`;
}
function entryHtml(msg) {
  const d = parseDate(msg);
  const link = `${location.origin}${location.pathname}#m${msg.id}`;
  return `<article class="entry" id="m${msg.id}" data-month="${monthKey(msg)}" data-tags="${escapeAttr((msg.tags || []).join(" "))}">
    <time class="entry-time" datetime="${escapeAttr(msg.date)}">${fmtTime.format(d)}</time>
    <div class="entry-body">
      ${metaPopoverHtml(msg, link)}
      ${mediaHtml(msg.media)}
      <div class="entry-text">${msg.html || ""}</div>
    </div>
  </article>`;
}
function dividerHtml(msg) {
  return `<div class="date-divider" data-date="${dateKey(msg)}"><span class="date-text">${fmtDate.format(parseDate(msg))}</span></div>`;
}
function populateMonths() {
  const seen = new Map();
  state.messages.forEach(m => {
    const key = monthKey(m);
    if (!seen.has(key)) seen.set(key, fmtMonth.format(parseDate(m)));
  });
  els.month.innerHTML = `<option value="">All dates</option>` + [...seen.entries()]
    .map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
}
function applyFilters() {
  const q = state.query.trim().toLowerCase();
  state.filtered = state.messages.filter(m => {
    const matchesQuery = !q || (m.plain || "").toLowerCase().includes(q);
    const matchesFilter = state.filter === "all" || (m.tags || []).includes(state.filter);
    const matchesMonth = !state.month || monthKey(m) === state.month;
    return matchesQuery && matchesFilter && matchesMonth;
  });
  render();
}
function render() {
  let html = "";
  let lastDate = "";
  for (const msg of state.filtered) {
    const dk = dateKey(msg);
    if (dk !== lastDate) {
      html += dividerHtml(msg);
      lastDate = dk;
    }
    html += entryHtml(msg);
  }
  els.timeline.innerHTML = html;
  els.results.textContent = `${state.filtered.length} entr${state.filtered.length === 1 ? "y" : "ies"}`;
  els.noResults.style.display = state.filtered.length ? "none" : "block";
  els.status.textContent = state.data ? `${state.data.name || "Archive"} · ${state.data.mediaMode || "media"} media` : "";
  setupAudioPlayers();
}
async function init() {
  try {
    const res = await fetch("result.processed.json");
    if (!res.ok) throw new Error(`Could not load result.processed.json (${res.status})`);
    state.data = await res.json();
    state.messages = state.data.messages || [];
    state.filtered = state.messages.slice();
    populateMonths();
    render();
  } catch (err) {
    els.status.textContent = err.message;
  }
}
function setupAudioPlayers() {
  document.querySelectorAll("[data-audio-shell]").forEach(shell => {
    if (shell.dataset.ready) return;
    shell.dataset.ready = "1";

    const audio = shell.querySelector("audio");
    const play = shell.querySelector(".audio-play");
    const progress = shell.querySelector(".audio-progress");
    const current = shell.querySelector(".audio-current");
    const duration = shell.querySelector(".audio-duration");

    let isDragging = false;

    const setProgressFromClientX = (clientX) => {
      const rect = progress.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

      progress.style.setProperty("--progress", `${pct * 100}%`);
      progress.setAttribute("aria-valuenow", String(Math.round(pct * 100)));

      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.currentTime = pct * audio.duration;
        current.textContent = formatClock(audio.currentTime);
      }
    };

    play.addEventListener("click", () => {
      document.querySelectorAll("audio").forEach(other => {
        if (other !== audio) other.pause();
      });
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    });

    audio.addEventListener("play", () => { play.textContent = "Ⅱ"; });
    audio.addEventListener("pause", () => { play.textContent = "▶"; });
    audio.addEventListener("loadedmetadata", () => {
      duration.textContent = formatClock(audio.duration);
    });
    audio.addEventListener("timeupdate", () => {
      if (isDragging) return;
      const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      progress.style.setProperty("--progress", `${pct}%`);
      progress.setAttribute("aria-valuenow", String(Math.round(pct)));
      current.textContent = formatClock(audio.currentTime);
    });
    audio.addEventListener("ended", () => {
      play.textContent = "▶";
      progress.style.setProperty("--progress", "0%");
      current.textContent = "0:00";
    });

    progress.addEventListener("pointerdown", e => {
      isDragging = true;
      progress.classList.add("is-dragging");
      progress.setPointerCapture?.(e.pointerId);
      if (audio.preload === "none") audio.preload = "metadata";
      audio.load?.();
      setProgressFromClientX(e.clientX);
      e.preventDefault();
    });
    progress.addEventListener("pointermove", e => {
      if (!isDragging) return;
      setProgressFromClientX(e.clientX);
      e.preventDefault();
    });
    const stopDrag = e => {
      if (!isDragging) return;
      isDragging = false;
      progress.classList.remove("is-dragging");
      try { progress.releasePointerCapture?.(e.pointerId); } catch {}
      setProgressFromClientX(e.clientX);
      e.preventDefault();
    };
    progress.addEventListener("pointerup", stopDrag);
    progress.addEventListener("pointercancel", stopDrag);
  });
}

els.search.addEventListener("input", () => {
  state.query = els.search.value;
  els.clear.classList.toggle("visible", !!state.query);
  applyFilters();
});
els.clear.addEventListener("click", () => {
  els.search.value = "";
  state.query = "";
  els.clear.classList.remove("visible");
  applyFilters();
  els.search.focus();
});
document.querySelectorAll(".filter-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.filter = btn.dataset.filter;
    applyFilters();
  });
});
els.month.addEventListener("change", () => {
  state.month = els.month.value;
  applyFilters();
});
document.addEventListener("click", async (e) => {
  const more = e.target.closest(".more-btn");
  if (more) {
    const popover = more.parentElement.querySelector(".meta-popover");
    const isHidden = popover.hidden;
    document.querySelectorAll(".meta-popover").forEach(p => p.hidden = true);
    document.querySelectorAll(".more-btn").forEach(b => b.setAttribute("aria-expanded", "false"));
    popover.hidden = !isHidden;
    more.setAttribute("aria-expanded", String(isHidden));
    return;
  }

  const textBtn = e.target.closest(".copy-text");
  if (textBtn) {
    try {
      await navigator.clipboard.writeText(textBtn.dataset.text || "");
      const old = textBtn.textContent;
      textBtn.textContent = "Copied text";
      setTimeout(() => textBtn.textContent = old, 900);
    } catch {
      textBtn.textContent = "Copy failed";
    }
    return;
  }

  const btn = e.target.closest(".copy-link");
  if (btn) {
    try {
      await navigator.clipboard.writeText(btn.dataset.link);
      const old = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => btn.textContent = old, 900);
    } catch {
      btn.textContent = "Copy failed";
    }
    return;
  }

  if (!e.target.closest(".entry-tools")) {
    document.querySelectorAll(".meta-popover").forEach(p => p.hidden = true);
    document.querySelectorAll(".more-btn").forEach(b => b.setAttribute("aria-expanded", "false"));
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "/" && document.activeElement !== els.search) {
    e.preventDefault();
    els.search.focus();
  }
  if (e.key === "Escape") {
    document.querySelectorAll(".meta-popover").forEach(p => p.hidden = true);
    document.querySelectorAll(".more-btn").forEach(b => b.setAttribute("aria-expanded", "false"));
    if (document.activeElement === els.search || els.search.value) {
      els.search.value = "";
      state.query = "";
      els.clear.classList.remove("visible");
      applyFilters();
    }
  }
});
els.theme.addEventListener("click", () => {
  const html = document.documentElement;
  const next = html.dataset.theme === "dark" ? "light" : "dark";
  html.dataset.theme = next;
  localStorage.setItem("archive-theme", next);
  els.theme.textContent = next === "dark" ? "☾" : "○";
});
document.getElementById("btn-top").addEventListener("click", () => window.scrollTo({top:0, behavior:"smooth"}));
document.getElementById("btn-bottom").addEventListener("click", () => window.scrollTo({top:document.body.scrollHeight, behavior:"smooth"}));

let ticking = false;
function updateScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const pct = max > 0 ? Math.round((scrollY / max) * 100) : 0;
  els.scrollPct.textContent = `${pct}%`;
  ticking = false;
}
window.addEventListener("scroll", () => {
  if (!ticking) {
    requestAnimationFrame(updateScroll);
    ticking = true;
  }
}, {passive:true});
window.addEventListener("resize", updateScroll);

const saved = localStorage.getItem("archive-theme");
if (saved) document.documentElement.dataset.theme = saved;
els.theme.textContent = document.documentElement.dataset.theme === "dark" ? "☾" : "○";
init();
updateScroll();
