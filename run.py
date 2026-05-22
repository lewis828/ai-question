import sys
from pathlib import Path

import uvicorn

from app.config import settings

if __name__ == "__main__":
    venv_python = Path(__file__).parent / "venv" / "Scripts" / "python.exe"
    if venv_python.exists() and Path(sys.executable).resolve() != venv_python.resolve():
        print("提示: 建议使用 .\\start.ps1 或先执行 .\\venv\\Scripts\\Activate.ps1")
        print(f"  当前 Python: {sys.executable}")
        print(f"  项目 venv:   {venv_python}")

    print(f"QuizAI 运行在 http://127.0.0.1:{settings.port}")
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
