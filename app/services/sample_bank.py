"""内置样例题库：含单选、多选、判断示例题。"""

from sqlalchemy.orm import Session

from app.models import Question, QuestionBank

SAMPLE_BANK_TITLE = "样例题库"
SAMPLE_BANK_CATEGORY = "示例"
SAMPLE_BANK_DESCRIPTION = "内置演示题库，涵盖单选、多选、判断题型，便于体验刷题与背题功能。"

SAMPLE_QUESTIONS: list[dict] = [
    {
        "q_type": "single",
        "content": "【演示题 1】根据资料内容，以下哪项最符合「微积分是研究函数变化率的数学分支」的描述？",
        "options": [
            "完全符合资料表述",
            "部分符合资料表述",
            "与资料表述相反",
            "资料中未涉及",
        ],
        "answer": "A",
        "explanation": "资料明确指出微积分研究变化率，与选项 A 一致。",
    },
    {
        "q_type": "multiple",
        "content": "【演示题 2】关于函数 f(x)=x³-3x²+2 在区间 [0,3] 上，以下哪些结论正确？（多选）",
        "options": [
            "f(0)=2，f(3)=2",
            "f(x) 在 x=2 处取得极小值 -2",
            "f(x) 在 [0,3] 上的最大值为 2",
            "f(x) 在 x=1 处取得极大值",
        ],
        "answer": "A,B,C",
        "explanation": "f'(x)=3x²-6x=3x(x-2)，端点与 x=2 处比较可得最大值为 2、极小值为 -2。",
    },
    {
        "q_type": "judge",
        "content": "【演示题 3】根据资料：「导数表示函数在某一点的瞬时变化率」，该表述正确。",
        "options": ["正确", "错误"],
        "answer": "A",
        "explanation": "导数的定义即瞬时变化率，表述正确。",
    },
    {
        "q_type": "single",
        "content": "【演示题 4】资料提到「定积分可用来计算曲边梯形的面积」，以下理解正确的是？",
        "options": [
            "定积分与面积无关",
            "定积分在特定条件下可表示面积",
            "只有不定积分才能算面积",
            "资料未讨论积分应用",
        ],
        "answer": "B",
        "explanation": "定积分几何意义包含求面积，属于资料核心应用之一。",
    },
    {
        "q_type": "multiple",
        "content": "【演示题 5】下列关于微积分基本定理的说法，哪些是正确的？（多选）",
        "options": [
            "连续函数的定积分可通过原函数求出",
            "牛顿-莱布尼茨公式连接微分与积分",
            "任何函数都无需满足条件即可使用",
            "原函数存在时定积分等于 F(b)-F(a)",
        ],
        "answer": "A,B,D",
        "explanation": "微积分基本定理要求函数连续等条件，A、B、D 为正确表述，C 过于绝对。",
    },
    {
        "q_type": "judge",
        "content": "【演示题 6】根据资料：「洛必达法则适用于所有分式极限」，该表述正确。",
        "options": ["正确", "错误"],
        "answer": "B",
        "explanation": "洛必达法则需满足未定式等条件，不能用于所有分式极限。",
    },
]

MULTIPLE_ONLY: list[dict] = [
    q for q in SAMPLE_QUESTIONS if q["q_type"] == "multiple"
]


def _is_sample_bank(bank: QuestionBank) -> bool:
    return (bank.title or "").strip() == SAMPLE_BANK_TITLE


def _find_sample_bank(db: Session) -> QuestionBank | None:
    bank = (
        db.query(QuestionBank)
        .filter(QuestionBank.title == SAMPLE_BANK_TITLE)
        .first()
    )
    if bank:
        return bank
    for b in db.query(QuestionBank).all():
        if _is_sample_bank(b):
            return b
        if b.question_count and b.question_count <= 8:
            demo = (
                db.query(Question)
                .filter(
                    Question.bank_id == b.id,
                    Question.content.like("【演示题%"),
                )
                .first()
            )
            if demo:
                return b
    return None


def _add_questions(db: Session, bank: QuestionBank, items: list[dict], start_index: int) -> int:
    added = 0
    for i, item in enumerate(items):
        db.add(
            Question(
                bank_id=bank.id,
                q_type=item["q_type"],
                content=item["content"],
                options=item["options"],
                answer=item["answer"],
                explanation=item.get("explanation", ""),
                order_index=start_index + i,
            )
        )
        added += 1
    return added


def seed_sample_bank(db: Session) -> None:
    """确保样例题库存在，且包含多选题示例。"""
    bank = _find_sample_bank(db)

    if not bank:
        bank = QuestionBank(
            title=SAMPLE_BANK_TITLE,
            description=SAMPLE_BANK_DESCRIPTION,
            category=SAMPLE_BANK_CATEGORY,
            source_files="内置样例",
            question_count=0,
        )
        db.add(bank)
        db.flush()
        _add_questions(db, bank, SAMPLE_QUESTIONS, 0)
        bank.question_count = len(SAMPLE_QUESTIONS)
        db.commit()
        return

    has_multiple = (
        db.query(Question)
        .filter(Question.bank_id == bank.id, Question.q_type == "multiple")
        .count()
        > 0
    )
    if has_multiple:
        bank.question_count = (
            db.query(Question).filter(Question.bank_id == bank.id).count()
        )
        if bank.title != SAMPLE_BANK_TITLE:
            bank.title = SAMPLE_BANK_TITLE
        if not bank.category or bank.category == "未分类":
            bank.category = SAMPLE_BANK_CATEGORY
        db.commit()
        return

    max_order = (
        db.query(Question.order_index)
        .filter(Question.bank_id == bank.id)
        .order_by(Question.order_index.desc())
        .limit(1)
        .scalar()
    ) or -1
    added = _add_questions(db, bank, MULTIPLE_ONLY, max_order + 1)
    bank.question_count = (
        db.query(Question).filter(Question.bank_id == bank.id).count()
    )
    if bank.title != SAMPLE_BANK_TITLE:
        bank.title = SAMPLE_BANK_TITLE
    db.commit()
