# mini OpenClaw 快速阅读与启动说明

本文基于 `E:\openclaw_learning\mini-calw\source-code` 目录下的代码整理，目标是帮助你快速理解这个项目的结构、运行依赖和启动方式。

## 1. 项目简介

这是一个“轻量版 OpenClaw”项目，整体是一个前后端分离的 AI Agent 系统：

- 后端使用 `FastAPI` 提供接口。
- 智能体链路使用 `LangChain` + `DeepSeek`。
- 支持工具调用、SSE 流式输出、会话持久化、技能扫描、记忆编辑、RAG 检索、历史压缩。
- 前端使用 `Next.js 14` + `React 18`，提供聊天界面、会话管理、原始消息查看器，以及右侧 Monaco 编辑器。

从代码实现来看，这个项目的定位不是通用网站，而是一个“可观察、可编辑、可扩展”的 Agent 工作台：

- 左侧管理会话和原始消息
- 中间进行流式聊天
- 右侧直接编辑 `memory/`、`workspace/`、`skills/` 相关文件
- 后端会把这些文件拼装成系统提示词，驱动 Agent 行为

## 2. 整体架构

### 2.1 前端

目录：`mini-calw/source-code/frontend`

职责：

- 提供聊天 UI
- 调用后端 `/api/*` 接口
- 解析 POST SSE 流式响应
- 展示工具调用链、RAG 检索结果、原始消息
- 允许用户在线编辑记忆、身份、技能等 Markdown 文件

### 2.2 后端

目录：`mini-calw/source-code/backend`

职责：

- 提供聊天、文件、会话、压缩、token 统计、RAG 开关等 API
- 初始化 DeepSeek 聊天模型
- 注册工具集
- 扫描 `skills/` 目录并生成技能快照
- 将 `workspace/` + `memory/` 等文件拼成系统提示词
- 管理 session JSON 文件
- 构建并持久化 `memory/MEMORY.md` 的向量索引

## 3. Python 包在做什么

严格来说，这个后端里真正的 Python package 主要有 3 个：

### 3.1 `api`

职责：FastAPI 路由层，对外暴露 HTTP API。

它负责：

- 聊天请求入口
- 会话 CRUD
- 原始消息查询
- 文件读写
- token 统计
- 历史压缩
- RAG 模式开关

### 3.2 `graph`

职责：Agent 核心编排层。

它负责：

- 初始化 LLM 和工具
- 构建系统提示词
- 将历史消息转换为模型输入
- 进行流式推理
- 触发工具调用事件
- 注入 RAG 检索结果
- 管理 session 持久化和压缩上下文

### 3.3 `tools`

职责：提供 Agent 可调用的工具。

当前内置工具包括：

- `terminal`
- `python_repl`
- `fetch_url`
- `read_file`
- `search_knowledge_base`

## 4. 每个 Python 模块实现了什么功能

### 4.1 后端顶层模块

| 模块 | 功能 |
| --- | --- |
| `backend/app.py` | 后端入口。创建 FastAPI 应用，配置 CORS，在启动阶段扫描技能、初始化 Agent、重建记忆索引，并挂载所有 `/api` 路由。 |
| `backend/config.py` | 读写 `config.json`，目前只管理 `rag_mode` 开关。 |
| `backend/test_openweather.py` | 独立测试脚本，用于验证 `OPENWEATHER_API_KEY` 是否可用。不是服务启动必需模块。 |

### 4.2 `api` 包

| 模块 | 功能 |
| --- | --- |
| `backend/api/chat.py` | 实现 `POST /api/chat`。通过 SSE 向前端流式返回 token、工具调用开始/结束、RAG 检索结果、生成标题等事件；同时把用户消息和助手分段回复写入 session。 |
| `backend/api/compress.py` | 实现 `POST /api/sessions/{session_id}/compress`。把会话前 50% 历史交给 DeepSeek 生成摘要，再把原消息归档并把摘要写回会话。 |
| `backend/api/config_api.py` | 实现 `GET/PUT /api/config/rag-mode`，前端可通过它切换 RAG 模式。 |
| `backend/api/files.py` | 实现受限文件读写接口，只允许访问 `workspace/`、`memory/`、`skills/`、`knowledge/` 和 `SKILLS_SNAPSHOT.md`。保存 `memory/MEMORY.md` 时会自动重建记忆索引。 |
| `backend/api/sessions.py` | 实现会话列表、创建、重命名、删除、读取原始消息、读取展示历史、生成标题等接口。 |
| `backend/api/tokens.py` | 使用 `tiktoken` 统计系统提示词、会话消息、指定文件的 token 数量。 |
| `backend/api/__init__.py` | 空包标记文件，没有业务逻辑。 |

### 4.3 `graph` 包

| 模块 | 功能 |
| --- | --- |
| `backend/graph/agent.py` | Agent 核心。初始化 `ChatDeepSeek` 和工具集；根据当前 `rag_mode` 构造系统提示词；执行流式输出；把工具调用和模型 token 转成前端可消费的事件。 |
| `backend/graph/memory_indexer.py` | 对 `memory/MEMORY.md` 建立向量索引并持久化到 `storage/memory_index/`。使用 MD5 检测文件变化，变化后自动重建；RAG 模式下可按查询召回记忆片段。 |
| `backend/graph/prompt_builder.py` | 把 `SKILLS_SNAPSHOT.md`、`workspace/SOUL.md`、`workspace/IDENTITY.md`、`workspace/USER.md`、`workspace/AGENTS.md`、`memory/MEMORY.md` 拼成系统提示词；RAG 模式下会跳过整份 `MEMORY.md`，改为按需注入检索结果。 |
| `backend/graph/session_manager.py` | 使用 JSON 文件保存会话；支持消息追加、重命名、删除、列出、压缩归档、为模型合并连续 assistant 消息，以及注入 `compressed_context`。 |
| `backend/graph/__init__.py` | 空包标记文件，没有业务逻辑。 |

### 4.4 `tools` 包

| 模块 | 功能 |
| --- | --- |
| `backend/tools/__init__.py` | 工具工厂，统一返回全部内置工具实例。 |
| `backend/tools/fetch_url_tool.py` | 抓取网页或 JSON，并把 HTML 转成 Markdown 文本，供 Agent 读取互联网内容。 |
| `backend/tools/python_repl_tool.py` | 封装 LangChain 的 `PythonREPLTool`，供 Agent 执行临时 Python 代码。 |
| `backend/tools/read_file_tool.py` | 在项目根目录沙箱内读取文件，避免路径越界。 |
| `backend/tools/search_knowledge_tool.py` | 对 `knowledge/` 目录中的资料建立/加载索引，并按查询返回相关内容。 |
| `backend/tools/skills_scanner.py` | 扫描 `skills/**/SKILL.md` 的 YAML frontmatter，生成 `SKILLS_SNAPSHOT.md`。 |
| `backend/tools/terminal_tool.py` | 在项目根目录执行终端命令，但内置黑名单，阻止明显危险命令。 |

## 5. 非 Python 但很关键的目录在做什么

这些目录不是 Python package，但对系统行为非常重要：

| 目录/文件 | 作用 |
| --- | --- |
| `backend/memory/MEMORY.md` | 长期记忆文件。非 RAG 模式下整份进入系统提示词；RAG 模式下被切块建索引并按需召回。 |
| `backend/knowledge/` | 本地知识库目录。放入文档后，`search_knowledge_base` 工具才有内容可检索。 |
| `backend/sessions/` | 每个会话对应一个 JSON 文件。 |
| `backend/skills/` | 技能目录。当前包含天气技能。启动时会被扫描。 |
| `backend/storage/` | 持久化向量索引。 |
| `backend/workspace/AGENTS.md` | Agent 工作规则。 |
| `backend/workspace/IDENTITY.md` | 角色身份设定。 |
| `backend/workspace/SOUL.md` | 风格、价值观、语气。 |
| `backend/workspace/USER.md` | 用户画像。 |
| `backend/SKILLS_SNAPSHOT.md` | 技能扫描产物，供提示词直接引用。 |

### 5.1 当前技能文件

| 技能 | 作用 |
| --- | --- |
| `backend/skills/get_weather/SKILL.md` | 教 Agent 使用 `fetch_url` 请求 `wttr.in` 获取天气。 |
| `backend/skills/get_weather_open/SKILL.md` | 教 Agent 使用 `python_repl` + OpenWeather API 获取天气，并提供 `wttr.in` 兜底方案。 |

## 6. 前端模块实现了什么功能

### 6.1 前端配置层

| 模块 | 功能 |
| --- | --- |
| `frontend/package.json` | 定义前端依赖和脚本，核心是 `next dev`、`next build`、`next start`。 |
| `frontend/next.config.mjs` | Next.js 配置，目前基本为空。 |
| `frontend/tailwind.config.ts` | Tailwind 扫描路径和自定义颜色配置。 |
| `frontend/postcss.config.mjs` | PostCSS 配置。 |
| `frontend/tsconfig.json` | TypeScript 配置，启用 `@/*` 路径别名。 |

### 6.2 `src/app`

| 模块 | 功能 |
| --- | --- |
| `frontend/src/app/layout.tsx` | 根布局，设置页面 metadata，并加载全局样式。 |
| `frontend/src/app/page.tsx` | 主页面。组织三栏布局：左侧会话栏、中间聊天区、右侧 Inspector，并支持拖拽调整宽度。 |
| `frontend/src/app/globals.css` | 全局视觉样式，包括玻璃态面板、Markdown 样式、动画、滚动条、Raw Message Viewer 样式。 |

### 6.3 `src/lib`

| 模块 | 功能 |
| --- | --- |
| `frontend/src/lib/api.ts` | 前端 API 客户端。封装了聊天流式 SSE、文件读写、会话管理、token 统计、压缩、RAG 模式切换等调用。 |
| `frontend/src/lib/store.tsx` | 全局状态中心。管理消息流、session 列表、当前会话、右侧编辑器状态、压缩状态、RAG 状态，并负责把 SSE 事件映射为前端消息 UI。 |

### 6.4 聊天相关组件

| 模块 | 功能 |
| --- | --- |
| `frontend/src/components/chat/ChatInput.tsx` | 输入框与发送按钮，处理 Enter/Shift+Enter、自动增高、发送时禁用。 |
| `frontend/src/components/chat/ChatMessage.tsx` | 渲染单条用户/助手消息；支持 Markdown、工具调用链展示、RAG 检索卡片、API key 错误提示。 |
| `frontend/src/components/chat/ChatPanel.tsx` | 聊天主区域；无消息时显示欢迎态和快捷提示，有消息时按顺序渲染消息流。 |
| `frontend/src/components/chat/RetrievalCard.tsx` | 显示 RAG 检索召回的记忆片段。 |
| `frontend/src/components/chat/ThoughtChain.tsx` | 显示工具调用过程，包括输入、输出、运行中/完成状态。 |

### 6.5 编辑器和布局组件

| 模块 | 功能 |
| --- | --- |
| `frontend/src/components/editor/InspectorPanel.tsx` | 右侧 Monaco 编辑器。可查看和编辑 memory/workspace/skills 文件；支持保存、脏状态提示、token 计数、展开/收起。 |
| `frontend/src/components/layout/Navbar.tsx` | 顶部导航栏，控制左侧 Sidebar 和右侧 Inspector 的开关。 |
| `frontend/src/components/layout/ResizeHandle.tsx` | 左右面板之间的拖拽调整宽度组件。 |
| `frontend/src/components/layout/Sidebar.tsx` | 左侧边栏；包括会话列表、重命名/删除、Raw Messages 查看、token 数量、RAG 开关、历史压缩入口。 |

## 7. 这个项目真正需要的运行环境

## 7.1 Python 版本

建议：

- `Python 3.11`

最低建议：

- `Python 3.10+`

原因：

- 代码中使用了 `str | None`、`dict[str, Any]` 这类 Python 3.10+ 语法。
- 仓库里也存在 `cpython-310`、`cpython-311`、`cpython-312` 的缓存文件，说明作者至少在这些版本上运行过。

## 7.2 Node.js 版本

建议：

- `Node.js 20 LTS`

最低建议：

- `Node.js 18+`

原因：

- 前端使用 `Next.js 14` + `React 18`。
- 项目没有显式声明 `engines`，但用 Node 18 或 20 启动最稳妥。

## 7.3 Python 后端依赖

来自 `backend/requirements.txt`，核心依赖如下：

- Web 服务：`fastapi`、`uvicorn[standard]`、`sse-starlette`
- 配置与数据：`python-dotenv`、`pydantic`
- Agent/LLM：`langchain`、`langchain-openai`、`langchain-deepseek`、`langchain-community`、`langchain-experimental`、`langgraph`
- 检索/RAG：`llama-index-core`、`llama-index-embeddings-openai`、`llama-index-retrievers-bm25`
- token 统计：`tiktoken`
- 工具侧依赖：`html2text`、`beautifulsoup4`、`requests`、`pyyaml`

## 7.4 前端依赖

来自 `frontend/package.json`：

- 基础框架：`next`、`react`、`react-dom`
- Markdown：`react-markdown`、`remark-gfm`
- 编辑器：`@monaco-editor/react`
- UI 图标/样式：`lucide-react`、`clsx`
- 开发依赖：`typescript`、`tailwindcss`、`postcss`、`autoprefixer`、`eslint`、`eslint-config-next`

## 7.5 环境变量

这里要特别注意一件事：

- `backend/.env.example` 里写了 `OPENAI_*` 和 `OPENWEATHER_API_KEY`
- 但聊天主链路真正使用的是 `DEEPSEEK_*`

也就是说，如果你只照着 `.env.example` 原样复制，不补 `DEEPSEEK_API_KEY`，聊天功能是起不来的。

### 7.5.1 建议使用的 `.env`

在 `mini-calw/source-code/backend/.env` 中建议至少配置：

```env
# DeepSeek 聊天模型
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# OpenAI 兼容 Embedding（用于 MEMORY RAG / knowledge 检索）
OPENAI_API_KEY=your_openai_or_compatible_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small

# 服务监听
HOST=0.0.0.0
PORT=8002

# 可选：天气技能
OPENWEATHER_API_KEY=your_openweather_api_key
```

### 7.5.2 哪些变量是必须的

| 变量 | 是否必需 | 用途 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 必需 | 聊天主模型 |
| `DEEPSEEK_BASE_URL` | 建议配置 | DeepSeek API 地址 |
| `DEEPSEEK_MODEL` | 可选 | 默认是 `deepseek-chat` |
| `OPENAI_API_KEY` | 强烈建议配置 | 记忆索引和知识库检索依赖 embedding |
| `OPENAI_BASE_URL` | 强烈建议配置 | embedding 接口地址 |
| `EMBEDDING_MODEL` | 可选 | 默认 `text-embedding-3-small` |
| `OPENWEATHER_API_KEY` | 可选 | OpenWeather 天气技能 |
| `HOST` / `PORT` | 可选 | 后端监听地址 |

### 7.5.3 一个容易忽略的点

`MODEL_NAME` 虽然出现在 `.env.example` 里，但从当前代码看，聊天主链路没有实际使用这个变量；真正读取的是 `DEEPSEEK_MODEL`。

## 8. 如何启动项目

这个项目没有 Docker、没有一键脚本，推荐手动分别启动后端和前端。

启动顺序建议：

1. 先启动后端
2. 再启动前端
3. 浏览器打开前端页面

### 8.1 Windows 启动方式

#### 8.1.1 启动后端

在 PowerShell 中执行：

```powershell
cd E:\openclaw_learning\mini-calw\source-code\backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

然后手动编辑 `.env`，补上前面提到的 `DEEPSEEK_*`、`OPENAI_*` 等变量。

接着启动服务：

```powershell
uvicorn app:app --reload --host 0.0.0.0 --port 8002
```

如果 PowerShell 阻止激活虚拟环境，可以先临时执行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

#### 8.1.2 启动前端

另开一个 PowerShell 窗口：

```powershell
cd E:\openclaw_learning\mini-calw\source-code\frontend
npm install
npm run dev
```

#### 8.1.3 打开页面

- 前端默认地址：`http://localhost:3000`
- 后端健康检查：`http://localhost:8002/`

### 8.2 macOS 启动方式

#### 8.2.1 启动后端

在终端中执行：

```bash
cd /path/to/openclaw_learning/mini-calw/source-code/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```

然后编辑 `.env`，补上 `DEEPSEEK_*`、`OPENAI_*` 等变量。

接着启动后端：

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8002
```

#### 8.2.2 启动前端

另开一个终端窗口：

```bash
cd /path/to/openclaw_learning/mini-calw/source-code/frontend
npm install
npm run dev
```

#### 8.2.3 打开页面

- 前端默认地址：`http://localhost:3000`
- 后端健康检查：`http://localhost:8002/`

## 9. 运行后的工作方式

项目启动后，大致流程如下：

1. 后端启动时扫描 `skills/`，生成 `SKILLS_SNAPSHOT.md`
2. 后端初始化 Agent 和工具集
3. 后端尝试为 `memory/MEMORY.md` 建立向量索引
4. 前端发送聊天请求到 `POST /api/chat`
5. 后端以 SSE 流的形式返回：
   - token
   - 工具调用开始/结束
   - RAG 检索结果
   - done
6. 前端把这些事件实时渲染成对话、工具链和检索卡片
7. 会话消息被落盘到 `backend/sessions/*.json`

## 10. 启动时最容易遇到的问题

### 10.1 前端能打开，但聊天失败

优先检查：

- `backend/.env` 是否配置了 `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL` 是否正确
- 后端是否真的跑在 `8002` 端口

### 10.2 RAG 没效果

检查：

- `memory/MEMORY.md` 是否有内容
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `EMBEDDING_MODEL` 是否可用
- 左侧 Raw Messages 面板里的 RAG 开关是否打开

### 10.3 知识库搜索没有结果

检查：

- `backend/knowledge/` 目录里是否真的放了资料文件
- embedding 配置是否可用

### 10.4 天气技能失败

当前有两条链路：

- `get_weather`：走 `wttr.in`
- `get_weather_open`：走 `OpenWeather API`

如果是 OpenWeather 版本失败，通常是：

- 没有配置 `OPENWEATHER_API_KEY`
- API key 无效
- 免费额度或网络有问题

## 11. 一句话总结

这个项目本质上是一个：

“带可视化聊天界面、会话存档、技能系统、记忆编辑器和可切换 RAG 的轻量 Agent 工作台。”

如果你只是想把它跑起来，最关键的不是代码本身，而是先把 `backend/.env` 里真正用到的 `DEEPSEEK_*` 和 `OPENAI_*` 配好。
