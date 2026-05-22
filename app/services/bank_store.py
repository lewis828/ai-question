"""将题库 payload 写入 SQLite。"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Question, QuestionBank


def save_bank_payload(db: Session, payload: dict) -> QuestionBank:
    questions = payload.get("questions") or []
    if not questions:
        raise ValueError("题库中没有有效题目")

    bank = QuestionBank(
        title=(payload.get("title") or "导入题库").strip()[:200],
        description=(payload.get("description") or f"导入 · {len(questions)} 道题")[:500],
        category=(payload.get("category") or "未分类").strip()[:100] or "未分类",
        source_files=str(payload.get("source_files") or "import"),
        question_count=len(questions),
    )
    db.add(bank)
    db.flush()

    for idx, item in enumerate(questions):
        db.add(
            Question(
                bank_id=bank.id,
                q_type=item["q_type"],
                content=item["content"],
                options=item["options"],
                answer=item["answer"],
                explanation=item.get("explanation", ""),
                order_index=idx,
            )
        )

    db.commit()
    db.refresh(bank)
    return bank
