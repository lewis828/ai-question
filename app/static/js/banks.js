const cardGrid = document.getElementById("cardGrid");
const searchInput = document.getElementById("searchInput");
const categorySidebar = document.getElementById("categorySidebar");
const toast = document.getElementById("toast");

const DEFAULT_CATEGORY = "未分类";
const CARD_ICON = "book-open";

let allBanks = [];
let currentCategory = "";
let editingBankId = null;

const editModal = document.getElementById("editModal");
const editTitle = document.getElementById("editTitle");
const editCategory = document.getElementById("editCategory");
const editCategoryList = document.getElementById("editCategoryList");

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

function setActiveCategory(name) {
  categorySidebar.querySelectorAll(".side-item").forEach((s) => {
    s.classList.toggle("active", s.dataset.category === name);
  });
  currentCategory = name;
  renderBanks();
}

function createCategoryItem(c) {
  const div = document.createElement("div");
  div.className = "side-item side-item-category";
  div.dataset.category = c.name;
  div.innerHTML = `
    <span class="side-item-left">
      <i data-lucide="book"></i>
      <span>${escapeHtml(c.name)}</span>
    </span>
    <span class="side-item-count">${c.count}</span>`;
  div.addEventListener("click", () => setActiveCategory(c.name));
  return div;
}

async function loadBanks() {
  const [banksRes, catRes] = await Promise.all([
    fetch("/api/banks"),
    fetch("/api/banks/categories"),
  ]);
  allBanks = await banksRes.json();
  const categories = await catRes.json();
  renderCategories(categories, true);
  updateAllBanksCount();
  await loadCategorySuggestions();
}

function updateAllBanksCount() {
  const el = document.getElementById("allBanksCount");
  if (el) el.textContent = String(allBanks.length);
}

function renderCategories(categories, keepSelection = false) {
  categorySidebar.querySelectorAll(".side-item:not(.side-item-all)").forEach((el) => el.remove());

  const spacer = categorySidebar.querySelector(".sidebar-spacer");
  categories.forEach((c) => {
    categorySidebar.insertBefore(createCategoryItem(c), spacer);
  });

  const allItem = categorySidebar.querySelector(".side-item-all");
  if (allItem) allItem.onclick = () => setActiveCategory("");

  const names = categories.map((c) => c.name);
  const prev = currentCategory;

  if (keepSelection && (prev === "" || names.includes(prev))) {
    setActiveCategory(prev);
  } else {
    setActiveCategory("");
  }

  lucide.createIcons();
}

function renderBanks() {
  const q = searchInput.value.toLowerCase();
  let banks = allBanks.filter((b) => {
    const cat = b.category || DEFAULT_CATEGORY;
    const matchCat = !currentCategory || cat === currentCategory;
    const matchSearch =
      !q ||
      b.title.toLowerCase().includes(q) ||
      (b.description || "").toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const newCard = cardGrid.querySelector(".new-card");
  cardGrid.innerHTML = "";
  cardGrid.appendChild(newCard);

  banks.forEach((bank) => {
    const accNumClass =
      bank.accuracy !== null ? "bank-stat-num stat-success" : "bank-stat-num stat-muted";
    const accValue = bank.accuracy !== null ? `${bank.accuracy}%` : "—";
    const accLabel = bank.accuracy !== null ? "正确率" : "未开始";

    const card = document.createElement("div");
    card.className = "bank-card";
    card.innerHTML = `
      <div class="bank-card-top">
        <div class="card-icon">
          <i data-lucide="${CARD_ICON}"></i>
        </div>
        <div class="bank-card-top-actions">
          <a href="/practice/${bank.id}" class="btn-practice">开始刷题</a>
        </div>
      </div>
      <div class="bank-card-body">
        <h3>${escapeHtml(bank.title)}</h3>
        <p>${escapeHtml(bank.description || bank.category)}</p>
      </div>
      <div class="bank-card-meta">
        <div class="bank-stats">
          <div class="bank-stat">
            <div class="bank-stat-num">${bank.question_count}</div>
            <div class="bank-stat-label">题目数</div>
          </div>
          <div class="bank-stat">
            <div class="${accNumClass}">${accValue}</div>
            <div class="bank-stat-label">${accLabel}</div>
          </div>
          <div class="bank-stat">
            <div class="bank-stat-num stat-error">${bank.wrong_count}</div>
            <div class="bank-stat-label">错题</div>
          </div>
        </div>
        <div class="card-actions">
          <button class="icon-btn" data-action="edit" data-id="${bank.id}" title="编辑" type="button">
            <i data-lucide="pencil"></i>
          </button>
          <button class="icon-btn" data-action="export" data-id="${bank.id}" title="导出" type="button">
            <i data-lucide="download"></i>
          </button>
          <button class="icon-btn danger" data-action="delete" data-id="${bank.id}" title="删除" type="button">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>`;
    cardGrid.appendChild(card);

    card.querySelector('[data-action="edit"]').addEventListener("click", (e) => {
      e.stopPropagation();
      editBank(bank);
    });
    card.querySelector('[data-action="export"]').addEventListener("click", (e) => {
      e.stopPropagation();
      exportBank(bank);
    });
    card.querySelector('[data-action="delete"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm(`确定删除「${bank.title}」？`)) return;
      await fetch(`/api/banks/${bank.id}`, { method: "DELETE" });
      showToast("已删除");
      loadBanks();
    });
  });

  document.getElementById("bankSubtitle").textContent = `共 ${banks.length} 个题库`;
  lucide.createIcons();
}

async function loadCategorySuggestions() {
  const res = await fetch("/api/banks/category-options");
  const { suggestions } = await res.json();
  const names = [...suggestions];
  allBanks.forEach((b) => {
    const cat = b.category || DEFAULT_CATEGORY;
    if (!names.includes(cat)) names.push(cat);
  });
  const options = names
    .map((name) => `<option value="${escapeHtml(name)}"></option>`)
    .join("");
  if (editCategoryList) editCategoryList.innerHTML = options;
}

function openEditModal(bank) {
  editingBankId = bank.id;
  editTitle.value = bank.title;
  editCategory.value = bank.category || DEFAULT_CATEGORY;
  editModal.hidden = false;
  editTitle.focus();
  editTitle.select();
}

function closeEditModal() {
  editModal.hidden = true;
  editingBankId = null;
}

async function saveEditBank() {
  if (!editingBankId) return;
  const title = editTitle.value.trim();
  const category = editCategory.value.trim() || DEFAULT_CATEGORY;
  if (!title) {
    showToast("请输入题库名称");
    editTitle.focus();
    return;
  }
  const res = await fetch(`/api/banks/${editingBankId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, category }),
  });
  if (!res.ok) {
    showToast("保存失败");
    return;
  }
  closeEditModal();
  showToast("已保存");
  const savedCategory = category;
  await loadBanks();
  if (savedCategory) setActiveCategory(savedCategory);
}

function editBank(bank) {
  openEditModal(bank);
}

document.getElementById("editCancel").addEventListener("click", closeEditModal);
document.getElementById("editSave").addEventListener("click", saveEditBank);
editModal.addEventListener("click", (e) => {
  if (e.target === editModal) closeEditModal();
});
document.addEventListener("keydown", (e) => {
  if (!editModal.hidden && e.key === "Escape") closeEditModal();
});
editTitle.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveEditBank();
});

async function exportBank(bank) {
  try {
    const res = await fetch(`/api/banks/${bank.id}/export`);
    if (!res.ok) throw new Error("export failed");
    const blob = await res.blob();
    const safeName = bank.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "题库";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("已导出 Excel");
  } catch {
    showToast("导出失败");
  }
}

searchInput.addEventListener("input", renderBanks);
loadBanks();

fetch("/api/wrong")
  .then((r) => r.json())
  .then((d) => {
    const el = document.getElementById("sideWrongText");
    if (el) el.textContent = `错题本 · ${d.total}道`;
    lucide.createIcons();
  });
