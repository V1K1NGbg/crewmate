"use client";

import { useRef, useState, type RefObject } from "react";
import { Inbox, Loader2, Send, X } from "lucide-react";
import { signIn } from "next-auth/react";
import { neutralizeEmailHtml } from "./emailHtml";

/* ------------------------------------------------------------------ */
/* Email body renderer                                                 */
/* ------------------------------------------------------------------ */

const EMAIL_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html { margin: 0; padding: 0; background: #ffffff; }
  body {
    margin: 0; padding: 0; background: #ffffff; color: #1a1a1a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 15px; line-height: 1.6; overflow-x: hidden; word-break: break-word; overflow-wrap: break-word;
  }
  a { color: #6366f1 !important; }
  img { max-width: 100%; height: auto; display: block; }
  p { margin: 0 0 0.85em; } p:last-child { margin-bottom: 0; }
  blockquote { border-left: 3px solid #d0d7de; margin: 0.5em 0 0.85em; padding: 0.3em 0.8em; color: #57606a; }
  pre, code { font-family: ui-monospace, monospace; font-size: 0.9em; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f6f8fa; padding: 0.75em; border-radius: 4px; }
  table { border-collapse: collapse; max-width: 100%; } td, th { padding: 6px 10px; }
  hr { border-color: #d0d7de; }
`;

export function EmailBody({ body, snippet }: { body: string; snippet: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadRemoteContent, setLoadRemoteContent] = useState(false);
  const isHtml = /<[a-z][\s\S]*>/i.test(body);

  function handleLoad() {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const resize = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        iframe.style.height = "0px";
        const h = Math.max(
          doc.documentElement.scrollHeight,
          doc.body?.scrollHeight ?? 0,
          80,
        );
        iframe.style.height = `${h}px`;
      } catch {
        iframe.style.height = "400px";
      }
    };
    resize();
    setTimeout(resize, 300);
  }

  if (!isHtml) {
    return (
      <pre className="text-sm text-text whitespace-pre-wrap font-sans leading-relaxed">
        {body || snippet}
      </pre>
    );
  }

  const contentPolicy = loadRemoteContent
    ? "default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline' https: http:; font-src data: https: http:"
    : "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:";
  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${contentPolicy}"><base target="_blank"><style>${EMAIL_STYLES}</style></head><body>${neutralizeEmailHtml(body)}</body></html>`;

  return (
    <div>
    {!loadRemoteContent && (
      <button className="mb-2 rounded-lg border border-border-2 px-3 py-1.5 text-xs text-text-2 hover:border-accent hover:text-accent" onClick={() => setLoadRemoteContent(true)}>
        Load remote images
      </button>
    )}
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      className="w-full border-none block"
      style={{ minHeight: 80, display: "block" }}
      onLoad={handleLoad}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      title="Email body"
      scrolling="no"
    />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

export function FullPageLoader({ label }: { label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-bg">
      <Loader2 size={28} className="animate-spin text-accent" />
      <span className="text-sm text-text-2">{label}</span>
    </div>
  );
}

export function GoogleSignInPrompt({ reason }: { reason: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-10 bg-bg">
      <div className="flex flex-col items-center gap-6 p-8 bg-surface border border-border-2 rounded-2xl shadow-2xl w-96">
        <div className="w-14 h-14 bg-accent/10 border border-accent/20 rounded-2xl flex items-center justify-center">
          <Inbox size={24} className="text-accent" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-base font-semibold text-text">
            Sign in to Gmail
          </h2>
          <p className="text-sm text-text-3 text-center leading-relaxed">
            {reason}
          </p>
        </div>
        <button
          onClick={() => signIn("google", { callbackUrl: "/app" })}
          className="w-full flex items-center justify-center gap-3 py-3 bg-surface-2 border border-border-2 text-text text-sm font-semibold rounded-lg hover:border-accent hover:text-accent transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
            />
            <path
              fill="#34A853"
              d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
            />
          </svg>
          Sign in with Google
        </button>
        <p className="text-xs text-text-3 text-center">
          Grants access to Gmail, Google Calendar, Google Tasks &amp; Google Docs
        </p>
      </div>
    </div>
  );
}

/** Bottom-right compose/reply dialog. */
export function ComposeDialog({
  dialogRef,
  replyToName,
  to,
  setTo,
  subject,
  setSubject,
  body,
  setBody,
  sending,
  sendError,
  onSend,
  onClose,
}: {
  dialogRef: RefObject<HTMLDivElement | null>;
  replyToName?: string;
  to: string;
  setTo: (value: string) => void;
  subject: string;
  setSubject: (value: string) => void;
  body: string;
  setBody: (value: string) => void;
  sending: boolean;
  sendError: string;
  onSend: () => void;
  onClose: () => void;
}) {
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="absolute bottom-0 right-0 sm:right-4 w-full sm:w-[min(520px,calc(100%-2rem))] max-h-[90dvh] bg-surface border border-border-2 rounded-t-xl shadow-2xl z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={replyToName !== undefined ? "Reply to email" : "Compose email"}
      style={{
        maxHeight: "calc(100dvh - 60px)",
        animation: "slideUpLocal 0.2s ease-out both",
      }}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <span className="text-sm font-semibold text-text">
          {replyToName !== undefined ? `Reply to ${replyToName}` : "New Message"}
        </span>
        <button
          aria-label="Close compose"
          onClick={onClose}
          className="text-text-3 hover:text-text p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">
        <input
          className="w-full bg-bg border border-border-2 rounded-lg px-4 py-2.5 text-sm text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
          aria-label="To"
          placeholder="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <input
          className="w-full bg-bg border border-border-2 rounded-lg px-4 py-2.5 text-sm text-text outline-none focus:border-accent placeholder:text-text-3 transition-colors"
          aria-label="Subject"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <textarea
          className="flex-1 bg-bg border border-border-2 rounded-lg px-4 py-2.5 text-sm text-text outline-none focus:border-accent resize-none placeholder:text-text-3 transition-colors leading-relaxed"
          aria-label="Message"
          placeholder="Write your message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
        />
        {sendError && <p className="text-sm text-danger">{sendError}</p>}
        <button
          onClick={onSend}
          disabled={sending}
          style={{ padding: "2px 12px" }}
          className="flex items-center justify-center gap-2 w-full text-sm font-semibold text-white bg-accent rounded-lg hover:bg-accent-hover transition-all disabled:opacity-50"
        >
          {sending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
