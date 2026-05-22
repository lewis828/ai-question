import logging
import traceback
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db
from app.routers import api, pages

logger = logging.getLogger("quizai")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="QuizAI", description="AI 智能出题与刷题系统", lifespan=lifespan)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled error on %s: %s\n%s", request.url.path, exc, traceback.format_exc())
    detail = str(exc)
    if request.url.path.startswith("/api"):
        return JSONResponse(status_code=500, content={"detail": detail})
    from fastapi.responses import HTMLResponse

    return HTMLResponse(
        status_code=500,
        content=f"""<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px">
        <h2>服务器错误</h2><p>{detail}</p>
        <p>请关闭终端后重新运行: <code>.\\start.ps1</code></p>
        <p><a href="/">返回首页</a></p></body></html>""",
    )


@app.get("/health")
async def health():
    return {"status": "ok"}

static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

app.include_router(pages.router)
app.include_router(api.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
