const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const genBtn = document.getElementById("genBtn");
const loading = document.getElementById("loading");
const toast = document.getElementById("toast");

const BANK_FILE_RE = /\.(xlsx|xlsm|json)$/i;

let pendingImportFile = null;

async function initCategoryInput() {
  const input = document.getElementById("bankCategory");
  const list = document.getElementById("uploadCategoryList");
  if (!input || !list) return;
  const res = await fetch("/api/banks/category-options");
  const { suggestions } = await res.json();
  list.innerHTML = suggestions.map((name) => `<option value="${name}"></option>`).join("");
}

initCategoryInput();

function isBankFile(name) {
  return BANK_FILE_RE.test(name || "");
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

function handleFiles(files) {
  if (!files.length) return;

  const picked = [...files];
  const bankFiles = picked.filter((f) => isBankFile(f.name));

  if (bankFiles.length !== 1 || bankFiles.length !== picked.length) {
    pendingImportFile = null;
    genBtn.disabled = true;
    fileList.innerHTML = "";
    showToast(
      bankFiles.length > 1 ? "一次只能导入一个题库文件" : "请上传 Excel 或 JSON 格式的题库文件"
    );
    return;
  }

  pendingImportFile = bankFiles[0];
  fileList.innerHTML = `
    <div class="file-item">
      <span>${bankFiles[0].name}</span>
      <span style="color:var(--success)">${(bankFiles[0].size / 1024).toFixed(1)} KB ✓</span>
    </div>`;
  genBtn.disabled = false;
  showToast("已选择题库文件，点击导入");
}

async function importBank(file) {
  const fd = new FormData();
  fd.append("file", file);

  loading.classList.add("show");
  genBtn.disabled = true;

  try {
    const res = await fetch("/api/banks/import", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "导入失败");

    showToast(`已导入「${data.bank.title}」共 ${data.imported} 题`);
    setTimeout(() => {
      window.location.href = "/banks";
    }, 800);
  } catch (err) {
    showToast(err.message);
    genBtn.disabled = false;
  } finally {
    loading.classList.remove("show");
  }
}

genBtn.addEventListener("click", async () => {
  if (!pendingImportFile) {
    showToast("请先上传 Excel 或 JSON 题库文件");
    return;
  }
  await importBank(pendingImportFile);
});

fetch("/api/stats")
  .then((r) => r.json())
  .then((d) => {
    document.getElementById("statGenerated").textContent =
      d.total_generated > 0 ? d.total_generated.toLocaleString() : "0";
  });
