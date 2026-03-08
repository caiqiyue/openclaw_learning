"use client";

import { PanelLeft, PanelRight } from "lucide-react";
import { useApp } from "@/lib/store";

export default function Navbar() {
  const { sidebarOpen, toggleSidebar, inspectorOpen, toggleInspector } =
    useApp();

  return (
    <nav className="glass-nav sticky top-0 z-50 h-11 flex items-center justify-between px-3">
      {/* Left - Sidebar toggle */}
      <div className="w-[120px]">
        <button
          onClick={toggleSidebar}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
            sidebarOpen
              ? "bg-[#002fa7] text-white shadow-sm"
              : "text-gray-400 hover:text-gray-600 hover:bg-black/[0.04]"
          }`}
        >
          <PanelLeft className="w-[16px] h-[16px]" />
        </button>
      </div>

      {/* Center - Brand */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#002fa7] to-[#4070ff] flex items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7L12 12L22 7L12 2Z"
              fill="white"
              fillOpacity="0.9"
            />
            <path
              d="M2 17L12 22L22 17"
              stroke="white"
              strokeOpacity="0.7"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M2 12L12 17L22 12"
              stroke="white"
              strokeOpacity="0.85"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="font-semibold text-[14px] tracking-tight text-gray-800">
          mini OpenClaw
        </span>
      </div>

      {/* Right - Inspector toggle */}
      <div className="w-[120px] flex justify-end">
        <button
          onClick={toggleInspector}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
            inspectorOpen
              ? "bg-[#ff6723] text-white shadow-sm"
              : "text-gray-400 hover:text-gray-600 hover:bg-black/[0.04]"
          }`}
        >
          <PanelRight className="w-[16px] h-[16px]" />
        </button>
      </div>
    </nav>
  );
}
