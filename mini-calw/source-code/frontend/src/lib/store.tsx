"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  streamChat,
  listSessions as apiListSessions,
  createSession as apiCreateSession,
  renameSession as apiRenameSession,
  deleteSession as apiDeleteSession,
  getRawMessages as apiGetRawMessages,
  getSessionHistory as apiGetSessionHistory,
  compressSession as apiCompressSession,
  getRagMode as apiGetRagMode,
  setRagMode as apiSetRagMode,
} from "./api";

// ── Types ──────────────────────────────────────────────────

export interface ToolCall {
  tool: string;
  input?: string;
  output?: string;
  status: "running" | "done";
}

export interface RetrievalResult {
  text: string;
  score: string;
  source: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  retrievals?: RetrievalResult[];
  timestamp: number;
}

export interface SessionMeta {
  id: string;
  title: string;
  updated_at: number;
}

export interface RawMessage {
  role: string;
  content: string;
}

interface AppState {
  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  sendMessage: (text: string) => Promise<void>;

  // Sessions
  sessionId: string;
  setSessionId: (id: string) => void;
  sessions: SessionMeta[];
  loadSessions: () => void;
  createSession: () => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;

  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Inspector (Monaco editor)
  inspectorFile: string | null;
  setInspectorFile: (path: string | null) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
  toggleInspector: () => void;

  // Right panel tab
  rightTab: "memory" | "skills";
  setRightTab: (tab: "memory" | "skills") => void;

  // Raw messages
  rawMessages: RawMessage[] | null;
  loadRawMessages: () => void;

  // Expanded file (editor full-panel mode)
  expandedFile: boolean;
  setExpandedFile: (v: boolean) => void;

  // Panel widths
  sidebarWidth: number;
  setSidebarWidth: (w: number | ((prev: number) => number)) => void;
  inspectorWidth: number;
  setInspectorWidth: (w: number | ((prev: number) => number)) => void;

  // Compression
  isCompressing: boolean;
  compressCurrentSession: () => Promise<void>;

  // RAG mode
  ragMode: boolean;
  toggleRagMode: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionIdRaw] = useState("default");
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorFile, setInspectorFileRaw] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"memory" | "skills">("memory");
  const [rawMessages, setRawMessages] = useState<RawMessage[] | null>(null);
  const [expandedFile, setExpandedFile] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [inspectorWidth, setInspectorWidth] = useState(360);
  const [isCompressing, setIsCompressing] = useState(false);
  const [ragMode, setRagMode] = useState(false);
  const abortRef = useRef(false);

  // Load RAG mode on mount
  useEffect(() => {
    apiGetRagMode()
      .then((data) => setRagMode(data.rag_mode))
      .catch(() => {});
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const toggleInspector = useCallback(() => setInspectorOpen((v) => !v), []);

  // When a file is selected, auto-open the inspector
  const setInspectorFile = useCallback((path: string | null) => {
    setInspectorFileRaw(path);
    if (path) setInspectorOpen(true);
  }, []);

  // ── Session management ─────────────────────────────

  const loadSessions = useCallback(() => {
    apiListSessions()
      .then((list) => setSessions(list))
      .catch(() => {});
  }, []);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const setSessionId = useCallback(
    (id: string) => {
      setSessionIdRaw(id);
      setMessages([]);
      setRawMessages(null);

      // Load existing conversation history from backend
      apiGetSessionHistory(id)
        .then((data) => {
          if (data.messages && data.messages.length > 0) {
            const loaded: ChatMessage[] = [];
            let msgIndex = 0;
            for (const msg of data.messages) {
              if (msg.role === "user") {
                loaded.push({
                  id: `hist-user-${msgIndex++}`,
                  role: "user",
                  content: msg.content,
                  timestamp: Date.now() - (data.messages.length - msgIndex) * 1000,
                });
              } else if (msg.role === "assistant") {
                const toolCalls: ToolCall[] = (msg.tool_calls || []).map(
                  (tc: { tool: string; input?: string; output?: string }) => ({
                    tool: tc.tool,
                    input: tc.input || "",
                    output: tc.output || "",
                    status: "done" as const,
                  })
                );
                loaded.push({
                  id: `hist-asst-${msgIndex++}`,
                  role: "assistant",
                  content: msg.content,
                  toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                  timestamp: Date.now() - (data.messages.length - msgIndex) * 1000,
                });
              }
            }
            setMessages(loaded);
          }
        })
        .catch(() => {
          // Session might not exist yet, that's OK
        });
    },
    []
  );

  const createSession = useCallback(async () => {
    try {
      const meta = await apiCreateSession();
      setSessions((prev) => [{ id: meta.id, title: meta.title, updated_at: Date.now() / 1000 }, ...prev]);
      setSessionId(meta.id);
    } catch {
      // ignore
    }
  }, [setSessionId]);

  const renameSessionFn = useCallback(async (id: string, title: string) => {
    try {
      const normalizedTitle = title.trim();
      await apiRenameSession(id, normalizedTitle);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                title: normalizedTitle,
                updated_at: Date.now() / 1000,
              }
            : s
        )
      );
      loadSessions();
    } catch (error) {
      throw error;
    }
  }, [loadSessions]);

  const deleteSessionFn = useCallback(
    async (id: string) => {
      try {
        await apiDeleteSession(id);
        const remainingSessions = sessions.filter((s) => s.id !== id);
        setSessions(remainingSessions);
        if (sessionId === id) {
          const nextSessionId = remainingSessions[0]?.id;
          if (nextSessionId) {
            setSessionId(nextSessionId);
          } else {
            const meta = await apiCreateSession();
            setSessions([
              {
                id: meta.id,
                title: meta.title,
                updated_at: Date.now() / 1000,
              },
            ]);
            setSessionId(meta.id);
          }
        }
        loadSessions();
      } catch (error) {
        throw error;
      }
    },
    [loadSessions, sessionId, sessions, setSessionId]
  );

  const loadRawMessages = useCallback(() => {
    if (!sessionId) return;
    apiGetRawMessages(sessionId)
      .then((data) => setRawMessages(data.messages))
      .catch(() => setRawMessages(null));
  }, [sessionId]);

  // ── Compression ──────────────────────────────────────

  const compressCurrentSession = useCallback(async () => {
    if (isCompressing) return;
    setIsCompressing(true);
    try {
      await apiCompressSession(sessionId);
      // Refresh raw messages and chat history
      loadRawMessages();
      apiGetSessionHistory(sessionId)
        .then((data) => {
          if (data.messages && data.messages.length > 0) {
            const loaded: ChatMessage[] = [];
            let msgIndex = 0;
            for (const msg of data.messages) {
              if (msg.role === "user") {
                loaded.push({
                  id: `hist-user-${msgIndex++}`,
                  role: "user",
                  content: msg.content,
                  timestamp: Date.now() - (data.messages.length - msgIndex) * 1000,
                });
              } else if (msg.role === "assistant") {
                const toolCalls: ToolCall[] = (msg.tool_calls || []).map(
                  (tc: { tool: string; input?: string; output?: string }) => ({
                    tool: tc.tool,
                    input: tc.input || "",
                    output: tc.output || "",
                    status: "done" as const,
                  })
                );
                loaded.push({
                  id: `hist-asst-${msgIndex++}`,
                  role: "assistant",
                  content: msg.content,
                  toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                  timestamp: Date.now() - (data.messages.length - msgIndex) * 1000,
                });
              }
            }
            setMessages(loaded);
          } else {
            setMessages([]);
          }
        })
        .catch(() => {});
    } catch {
      // ignore
    } finally {
      setIsCompressing(false);
    }
  }, [isCompressing, sessionId, loadRawMessages]);

  // ── RAG mode ────────────────────────────────────────

  const toggleRagMode = useCallback(() => {
    const newMode = !ragMode;
    setRagMode(newMode);
    apiSetRagMode(newMode).catch(() => setRagMode(ragMode));
  }, [ragMode]);

  // ── Send message ───────────────────────────────────

  // Ref to track the current assistant message ID during streaming
  const currentAssistantIdRef = useRef("");

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming || isCompressing) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      const firstAssistantId = `assistant-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: firstAssistantId,
        role: "assistant",
        content: "",
        toolCalls: [],
        timestamp: Date.now(),
      };

      currentAssistantIdRef.current = firstAssistantId;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      abortRef.current = false;

      try {
        for await (const event of streamChat(text, sessionId)) {
          if (abortRef.current) break;

          // Handle retrieval event (RAG mode)
          if (event.event === "retrieval") {
            const targetId = currentAssistantIdRef.current;
            const retrievalData = event.data as {
              query: string;
              results: Array<{ text: string; score: string; source: string }>;
            };
            setMessages((prev) => {
              const updated = [...prev];
              const idx = updated.findIndex((m) => m.id === targetId);
              if (idx === -1) return prev;
              updated[idx] = {
                ...updated[idx],
                retrievals: retrievalData.results,
              };
              return updated;
            });
            continue;
          }

          // Handle title event (auto-generated after first message)
          if (event.event === "title") {
            const titleData = event.data as { session_id: string; title: string };
            setSessions((prev) =>
              prev.map((s) =>
                s.id === titleData.session_id
                  ? { ...s, title: titleData.title }
                  : s
              )
            );
            continue;
          }

          // Handle new_response — create a new assistant bubble
          if (event.event === "new_response") {
            const newId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            currentAssistantIdRef.current = newId;
            setMessages((prev) => [
              ...prev,
              {
                id: newId,
                role: "assistant",
                content: "",
                toolCalls: [],
                timestamp: Date.now(),
              },
            ]);
            continue;
          }

          const targetId = currentAssistantIdRef.current;

          setMessages((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex((m) => m.id === targetId);
            if (idx === -1) return prev;
            const msg = { ...updated[idx] };

            switch (event.event) {
              case "token":
                msg.content += (event.data.content as string) || "";
                break;

              case "tool_start":
                msg.toolCalls = [
                  ...(msg.toolCalls || []),
                  {
                    tool: event.data.tool as string,
                    input: event.data.input as string,
                    status: "running",
                  },
                ];
                break;

              case "tool_end": {
                const calls = [...(msg.toolCalls || [])];
                for (let i = calls.length - 1; i >= 0; i--) {
                  if (
                    calls[i].tool === event.data.tool &&
                    calls[i].status === "running"
                  ) {
                    calls[i] = {
                      ...calls[i],
                      output: event.data.output as string,
                      status: "done",
                    };
                    break;
                  }
                }
                msg.toolCalls = calls;
                break;
              }

              case "done":
                break;

              case "error":
                msg.content +=
                  `\n\n**Error:** ${event.data.error || "Unknown error"}`;
                break;
            }

            updated[idx] = msg;
            return updated;
          });
        }
      } catch (err) {
        const targetId = currentAssistantIdRef.current;
        setMessages((prev) => {
          const updated = [...prev];
          const idx = updated.findIndex((m) => m.id === targetId);
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              content:
                updated[idx].content +
                `\n\n**Connection error:** ${err instanceof Error ? err.message : "Unknown"}`,
            };
          }
          return updated;
        });
      } finally {
        setIsStreaming(false);
        // Refresh sessions list to pick up any updates
        loadSessions();
      }
    },
    [isStreaming, isCompressing, sessionId, loadSessions]
  );

  return (
    <AppContext.Provider
      value={{
        messages,
        isStreaming,
        sendMessage,
        sessionId,
        setSessionId,
        sessions,
        loadSessions,
        createSession,
        renameSession: renameSessionFn,
        deleteSession: deleteSessionFn,
        sidebarOpen,
        setSidebarOpen,
        toggleSidebar,
        inspectorFile,
        setInspectorFile,
        inspectorOpen,
        setInspectorOpen,
        toggleInspector,
        rightTab,
        setRightTab,
        rawMessages,
        loadRawMessages,
        expandedFile,
        setExpandedFile,
        sidebarWidth,
        setSidebarWidth,
        inspectorWidth,
        setInspectorWidth,
        isCompressing,
        compressCurrentSession,
        ragMode,
        toggleRagMode,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
