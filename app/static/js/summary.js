function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadSummary() {
  const res = await fetch(`/api/practice/${SESSION_ID}/summary`);
  if (!res.ok) {
    document.getElementById("summaryTitle").textContent = "总结加载失败";
    return;
  }
  const data = await res.json();

  document.getElementById("summaryTitle").textContent = data.bank_title;
  document.getElementById("summarySubtitle").textContent =
    `共作答 ${data.answered} 题 · 用时 ${formatTime(data.elapsed_seconds)}`;

  document.getElementById("summaryStats").innerHTML = `
    <div class="summary-stat-card">
      <div class="summary-stat-num">${data.total}</div>
      <div class="summary-stat-label">总题数</div>
    </div>
    <div class="summary-stat-card success">
      <div class="summary-stat-num">${data.correct_count}</div>
      <div class="summary-stat-label">答对</div>
    </div>
    <div class="summary-stat-card error">
      <div class="summary-stat-num">${data.wrong_count}</div>
      <div class="summary-stat-label">答错</div>
    </div>
    <div class="summary-stat-card accent">
      <div class="summary-stat-num">${data.accuracy}%</div>
      <div class="summary-stat-label">正确率</div>
    </div>`;

  document.getElementById("retryBtn").href = `/practice/${data.bank_id}`;

  if (data.wrong_items.length > 0) {
    const section = document.getElementById("wrongSection");
    section.style.display = "block";
    document.getElementById("wrongList").innerHTML = data.wrong_items
      .map(
        (item, i) => `
      <div class="summary-wrong-item">
        <div class="summary-wrong-item-head">
          <span class="type-badge">${escapeHtml(item.q_type_label)}</span>
          <span style="font-size:12px;color:var(--fg-secondary)">第 ${item.order_index + 1} 题</span>
        </div>
        <p class="summary-wrong-content">${escapeHtml(item.content)}</p>
        <p class="summary-wrong-answer">你的答案：<strong style="color:var(--error)">${escapeHtml(item.user_answer || "—")}</strong>
          · 正确答案：<strong style="color:var(--success)">${escapeHtml(item.correct_answer)}</strong></p>
      </div>`
      )
      .join("");
  }

  lucide.createIcons();
}

loadSummary();
