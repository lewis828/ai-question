# QuizAI — 本地智能出题与刷题系统

基于 Python FastAPI 的前后端一体 Web 应用，**无需 API Key**，根据上传资料本地生成题目。

## 功能

- **资料上传**：支持 PDF、Word、PPT、TXT、Markdown、Excel 等格式
- **本地出题**：解析资料内容，生成单选 / 多选 / 判断题（正确答案随机分布）
- **刷题练习**：答题卡、计时器、进度追踪
- **错题本**：自动记录错题，支持手动收藏与标记掌握

## 快速开始

```bash
# 1. 创建虚拟环境（推荐）
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# 2. 安装依赖
pip install -r requirements.txt

# 3. 启动服务（推荐）
.\start.ps1

# 或手动激活 venv 后：
.\venv\Scripts\Activate.ps1
python run.py
```

浏览器访问：**http://127.0.0.1:8000**（不要用 0.0.0.0 打开）

健康检查：**http://127.0.0.1:8000/health** 应返回 `{"status":"ok"}`

> 若出现 Internal Server Error，请先停掉旧进程，再执行 `.\start.ps1` 重启。

## 项目结构

```
app/
  main.py           # FastAPI 入口
  models.py         # 数据库模型
  routers/
    api.py          # REST API
    pages.py        # 页面路由
  services/
    parser.py       # 文档解析
    ai_generator.py # 本地出题
  templates/        # Jinja2 页面
  static/           # CSS / JS
uploads/            # 上传文件
data/               # SQLite 数据库
```

## 页面

| 路径 | 说明 |
|------|------|
| `/` | 上传资料 & 生成题库 |
| `/banks` | 我的题库 |
| `/practice/{id}` | 刷题练习 |
| `/practice/{session_id}/summary` | 练习总结（答完全部题目后自动生成） |
| `/wrong` | 错题本 |

## API 文档

启动后访问：**http://localhost:8000/docs**
