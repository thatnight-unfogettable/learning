"use strict";

const API_URL = "/api/records";

const state = {
  records: [],
  filters: { keyword: "", platform: "", status: "", tag: "" },
};

let editingId = null;
let toastTimer = null;

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

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 2000);
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
  const chips = [
    { label: "累计刷题", num: rs.length, cls: "" },
    { label: "已通过", num: count((r) => r.status === "已通过"), cls: "green" },
    { label: "进行中", num: count((r) => r.status === "进行中"), cls: "orange" },
    { label: "待重做", num: count((r) => r.status === "待重做"), cls: "red" },
  ];
  const platforms = [...new Set(rs.map((r) => r.platform).filter(Boolean))];
  platforms.slice(0, 4).forEach((p) => {
    const cls = p === "洛谷" ? "blue" : p === "Matrix" ? "purple" : "other";
    chips.push({ label: p, num: count((r) => r.platform === p), cls });
  });
  if (platforms.length > 4) {
    chips.push({ label: "其他平台", num: count((r) => !platforms.slice(0, 4).includes(r.platform)), cls: "muted" });
  }
  els.stats.innerHTML = chips
    .map((c) => `<div class="stat ${c.cls}"><div class="num">${c.num}</div><div class="label">${esc(c.label)}</div></div>`)
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
  return state.records
    .filter(matchRecord)
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
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
      ${statusBadge(r.status)}
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

function openForm(record) {
  editingId = record ? record.id : null;
  els.formTitle.textContent = record ? "编辑题目" : "添加题目";
  formFields.platform.value = record && record.platform ? record.platform : "洛谷";
  formFields.pid.value = record ? record.pid || "" : "";
  els.pidStatus.textContent = "";
  els.pidStatus.className = "pid-status";
  formFields.title.value = record ? record.title || "" : "";
  formFields.difficulty.value = record ? record.difficulty || "" : "";
  formFields.date.value = record ? record.date || "" : todayStr();
  formFields.status.value = record ? record.status || "已通过" : "已通过";
  formFields.tags.value = record && record.tags ? record.tags.join(", ") : "";
  formFields.codeText.value = record ? record.codeText || "" : "";
  formFields.codePath.value = record ? record.codePath || "" : "";
  formFields.description.value = record ? record.description || "" : "";
  updateLuoguUI();
  els.notesBox.innerHTML = "";
  const notes = record && record.notes && record.notes.length ? record.notes : [{ problem: "", solution: "" }];
  notes.forEach((n) => addNoteRow(n.problem, n.solution));
  els.betterBox.innerHTML = "";
  const better = record && record.betterSolutions && record.betterSolutions.length ? record.betterSolutions : [{ idea: "", code: "" }];
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
  if (els.btnFetchLuogu) els.btnFetchLuogu.style.display = luogu ? "" : "none";
  formFields.pid.placeholder = luogu ? "如 P1085，输入后自动获取题名" : "题号（选填）";
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

async function deleteRecord(id) {
  const r = findRecord(id);
  if (!r) return;
  if (!confirm(`确定删除「${r.title || "未命名题目"}」吗？删除后无法恢复。`)) return;
  try {
    const res = await fetch(`${API_URL}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("delete failed");
    showToast("已删除");
    await refresh();
  } catch {
    showToast("删除失败，请重试");
  }
}

function bindEvents() {
  els.btnAdd.addEventListener("click", () => openForm(null));
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
  els.btnClear.addEventListener("click", () => {
    els.search.value = "";
    els.filterPlatform.value = "";
    els.filterStatus.value = "";
    els.filterTag.value = "";
    Object.assign(state.filters, { keyword: "", platform: "", status: "", tag: "" });
    renderList();
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
      if (pid && isLuoguPlatform()) fetchLuoguInfo(pid);
    }
  });
  formFields.pid.addEventListener("change", () => {
    const pid = parseLuoguPid(formFields.pid.value);
    if (pid && !formFields.title.value.trim() && isLuoguPlatform()) fetchLuoguInfo(pid);
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
    const url = editingId ? `${API_URL}/${editingId}` : API_URL;
    const method = editingId ? "PUT" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("保存失败", res.status, errText);
        throw new Error(errText || "save failed");
      }
      closeModal(els.modalForm);
      showToast(editingId ? "已保存修改 ✓" : "添加成功 ✓");
      await refresh();
    } catch (err) {
      showToast("保存失败：" + (err.message || "请重试"));
    }
  });
  document.querySelectorAll("[data-close]").forEach((el) =>
    el.addEventListener("click", () => {
      const modal = el.closest(".modal");
      if (modal) closeModal(modal);
    })
  );
  async function uploadImage(dataUrl, alt) {
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
  refresh();
}
