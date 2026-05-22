from fastapi import APIRouter, Request
from starlette.templating import Jinja2Templates

from app.config import BASE_DIR

templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))
router = APIRouter()


@router.get("/")
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html", {"page": "upload"})


@router.get("/banks")
async def banks_page(request: Request):
    return templates.TemplateResponse(request, "banks.html", {"page": "banks"})


@router.get("/practice/{bank_id}")
async def practice_page(request: Request, bank_id: int):
    return templates.TemplateResponse(
        request,
        "practice.html",
        {"page": "practice", "bank_id": bank_id},
    )


@router.get("/practice/{session_id}/summary")
async def practice_summary_page(request: Request, session_id: int):
    return templates.TemplateResponse(
        request,
        "summary.html",
        {"page": "summary", "session_id": session_id},
    )


@router.get("/wrong")
async def wrong_page(request: Request):
    return templates.TemplateResponse(request, "wrong.html", {"page": "wrong"})


@router.get("/wrong/recite")
async def wrong_recite_page(request: Request):
    return templates.TemplateResponse(request, "wrong_recite.html", {"page": "wrong"})
