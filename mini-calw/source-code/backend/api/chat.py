"""POST /api/chat — SSE streaming chat with Agent."""

import json
import os
import traceback
from typing import AsyncGenerator

from fastapi import APIRouter
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from graph.agent import agent_manager
from graph.session_manager import session_manager

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    stream: bool = True


async def _generate_title(session_id: str) -> str | None:
    """Generate a title for a session using DeepSeek. Returns title or None."""
    try:
        messages = session_manager.load_session(session_id)
        first_user = ""
        first_assistant = ""
        for msg in messages:
            if msg["role"] == "user" and not first_user:
                first_user = msg["content"][:200]
            elif msg["role"] == "assistant" and not first_assistant:
                first_assistant = msg["content"][:200]
            if first_user and first_assistant:
                break

        if not first_user:
            return None

        from langchain_deepseek import ChatDeepSeek
        from langchain_core.messages import HumanMessage as HM

        llm = ChatDeepSeek(
            model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            api_key=os.getenv("DEEPSEEK_API_KEY"),
            api_base=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            temperature=0.3,
        )

        prompt = (
            f"根据以下对话内容，生成一个不超过10个字的中文标题，只输出标题文本，不要加引号或标点。\n\n"
            f"用户: {first_user}\n"
            f"助手: {first_assistant}"
        )

        result = await llm.ainvoke([HM(content=prompt)])
        title = result.content.strip().strip('"\'""''')[:20]
        session_manager.update_title(session_id, title)
        return title
    except Exception:
        traceback.print_exc()
        return None


async def event_generator(message: str, session_id: str) -> AsyncGenerator[dict, None]:
    """Generate SSE events from agent stream.

    Tracks multiple response segments — each time the agent finishes
    tool calls and starts generating new text, a new_response event is
    emitted and a new segment begins. Each segment is saved as a
    separate assistant message in the session history.
    """
    try:
        # Use merged history for agent context (combines consecutive assistant msgs)
        history = session_manager.load_session_for_agent(session_id)
        is_first_message = len(history) == 0

        # Per-segment tracking
        segments: list[dict] = []  # finalized segments
        current_segment: dict = {"content": "", "tool_calls": []}

        async for event in agent_manager.astream(message, history):
            event_type = event.get("type", "unknown")

            if event_type == "retrieval":
                yield {
                    "event": "retrieval",
                    "data": json.dumps(
                        {"query": event["query"], "results": event["results"]},
                        ensure_ascii=False,
                    ),
                }

            elif event_type == "token":
                current_segment["content"] += event["content"]
                yield {
                    "event": "token",
                    "data": json.dumps({"content": event["content"]}, ensure_ascii=False),
                }

            elif event_type == "new_response":
                # Finalize current segment and start a new one
                segments.append(current_segment)
                current_segment = {"content": "", "tool_calls": []}
                yield {
                    "event": "new_response",
                    "data": json.dumps({}, ensure_ascii=False),
                }

            elif event_type == "tool_start":
                current_segment["tool_calls"].append({
                    "tool": event["tool"],
                    "input": event.get("input", ""),
                })
                yield {
                    "event": "tool_start",
                    "data": json.dumps(
                        {"tool": event["tool"], "input": event["input"]},
                        ensure_ascii=False,
                    ),
                }

            elif event_type == "tool_end":
                # Match with current segment's tool_calls to add output
                for tc in reversed(current_segment["tool_calls"]):
                    if tc["tool"] == event["tool"] and "output" not in tc:
                        tc["output"] = event["output"]
                        break
                yield {
                    "event": "tool_end",
                    "data": json.dumps(
                        {"tool": event["tool"], "output": event["output"]},
                        ensure_ascii=False,
                    ),
                }

            elif event_type == "done":
                # Finalize the last segment
                segments.append(current_segment)

                # Save user message once
                session_manager.save_message(session_id, "user", message)

                # Save each segment as a separate assistant message
                for seg in segments:
                    tc = seg["tool_calls"] if seg["tool_calls"] else None
                    session_manager.save_message(
                        session_id, "assistant", seg["content"], tool_calls=tc
                    )

                yield {
                    "event": "done",
                    "data": json.dumps(
                        {"content": event["content"], "session_id": session_id},
                        ensure_ascii=False,
                    ),
                }

                # Auto-generate title on first conversation
                if is_first_message:
                    title = await _generate_title(session_id)
                    if title:
                        yield {
                            "event": "title",
                            "data": json.dumps(
                                {"session_id": session_id, "title": title},
                                ensure_ascii=False,
                            ),
                        }

    except Exception as e:
        traceback.print_exc()
        yield {
            "event": "error",
            "data": json.dumps({"error": str(e)}, ensure_ascii=False),
        }


@router.post("/chat")
async def chat(request: ChatRequest):
    if request.stream:
        return EventSourceResponse(
            event_generator(request.message, request.session_id)
        )
    # Non-streaming fallback
    result = await agent_manager.ainvoke(request.message, request.session_id)
    return {"reply": result}
