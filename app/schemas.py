from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    title: str = ""
    category: str = "未分类"
    question_types: list[str] = Field(default=["single", "judge", "multiple"])
    count: int = Field(default=20, ge=5, le=100)
    difficulty: int = Field(default=3, ge=1, le=5)


class QuestionOut(BaseModel):
    id: int
    q_type: str
    content: str
    options: list[str]
    order_index: int

    model_config = {"from_attributes": True}


class QuestionDetail(QuestionOut):
    answer: str
    explanation: str


class BankUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None


class BankOut(BaseModel):
    id: int
    title: str
    description: str
    category: str
    question_count: int
    created_at: datetime
    accuracy: float | None = None
    wrong_count: int = 0

    model_config = {"from_attributes": True}


class SubmitAnswer(BaseModel):
    question_id: int
    answer: str


class PracticeState(BaseModel):
    session_id: int
    bank_id: int
    bank_title: str
    total: int
    current_index: int
    question: QuestionOut | None
    answers: dict[str, str]
    results: dict[str, str]
    elapsed_seconds: int
    finished: bool = False


class PracticeSummaryItem(BaseModel):
    question_id: int
    order_index: int
    content: str
    user_answer: str
    correct_answer: str
    q_type_label: str


class PracticeSummary(BaseModel):
    session_id: int
    bank_id: int
    bank_title: str
    total: int
    answered: int
    correct_count: int
    wrong_count: int
    accuracy: float
    elapsed_seconds: int
    wrong_items: list[PracticeSummaryItem] = []


QType = Literal["single", "multiple", "judge"]
