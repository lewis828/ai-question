import shutil
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.categories import DEFAULT_CATEGORY, PRESET_CATEGORIES
from app.config import settings
from app.database import get_db
from app.models import PracticeSession, Question, QuestionBank, WrongRecord

from app.schemas import (
    BankOut,
    BankUpdate,
    GenerateRequest,
    PracticeState,
    PracticeSummary,
    PracticeSummaryItem,
    QuestionDetail,
    QuestionOut,
    SubmitAnswer,
)
from app.services.ai_generator import Q_TYPE_LABELS, generate_questions
from app.services.bank_io import export_bank_xlsx, parse_import_file
from app.services.bank_store import save_bank_payload
from app.services.parser import SUPPORTED, extract_text

router = APIRouter(prefix="/api")


def _normalize_answer(ans: str) -> str:
    """统一答案格式，多选按字母排序比较（A,B 与 B,A 等价）。"""
    raw = (ans or "").upper().replace(" ", "")
    if not raw:
        return ""
    if "," in raw:
        return ",".join(sorted(p for p in raw.split(",") if p))
    return "".join(sorted(raw))


def _bank_stats(db: Session, bank_id: int) -> tuple[float | None, int]:
    wrong_count = (
        db.query(func.count(WrongRecord.id))
        .join(Question)
        .filter(Question.bank_id == bank_id, WrongRecord.resolved == False)
        .scalar()
        or 0
    )
    sessions = (
        db.query(PracticeSession)
        .filter(PracticeSession.bank_id == bank_id)
        .all()
    )
    total_answered = 0
    total_correct = 0
    for s in sessions:
        for qid, result in (s.results or {}).items():
            if result in ("correct", "wrong"):
                total_answered += 1
                if result == "correct":
                    total_correct += 1
    accuracy = round(total_correct / total_answered * 100, 1) if total_answered else None
    return accuracy, wrong_count


def _to_bank_out(db: Session, bank: QuestionBank) -> BankOut:
    acc, wrong = _bank_stats(db, bank.id)
    return BankOut(
        id=bank.id,
        title=bank.title,
        description=bank.description,
        category=bank.category,
        question_count=bank.question_count,
        created_at=bank.created_at,
        accuracy=acc,
        wrong_count=wrong,
    )


@router.get("/banks")
def list_banks(db: Session = Depends(get_db)):
    banks = db.query(QuestionBank).order_by(QuestionBank.created_at.desc()).all()
    return [_to_bank_out(db, b) for b in banks]


@router.get("/banks/categories")
def list_categories(db: Session = Depends(get_db)):
    """侧栏：仅汇总数据库中已有题库的分类。"""
    rows = db.query(QuestionBank.category, func.count(QuestionBank.id)).group_by(
        QuestionBank.category
    ).all()
    result = [{"name": (c or DEFAULT_CATEGORY), "count": n} for c, n in rows]
    result.sort(key=lambda x: (-x["count"], x["name"]))
    return result


@router.get("/banks/category-options")
def category_options(db: Session = Depends(get_db)):
    """编辑/上传：预设 + 已有分类，供输入时参考。"""
    rows = db.query(QuestionBank.category).distinct().all()
    existing = {(c or DEFAULT_CATEGORY) for (c,) in rows}
    seen = set()
    suggestions = []
    for name in PRESET_CATEGORIES + sorted(existing):
        if name not in seen:
            seen.add(name)
            suggestions.append(name)
    return {"suggestions": suggestions}


@router.patch("/banks/{bank_id}")
def update_bank(bank_id: int, req: BankUpdate, db: Session = Depends(get_db)):
    bank = db.get(QuestionBank, bank_id)
    if not bank:
        raise HTTPException(404, "题库不存在")
    if req.title is not None:
        bank.title = req.title.strip() or bank.title
    if req.description is not None:
        bank.description = req.description
    if req.category is not None:
        bank.category = req.category.strip() or "未分类"
    db.commit()
    db.refresh(bank)
    return _to_bank_out(db, bank)


@router.delete("/banks/{bank_id}")
def delete_bank(bank_id: int, db: Session = Depends(get_db)):
    bank = db.get(QuestionBank, bank_id)
    if not bank:
        raise HTTPException(404, "题库不存在")
    db.delete(bank)
    db.commit()
    return {"ok": True}


@router.post("/upload")
async def upload_files(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    if len(files) > settings.max_files_per_upload:
        raise HTTPException(400, f"单次最多上传 {settings.max_files_per_upload} 个文件")

    saved = []
    combined_text = []

    for f in files:
        suffix = Path(f.filename or "").suffix.lower()
        if suffix not in SUPPORTED:
            raise HTTPException(400, f"不支持格式: {suffix}")

        content = await f.read()
        if len(content) > settings.max_upload_mb * 1024 * 1024:
            raise HTTPException(400, f"文件 {f.filename} 超过 {settings.max_upload_mb}MB")

        safe_name = f"{uuid.uuid4().hex}{suffix}"
        from app.config import UPLOAD_DIR

        path = UPLOAD_DIR / safe_name
        path.write_bytes(content)

        try:
            text = extract_text(path)
            combined_text.append(text)
            saved.append({"name": f.filename, "path": safe_name, "size": len(content)})
        except Exception as e:
            raise HTTPException(400, f"解析 {f.filename} 失败: {e}") from e

    return {
        "files": saved,
        "text_preview": "\n\n".join(combined_text)[:500],
        "text_length": sum(len(t) for t in combined_text),
        "full_text": "\n\n".join(combined_text),
    }


@router.post("/generate")
async def generate_bank(
    title: str = Form(""),
    category: str = Form("未分类"),
    question_types: str = Form("single,judge,multiple"),
    count: int = Form(20),
    difficulty: int = Form(3),
    material_text: str = Form(""),
    file_paths: str = Form(""),
    db: Session = Depends(get_db),
):
    from app.config import UPLOAD_DIR

    req = GenerateRequest(
        title=title,
        category=category,
        question_types=[t.strip() for t in question_types.split(",") if t.strip()],
        count=count,
        difficulty=difficulty,
    )

    text_parts = [material_text] if material_text.strip() else []
    for fp in [p.strip() for p in file_paths.split(",") if p.strip()]:
        path = UPLOAD_DIR / fp
        if path.exists():
            text_parts.append(extract_text(path))

    full_text = "\n\n".join(text_parts).strip()
    if not full_text:
        raise HTTPException(400, "请先上传资料或提供文本内容")

    try:
        items = generate_questions(
            full_text,
            req.question_types,
            req.count,
            req.difficulty,
            req.title,
        )
    except Exception as e:
        raise HTTPException(500, f"AI 出题失败: {e}") from e

    if not items:
        raise HTTPException(500, "未能生成有效题目")

    bank_title = req.title or "AI 生成题库"
    bank = QuestionBank(
        title=bank_title,
        description=f"基于资料自动生成 · {len(items)} 道题",
        category=req.category,
        source_files=file_paths,
        question_count=len(items),
    )
    db.add(bank)
    db.flush()

    for idx, item in enumerate(items):
        q = Question(
            bank_id=bank.id,
            q_type=item["q_type"],
            content=item["content"],
            options=item["options"],
            answer=item["answer"],
            explanation=item.get("explanation", ""),
            difficulty=req.difficulty,
            order_index=idx,
        )
        db.add(q)

    db.commit()
    db.refresh(bank)
    return {"bank": _to_bank_out(db, bank), "generated": len(items)}


@router.get("/banks/{bank_id}/questions")
def get_questions(bank_id: int, db: Session = Depends(get_db)):
    qs = (
        db.query(Question)
        .filter(Question.bank_id == bank_id)
        .order_by(Question.order_index)
        .all()
    )
    return [QuestionOut.model_validate(q) for q in qs]


def _create_bank_from_payload(db: Session, payload: dict) -> QuestionBank:
    try:
        return save_bank_payload(db, payload)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/banks/{bank_id}/export")
def export_bank(bank_id: int, db: Session = Depends(get_db)):
    bank = db.get(QuestionBank, bank_id)
    if not bank:
        raise HTTPException(404, "题库不存在")
    questions = (
        db.query(Question)
        .filter(Question.bank_id == bank_id)
        .order_by(Question.order_index)
        .all()
    )
    data = export_bank_xlsx(
        bank.title,
        bank.category,
        bank.description,
        questions,
    )
    safe_name = "".join(c if c not in '\\/:*?"<>|' else "_" for c in bank.title)[:80]
    filename = f"{safe_name or 'quizai-bank'}.xlsx"
    ascii_fallback = filename.encode("ascii", "ignore").decode() or "quizai-bank.xlsx"
    utf8_name = quote(filename)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_fallback}"; filename*=UTF-8\'\'{utf8_name}'
            )
        },
    )


@router.post("/banks/import")
async def import_bank(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(400, "请选择文件")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "文件不能超过 10MB")
    try:
        payload = parse_import_file(file.filename, content)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(400, f"解析文件失败: {e}") from e

    bank = _create_bank_from_payload(db, payload)
    return {"bank": _to_bank_out(db, bank), "imported": bank.question_count}


@router.post("/practice/start/{bank_id}")
def start_practice(bank_id: int, db: Session = Depends(get_db)):
    bank = db.get(QuestionBank, bank_id)
    if not bank:
        raise HTTPException(404, "题库不存在")
    count = db.query(Question).filter(Question.bank_id == bank_id).count()
    if count == 0:
        raise HTTPException(400, "题库暂无题目")

    session = PracticeSession(bank_id=bank_id, current_index=0)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"session_id": session.id, "total": count}


@router.get("/practice/{session_id}")
def get_practice_state(session_id: int, db: Session = Depends(get_db)):
    session = db.get(PracticeSession, session_id)
    if not session:
        raise HTTPException(404, "练习会话不存在")

    bank = db.get(QuestionBank, session.bank_id)
    questions = (
        db.query(Question)
        .filter(Question.bank_id == session.bank_id)
        .order_by(Question.order_index)
        .all()
    )
    total = len(questions)
    idx = min(session.current_index, max(0, total - 1))
    current_q = questions[idx] if questions else None

    q_out = QuestionOut.model_validate(current_q) if current_q else None
    return PracticeState(
        session_id=session.id,
        bank_id=session.bank_id,
        bank_title=bank.title if bank else "",
        total=total,
        current_index=idx,
        question=q_out,
        answers={str(k): v for k, v in (session.answers or {}).items()},
        results={str(k): v for k, v in (session.results or {}).items()},
        elapsed_seconds=session.elapsed_seconds,
        finished=session.finished_at is not None,
    )


def _build_summary(session: PracticeSession, db: Session) -> PracticeSummary:
    bank = db.get(QuestionBank, session.bank_id)
    questions = (
        db.query(Question)
        .filter(Question.bank_id == session.bank_id)
        .order_by(Question.order_index)
        .all()
    )
    results = session.results or {}
    answers = session.answers or {}
    correct_count = sum(1 for v in results.values() if v == "correct")
    wrong_count = sum(1 for v in results.values() if v == "wrong")
    answered = len(results)
    total = len(questions)
    accuracy = round(correct_count / answered * 100, 1) if answered else 0.0

    wrong_items = []
    for q in questions:
        if results.get(str(q.id)) != "wrong":
            continue
        wrong_items.append(
            PracticeSummaryItem(
                question_id=q.id,
                order_index=q.order_index,
                content=q.content,
                user_answer=answers.get(str(q.id), ""),
                correct_answer=q.answer,
                q_type_label=Q_TYPE_LABELS.get(q.q_type, q.q_type),
            )
        )

    return PracticeSummary(
        session_id=session.id,
        bank_id=session.bank_id,
        bank_title=bank.title if bank else "",
        total=total,
        answered=answered,
        correct_count=correct_count,
        wrong_count=wrong_count,
        accuracy=accuracy,
        elapsed_seconds=session.elapsed_seconds,
        wrong_items=wrong_items,
    )


@router.post("/practice/{session_id}/submit")
def submit_answer(
    session_id: int,
    body: SubmitAnswer,
    db: Session = Depends(get_db),
):
    session = db.get(PracticeSession, session_id)
    if not session:
        raise HTTPException(404, "练习会话不存在")

    question = db.get(Question, body.question_id)
    if not question:
        raise HTTPException(404, "题目不存在")

    user_ans = _normalize_answer(body.answer)
    correct_ans = _normalize_answer(question.answer)
    is_correct = user_ans == correct_ans

    answers = dict(session.answers or {})
    results = dict(session.results or {})
    answers[str(question.id)] = user_ans
    results[str(question.id)] = "correct" if is_correct else "wrong"
    session.answers = answers
    session.results = results

    if not is_correct:
        existing = (
            db.query(WrongRecord)
            .filter(
                WrongRecord.question_id == question.id,
                WrongRecord.resolved == False,
            )
            .first()
        )
        if not existing:
            db.add(
                WrongRecord(
                    question_id=question.id,
                    user_answer=user_ans,
                    wrong_count=1,
                )
            )
        else:
            existing.user_answer = user_ans
            existing.wrong_count = (existing.wrong_count or 1) + 1

    db.commit()

    total_q = db.query(Question).filter(Question.bank_id == session.bank_id).count()
    all_completed = len(results) >= total_q

    return {
        "correct": is_correct,
        "correct_answer": question.answer,
        "explanation": question.explanation,
        "q_type_label": Q_TYPE_LABELS.get(question.q_type, question.q_type),
        "added_to_wrong": not is_correct,
        "all_completed": all_completed,
    }


@router.get("/practice/{session_id}/summary")
def get_practice_summary(session_id: int, db: Session = Depends(get_db)):
    session = db.get(PracticeSession, session_id)
    if not session:
        raise HTTPException(404, "练习会话不存在")
    return _build_summary(session, db)


@router.post("/practice/{session_id}/finish")
def finish_practice(
    session_id: int,
    elapsed: int = Form(0),
    db: Session = Depends(get_db),
):
    session = db.get(PracticeSession, session_id)
    if not session:
        raise HTTPException(404, "练习会话不存在")

    total_q = db.query(Question).filter(Question.bank_id == session.bank_id).count()
    answered = len(session.results or {})
    if answered < total_q:
        raise HTTPException(400, "还有题目未作答，无法生成总结")

    session.elapsed_seconds = elapsed
    if not session.finished_at:
        session.finished_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return _build_summary(session, db)


@router.post("/practice/{session_id}/navigate")
def navigate(
    session_id: int,
    index: int = Form(...),
    elapsed: int = Form(0),
    db: Session = Depends(get_db),
):
    session = db.get(PracticeSession, session_id)
    if not session:
        raise HTTPException(404, "练习会话不存在")

    total = db.query(Question).filter(Question.bank_id == session.bank_id).count()
    session.current_index = max(0, min(index, total - 1))
    session.elapsed_seconds = elapsed
    db.commit()
    return get_practice_state(session_id, db)


@router.post("/practice/{session_id}/bookmark")
def bookmark_wrong(session_id: int, question_id: int = Form(...), db: Session = Depends(get_db)):
    question = db.get(Question, question_id)
    if not question:
        raise HTTPException(404, "题目不存在")

    existing = (
        db.query(WrongRecord)
        .filter(WrongRecord.question_id == question_id, WrongRecord.resolved == False)
        .first()
    )
    if not existing:
        session = db.get(PracticeSession, session_id)
        user_ans = ""
        if session and session.answers:
            user_ans = session.answers.get(str(question_id), "")
        db.add(WrongRecord(question_id=question_id, user_answer=user_ans))
        db.commit()
    return {"ok": True}


@router.get("/wrong/sources")
def wrong_sources(db: Session = Depends(get_db)):
    rows = (
        db.query(QuestionBank.id, QuestionBank.title, func.count(WrongRecord.id))
        .join(Question, Question.bank_id == QuestionBank.id)
        .join(WrongRecord, WrongRecord.question_id == Question.id)
        .filter(WrongRecord.resolved == False)
        .group_by(QuestionBank.id, QuestionBank.title)
        .order_by(func.count(WrongRecord.id).desc())
        .all()
    )
    return [
        {"bank_id": bid, "title": title, "count": cnt} for bid, title, cnt in rows
    ]


@router.get("/wrong")
def list_wrong(
    bank_id: int | None = None,
    sort: str = "recent",
    search: str | None = Query(None, alias="q"),
    offset: int = 0,
    limit: int | None = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(WrongRecord, Question, QuestionBank)
        .join(Question, WrongRecord.question_id == Question.id)
        .join(QuestionBank, Question.bank_id == QuestionBank.id)
        .filter(WrongRecord.resolved == False)
    )
    if bank_id is not None:
        query = query.filter(QuestionBank.id == bank_id)
    if sort == "freq":
        query = query.order_by(
            WrongRecord.wrong_count.desc(), WrongRecord.created_at.desc()
        )
    else:
        query = query.order_by(WrongRecord.created_at.desc())

    records = query.all()
    keyword = (search or "").strip().lower()

    def _to_item(wr, question, bank):
        return {
            "id": wr.id,
            "question_id": question.id,
            "bank_id": bank.id,
            "bank_title": bank.title,
            "q_type": question.q_type,
            "q_type_label": Q_TYPE_LABELS.get(question.q_type, question.q_type),
            "content": question.content,
            "options": question.options,
            "answer": question.answer,
            "user_answer": wr.user_answer,
            "explanation": question.explanation,
            "wrong_count": wr.wrong_count or 1,
            "created_at": wr.created_at.isoformat(),
        }

    def _matches(wr, question, bank) -> bool:
        if not keyword:
            return True
        opts_text = ""
        if isinstance(question.options, list):
            opts_text = " ".join(question.options)
        haystack = " ".join(
            [
                question.content or "",
                bank.title or "",
                question.answer or "",
                wr.user_answer or "",
                question.explanation or "",
                Q_TYPE_LABELS.get(question.q_type, question.q_type),
                opts_text,
            ]
        ).lower()
        return keyword in haystack

    filtered = [
        _to_item(wr, question, bank)
        for wr, question, bank in records
        if _matches(wr, question, bank)
    ]

    total = len(filtered)
    offset = max(0, offset)
    if limit is not None:
        limit = max(1, min(limit, 100))
        page = filtered[offset : offset + limit]
        has_more = offset + len(page) < total
    else:
        page = filtered[offset:]
        has_more = False

    return {
        "items": page,
        "total": total,
        "offset": offset,
        "has_more": has_more,
    }


@router.delete("/wrong/{record_id}")
def resolve_wrong(record_id: int, db: Session = Depends(get_db)):
    record = db.get(WrongRecord, record_id)
    if not record:
        raise HTTPException(404, "记录不存在")
    record.resolved = True
    db.commit()
    return {"ok": True}


@router.get("/stats")
def global_stats(db: Session = Depends(get_db)):
    total_questions = db.query(func.count(Question.id)).scalar() or 0
    total_wrong = (
        db.query(func.count(WrongRecord.id))
        .filter(WrongRecord.resolved == False)
        .scalar()
        or 0
    )
    return {
        "total_generated": total_questions,
        "wrong_count": total_wrong,
        "generator": "local",
    }
