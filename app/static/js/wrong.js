const wrongList = document.getElementById("wrongList");
const emptyState = document.getElementById("emptyState");
const wrongSidebar = document.getElementById("wrongSidebar");
const toast = document.getElementById("toast");

let currentBankId = "";
let currentSort = "recent";
let searchQuery = "";
let allItems = [];
let totalWrongCount = 0;

const wrongSearchInput = document.getElementById("wrongSearchInput");

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatQuestionContent(item) {
  if (!item.options?.length) return item.content || "";
  const letters = "ABCDEF";
  const opts = item.options.map((opt, i) => `${letters[i]}. ${opt}`).join("\n");
  const base = (item.content || "").trim();
  return base ? `${base}\n${opts}` : opts;
}

function formatTimeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  return `${months} 个月前`;
}

function setActiveSource(bankId) {
  wrongSidebar.querySelectorAll(".side-item").forEach((el) => {
    const id = el.dataset.bankId ?? "";
    el.classList.toggle("active", id === String(bankId));
  });
  currentBankId = bankId === "" ? "" : String(bankId);
  loadItems();
}

async function renderSources(total) {
  document.getElementById("allWrongCount").textContent = String(total);
  document.getElementById("wrongCountBadge").textContent = `${total} 道错题`;

  wrongSidebar.querySelectorAll(".side-item:not(.side-item-all)").forEach((el) => el.remove());

  const res = await fetch("/api/wrong/sources");
  const sources = await res.json();
  const spacer = wrongSidebar.querySelector(".sidebar-spacer");

  sources.forEach((s) => {
    const div = document.createElement("div");
    div.className = "side-item side-item-source";
    div.dataset.bankId = String(s.bank_id);
    div.innerHTML = `
      <span class="side-item-left">
        <i data-lucide="book"></i>
        <span>${escapeHtml(s.title)}</span>
      </span>
      <span class="side-item-count">${s.count}</span>`;
    div.addEventListener("click", () => setActiveSource(s.bank_id));
    wrongSidebar.insertBefore(div, spacer);
  });

  const allItem = wrongSidebar.querySelector(".side-item-all");
  if (allItem) allItem.onclick = () => setActiveSource("");
  lucide.createIcons();
}

async function loadItems() {
  const params = new URLSearchParams();
  if (currentBankId) params.set("bank_id", currentBankId);
  if (currentSort === "freq") params.set("sort", "freq");
  else if (currentSort === "recent") params.set("sort", "recent");
  if (searchQuery) params.set("q", searchQuery);

  const res = await fetch(`/api/wrong?${params}`);
  const data = await res.json();
  allItems = data.items;

  if (!currentBankId && !searchQuery) {
    document.getElementById("wrongCountBadge").textContent = `${data.total} 道错题`;
  } else if (searchQuery) {
    document.getElementById("wrongCountBadge").textContent = `找到 ${data.total} 道`;
  }

  renderList();
}

function toggleEmptyView(showEmpty, noSearchMatch = false) {
  emptyState.classList.toggle("is-visible", showEmpty);
  const reciteBtn = document.getElementById("startReciteBtn");
  if (reciteBtn) reciteBtn.disabled = showEmpty || noSearchMatch;
  const titleEl = document.getElementById("emptyStateTitle");
  const descEl = document.getElementById("emptyStateDesc");
  const iconEl = document.getElementById("emptyStateIcon");
  if (noSearchMatch) {
    if (titleEl) titleEl.textContent = "未找到匹配的错题";
    if (descEl) descEl.textContent = "试试更换关键词或清空搜索";
    if (iconEl) iconEl.setAttribute("data-lucide", "search-x");
  } else {
    if (titleEl) titleEl.textContent = "太棒了！暂无错题记录";
    if (descEl) descEl.textContent = "继续保持，去刷题巩固知识吧";
    if (iconEl) iconEl.setAttribute("data-lucide", "party-popper");
  }
  if (showEmpty) {
    wrongList.hidden = true;
    wrongList.innerHTML = "";
  } else {
    wrongList.hidden = false;
    emptyState.classList.remove("is-visible");
  }
}

function buildReciteUrl() {
  const params = new URLSearchParams();
  if (currentBankId) params.set("bank_id", currentBankId);
  if (currentSort === "freq") params.set("sort", "freq");
  else if (currentSort === "recent") params.set("sort", "recent");
  const qs = params.toString();
  return qs ? `/wrong/recite?${qs}` : "/wrong/recite";
}

function renderList() {
  let items = [...allItems];
  if (currentSort === "recent") {
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (currentSort === "freq") {
    items.sort((a, b) => b.wrong_count - a.wrong_count);
  }

  if (!items.length) {
    toggleEmptyView(true, Boolean(searchQuery));
    lucide.createIcons();
    return;
  }

  toggleEmptyView(false);
  wrongList.innerHTML = items
    .map((item, index) => {
      const explain = item.explanation
        ? `<p class="wrong-explain-text">${escapeHtml(item.explanation)}</p>`
        : "";
      return `
      <article class="wrong-card" data-id="${item.id}">
        <div class="wrong-card-header">
          <div class="wrong-card-header-left">
            <span class="wrong-no-badge">No.${index + 1}</span>
            <span class="wrong-bank-name">${escapeHtml(item.bank_title)}</span>
          </div>
          <div class="wrong-card-meta-right">
            <span class="wrong-times">错了 ${item.wrong_count} 次</span>
            <span class="wrong-time-ago">${formatTimeAgo(item.created_at)}</span>
            <button type="button" class="wrong-resolve-link" data-resolve="${item.id}">掌握</button>
          </div>
        </div>
        <div class="wrong-card-body">
          <p class="wrong-question-text">${escapeHtml(formatQuestionContent(item))}</p>
          <div class="wrong-explain-box">
            <div class="wrong-explain-head">
              <i data-lucide="lightbulb"></i>
              <span>解析</span>
            </div>
            <div class="wrong-answer-row">
              <span class="wrong-answer-tag">正确答案</span>
              <span class="wrong-answer-value">${escapeHtml(item.answer)}</span>
            </div>
            ${explain}
          </div>
        </div>
      </article>`;
    })
    .join("");

  document.querySelectorAll("[data-resolve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await fetch(`/api/wrong/${btn.dataset.resolve}`, { method: "DELETE" });
      showToast("已标记为掌握");
      await init();
    });
  });

  lucide.createIcons();
}

document.querySelectorAll(".wrong-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".wrong-pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    const sort = pill.dataset.sort;
    currentSort = sort === "all" ? "recent" : sort;
    loadItems();
  });
});

const startReciteBtn = document.getElementById("startReciteBtn");
if (startReciteBtn) {
  startReciteBtn.addEventListener("click", () => {
    if (!allItems.length) {
      showToast("暂无错题可背");
      return;
    }
    window.location.href = buildReciteUrl();
  });
}

if (wrongSearchInput) {
  let searchTimer = null;
  wrongSearchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = wrongSearchInput.value.trim();
      loadItems();
    }, 300);
  });
}

async function init() {
  const res = await fetch("/api/wrong");
  const data = await res.json();
  totalWrongCount = data.total;
  await renderSources(data.total);
  currentBankId = "";
  currentSort = "recent";
  setActiveSource("");
}

init();
