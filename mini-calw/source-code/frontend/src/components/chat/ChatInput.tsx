"use client";

import { useState, useRef, useCallback } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { useApp } from "@/lib/store";

export default function ChatInput() {
  const [text, setText] = useState("");
  const { sendMessage, isStreaming, isCompressing } = useApp();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const disabled = isStreaming || isCompressing;

  const handleSubmit = useCallback(() => {
    if (!text.trim() || disabled) return;
    sendMessage(text.trim());
    setText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [text, disabled, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; }
  };

  return (
    <div className="p-4 pb-5">
      <div className="glass-input rounded-2xl flex items-end gap-2 px-4 py-2.5 max-w-2xl mx-auto hover:shadow-md transition-shadow">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          rows={1}
          className="flex-1 resize-none bg-transparent text-[14px] outline-none placeholder:text-gray-400 max-h-40 py-1 leading-relaxed"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-[#002fa7] text-white disabled:opacity-25 hover:bg-[#001f7a] transition-all active:scale-95"
        >
          {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-center text-[10px] text-gray-400/70 mt-2">
        Powered by DeepSeek · mini OpenClaw v0.1
      </p>
    </div>
  );
}
