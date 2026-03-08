"""AgentManager — Core Agent using LangChain create_agent API with DeepSeek."""

import os
from pathlib import Path
from typing import Any, AsyncGenerator

from langchain_core.messages import HumanMessage, AIMessage

from config import get_rag_mode
from graph.prompt_builder import build_system_prompt
from graph.session_manager import session_manager
from tools import get_all_tools


class AgentManager:
    """Manages the Agent lifecycle: initialization, streaming, invocation."""

    def __init__(self) -> None:
        self._base_dir: Path | None = None
        self._tools: list = []
        self._llm = None

    def initialize(self, base_dir: Path) -> None:
        """Initialize LLM (DeepSeek) and tools. Called once at startup."""
        self._base_dir = base_dir
        self._tools = get_all_tools(base_dir)

        # Use langchain-deepseek for native DeepSeek support
        from langchain_deepseek import ChatDeepSeek

        self._llm = ChatDeepSeek(
            model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            api_key=os.getenv("DEEPSEEK_API_KEY"),
            api_base=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            temperature=0.7,
            streaming=True,
        )

        session_manager.initialize(base_dir)
        print(f"🤖 Agent initialized with {len(self._tools)} tools (DeepSeek: {os.getenv('DEEPSEEK_MODEL', 'deepseek-chat')})")

    def _build_agent(self):
        """Build a fresh agent with current system prompt (re-reads files each time)."""
        from langchain.agents import create_agent

        assert self._base_dir is not None
        assert self._llm is not None

        rag_mode = get_rag_mode()
        system_prompt = build_system_prompt(self._base_dir, rag_mode=rag_mode)

        agent = create_agent(
            model=self._llm,
            tools=self._tools,
            system_prompt=system_prompt,
        )
        return agent

    def _build_messages(self, user_message: str, history: list[dict[str, Any]]) -> list:
        """Convert session history + new message into LangChain messages."""
        messages = []
        for msg in history:
            role = msg.get("role", "")
            content = msg.get("content", "")
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
        messages.append(HumanMessage(content=user_message))
        return messages

    async def astream(
        self, message: str, history: list[dict[str, Any]]
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Stream agent response with token-level and node-level events.

        Yields events:
          {"type": "retrieval", "query": "...", "results": [...]}  (RAG mode only)
          {"type": "token", "content": "..."}
          {"type": "tool_start", "tool": "...", "input": "..."}
          {"type": "tool_end", "tool": "...", "output": "..."}
          {"type": "done", "content": "..."}
        """
        # RAG retrieval: inject memory context if enabled
        rag_mode = get_rag_mode()
        rag_context = ""
        if rag_mode and self._base_dir:
            from graph.memory_indexer import get_memory_indexer

            indexer = get_memory_indexer(self._base_dir)
            results = indexer.retrieve(message)
            if results:
                yield {
                    "type": "retrieval",
                    "query": message,
                    "results": results,
                }
                snippets = "\n\n".join(
                    f"[片段 {i+1}] (score: {r['score']})\n{r['text']}"
                    for i, r in enumerate(results)
                )
                rag_context = f"[记忆检索结果]\n{snippets}"

        agent = self._build_agent()

        # Build messages with optional RAG context appended to history
        augmented_history = list(history)
        if rag_context:
            augmented_history.append(
                {"role": "assistant", "content": rag_context}
            )
        messages = self._build_messages(message, augmented_history)

        full_response = ""
        tools_just_finished = False

        async for event in agent.astream(
            {"messages": messages},
            stream_mode=["messages", "updates"],
        ):
            # event is a tuple of (stream_mode, data) when using multiple modes
            if isinstance(event, tuple):
                mode, data = event
            else:
                mode = "messages"
                data = event

            if mode == "messages":
                # Token-level streaming from LLM
                msg, metadata = data
                if hasattr(msg, "content") and msg.content:
                    if msg.type == "AIMessageChunk" or msg.type == "ai":
                        if msg.content and not getattr(msg, "tool_calls", None):
                            # If tools just finished, signal a new response segment
                            if tools_just_finished:
                                yield {"type": "new_response"}
                                tools_just_finished = False
                            full_response += msg.content
                            yield {"type": "token", "content": msg.content}

            elif mode == "updates":
                if isinstance(data, dict):
                    for node_name, node_data in data.items():
                        if node_name == "tools" and "messages" in node_data:
                            for tool_msg in node_data["messages"]:
                                if hasattr(tool_msg, "name"):
                                    yield {
                                        "type": "tool_end",
                                        "tool": tool_msg.name,
                                        "output": str(tool_msg.content)[:2000],
                                    }
                            # After all tool results, mark that tools finished
                            tools_just_finished = True
                        elif node_name == "model" and "messages" in node_data:
                            for agent_msg in node_data["messages"]:
                                if hasattr(agent_msg, "tool_calls") and agent_msg.tool_calls:
                                    for tc in agent_msg.tool_calls:
                                        yield {
                                            "type": "tool_start",
                                            "tool": tc["name"],
                                            "input": str(tc.get("args", ""))[:1000],
                                        }

        yield {"type": "done", "content": full_response}

    async def ainvoke(self, message: str, session_id: str) -> str:
        """Non-streaming invocation (fallback)."""
        history = session_manager.load_session(session_id)
        agent = self._build_agent()
        messages = self._build_messages(message, history)
        result = await agent.ainvoke({"messages": messages})

        final_messages = result.get("messages", [])
        for msg in reversed(final_messages):
            if hasattr(msg, "content") and msg.type == "ai" and msg.content:
                response = msg.content
                session_manager.save_message(session_id, "user", message)
                session_manager.save_message(session_id, "assistant", response)
                return response
        return "No response generated."


agent_manager = AgentManager()
