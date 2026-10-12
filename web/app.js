"use strict";

const API_URL = "/api/records";

const state = {
  records: [],
  filters: { keyword: "", platform: "", status: "", tag: "" },
  sort: "updated",
};

let editingId = null;
let toastTimer = null;
const DRAFT_KEY = "shuati.draft";
const STORAGE_MODE_KEY = "shuati.storageMode";
const RECORDS_KEY = "shuati.records";

const els = {
  stats: document.getElementById("stats"),
  list: document.getElementById("list"),
  search: document.getElementById("search"),
  filterPlatform: document.getElementById("f-platform"),
  filterStatus: document.getElementById("f-status"),
  filterTag: document.getElementById("f-tag"),
  btnClear: document.getElementById("btn-clear"),
  btnAdd: document.getElementById("btn-add"),
  modalView: document.getElementById("modal-view"),
  modalForm: document.getElementById("modal-form"),
  form: document.getElementById("form"),
  formTitle: document.getElementById("form-title"),
  viewBody: document.getElementById("view-body"),
  notesBox: document.getElementById("f-notes"),
  betterBox: document.getElementById("f-better"),
  btnAddNote: document.getElementById("btn-add-note"),
  btnAddBetter: document.getElementById("btn-add-better"),
  toast: document.getElementById("toast"),
  btnFetchLuogu: document.getElementById("btn-fetch-luogu"),
  pidStatus: document.getElementById("pid-status"),
  btnInsertImage: document.getElementById("btn-insert-image"),
  descImageInput: document.getElementById("f-desc-image"),
  draftBanner: document.getElementById("draft-banner"),
  draftWhen: document.getElementById("draft-when"),
  draftRetry: document.getElementById("draft-retry"),
  draftRestore: document.getElementById("draft-restore"),
  draftDiscard: document.getElementById("draft-discard"),
  storageBar: document.getElementById("storage-bar"),
  storageText: document.getElementById("storage-text"),
  sortSelect: document.getElementById("sort"),
};

const formFields = {
  platform: document.getElementById("f-platform-select"),
  pid: document.getElementById("f-pid"),
  title: document.getElementById("f-title"),
  difficulty: document.getElementById("f-diff"),
  date: document.getElementById("f-date"),
  status: document.getElementById("f-status-select"),
  tags: document.getElementById("f-tags"),
  codeText: document.getElementById("f-code"),
  codePath: document.getElementById("f-codepath"),
  description: document.getElementById("f-desc"),
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function findRecord(id) {
  return state.records.find((r) => r.id === id);
}

function platformBadge(platform) {
  const cls = platform === "洛谷" ? "platform-luogu" : platform === "Matrix" ? "platform-matrix" : "platform-other";
  return `<span class="badge ${cls}">${esc(platform || "未填")}</span>`;
}

function statusBadge(status) {
  const cls = status === "已通过" ? "st-pass" : status === "进行中" ? "st-doing" : "st-redo";
  return `<span class="badge ${cls}">${esc(status || "未填")}</span>`;
}

function showToast(msg, ms = 2000, isError = false) {
  els.toast.textContent = msg;
  els.toast.classList.toggle("err", Boolean(isError));
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), ms);
}

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraft(data, id, reason) {
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ data, id: id ?? null, reason: reason || "", at: new Date().toISOString() })
    );
  } catch {
    /* 浏览器不让存就算了，至少页面上有醒目提示 */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
  if (els.draftBanner) els.draftBanner.classList.add("hidden");
}

function showDraftBanner() {
  if (!els.draftBanner) return;
  const draft = readDraft();
  if (!draft) {
    els.draftBanner.classList.add("hidden");
    return;
  }
  const title = (draft.data && draft.data.title) || "(未填题名)";
  if (els.draftWhen) els.draftWhen.textContent = `「${title}」`;
  els.draftBanner.classList.remove("hidden");
}

/* ---------- 存储模式 ----------
   server  = 本机程序（或自建后端）保存到 data.json
   browser = 纯网页部署时，数据保存在当前浏览器里（换设备前请导出备份）
   默认：本机 / 局域网地址用 server，其它域名（如 Vercel）用 browser；
   可在地址后加 ?storage=server 或 ?storage=browser 强制切换。 */

function isPrivateHost(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return false;
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].includes(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".internal") || h.endsWith(".home.arpa");
}

function applyStorageOverrideFromUrl() {
  try {
    const value = new URLSearchParams(location.search).get("storage");
    if (value === "server" || value === "browser") localStorage.setItem(STORAGE_MODE_KEY, value);
  } catch {
    /* ignore */
  }
}

function resolveStorageMode() {
  try {
    const override = localStorage.getItem(STORAGE_MODE_KEY);
    if (override === "server" || override === "browser") return override;
  } catch {
    /* ignore */
  }
  if (location.protocol === "http:" || location.protocol === "https:") {
    return isPrivateHost(location.hostname) ? "server" : "browser";
  }
  return "browser";
}

applyStorageOverrideFromUrl();
const storage = { mode: resolveStorageMode() };

function nowStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function normalizeRecord(data) {
  const source = data || {};
  const tags = source.tags || [];
  const notes = source.notes || [];
  const better = source.betterSolutions || [];
  return {
    platform: String(source.platform || "洛谷").trim(),
    pid: String(source.pid || "").trim(),
    title: String(source.title || "").trim(),
    difficulty: String(source.difficulty || "").trim(),
    tags: tags.map((tag) => String(tag).trim()).filter(Boolean),
    date: String(source.date || "").trim(),
    status: String(source.status || "已通过").trim(),
    description: String(source.description || ""),
    codeText: String(source.codeText || ""),
    codePath: String(source.codePath || "").trim(),
    notes: notes
      .filter((n) => n && (String(n.problem || "").trim() || String(n.solution || "").trim()))
      .map((n) => ({ problem: String(n.problem || ""), solution: String(n.solution || "") })),
    betterSolutions: better
      .filter((b) => b && (String(b.idea || "").trim() || String(b.code || "").trim()))
      .map((b) => ({ idea: String(b.idea || ""), code: String(b.code || "") })),
  };
}

function loadBrowserRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((r) => r && typeof r === "object") : [];
  } catch {
    return [];
  }
}

function persistBrowserRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (err) {
    const quota = err && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" || err.code === 22);
    throw new Error(
      quota
        ? "浏览器存储空间不足：请先点下方「导出备份」，再删掉一些带大图的旧记录"
        : `浏览器本地保存失败：${(err && err.message) || err}`
    );
  }
}

function saveBrowserRecord(data, id) {
  const records = loadBrowserRecords();
  const record = normalizeRecord(data);
  if (id) {
    const index = records.findIndex((r) => Number(r.id) === Number(id));
    if (index === -1) throw new Error("这条记录不存在（可能已被删除）");
    record.id = records[index].id;
    record.createdAt = records[index].createdAt || nowStr();
    record.updatedAt = nowStr();
    records[index] = record;
  } else {
    record.id = records.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
    record.createdAt = nowStr();
    record.updatedAt = record.createdAt;
    records.push(record);
  }
  persistBrowserRecords(records);
  return record;
}

function deleteBrowserRecord(id) {
  const remaining = loadBrowserRecords().filter((r) => Number(r.id) !== Number(id));
  persistBrowserRecords(remaining);
}

async function exportBackup() {
  let records;
  if (storage.mode === "browser") {
    records = loadBrowserRecords();
  } else {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("读取记录失败，请确认程序窗口还在运行");
    records = await res.json();
  }
  const stamp = nowStr().replace(/[-:]/g, "").replace(" ", "-");
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `刷题记录本-备份-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  showToast("已导出备份 ✓");
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result || ""));
      if (!Array.isArray(parsed)) throw new Error("文件内容不是记录列表");
      const cleaned = [];
      const usedIds = new Set();
      let maxId = 0;
      parsed.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const record = normalizeRecord(item);
        const id = Number(item.id);
        if (Number.isInteger(id) && id > 0 && !usedIds.has(id)) {
          record.id = id;
          usedIds.add(id);
          maxId = Math.max(maxId, id);
        } else {
          record.id = 0;
        }
        record.createdAt = typeof item.createdAt === "string" && item.createdAt ? item.createdAt : nowStr();
        record.updatedAt = typeof item.updatedAt === "string" && item.updatedAt ? item.updatedAt : record.createdAt;
        cleaned.push(record);
      });
      cleaned.forEach((record) => {
        if (!record.id) {
          maxId += 1;
          record.id = maxId;
        }
      });
      if (storage.mode === "browser") {
        if (!confirm(`导入将用备份里的 ${cleaned.length} 条记录，覆盖当前的全部 ${state.records.length} 条记录。确定继续吗？`)) return;
        persistBrowserRecords(cleaned);
        state.records = cleaned;
        render();
        showToast("导入成功 ✓");
        return;
      }
      if (!confirm(`导入将把备份里的 ${cleaned.length} 条记录追加到本机 data.json（当前已有 ${state.records.length} 条）。确定继续吗？`)) return;
      let okCount = 0;
      for (const record of cleaned) {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        });
        if (res.ok) okCount += 1;
      }
      await refresh();
      showToast(
        okCount === cleaned.length
          ? `已导入 ${okCount} 条记录 ✓`
          : `导入完成：成功 ${okCount} 条，失败 ${cleaned.length - okCount} 条`,
        6000,
        okCount !== cleaned.length
      );
    } catch (err) {
      showToast(`导入失败：${(err && err.message) || "文件无法解析"}`, 6000, true);
    }
  };
  reader.onerror = () => showToast("读取文件失败", 6000, true);
  reader.readAsText(file, "utf-8");
}

function compressImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 1600;
        const wide = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = wide > maxSide ? maxSide / wide : 1;
        if (scale === 1 && dataUrl.length < 600000) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const jpeg = canvas.toDataURL("image/jpeg", 0.85);
        resolve(jpeg.length < dataUrl.length ? jpeg : dataUrl);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("无法读取图片"));
    img.src = dataUrl;
  });
}

function setupStorageBar() {
  const bar = els.storageBar;
  if (bar) bar.classList.remove("hidden");
  if (els.storageText) {
    els.storageText.innerHTML =
      storage.mode === "browser"
        ? "💾 数据保存在<b>这台设备的浏览器</b>里：换电脑 / 手机或清理浏览器数据前，请先导出备份。"
        : "💾 数据保存在<b>本机程序</b>的 data.json 里：可随时导出备份，或从备份文件追加导入。";
  }
  const btnExport = document.getElementById("btn-export");
  const btnImport = document.getElementById("btn-import");
  const fileInput = document.getElementById("f-import-file");
  if (btnExport)
    btnExport.addEventListener("click", () => {
      exportBackup().catch((err) => showToast(`导出失败：${(err && err.message) || err}`, 6000, true));
    });
  if (btnImport && fileInput) {
    btnImport.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importBackup(file);
      e.target.value = "";
    });
  }
}

async function postRecord(data, id) {
  if (storage.mode === "browser") {
    return saveBrowserRecord(data, id);
  }
  const res = await fetch(id ? `${API_URL}/${id}` : API_URL, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("保存失败", res.status, errText);
    throw new Error(`HTTP ${res.status}${errText ? " " + errText : ""}`);
  }
  return res.json();
}

function showModal(modal) {
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal(modal) {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

async function refresh() {
  if (storage.mode === "browser") {
    state.records = loadBrowserRecords();
    render();
    return;
  }
  const res = await fetch(API_URL);
  state.records = await res.json();
  render();
}

function render() {
  renderStats();
  renderPlatformFilter();
  renderTagFilter();
  renderList();
}

function renderStats() {
  const rs = state.records;
  const count = (fn) => rs.filter(fn).length;
  const active = (key, value) => (state.filters[key] === value ? " active" : "");
  const chips = [
    { label: "累计刷题", num: rs.length, cls: "clickable", clear: true },
    { label: "已通过", num: count((r) => r.status === "已通过"), cls: `green clickable${active("status", "已通过")}`, status: "已通过" },
    { label: "进行中", num: count((r) => r.status === "进行中"), cls: `orange clickable${active("status", "进行中")}`, status: "进行中" },
    { label: "待重做", num: count((r) => r.status === "待重做"), cls: `red clickable${active("status", "待重做")}`, status: "待重做" },
  ];
  const platforms = [...new Set(rs.map((r) => r.platform).filter(Boolean))];
  platforms.slice(0, 4).forEach((p) => {
    const cls = p === "洛谷" ? "blue" : p === "Matrix" ? "purple" : "other";
    chips.push({ label: p, num: count((r) => r.platform === p), cls: `${cls} clickable${active("platform", p)}`, platform: p });
  });
  if (platforms.length > 4) {
    chips.push({ label: "其他平台", num: count((r) => !platforms.slice(0, 4).includes(r.platform)), cls: "muted" });
  }
  els.stats.innerHTML = chips
    .map((c) => {
      const data = c.clear
        ? ' data-clear="1"'
        : c.status
          ? ` data-status="${esc(c.status)}"`
          : c.platform
            ? ` data-platform="${esc(c.platform)}"`
            : "";
      return `<div class="stat ${c.cls}"${data}><div class="num">${c.num}</div><div class="label">${esc(c.label)}</div></div>`;
    })
    .join("");
}

function renderPlatformFilter() {
  const list = document.getElementById("platform-list");
  if (!list) return;
  const platforms = [...new Set(state.records.map((r) => r.platform).filter(Boolean))];
  const known = ["洛谷", "Matrix"];
  const extras = platforms.filter((p) => !known.includes(p));
  list.innerHTML = known.map((p) => `<option value="${esc(p)}"></option>`).join("") +
    extras.map((p) => `<option value="${esc(p)}"></option>`).join("");
}

function renderTagFilter() {
  const tags = [...new Set(state.records.flatMap((r) => r.tags || []))].sort();
  const current = state.filters.tag;
  els.filterTag.innerHTML =
    `<option value="">全部标签</option>` + tags.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  if (tags.includes(current)) {
    els.filterTag.value = current;
  } else {
    state.filters.tag = "";
    els.filterTag.value = "";
  }
}

function matchRecord(r) {
  const { keyword, platform, status, tag } = state.filters;
  if (platform && r.platform !== platform) return false;
  if (status && r.status !== status) return false;
  if (tag && !(r.tags || []).includes(tag)) return false;
  if (keyword) {
    const hay = [
      r.title,
      r.pid,
      r.date,
      r.difficulty,
      r.platform,
      (r.tags || []).join(" "),
      r.codeText,
      r.codePath,
      r.description,
      ...(r.notes || []).map((n) => `${n.problem} ${n.solution}`),
      ...(r.betterSolutions || []).map((b) => `${b.idea} ${b.code}`),
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(keyword.toLowerCase())) return false;
  }
  return true;
}

function filteredRecords() {
  const list = state.records.filter(matchRecord);
  const byTime = (a, b) =>
    String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  const sorts = {
    updated: byTime,
    date: (a, b) => String(b.date || "").localeCompare(String(a.date || "")) || byTime(a, b),
    platform: (a, b) =>
      String(a.platform || "").localeCompare(String(b.platform || ""), "zh") || byTime(a, b),
    pid: (a, b) =>
      String(a.pid || "").localeCompare(String(b.pid || ""), "zh", { numeric: true }) || byTime(a, b),
  };
  return list.sort(sorts[state.sort] || byTime);
}

function cardHtml(r) {
  const lastNote = r.notes && r.notes.length ? r.notes[r.notes.length - 1].problem : "";
  return `
    <article class="rec card" data-id="${r.id}">
      <div class="rec-head">
        <h3>${esc(r.title || "(未填题名)")}</h3>
        ${statusBadge(r.status)}
      </div>
      <div class="rec-meta">
        ${platformBadge(r.platform)}
        ${r.pid ? `<span class="meta-item mono">${esc(r.pid)}</span>` : ""}
        ${r.difficulty ? `<span class="meta-item">${esc(r.difficulty)}</span>` : ""}
        ${r.date ? `<span class="meta-item">${esc(r.date)}</span>` : ""}
      </div>
      ${r.tags && r.tags.length ? `<div class="rec-tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      ${lastNote ? `<p class="rec-preview"><b>最近卡壳：</b>${esc(lastNote)}</p>` : ""}
      <div class="rec-actions">
        <button class="btn btn-ghost btn-sm" data-act="view">详情</button>
        <button class="btn btn-ghost btn-sm" data-act="edit">编辑</button>
        <button class="btn btn-ghost btn-sm btn-danger" data-act="del">删除</button>
      </div>
    </article>`;
}

function renderList() {
  const list = filteredRecords();
  if (!list.length) {
    const hasAny = state.records.length > 0;
    els.list.innerHTML = hasAny
      ? `<div class="empty"><div class="big">🔍</div><p>没有符合筛选条件的记录</p></div>`
      : `<div class="empty"><div class="big">🗂️</div><p>还没有任何记录，从添加第一道题开始吧！</p><button class="btn btn-primary" id="btn-empty-add">＋ 添加题目</button></div>`;
    const emptyBtn = document.getElementById("btn-empty-add");
    if (emptyBtn) emptyBtn.addEventListener("click", () => openForm(null));
    return;
  }
  els.list.innerHTML = list.map(cardHtml).join("");
}

function notesHtml(r) {
  if (!r.notes || !r.notes.length) return `<p class="empty-line">暂无卡壳记录～</p>`;
  return `<ol class="detail-notes">${r.notes
    .map(
      (n) => `
      <li>
        <div class="note-block"><h4>卡壳点</h4><p>${esc(n.problem) || '<span class="empty-line">（未填）</span>'}</p></div>
        <div class="note-block"><h4>解决办法</h4><p>${esc(n.solution) || '<span class="empty-line">（未填）</span>'}</p></div>
      </li>`
    )
    .join("")}</ol>`;
}

function betterHtml(r) {
  const arr = r.betterSolutions || [];
  if (!arr.length) return `<p class="empty-line">暂无更优解记录～</p>`;
  return `<ol class="detail-notes detail-better">${arr
    .map(
      (b, i) => `
      <li>
        <div class="note-block"><h4>思路说明</h4><p>${esc(b.idea) || '<span class="empty-line">（未填）</span>'}</p></div>
        ${b.code && b.code.trim() ? `<div class="note-block"><h4>参考代码</h4><pre class="code-block mono">${esc(b.code)}</pre></div>` : ""}
      </li>`
    )
    .join("")}</ol>`;
}

function viewRecord(id) {
  const r = findRecord(id);
  if (!r) return;
  const meta = [
    ["平台", r.platform],
    ["题号", r.pid],
    ["难度", r.difficulty],
    ["日期", r.date],
    ["状态", r.status],
  ];
  const hasCode = (r.codeText && r.codeText.trim()) || r.codePath;
  const hasBetter = (r.betterSolutions || []).some((b) => (b.idea && b.idea.trim()) || (b.code && b.code.trim()));
  els.viewBody.innerHTML = `
    <div class="view-head">
      <h2>${esc(r.title || "(未填题名)")}</h2>
      <div class="view-head-actions">
        ${statusBadge(r.status)}
        <button type="button" class="btn btn-primary btn-sm" data-edit="${r.id}">✏️ 编辑</button>
      </div>
    </div>
    <div class="view-meta">${meta
      .filter(([, v]) => v)
      .map(([k, v]) => `<div class="vmeta"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`)
      .join("")}</div>
    ${r.tags && r.tags.length ? `<div class="rec-tags view-tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    ${(r.description && r.description.trim()) ? `<div class="detail-section"><h3>📄 题目描述</h3><div class="desc-block">${renderDescription(r.description)}</div></div>` : ""}
    <div class="detail-section"><h3>📝 卡壳点 → 解决办法</h3>${notesHtml(r)}</div>
    ${
      hasCode
        ? `<div class="detail-section"><h3>💻 代码</h3>${
            r.codeText && r.codeText.trim() ? `<pre class="code-block mono">${esc(r.codeText)}</pre>` : ""
          }${r.codePath ? `<p class="code-path mono">📄 ${esc(r.codePath)}</p>` : ""}</div>`
        : ""
    }
    ${
      hasBetter
        ? `<div class="detail-section"><h3>🚀 更优解 / 其他解法</h3>${betterHtml(r)}</div>`
        : ""
    }`;
  showModal(els.modalView);
}

function addNoteRow(problem = "", solution = "") {
  const row = document.createElement("div");
  row.className = "note-row";
  row.innerHTML = `
    <button type="button" class="note-remove" title="删除这条">×</button>
    <label>卡壳点<textarea class="note-problem" rows="2" placeholder="哪里卡住了？比如：递归边界写不对"></textarea></label>
    <label>解决办法<textarea class="note-solution" rows="2" placeholder="后来怎么解决的？比如：画图模拟 + 打印中间变量"></textarea></label>`;
  row.querySelector(".note-problem").value = problem;
  row.querySelector(".note-solution").value = solution;
  row.querySelector(".note-remove").addEventListener("click", () => {
    if (els.notesBox.children.length > 1) {
      row.remove();
    } else {
      row.querySelector(".note-problem").value = "";
      row.querySelector(".note-solution").value = "";
    }
  });
  els.notesBox.appendChild(row);
}

function addBetterRow(idea = "", code = "") {
  const row = document.createElement("div");
  row.className = "note-row better-row";
  row.innerHTML = `
    <button type="button" class="note-remove" title="删除这条">×</button>
    <label class="full">思路说明<textarea class="better-idea" rows="2" placeholder="更优的思路是什么？比如：用前缀和把 O(n²) 降到 O(n)"></textarea></label>
    <label class="full">参考代码<textarea class="better-code mono" rows="5" spellcheck="false" placeholder="贴一段更简洁或更高效的参考代码…"></textarea></label>`;
  row.querySelector(".better-idea").value = idea;
  row.querySelector(".better-code").value = code;
  row.querySelector(".note-remove").addEventListener("click", () => {
    if (els.betterBox.children.length > 1) {
      row.remove();
    } else {
      row.querySelector(".better-idea").value = "";
      row.querySelector(".better-code").value = "";
    }
  });
  els.betterBox.appendChild(row);
}

function openForm(record, prefill) {
  const source = prefill || record;
  editingId = record ? record.id : null;
  els.formTitle.textContent = record ? "编辑题目" : "添加题目";
  formFields.platform.value = source && source.platform ? source.platform : "洛谷";
  formFields.pid.value = source ? source.pid || "" : "";
  els.pidStatus.textContent = "";
  els.pidStatus.className = "pid-status";
  formFields.title.value = source ? source.title || "" : "";
  formFields.difficulty.value = source ? source.difficulty || "" : "";
  formFields.date.value = source ? source.date || "" : todayStr();
  formFields.status.value = source ? source.status || "已通过" : "已通过";
  formFields.tags.value = source && source.tags ? source.tags.join(", ") : "";
  formFields.codeText.value = source ? source.codeText || "" : "";
  formFields.codePath.value = source ? source.codePath || "" : "";
  formFields.description.value = source ? source.description || "" : "";
  updateLuoguUI();
  els.notesBox.innerHTML = "";
  const notes = source && source.notes && source.notes.length ? source.notes : [{ problem: "", solution: "" }];
  notes.forEach((n) => addNoteRow(n.problem, n.solution));
  els.betterBox.innerHTML = "";
  const better = source && source.betterSolutions && source.betterSolutions.length ? source.betterSolutions : [{ idea: "", code: "" }];
  better.forEach((b) => addBetterRow(b.idea, b.code));
  showModal(els.modalForm);
  formFields.title.focus();
}

function collectForm() {
  const notes = [...els.notesBox.querySelectorAll(".note-row")]
    .map((row) => ({
      problem: row.querySelector(".note-problem").value.trim(),
      solution: row.querySelector(".note-solution").value.trim(),
    }))
    .filter((n) => n.problem || n.solution);
  const betterSolutions = [...els.betterBox.querySelectorAll(".better-row")]
    .map((row) => ({
      idea: row.querySelector(".better-idea").value.trim(),
      code: row.querySelector(".better-code").value,
    }))
    .filter((b) => b.idea || b.code.trim());
  return {
    platform: formFields.platform.value.trim(),
    pid: formFields.pid.value.trim(),
    title: formFields.title.value.trim(),
    difficulty: formFields.difficulty.value.trim(),
    date: formFields.date.value,
    status: formFields.status.value,
    tags: formFields.tags.value.split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean),
    codeText: formFields.codeText.value,
    codePath: formFields.codePath.value.trim(),
    description: formFields.description.value,
    notes,
    betterSolutions,
  };
}


function isLuoguPlatform() {
  return formFields.platform.value.trim() === "洛谷";
}

function updateLuoguUI() {
  const luogu = isLuoguPlatform();
  const canFetch = storage.mode === "server";
  if (els.btnFetchLuogu) els.btnFetchLuogu.style.display = luogu && canFetch ? "" : "none";
  formFields.pid.placeholder = luogu
    ? canFetch
      ? "如 P1085，输入后自动获取题名"
      : "如 P1085（网页版需手动填写题名）"
    : "题号（选填）";
  if (!luogu) {
    els.pidStatus.textContent = "";
    els.pidStatus.className = "pid-status";
  }
}

function renderDescription(text) {
  if (!text) return "";
  let html = "";
  let last = 0;
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    html += esc(text.slice(last, m.index)).replace(/\n/g, "<br>");
    html += `<img alt="${esc(m[1])}" src="${esc(m[2])}" />`;
    last = m.index + m[0].length;
  }
  html += esc(text.slice(last)).replace(/\n/g, "<br>");
  return html;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function insertImageMarkdown(url, alt) {
  const t = formFields.description;
  const altText = String(alt || "图片").replace(/[[\]]/g, "");
  const insert = `![${altText}](${url})`;
  const start = t.selectionStart || 0;
  const end = t.selectionEnd || 0;
  const before = t.value.slice(0, start);
  const after = t.value.slice(end);
  const sepBefore = before && !before.endsWith("\n") && before.trim() ? "\n" : "";
  t.value = before + sepBefore + insert + "\n" + after;
  const pos = start + sepBefore.length + insert.length + 1;
  t.selectionStart = t.selectionEnd = pos;
  t.focus();
}
function parseLuoguPid(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  const urlMatch = value.match(/luogu\.com\.cn\/problem\/([A-Za-z0-9_.-]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^([PBT]\d{3,6}|CF\d{1,6}[A-Za-z]?|SP\d{1,5}|UVA\d{1,5}|AT_[a-z0-9_]+)$/i.test(value)) return value;
  return null;
}

let fetchingLuogu = false;

async function fetchLuoguInfo(pid) {
  if (storage.mode !== "server") {
    els.pidStatus.textContent = "ℹ️ 当前是网页版，无法自动获取，请手动填写题名 / 难度";
    els.pidStatus.className = "pid-status";
    return;
  }
  if (fetchingLuogu) return;
  fetchingLuogu = true;
  els.pidStatus.textContent = "🔄 正在从洛谷获取…";
  els.pidStatus.className = "pid-status";
  try {
    const res = await fetch(`/api/luogu?pid=${encodeURIComponent(pid)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "获取失败");
    formFields.platform.value = "洛谷";
    formFields.title.value = data.title || "";
    formFields.difficulty.value = data.difficulty || "";
    formFields.description.value = data.description || "";
    els.pidStatus.textContent = "✅ 已自动填写题目信息，请确认";
    els.pidStatus.className = "pid-status ok";
    showToast("已获取题目信息 ✓");
  } catch (err) {
    els.pidStatus.textContent = "⚠️ " + err.message;
    els.pidStatus.className = "pid-status err";
  } finally {
    fetchingLuogu = false;
  }
}

function resetFilters() {
  Object.assign(state.filters, { keyword: "", platform: "", status: "", tag: "" });
  syncFilterUI();
  renderStats();
  renderList();
}

function syncFilterUI() {
  els.search.value = state.filters.keyword;
  els.filterPlatform.value = state.filters.platform;
  els.filterStatus.value = state.filters.status;
  els.filterTag.value = state.filters.tag;
}

async function deleteRecord(id) {
  const r = findRecord(id);
  if (!r) return;
  if (!confirm(`确定删除「${r.title || "未命名题目"}」吗？删除后无法恢复。`)) return;
  try {
    if (storage.mode === "browser") {
      deleteBrowserRecord(id);
    } else {
      const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    }
    showToast("已删除");
    await refresh();
  } catch {
    showToast("删除失败，请重试");
  }
}

function bindEvents() {
  els.btnAdd.addEventListener("click", () => openForm(null));
  if (els.draftRetry) {
    els.draftRetry.addEventListener("click", async () => {
      const draft = readDraft();
      if (!draft) {
        showDraftBanner();
        return;
      }
      try {
        await postRecord(draft.data, draft.id);
        clearDraft();
        if (!els.modalForm.classList.contains("hidden")) closeModal(els.modalForm);
        showToast("已重新保存成功 ✓");
        await refresh();
      } catch (err) {
        showToast(`⚠️ 还是没成功：${err.message || "请确认程序窗口还在运行"}`, 8000, true);
      }
    });
    els.draftRestore.addEventListener("click", () => {
      const draft = readDraft();
      if (!draft) return;
      openForm(draft.id ? { id: draft.id } : null, draft.data);
    });
    els.draftDiscard.addEventListener("click", () => {
      if (!confirm("确定丢弃这条没保存成功的记录吗？")) return;
      clearDraft();
      showToast("已丢弃");
    });
  }
  els.search.addEventListener("input", () => {
    state.filters.keyword = els.search.value.trim();
    renderList();
  });
  els.filterPlatform.addEventListener("input", () => {
    state.filters.platform = els.filterPlatform.value.trim();
    renderList();
  });
  els.filterStatus.addEventListener("change", () => {
    state.filters.status = els.filterStatus.value;
    renderList();
  });
  els.filterTag.addEventListener("change", () => {
    state.filters.tag = els.filterTag.value;
    renderList();
  });
  els.btnClear.addEventListener("click", resetFilters);
  if (els.sortSelect)
    els.sortSelect.addEventListener("change", () => {
      state.sort = els.sortSelect.value;
      renderList();
    });
  els.stats.addEventListener("click", (e) => {
    const chip = e.target.closest(".stat[data-status], .stat[data-platform], .stat[data-clear]");
    if (!chip) return;
    if (chip.dataset.clear !== undefined) {
      resetFilters();
      return;
    }
    const key = chip.dataset.status !== undefined ? "status" : "platform";
    const value = chip.dataset[key];
    if (state.filters[key] === value) state.filters[key] = "";
    else state.filters[key] = value;
    syncFilterUI();
    renderStats();
    renderList();
  });
  els.viewBody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit]");
    if (!btn) return;
    const rec = findRecord(Number(btn.dataset.edit));
    if (!rec) return;
    closeModal(els.modalView);
    openForm(rec);
  });
  els.btnAddNote.addEventListener("click", () => addNoteRow());
  els.btnAddBetter.addEventListener("click", () => addBetterRow());
  els.btnFetchLuogu.addEventListener("click", () => {
    const pid = parseLuoguPid(formFields.pid.value);
    if (!pid) {
      els.pidStatus.textContent = "⚠️ 请先输入洛谷题号或题目链接，如 P1085";
      els.pidStatus.className = "pid-status err";
      return;
    }
    fetchLuoguInfo(pid);
  });
  formFields.platform.addEventListener("input", updateLuoguUI);
  formFields.platform.addEventListener("change", updateLuoguUI);
  formFields.pid.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const pid = parseLuoguPid(formFields.pid.value);
      if (pid && isLuoguPlatform() && storage.mode === "server") fetchLuoguInfo(pid);
    }
  });
  formFields.pid.addEventListener("change", () => {
    const pid = parseLuoguPid(formFields.pid.value);
    if (pid && !formFields.title.value.trim() && isLuoguPlatform() && storage.mode === "server") fetchLuoguInfo(pid);
  });
  els.list.addEventListener("click", (e) => {
    const card = e.target.closest(".rec");
    if (!card) return;
    const id = Number(card.dataset.id);
    const actBtn = e.target.closest("[data-act]");
    const act = actBtn ? actBtn.dataset.act : "view";
    if (act === "edit") openForm(findRecord(id));
    else if (act === "del") deleteRecord(id);
    else viewRecord(id);
  });
  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = collectForm();
    if (!data.title) {
      showToast("题名是必填的哦");
      formFields.title.focus();
      return;
    }
    const targetId = editingId;
    try {
      await postRecord(data, targetId);
      clearDraft();
      closeModal(els.modalForm);
      showToast(targetId ? "已保存修改 ✓" : "添加成功 ✓");
      await refresh();
    } catch (err) {
      if (storage.mode === "browser") {
        showToast(`⚠️ 保存失败：${err.message || "请重试"}`, 8000, true);
        return;
      }
      writeDraft(data, targetId, err.message);
      showDraftBanner();
      showToast(`⚠️ 保存失败：${err.message || "请重试"}（内容已暂存在本机，可点上方提示条重试）`, 8000, true);
    }
  });
  document.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", () => {
      const modal = el.closest(".modal");
      if (modal) closeModal(modal);
    })
  );
  async function uploadImage(dataUrl, alt) {
    if (storage.mode === "browser") {
      try {
        const localUrl = await compressImage(dataUrl);
        insertImageMarkdown(localUrl, alt);
      } catch {
        insertImageMarkdown(dataUrl, alt);
      }
      return;
    }
    try {
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: dataUrl }),
      });
      if (!res.ok) throw new Error("上传失败");
      const { url } = await res.json();
      insertImageMarkdown(url, alt);
    } catch (err) {
      showToast("图片上传失败，请重试");
    }
  }

  if (els.btnInsertImage && els.descImageInput) {
    els.btnInsertImage.addEventListener("click", () => els.descImageInput.click());
    els.descImageInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await readFileAsDataURL(file);
        await uploadImage(dataUrl, file.name);
      } catch {
        showToast("读取图片失败");
      }
      e.target.value = "";
    });
  }
  formFields.description.addEventListener("paste", (e) => {
    const cd = e.clipboardData;
    if (!cd) return;

    // 优先处理剪贴板里的图片文件
    const imageFiles = [];
    for (const item of cd.items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length) {
      e.preventDefault();
      imageFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => uploadImage(reader.result, file.name);
        reader.onerror = () => showToast("粘贴图片失败");
        reader.readAsDataURL(file);
      });
      return;
    }

    // 处理纯文本形式的 base64 / data URL
    const text = cd.getData("text/plain") || "";
    if (/^data:image\/\w+;base64,/i.test(text) || /^[A-Za-z0-9+/=]{100,}$/.test(text.trim())) {
      e.preventDefault();
      uploadImage(text.trim(), "粘贴图片");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      [els.modalView, els.modalForm].forEach((m) => {
        if (!m.classList.contains("hidden")) closeModal(m);
      });
    }
  });
}

if (location.protocol === "file:") {
  document.getElementById("file-guard").classList.remove("hidden");
} else {
  bindEvents();
  showDraftBanner();
  setupStorageBar();
  refresh();
}
