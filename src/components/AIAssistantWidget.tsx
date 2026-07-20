"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    NexusAI?: {
      init: (config: {
        system: string;
        pageContext?: { route?: string; title?: string; errorBanner?: string };
      }) => void;
      setPageContext: (ctx: { route?: string; title?: string; errorBanner?: string }) => void;
    };
  }
}

export function AIAssistantWidget() {
  useEffect(() => {
    const existing = document.getElementById("nexus-ai-widget-script");
    if (!existing) {
      const script = document.createElement("script");
      script.id = "nexus-ai-widget-script";
      script.src = "https://nexus-1pwrafrica.web.app/ai/widget.js";
      script.async = true;
      script.onload = () => {
        window.NexusAI?.init({ system: "fm" });
      };
      document.head.appendChild(script);
    } else if (window.NexusAI) {
      window.NexusAI.init({ system: "fm" });
    }
  }, []);

  return null;
}
