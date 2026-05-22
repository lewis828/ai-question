import random
import re
from typing import Any

Q_TYPE_LABELS = {
    "single": "单选题",
    "multiple": "多选题",
    "judge": "判断题",
}

TYPE_ORDER = ("single", "judge", "multiple")
_LABELS = ("A", "B", "C", "D", "E", "F")
JUDGE_OPTIONS = ("正确", "错误")


def normalize_judge_answer(raw: str) -> str:
    """判断题答案：A=正确，B=错误。"""
    s = (raw or "").strip()
    upper = s.upper()
    if upper == "A":
        return "A"
    if upper == "B":
        return "B"
    if s in {"正确", "对", "√", "是", "T", "TRUE"} or s.startswith("正确"):
        return "A"
    if s in {"错误", "错", "×", "否", "F", "FALSE"} or s.startswith("错误"):
        return "B"
    return "A"


def judge_verdict(answer: str) -> str:
    return "正确" if normalize_judge_answer(answer) == "A" else "错误"


def build_judge_explanation(answer: str, basis: str = "") -> str:
    ans = normalize_judge_answer(answer)
    verdict = judge_verdict(ans)
    parts = [f"答案：{ans}（{verdict}）。"]
    if basis.strip():
        parts.append(f"依据：{basis.strip()}。")
    return "".join(parts)


def _extract_basis_from_explanation(explanation: str) -> str:
    exp = (explanation or "").strip()
    m = re.search(r"依据[：:]([^。]+)。", exp)
    if m:
        return m.group(1).strip()
    return ""


def finalize_judge_question(q: dict[str, Any]) -> dict[str, Any]:
    """判断题：A 固定正确，B 固定错误；不打乱选项；解析与答案一致。"""
    q = dict(q)
    q["options"] = list(JUDGE_OPTIONS)

    raw_answer = str(q.get("answer", "A"))
    exp = str(q.get("explanation", "") or "").strip()
    answer = normalize_judge_answer(raw_answer)

    # 若解析中明确写了「答案：正确/错误」，与 A/B 语义对齐
    if re.search(r"答案[：:]\s*正确", exp):
        answer = "A"
    elif re.search(r"答案[：:]\s*错误", exp):
        answer = "B"
    else:
        m = re.search(r"答案[：:]\s*([ABab])", exp)
        if m:
            answer = normalize_judge_answer(m.group(1))

    basis = _extract_basis_from_explanation(exp)
    if not basis and len(exp) > 10 and not exp.startswith("答案："):
        basis = exp

    q["answer"] = answer
    q["explanation"] = build_judge_explanation(answer, basis)
    q.pop("_material_ref", None)
    return q


def generate_questions(
    material_text: str,
    question_types: list[str],
    count: int,
    difficulty: int,
    title: str = "",
) -> list[dict[str, Any]]:
    text = material_text.strip()
    if not text:
        raise ValueError("未能从资料中提取到有效文本内容")

    return _generate_local(text, question_types, count, difficulty, title)


def _truncate(text: str, max_len: int) -> str:
    s = re.sub(r"\s+", " ", (text or "").strip())
    if len(s) <= max_len:
        return s
    return s[:max_len].rstrip() + "…"


def _keyword(text: str, max_len: int = 24) -> str:
    s = _truncate(text, max_len)
    return s.strip("「」\"' ")


def _extract_sentences(text: str) -> list[str]:
    parts = re.split(r"[。！？\n；;]+", text)
    sentences = [p.strip() for p in parts if len(p.strip()) >= 12]
    if not sentences:
        chunk = re.sub(r"\s+", " ", text.strip())[:400]
        if chunk:
            sentences = [chunk]
    return sentences


def _ordered_types(question_types: list[str]) -> list[str]:
    allowed = set(question_types or TYPE_ORDER)
    return [t for t in TYPE_ORDER if t in allowed]


def _allocate_counts(total: int, types: list[str]) -> dict[str, int]:
    if not types or total <= 0:
        return {}
    base, rem = divmod(total, len(types))
    return {t: base + (1 if i < rem else 0) for i, t in enumerate(types)}


def _pick_other_sentences(sentences: list[str], exclude_idx: int, n: int) -> list[str]:
    others = [s for i, s in enumerate(sentences) if i != exclude_idx]
    if not others:
        return []
    if len(others) <= n:
        return others
    return random.sample(others, n)


def _answer_text(q: dict[str, Any]) -> str:
    answer = str(q.get("answer", "")).upper()
    options = q.get("options") or []
    labels = [p for p in re.split(r"[,，]", answer) if p in _LABELS[: len(options)]]
    return "、".join(_truncate(options[_LABELS.index(l)], 60) for l in labels if l in _LABELS)


def _rebuild_explanation_after_shuffle(q: dict[str, Any], original: str) -> str:
    """选项打乱后，按最终答案与选项文本重建解析，保留原解析中的「依据」。"""
    original = (original or "").strip()
    basis = ""
    m = re.search(r"依据[：:]([^。]+)。", original)
    if m:
        basis = m.group(1).strip()

    q_type = q.get("q_type", "single")
    answer = str(q.get("answer", "")).upper()
    options = q.get("options") or []

    if q_type == "judge":
        ans = normalize_judge_answer(answer)
        basis = _extract_basis_from_explanation(original)
        return build_judge_explanation(ans, basis)

    ans_display = answer.replace(",", "、")
    correct_text = _answer_text(q)
    parts = [f"答案：{ans_display}（{correct_text}）。"]
    if basis:
        parts.append(f"依据：{basis}。")

    ans_set = {p for p in re.split(r"[,，]", answer) if p}
    wrong_parts: list[str] = []
    for i, opt in enumerate(options):
        label = _LABELS[i]
        if label in ans_set:
            continue
        wrong_parts.append(f"{label}「{_truncate(opt, 36)}」")
    if wrong_parts:
        parts.append(f"错项：{'；'.join(wrong_parts)}。")
    return "".join(parts)


def _shuffle_question_options(
    q: dict[str, Any], *, preserve_explanation: bool = False
) -> dict[str, Any]:
    if q.get("q_type") == "judge":
        return finalize_judge_question(q)

    options = list(q.get("options") or [])
    if len(options) < 2:
        return q

    answer = str(q.get("answer", "A")).upper().replace(" ", "")
    correct_labels = [p for p in re.split(r"[,，]", answer) if p in _LABELS[: len(options)]]
    if not correct_labels:
        correct_labels = ["A"]

    saved_explanation = str(q.get("explanation", "") or "").strip()
    correct_indices = {_LABELS.index(label) for label in correct_labels}
    pairs = list(enumerate(options))
    random.shuffle(pairs)

    new_options = [text for _, text in pairs]
    index_map = {old_i: new_i for new_i, (old_i, _) in enumerate(pairs)}
    new_answer = ",".join(
        sorted(_LABELS[index_map[i]] for i in correct_indices if i in index_map)
    )

    shuffled = {**q, "options": new_options, "answer": new_answer or "A"}
    if preserve_explanation and saved_explanation:
        shuffled["explanation"] = _rebuild_explanation_after_shuffle(shuffled, saved_explanation)
    else:
        shuffled["explanation"] = _build_explanation(shuffled, q.get("_material_ref", ""))
    shuffled.pop("_material_ref", None)
    return shuffled


def sort_questions_by_type(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order = {t: i for i, t in enumerate(TYPE_ORDER)}
    return sorted(questions, key=lambda q: order.get(q.get("q_type", "single"), 99))


def prepare_export_questions(
    questions: list[dict[str, Any]], *, shuffle: bool = True
) -> list[dict[str, Any]]:
    """导出前按题型排序，并随机打乱选项（解析随最终答案同步）。"""
    sorted_qs = sort_questions_by_type(questions)
    if not shuffle:
        return sorted_qs
    result: list[dict[str, Any]] = []
    for raw in sorted_qs:
        q = dict(raw)
        if q.get("q_type") == "judge":
            result.append(finalize_judge_question(q))
        else:
            result.append(_shuffle_question_options(q, preserve_explanation=True))
    return result


def _wrong_option_notes(q: dict[str, Any], limit: int = 3) -> str:
    answer = {p for p in re.split(r"[,，]", str(q.get("answer", "")).upper()) if p}
    notes: list[str] = []
    for i, opt in enumerate(q.get("options") or []):
        label = _LABELS[i]
        if label in answer:
            continue
        notes.append(f"{label}「{_truncate(opt, 36)}」不符合资料")
        if len(notes) >= limit:
            break
    return "；".join(notes)


def _build_explanation(q: dict[str, Any], material_ref: str = "") -> str:
    q_type = q.get("q_type", "single")
    answer = str(q.get("answer", "")).upper()
    ref = _truncate(material_ref, 100)

    if q_type == "judge":
        return build_judge_explanation(answer, ref or _truncate(material_ref, 100))

    if q_type == "multiple":
        correct = _answer_text(q)
        wrong = _wrong_option_notes(q)
        parts = [f"正确答案 {answer.replace(',', '、')}：{correct}。"]
        if wrong:
            parts.append(f"错项说明：{wrong}。")
        return "".join(parts)

    correct = _answer_text(q)
    wrong = _wrong_option_notes(q)
    parts = [f"正确答案 {answer.split(',')[0]}：{correct}。"]
    if ref:
        parts.append(f"资料依据：{ref}。")
    if wrong:
        parts.append(f"错项说明：{wrong}。")
    return "".join(parts)


def _make_single(sentences: list[str], idx: int) -> dict[str, Any]:
    correct = sentences[idx]
    topic = _keyword(correct)
    distractors = _pick_other_sentences(sentences, idx, 3)
    while len(distractors) < 3:
        filler = ["与资料表述不符", "资料中未涉及该内容", "属于对资料的误读"]
        distractors.append(filler[len(distractors)])

    options = [_truncate(correct, 100)] + [_truncate(d, 100) for d in distractors[:3]]
    return {
        "q_type": "single",
        "content": f"根据资料，以下哪项关于「{topic}」的表述正确？",
        "options": options,
        "answer": "A",
        "_material_ref": correct,
    }


def _make_judge(sentences: list[str], idx: int) -> dict[str, Any]:
    stmt = sentences[idx]
    stem = _truncate(stmt, 120)
    is_true = random.choice([True, False])

    if is_true:
        content = stem
        answer = "A"
        material_ref = stmt
    else:
        other = sentences[(idx + 1) % len(sentences)] if len(sentences) > 1 else stmt
        content = f"「{_truncate(other, 80)}」是对「{_keyword(stmt)}」的准确概括。"
        answer = "B"
        material_ref = stmt

    return {
        "q_type": "judge",
        "content": content,
        "options": ["正确", "错误"],
        "answer": answer,
        "_material_ref": material_ref,
    }


def _make_multiple(sentences: list[str], idx: int) -> dict[str, Any]:
    topic = _keyword(sentences[idx])
    correct_a = _truncate(sentences[idx], 100)
    correct_b = _truncate(sentences[(idx + 1) % len(sentences)], 100)
    wrong_candidates = _pick_other_sentences(sentences, idx, 2)
    wrong_a = _truncate(wrong_candidates[0], 100) if wrong_candidates else "资料未提及该结论"
    wrong_b = (
        _truncate(wrong_candidates[1], 100)
        if len(wrong_candidates) > 1
        else "与资料核心观点相反"
    )

    return {
        "q_type": "multiple",
        "content": f"根据资料，以下关于「{topic}」的说法中，哪些是正确的？（多选）",
        "options": [correct_a, correct_b, wrong_a, wrong_b],
        "answer": "A,B",
        "_material_ref": sentences[idx],
    }


def _generate_local(
    text: str,
    question_types: list[str],
    count: int,
    difficulty: int,
    title: str,
) -> list[dict[str, Any]]:
    sentences = _extract_sentences(text)
    ordered = _ordered_types(question_types)
    if not ordered:
        ordered = list(TYPE_ORDER)

    allocation = _allocate_counts(count, ordered)
    builders = {
        "single": _make_single,
        "judge": _make_judge,
        "multiple": _make_multiple,
    }

    questions: list[dict[str, Any]] = []
    cursor = 0
    for q_type in ordered:
        n = allocation.get(q_type, 0)
        builder = builders[q_type]
        for j in range(n):
            idx = (cursor + j) % len(sentences)
            questions.append(builder(sentences, idx))
        cursor += n

    return _normalize_questions(questions, question_types)


def _normalize_questions(
    raw: list[Any], allowed_types: list[str]
) -> list[dict[str, Any]]:
    result = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        q_type = item.get("q_type", "single")
        if allowed_types and q_type not in allowed_types:
            q_type = allowed_types[0]

        options = item.get("options") or []
        if q_type == "judge":
            options = ["正确", "错误"]
        elif len(options) < 2:
            continue

        answer = str(item.get("answer", "A")).upper().replace(" ", "")
        content = str(item.get("content", "")).strip()
        if not content:
            continue

        material_ref = str(item.get("_material_ref", "") or "")

        question = {
            "q_type": q_type,
            "content": content,
            "options": options[:6],
            "answer": answer,
            "explanation": "",
            "_material_ref": material_ref,
        }
        result.append(_shuffle_question_options(question))
    return result
