const reciteList = document.getElementById("reciteList");
const reciteSentinel = document.getElementById("reciteSentinel");
const reciteEmpty = document.getElementById("reciteEmpty");
const reciteProgress = document.getElementById("reciteProgress");
const reciteLoading = document.getElementById("reciteLoading");
const reciteLoadEnd = document.getElementById("reciteLoadEnd");
const wrongSidebar = document.getElementById("wrongSidebar");
const toast = document.getElementById("toast");
const exitReciteBtn = document.getElementById("exitReciteBtn");

const PAGE_SIZE = 10;
const optionLetters = "ABCDEF";
const typeLabels = { single: "单选题", multiple: "多选题", judge: "判断题" };

const urlParams = new URLSearchParams(window.location.search);
const bankParam = urlParams.get("bank_id");
let currentBankId = bankParam && String(bankParam).trim() !== "" ? String(bankParam).trim() : "";
let currentSort = urlParams.get("sort") || "recent";
if (!["recent", "freq"].includes(currentSort)) currentSort = "recent";

let totalCount = 0;
let loadedCount = 0;
let hasMore = false;
let loading = false;
/** @type {Map<number, { phase: string, selected: Set<string>, userAnswer: string }>} */
const cardStates = new Map();

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

function getOptions(item) {
  return Array.isArray(item.options) ? item.options : [];
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
  return `${Math.floor(days / 30)} 个月前`;
}

function normalizeAnswer(ans) {
  const raw = (ans || "").toUpperCase().replace(/\s/g, "");
  if (!raw) return "";
  if (raw.includes(",")) return raw.split(",").filter(Boolean).sort().join(",");
  return [...raw].sort().join(",");
}

function getCorrectLetters(answer) {
  const norm = normalizeAnswer(answer);
  if (!norm) return [];
  if (norm.includes(",")) return norm.split(",");
  return [...norm];
}

function isAnswerCorrect(userAns, correctAns) {
  return normalizeAnswer(userAns) === normalizeAnswer(correctAns);
}

function formatUserAnswer(letters) {
  if (!letters.size) return "";
  return [...letters].sort().join(",");
}

function getOptionLetters(q) {
  const opts = getOptions(q);
  if (q.q_type === "judge") return ["A", "B"];
  return [...optionLetters].slice(0, opts.length);
}

function formatOptionLabel(letter, text) {
  return `${letter}. ${text}`;
}

function getCardState(id) {
  if (!cardStates.has(id)) {
    cardStates.set(id, { phase: "answering", selected: new Set(), userAnswer: "" });
  }
  return cardStates.get(id);
}

function userPickedLetter(userAnswer, letter) {
  const ua = (userAnswer || "").toUpperCase().replace(/\s/g, "");
  if (!ua) return false;
  if (ua.includes(",")) return ua.split(",").filter(Boolean).includes(letter);
  return ua === letter;
}

function formatCorrectDisplay(item) {
  const letters = getOptionLetters(item);
  const opts = getOptions(item);
  const correctSet = new Set(getCorrectLetters(item.answer));
  const parts = [];
  letters.forEach((letter, i) => {
    if (correctSet.has(letter) && opts[i] !== undefined) {
      parts.push(formatOptionLabel(letter, opts[i]));
    }
  });
  if (parts.length) return parts.join("；");
  return item.answer || "";
}

function buildExitUrl() {
  const params = new URLSearchParams();
  if (currentBankId) params.set("bank_id", currentBankId);
  if (currentSort === "freq") params.set("sort", "freq");
  else if (currentSort === "recent") params.set("sort", "recent");
  const qs = params.toString();
  return qs ? `/wrong?${qs}` : "/wrong";
}

function buildFetchParams(offset) {
  const params = new URLSearchParams();
  if (currentBankId) params.set("bank_id", currentBankId);
  if (currentSort === "freq") params.set("sort", "freq");
  else params.set("sort", "recent");
  params.set("offset", String(offset));
  params.set("limit", String(PAGE_SIZE));
  return params;
}

function updateProgress() {
  reciteProgress.textContent =
    totalCount > 0 ? `${loadedCount} / ${totalCount}` : "0 / 0";
}

function updateLoadStatus() {
  if (reciteLoading) reciteLoading.hidden = !loading;
  if (reciteLoadEnd) reciteLoadEnd.hidden = hasMore || loading || totalCount === 0;
}

function toggleReciteView(empty) {
  if (!reciteList || !reciteEmpty) return;
  reciteEmpty.classList.toggle("is-visible", empty);
  reciteList.hidden = empty;
  if (empty) {
    reciteList.innerHTML = "";
    if (reciteSentinel) {
      reciteList.appendChild(reciteSentinel);
    }
    loadedCount = 0;
  }
}

function renumberCards() {
  reciteList.querySelectorAll(".recite-card").forEach((card, i) => {
    const badge = card.querySelector(".wrong-no-badge");
    if (badge) badge.textContent = `No.${i + 1}`;
  });
}

async function renderSources(total) {
  document.getElementById("allWrongCount").textContent = String(total);
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
    div.addEventListener("click", () => {
      const p = new URLSearchParams();
      p.set("bank_id", String(s.bank_id));
      if (currentSort === "freq") p.set("sort", "freq");
      else if (currentSort === "recent") p.set("sort", "recent");
      window.location.href = `/wrong/recite?${p}`;
    });
    wrongSidebar.insertBefore(div, spacer);
  });
  wrongSidebar.querySelectorAll(".side-item").forEach((el) => {
    const id = el.dataset.bankId ?? "";
    el.classList.toggle("active", id === String(currentBankId));
  });
  lucide.createIcons();
}

function renderOptions(item, state) {
  const letters = getOptionLetters(item);
  const opts = getOptions(item);
  const correctLetters = getCorrectLetters(item.answer);
  const answered = state.phase !== "answering";

  return letters
    .map((letter, i) => {
      const label = formatOptionLabel(letter, opts[i] ?? "");
      let cls = "recite-option";
      let icon = "";

      if (answered) {
        const isCorrectOpt = correctLetters.includes(letter);
        const picked = userPickedLetter(state.userAnswer, letter);
        const isUserWrong = state.phase === "wrong" && picked && !isCorrectOpt;

        if (isCorrectOpt) {
          cls += " recite-option--correct";
          icon = '<i data-lucide="check" class="recite-option-icon"></i>';
        } else if (isUserWrong) {
          cls += " recite-option--wrong";
          icon = '<i data-lucide="x" class="recite-option-icon"></i>';
        }
      } else if (state.selected.has(letter)) {
        cls += " recite-option--selected";
      }

      const disabled = answered ? "disabled" : "";
      return `
        <button type="button" class="${cls}" data-letter="${letter}" ${disabled}>
          ${icon}
          <span class="recite-option-text">${escapeHtml(label)}</span>
        </button>`;
    })
    .join("");
}

function renderResultSection(item, state) {
  if (state.phase === "correct") {
    return `
      <div class="recite-result recite-result--correct">
        <div class="recite-result-left">
          <i data-lucide="check"></i>
          <span>回答正确!</span>
        </div>
        <button type="button" class="recite-remove-btn" data-remove="${item.id}">
          <i data-lucide="trash-2"></i>
          移出错题本
        </button>
      </div>`;
  }
  if (state.phase === "wrong") {
    const explain = item.explanation
      ? `<p class="wrong-explain-text">${escapeHtml(item.explanation)}</p>`
      : "";
    return `
      <div class="recite-result recite-result--wrong">
        <i data-lucide="x"></i>
        <span>回答错误</span>
      </div>
      <div class="wrong-explain-box recite-explain-box">
        <div class="wrong-explain-head">
          <i data-lucide="lightbulb"></i>
          <span>解析</span>
        </div>
        <div class="wrong-answer-row">
          <span class="wrong-answer-tag">正确答案</span>
          <span class="wrong-answer-value">${escapeHtml(formatCorrectDisplay(item))}</span>
        </div>
        ${explain}
      </div>`;
  }
  return "";
}

function renderSubmitRow(item, state) {
  if (state.phase !== "answering" || item.q_type !== "multiple") return "";
  const disabled = state.selected.size === 0 ? "disabled" : "";
  return `
    <div class="recite-submit-row">
      <button type="button" class="btn btn-primary recite-submit-btn" data-submit="${item.id}" ${disabled}>
        提交答案
      </button>
    </div>`;
}

function buildCardHtml(item, index) {
  const state = getCardState(item.id);
  return `
    <article class="wrong-card recite-card" data-id="${item.id}" data-index="${index}">
      <div class="wrong-card-header">
        <div class="wrong-card-header-left">
          <span class="wrong-no-badge">No.${index + 1}</span>
          <span class="wrong-bank-name">${escapeHtml(item.bank_title)}</span>
          <span class="recite-type-tag">${escapeHtml(typeLabels[item.q_type] || item.q_type)}</span>
        </div>
        <div class="wrong-card-meta-right">
          <span class="wrong-times">错了 ${item.wrong_count} 次</span>
          <span class="wrong-time-ago">${formatTimeAgo(item.created_at)}</span>
        </div>
      </div>
      <div class="wrong-card-body recite-card-body">
        <p class="wrong-question-text">${escapeHtml(item.content)}</p>
        <div class="recite-options">${renderOptions(item, state)}</div>
        ${renderSubmitRow(item, state)}
        <div class="recite-result-wrap">${renderResultSection(item, state)}</div>
      </div>
    </article>`;
}

function refreshCard(cardEl, item) {
  if (!cardEl) return;
  const index = Number(cardEl.dataset.index);
  const tmp = document.createElement("div");
  tmp.innerHTML = buildCardHtml(item, index);
  const fresh = tmp.firstElementChild;
  cardEl.replaceWith(fresh);
  bindCardEvents(fresh, item);
  lucide.createIcons();
}

function bindCardEvents(cardEl, item) {
  const state = getCardState(item.id);

  cardEl.querySelectorAll(".recite-option").forEach((btn) => {
    if (state.phase !== "answering") return;
    btn.addEventListener("click", () => onOptionClick(item, btn.dataset.letter));
  });

  const submitBtn = cardEl.querySelector("[data-submit]");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => checkAnswer(item));
  }

  const removeBtn = cardEl.querySelector("[data-remove]");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => removeFromWrong(cardEl, item));
  }
}

function getCardEl(itemId) {
  return reciteList.querySelector(`[data-id="${itemId}"]`);
}

function onOptionClick(item, letter) {
  const state = getCardState(item.id);
  if (state.phase !== "answering") return;

  if (item.q_type === "multiple") {
    if (state.selected.has(letter)) state.selected.delete(letter);
    else state.selected.add(letter);
    refreshCard(getCardEl(item.id), item);
    return;
  }

  state.selected = new Set([letter]);
  state.userAnswer = letter;
  finishCheck(item);
}

function checkAnswer(item) {
  const state = getCardState(item.id);
  if (state.phase !== "answering" || item.q_type !== "multiple") return;
  if (!state.selected.size) {
    showToast("请先选择答案");
    return;
  }
  state.userAnswer = formatUserAnswer(state.selected);
  finishCheck(item);
}

function finishCheck(item) {
  const state = getCardState(item.id);
  state.phase = isAnswerCorrect(state.userAnswer, item.answer) ? "correct" : "wrong";
  refreshCard(getCardEl(item.id), item);
}

async function removeFromWrong(cardEl, item) {
  const res = await fetch(`/api/wrong/${item.id}`, { method: "DELETE" });
  if (!res.ok) {
    showToast("移除失败");
    return;
  }
  showToast("已移出错题本");
  cardStates.delete(item.id);
  cardEl.remove();
  loadedCount = Math.max(0, loadedCount - 1);
  totalCount = Math.max(0, totalCount - 1);
  renumberCards();
  updateProgress();

  if (!reciteList.children.length) {
    toggleReciteView(true);
    const totalRes = await fetch("/api/wrong");
    const totalData = await totalRes.json();
    await renderSources(totalData.total);
    return;
  }

  document.getElementById("allWrongCount").textContent = String(totalCount);
  updateLoadStatus();
}

function appendCards(batch, startIndex) {
  const html = batch.map((item, i) => buildCardHtml(item, startIndex + i)).join("");
  if (reciteSentinel) {
    reciteSentinel.insertAdjacentHTML("beforebegin", html);
  } else {
    reciteList.insertAdjacentHTML("beforeend", html);
  }
  batch.forEach((item) => {
    const card = reciteList.querySelector(`[data-id="${item.id}"]`);
    if (card) bindCardEvents(card, item);
  });
  lucide.createIcons();
}

async function fetchPage(offset) {
  const res = await fetch(`/api/wrong?${buildFetchParams(offset)}`);
  if (!res.ok) {
    let msg = "加载错题失败";
    try {
      const err = await res.json();
      msg = err.detail?.[0]?.msg || err.detail || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

async function loadMore() {
  if (loading || !hasMore) return;
  loading = true;
  updateLoadStatus();

  try {
    const data = await fetchPage(loadedCount);
    const batch = data.items || [];
    if (!batch.length) {
      hasMore = false;
      return;
    }

    totalCount = data.total ?? totalCount;
    hasMore = Boolean(data.has_more);
    appendCards(batch, loadedCount);
    loadedCount += batch.length;
    updateProgress();
  } catch (e) {
    showToast(e.message || "加载失败");
    hasMore = false;
  } finally {
    loading = false;
    updateLoadStatus();
  }
}

async function resetAndLoad() {
  if (!reciteList) return;
  loading = true;
  cardStates.clear();
  reciteList.querySelectorAll(".recite-card").forEach((el) => el.remove());
  loadedCount = 0;
  hasMore = true;
  totalCount = 0;
  updateLoadStatus();

  try {
    const data = await fetchPage(0);
    const batch = data.items || [];
    totalCount = data.total ?? batch.length;
    hasMore = Boolean(data.has_more);

    if (!batch.length) {
      toggleReciteView(true);
      updateProgress();
      return;
    }

    toggleReciteView(false);
    appendCards(batch, 0);
    loadedCount = batch.length;
    updateProgress();
  } catch (e) {
    toggleReciteView(true);
    showToast(e.message || "加载错题失败");
  } finally {
    loading = false;
    updateLoadStatus();
  }
}

let scrollObserver = null;

function setupScrollObserver() {
  if (!reciteSentinel || !reciteList) return;
  if (scrollObserver) scrollObserver.disconnect();
  scrollObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) loadMore();
    },
    { root: reciteList, rootMargin: "80px", threshold: 0 }
  );
  scrollObserver.observe(reciteSentinel);
}

if (exitReciteBtn) exitReciteBtn.href = buildExitUrl();

async function init() {
  if (!reciteList) {
    showToast("页面加载异常，请刷新重试");
    return;
  }
  try {
    const res = await fetch("/api/wrong");
    const data = await res.json();
    await renderSources(data.total ?? 0);
    setupScrollObserver();
    await resetAndLoad();
  } catch (e) {
    showToast("初始化失败，请刷新页面");
  }
}

init();
