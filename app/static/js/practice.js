let sessionId = null;

let state = null;

let allQuestions = [];

let selectedAnswer = null;
let selectedLetters = new Set();

let timerSeconds = 0;

let timerInterval = null;

let finishing = false;
let submitting = false;

const correctAnswers = {};
const questionExplanations = {};



const typeLabels = { single: "单选题", multiple: "多选题", judge: "判断题" };

const optionLetters = "ABCDEF";



function getCorrectLetters(answer) {
  const raw = (answer || "").toUpperCase().replace(/\s/g, "");
  if (!raw) return [];
  if (raw.includes(",")) return raw.split(",").filter(Boolean);
  return [...raw];
}

function parseAnswerToSet(ans) {
  const raw = (ans || "").toUpperCase().replace(/\s/g, "");
  if (!raw) return new Set();
  if (raw.includes(",")) return new Set(raw.split(",").filter(Boolean));
  return new Set([raw]);
}

function formatMultiAnswer(letters) {
  if (!letters.size) return "";
  return [...letters].sort().join(",");
}

function userPickedLetter(userAns, letter) {
  const parts = parseAnswerToSet(userAns);
  return parts.has(letter);
}

function isMultipleQuestion(q) {
  return q && q.q_type === "multiple";
}



function showToast(msg) {

  const t = document.getElementById("toast");

  t.textContent = msg;

  t.classList.add("show");

  setTimeout(() => t.classList.remove("show"), 3000);

}



function formatTime(s) {

  const m = Math.floor(s / 60).toString().padStart(2, "0");

  const sec = (s % 60).toString().padStart(2, "0");

  return `${m}:${sec}`;

}



function startTimer() {

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {

    timerSeconds++;

    document.getElementById("timerDisplay").textContent = formatTime(timerSeconds);

  }, 1000);

}



function stopTimer() {

  if (timerInterval) {

    clearInterval(timerInterval);

    timerInterval = null;

  }

}



async function refreshWrongBadge() {

  const wrong = await (await fetch("/api/wrong")).json();

  document.getElementById("wrongBadge").textContent = `${wrong.total}道`;

}



function isAllAnswered() {

  return state && Object.keys(state.results).length >= state.total;

}



async function finishAndGoSummary() {

  if (finishing) return;

  finishing = true;

  stopTimer();

  const fd = new FormData();

  fd.append("elapsed", timerSeconds);

  const res = await fetch(`/api/practice/${sessionId}/finish`, { method: "POST", body: fd });

  if (!res.ok) {

    const err = await res.json();

    showToast(err.detail || "无法生成总结");

    finishing = false;

    return;

  }

  window.location.href = `/practice/${sessionId}/summary`;

}



function isLastQuestion() {
  return state && state.current_index >= state.total - 1;
}

function updateActionButtons() {
  const submitBtn = document.getElementById("submitBtn");
  const nextBtn = document.getElementById("nextBtn");
  const q = state.question;
  const result = q ? state.results[String(q.id)] : null;
  const allDone = isAllAnswered();
  const onLast = isLastQuestion();
  const isMulti = isMultipleQuestion(q);
  const showSubmit = isMulti && !result;

  if (onLast) {
    if (result) {
      nextBtn.style.display = "";
      nextBtn.textContent = "查看结果";
      submitBtn.style.display = "none";
    } else {
      nextBtn.style.display = "none";
      submitBtn.style.display = showSubmit ? "" : "none";
    }
    return;
  }

  nextBtn.style.display = "";
  if (allDone) {
    nextBtn.textContent = "查看总结";
    submitBtn.style.display = showSubmit ? "" : "none";
  } else {
    nextBtn.textContent = "下一题";
    submitBtn.style.display = showSubmit ? "" : "none";
  }
}



async function init() {

  const startRes = await fetch(`/api/practice/start/${BANK_ID}`, { method: "POST" });

  const startData = await startRes.json();

  if (!startRes.ok) {

    showToast(startData.detail || "无法开始练习");

    return;

  }

  sessionId = startData.session_id;



  const qRes = await fetch(`/api/banks/${BANK_ID}/questions`);

  allQuestions = await qRes.json();



  await loadBanksNav();

  await refreshState();



  if (state.finished) {

    window.location.href = `/practice/${sessionId}/summary`;

    return;

  }



  startTimer();

}



async function loadBanksNav() {

  const banks = await (await fetch("/api/banks")).json();

  const list = document.getElementById("bankNavList");

  list.innerHTML = banks

    .map(

      (b) => `

    <a href="/practice/${b.id}" class="practice-nav-item ${b.id === BANK_ID ? "active" : ""}">

      ${b.title}

    </a>`

    )

    .join("");



  await refreshWrongBadge();

}



async function refreshState() {

  const res = await fetch(`/api/practice/${sessionId}`);

  state = await res.json();

  renderQuestion();

  renderSheet();

  updateActionButtons();

}



function renderQuestion() {

  const q = state.question;

  if (!q) return;



  document.getElementById("breadcrumb").textContent =

    `${state.bank_title} · ${typeLabels[q.q_type] || q.q_type}`;

  document.getElementById("progressText").textContent =

    `第 ${state.current_index + 1} / ${state.total} 题`;

  document.getElementById("progressFill").style.width =

    `${((state.current_index + 1) / state.total) * 100}%`;

  document.getElementById("typeBadge").textContent = typeLabels[q.q_type] || q.q_type;

  document.getElementById("questionText").textContent =

    `${state.current_index + 1}. ${q.content}`;



  const result = state.results[String(q.id)];

  const savedAnswer = state.answers[String(q.id)];

  selectedAnswer = savedAnswer || null;
  selectedLetters = parseAnswerToSet(savedAnswer);



  const group = document.getElementById("optionsGroup");

  group.innerHTML = "";



  const letters = q.q_type === "judge" ? ["A", "B"] : [...optionLetters].slice(0, q.options.length);

  const correctLetters = getCorrectLetters(correctAnswers[q.id] || q.answer);



  q.options.forEach((opt, i) => {

    const letter = letters[i];

    const div = document.createElement("div");

    div.className = "option-item";



    if (result) {
      if (correctLetters.includes(letter)) div.classList.add("correct");
      const picked = userPickedLetter(selectedAnswer, letter);
      if (result === "wrong" && picked && !correctLetters.includes(letter)) {
        div.classList.add("wrong");
      }
    } else if (selectedLetters.has(letter)) {
      div.classList.add("selected");
    }



    div.innerHTML = `

      <span class="option-badge">${letter}</span>

      <span>${opt}</span>`;

    if (!result) {

      div.addEventListener("click", () => selectOption(letter, div));

    }

    group.appendChild(div);

  });



  const exp = document.getElementById("explanationBox");

  exp.classList.remove("show");
  exp.textContent = "";

  if (result) {
    const explanation = questionExplanations[q.id] || "";
    if (result === "correct") {
      exp.textContent = explanation ? `✓ 正确！${explanation}` : "✓ 回答正确！";
    } else {
      exp.textContent = explanation;
    }
    if (exp.textContent) exp.classList.add("show");
  }

}



function selectOption(letter, el) {
  if (submitting || state.results[String(state.question.id)]) return;

  const q = state.question;
  if (isMultipleQuestion(q)) {
    if (selectedLetters.has(letter)) {
      selectedLetters.delete(letter);
      el.classList.remove("selected");
    } else {
      selectedLetters.add(letter);
      el.classList.add("selected");
    }
    selectedAnswer = formatMultiAnswer(selectedLetters);
    return;
  }

  selectedLetters = new Set([letter]);
  selectedAnswer = letter;
  document.querySelectorAll(".option-item").forEach((o) => o.classList.remove("selected"));
  el.classList.add("selected");
  submitCurrentAnswer();
}



async function submitCurrentAnswer() {
  if (submitting) return;

  const q = state.question;
  if (!q || state.results[String(q.id)]) return;

  const answer = isMultipleQuestion(q)
    ? formatMultiAnswer(selectedLetters)
    : selectedAnswer;

  if (!answer) {
    showToast(isMultipleQuestion(q) ? "请至少选择一个选项" : "请先选择答案");
    return;
  }

  submitting = true;
  try {
    const res = await fetch(`/api/practice/${sessionId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_id: q.id, answer }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.detail || "提交失败");
      return;
    }

    correctAnswers[q.id] = data.correct_answer;
    questionExplanations[q.id] = data.explanation || "";

    const exp = document.getElementById("explanationBox");

    exp.textContent = data.correct
      ? `✓ 正确！${data.explanation || ""}`
      : data.explanation || "";

    if (exp.textContent) exp.classList.add("show");

    if (!data.correct && data.added_to_wrong) {
      await refreshWrongBadge();
    } else if (data.correct) {
      showToast("回答正确！");
    }

    await refreshState();

    if (data.all_completed && !isLastQuestion()) {
      setTimeout(() => finishAndGoSummary(), 1200);
    }
  } finally {
    submitting = false;
  }
}



function renderSheet() {

  const grid = document.getElementById("sheetGrid");

  grid.innerHTML = "";

  allQuestions.forEach((q, i) => {

    const cell = document.createElement("div");

    cell.className = "sheet-cell";

    cell.textContent = i + 1;

    const res = state.results[String(q.id)];

    if (res === "correct" || res === "wrong") {

      cell.classList.add(res === "wrong" ? "wrong" : "answered");

    }

    if (i === state.current_index) cell.classList.add("current");

    cell.addEventListener("click", () => navigateTo(i));

    grid.appendChild(cell);

  });

}



async function navigateTo(index) {

  const fd = new FormData();

  fd.append("index", index);

  fd.append("elapsed", timerSeconds);

  await fetch(`/api/practice/${sessionId}/navigate`, { method: "POST", body: fd });

  await refreshState();

}



document.getElementById("prevBtn").addEventListener("click", () => {

  if (state.current_index > 0) navigateTo(state.current_index - 1);

});



document.getElementById("nextBtn").addEventListener("click", async () => {
  if (isAllAnswered()) {
    await finishAndGoSummary();
    return;
  }

  if (isLastQuestion()) {
    showToast("请先完成本题作答");
    return;
  }

  if (state.current_index < state.total - 1) {
    navigateTo(state.current_index + 1);
  } else {
    showToast("请先完成本题作答");
  }
});



document.getElementById("submitBtn").addEventListener("click", () => submitCurrentAnswer());



document.getElementById("bookmarkBtn").addEventListener("click", async () => {

  if (!state.question) return;

  const fd = new FormData();

  fd.append("question_id", state.question.id);

  await fetch(`/api/practice/${sessionId}/bookmark`, { method: "POST", body: fd });

  showToast("已加入错题本");

  await refreshWrongBadge();

});



init();

