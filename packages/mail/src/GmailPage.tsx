"use client";

import { useState, useEffect, useRef } from "react";
import {
  Search,
  RefreshCw,
  Trash2,
  Reply,
  Send,
  X,
  Loader2,
  Inbox,
  Pencil,
  Sparkles,
  Archive,
  ArchiveRestore,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronUp,
  Star,
  MailOpen,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useApp } from "@crewmate/state";
import { aiChat, parseJsonArray, useDialogFocus, useResizable } from "@crewmate/lib";
import { useGmail, type GmailMessage } from "./useGmail";
import { buildReferences } from "./mime";
import {
  buildThreadEmailContext,
  extractEmail,
  extractName,
  formatDate,
  getInitials,
  stripHtml,
} from "./mailFormat";
import { ACTION_STYLES } from "./actionStyles";
import { ComposeDialog, EmailBody, FullPageLoader, GoogleSignInPrompt } from "./MailViews";
import {
  orderSuggestedActions,
  sanitizeSuggestedActions,
  type AIAction,
} from "./suggestedActions";
import type { MailPrefill } from "@crewmate/types";
import { DEFAULT_GMAIL_SETTINGS, type GmailPluginSettings } from "./settings";
import {
  countReadySuggestions,
  selectSuggestionPrecomputeCandidates,
  suggestionWindowCount,
} from "./suggestionQueue";
import {
  quickReviewCommandForKey,
  waitsForReviewDestination,
} from "./quickReview";
import {
  buildEmailLanguageDetectionPrompt,
  buildEmailTranslationPrompt,
  emailTextForTranslation,
  languageName,
  normalizeMainLanguage,
  OnDeviceTranslationDownloadRequiredError,
  parseEmailLanguageDetection,
  translateEmailInBrowser,
  translationResult,
  type EmailTranslationResult,
} from "./translation";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type MessageTranslation =
  | { status: "loading"; progress?: number }
  | { status: "same"; sourceLanguage: string }
  | { status: "translated"; sourceLanguage: string; body: string }
  | { status: "error"; message: string; downloadRequired?: boolean };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */



const ARCHIVE_ACTION: AIAction = {
  type: "archive",
  label: "Archive email",
  description: "Moves this conversation out of the inbox.",
};

const UNARCHIVE_ACTION: AIAction = {
  type: "unarchive",
  label: "Unarchive email",
  description: "Returns this conversation to the Inbox.",
};

// llama.cpp commonly runs with a single inference slot. Keeping mail's
// background queue serial prevents precomputation from starving the email the
// user is actively reviewing.
const PRECOMPUTE_CONCURRENCY = 1;
const MAIL_AI_TIMEOUT_MS = 45_000;
const ARCHIVED_QUERY =
  "in:anywhere -in:inbox -in:sent -in:drafts -in:spam -in:trash";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("AI analysis timed out. Showing basic actions.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mailboxActionForMailbox(isArchivedMailbox: boolean): AIAction {
  return isArchivedMailbox ? UNARCHIVE_ACTION : ARCHIVE_ACTION;
}

function actionsForMailbox(
  actions: AIAction[],
  isArchivedMailbox: boolean,
): AIAction[] {
  return orderSuggestedActions(actions).concat(
    mailboxActionForMailbox(isArchivedMailbox),
  );
}

function clampSuggestionCount(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(10, Math.max(1, Math.round(value as number)));
}


/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function GmailPage() {
  const { state, dispatch, notify } = useApp();
  const { data: session, status: sessionStatus } = useSession();
  const gmail = useGmail();

  const gmailSettings =
    (state.pageSettings.features.mail as GmailPluginSettings | undefined) ??
    DEFAULT_GMAIL_SETTINGS;

  const hasCalendar = state.pages.some((p) => p.type === "calendar");
  const hasTasks = state.pages.some((p) => p.type === "tasks");
  const hasNotes = state.pages.some((p) => p.type === "notes");

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [translations, setTranslations] = useState<Record<string, MessageTranslation>>({});
  const [translationBusy, setTranslationBusy] = useState(false);
  const [showOriginalMessages, setShowOriginalMessages] = useState<Set<string>>(new Set());
  const translationCacheRef = useRef<Map<string, EmailTranslationResult>>(new Map());
  const translationControllerRef = useRef<AbortController | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [query, setQuery] = useState(gmailSettings.defaultQuery || "in:inbox");
  const [searchInput, setSearchInput] = useState(gmailSettings.defaultQuery || "in:inbox");
  // When the configured default search changes, follow it unless the user has
  // already navigated to a different search (adjusting state during render).
  const configuredDefaultQuery = gmailSettings.defaultQuery || "in:inbox";
  const [appliedDefaultQuery, setAppliedDefaultQuery] = useState(configuredDefaultQuery);
  if (configuredDefaultQuery !== appliedDefaultQuery) {
    setAppliedDefaultQuery(configuredDefaultQuery);
    if (query === appliedDefaultQuery) {
      setQuery(configuredDefaultQuery);
      setSearchInput(configuredDefaultQuery);
    }
  }

  const [composeOpen, setComposeOpen] = useState(false);
  const composeDialogRef = useDialogFocus(composeOpen);
  const [replyTo, setReplyTo] = useState<GmailMessage | null>(null);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [pendingReplyReviewThreadId, setPendingReplyReviewThreadId] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aiActions, setAiActions] = useState<AIAction[]>([ARCHIVE_ACTION]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [expandedAction, setExpandedAction] = useState<number | null>(null);
  const [reviewActionIndex, setReviewActionIndex] = useState(0);
  const [suggestionCacheVersion, setSuggestionCacheVersion] = useState(0);
  const aiCacheRef = useRef<Map<string, AIAction[]>>(new Map());
  const suggestionInFlightRef = useRef<Set<string>>(new Set());
  const suggestionFailedRef = useRef<Set<string>>(new Set());
  const activeThreadIdRef = useRef<string | null>(null);
  const threadRequestVersionRef = useRef(0);
  const analysisPromisesRef = useRef<Map<string, Promise<AIAction[]>>>(new Map());
  const analysisControllersRef = useRef<Map<string, AbortController>>(new Map());
  const analysisEpochRef = useRef(0);
  const activeLoadingThreadRef = useRef<string | null>(null);
  const archivedMailboxRef = useRef(false);

  const suggestionTarget = clampSuggestionCount(
    gmailSettings.suggestionPrecomputeCount,
    5,
  );
  const suggestionActionTarget = clampSuggestionCount(
    gmailSettings.suggestionActionCount,
    6,
  );
  const isArchivedMailbox = query === ARCHIVED_QUERY;
  archivedMailboxRef.current = isArchivedMailbox;
  const quickReviewEnabled = gmailSettings.quickReviewEnabled ?? false;
  const reviewKeys = {
    next: gmailSettings.reviewNextActionKey ?? "j",
    previous: gmailSettings.reviewPreviousActionKey ?? "k",
    apply: gmailSettings.reviewApplyKey ?? "e",
    skip: gmailSettings.reviewSkipKey ?? "x",
    applyOnly: gmailSettings.reviewApplyOnlyKey ?? "a",
  };

  const threadListResize = useResizable({
    side: "right",
    initial: state.panelWidths.gmailThreadList ?? 380,
    min: 260,
    max: 560,
    onResize: (w) =>
      dispatch({
        type: "SET_PANEL_WIDTH",
        key: "gmailThreadList",
        width: w,
      }),
  });
  const aiSidebarResize = useResizable({
    side: "left",
    initial: state.panelWidths.gmailAiSidebar ?? 300,
    min: 240,
    max: 500,
    onResize: (w) =>
      dispatch({
        type: "SET_PANEL_WIDTH",
        key: "gmailAiSidebar",
        width: w,
      }),
  });

  const activeThread =
    gmail.threads.find((t) => t.id === activeThreadId) ?? null;

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    dispatch({ type: "SET_FEATURE_DATA", featureId: "mail", data: gmail.threads });
  }, [gmail.threads, dispatch]);

  useEffect(() => {
    const q = query || "in:inbox";
    void gmail.fetchThreads(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const mailPrefill = state.pagePrefills.mail as MailPrefill | undefined;
  useEffect(() => {
    if (!mailPrefill) return;
    dispatch({ type: "CLEAR_PAGE_PREFILL", pageId: "mail" });
    if (mailPrefill.reviewCompletedThreadId) {
      void handleArchive(mailPrefill.reviewCompletedThreadId);
      return;
    }
    if (mailPrefill.query) {
      setSearchInput(mailPrefill.query);
      setQuery(mailPrefill.query);
      return;
    }
    setReplyTo(null);
    setComposeTo(mailPrefill.to ?? "");
    setComposeSubject(mailPrefill.subject ?? "");
    setComposeBody(mailPrefill.body ?? "");
    setComposeOpen(true);
    // handleArchive is render-local; the one-shot prefill is the trigger and
    // is cleared before archival starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailPrefill, dispatch]);

  useEffect(() => {
    const interval = state.pageSettings.general.autoRefreshInterval;
    if (!interval) return;
    const id = setInterval(() => {
      gmail.fetchThreads(query || "in:inbox").catch(() => {});
    }, interval * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pageSettings.general.autoRefreshInterval, query]);

  async function openThread(id: string) {
    translationControllerRef.current?.abort();
    setTranslations({});
    setTranslationBusy(false);
    for (const [threadId, controller] of analysisControllersRef.current) {
      if (threadId !== id) controller.abort();
    }
    const requestVersion = ++threadRequestVersionRef.current;
    activeThreadIdRef.current = id;
    setActiveThreadId(id);
    setAiError("");
    setExpandedAction(null);
    setReviewActionIndex(0);
    setMessages([]);
    setAiLoading(false);
    activeLoadingThreadRef.current = null;
    setThreadLoading(true);
    const cached = aiCacheRef.current.get(id);
    if (cached) setAiActions(actionsForMailbox(cached, isArchivedMailbox));
    else {
      setAiActions([
        mailboxActionForMailbox(isArchivedMailbox),
      ]);
    }
    try {
      const msgs = await gmail.fetchThread(id);
      if (
        !msgs ||
        requestVersion !== threadRequestVersionRef.current ||
        activeThreadIdRef.current !== id
      ) return;
      setMessages(msgs);
      setShowOriginalMessages(new Set());
      if (
        gmailSettings.autoTranslateForeignEmails &&
        msgs.length > 0
      ) {
        void translateMessages(msgs);
      }
      gmail.setThreads((prev) =>
        prev.map((x) => (x.id === id ? { ...x, unread: false } : x)),
      );
      if (!cached && state.aiServerAvailable && msgs.length > 0)
        void generateAIActions(id, msgs);
    } finally {
      if (requestVersion === threadRequestVersionRef.current) {
        setThreadLoading(false);
      }
    }
  }

  async function translateMessages(
    messagesToTranslate: GmailMessage[],
    options: { allowDownload?: boolean } = {},
  ) {
    translationControllerRef.current?.abort();
    const controller = new AbortController();
    translationControllerRef.current = controller;
    setTranslationBusy(true);
    const mainLanguage = normalizeMainLanguage(gmailSettings.mainLanguage);

    for (const message of messagesToTranslate) {
      if (controller.signal.aborted) break;
      const cacheKey = `${mainLanguage}:${message.id}`;
      const cached = translationCacheRef.current.get(cacheKey);
      if (cached) {
        setTranslations((current) => ({
          ...current,
          [message.id]: cached.sameLanguage
            ? { status: "same", sourceLanguage: cached.sourceLanguage }
            : { status: "translated", sourceLanguage: cached.sourceLanguage, body: cached.translation },
        }));
        continue;
      }

      setTranslations((current) => ({ ...current, [message.id]: { status: "loading" } }));
      try {
        const plainText = emailTextForTranslation(message.body, message.snippet);
        let nativeError: unknown;
        let result: EmailTranslationResult | null = null;
        try {
          result = await translateEmailInBrowser(
            plainText,
            mainLanguage,
            globalThis as Parameters<typeof translateEmailInBrowser>[2],
            {
              allowDownload: options.allowDownload,
              onDownloadProgress: (progress) => {
                if (controller.signal.aborted) return;
                setTranslations((current) => ({
                  ...current,
                  [message.id]: { status: "loading", progress },
                }));
              },
            },
          );
        } catch (error: unknown) {
          nativeError = error;
        }
        if (controller.signal.aborted) break;
        if (!result) {
          if (
            !gmailSettings.allowAITranslationFallback ||
            !state.aiServerAvailable
          ) {
            if (nativeError) throw nativeError;
            throw new Error(
              "On-device translation requires Chrome 138 or newer on desktop. No email text was sent elsewhere.",
            );
          }
          const detectionResponse = await aiChat(
            state.aiServerUrl,
            buildEmailLanguageDetectionPrompt(plainText, mainLanguage),
            state.assistantModel || undefined,
            undefined,
            controller.signal,
            { maxTokens: 32, temperature: 0 },
          );
          const detection = parseEmailLanguageDetection(detectionResponse);
          result = detection.sameLanguage
            ? {
                sameLanguage: true,
                sourceLanguage: mainLanguage,
                translation: "",
              }
            : translationResult(
                detection.sourceLanguage,
                await aiChat(
                  state.aiServerUrl,
                  buildEmailTranslationPrompt(
                    plainText,
                    mainLanguage,
                    detection.sourceLanguage,
                  ),
                  state.assistantModel || undefined,
                  undefined,
                  controller.signal,
                  { maxTokens: 2048, temperature: 0.1 },
                ),
              );
        }
        translationCacheRef.current.set(cacheKey, result);
        setTranslations((current) => ({
          ...current,
          [message.id]: result.sameLanguage
            ? { status: "same", sourceLanguage: result.sourceLanguage }
            : { status: "translated", sourceLanguage: result.sourceLanguage, body: result.translation },
        }));
      } catch (error: unknown) {
        if (controller.signal.aborted) break;
        setTranslations((current) => ({
          ...current,
          [message.id]: {
            status: "error",
            message: error instanceof Error ? error.message : "Translation failed",
            downloadRequired:
              error instanceof OnDeviceTranslationDownloadRequiredError,
          },
        }));
      }
    }
    if (translationControllerRef.current === controller) setTranslationBusy(false);
  }

  function toggleMessageTranslation(messageId: string) {
    setShowOriginalMessages((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  useEffect(() => {
    setTranslations({});
    setShowOriginalMessages(new Set());
    if (
      gmailSettings.autoTranslateForeignEmails &&
      messages.length > 0
    ) {
      void translateMessages(messages);
    }
    return () => translationControllerRef.current?.abort();
    // Translation is intentionally restarted only when its configuration changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gmailSettings.autoTranslateForeignEmails,
    gmailSettings.mainLanguage,
    gmailSettings.allowAITranslationFallback,
    state.aiServerAvailable,
  ]);

  async function analyzeMessages(
    msgs: GmailMessage[],
    signal?: AbortSignal,
  ): Promise<AIAction[]> {
      const latest = msgs[msgs.length - 1];
      const bodyText = latest.body.includes("<")
        ? stripHtml(latest.body, 2000)
        : latest.body.slice(0, 2000);
      const minimumTarget = Math.max(1, suggestionActionTarget - 2);
      const maximumTarget = Math.min(10, suggestionActionTarget + 2);
      const prompt = `Analyze the following email and suggest helpful actions. Return a JSON array of actions that would genuinely help the user manage this email.

Each action must have:
- "type": one of create_event, create_task, add_to_notes, reply_draft, star_email
- "label": short label (≤6 words)
- "description": 1-2 sentences explaining what this action will do and why it's useful
- Optional "payload": object with title, description, dateHint (YYYY-MM-DD), startHint (ISO 8601 datetime e.g. 2024-03-15T14:00:00), endHint (ISO 8601 datetime e.g. 2024-03-15T15:00:00), replyDraft fields as appropriate

Guidelines:
- Suggest create_event if the email mentions any meeting, appointment, call, or event with a date/time
- Suggest create_task if the email contains any task, assignment, deadline, or action item
- Suggest add_to_notes if the email has useful information to reference later
- Suggest reply_draft if a reply would be appropriate
- Suggest star_email sparingly - only for truly important emails worth keeping starred
- You may return multiple actions of the same type only when they represent genuinely distinct tasks, events, or replies. Do not repeat equivalent actions.
- Do not return an archive action; the app always adds it separately.
- Return roughly ${suggestionActionTarget} distinct useful actions whenever the message provides enough material (normally ${minimumTarget}-${maximumTarget}). Return fewer only when additional actions would be genuinely misleading.

For create_event actions, extract any dates/times mentioned. Use startHint/endHint for datetime, dateHint for date-only.

Return ONLY valid JSON, no markdown fences.

From: ${latest.from}
Subject: ${latest.subject}
Date: ${latest.date}
Body: ${bodyText}

Example: [{"type":"create_event","label":"Schedule meeting","description":"Creates a calendar event for the meeting mentioned on March 15th with the project team.","payload":{"title":"Team Meeting","description":"Discuss Q1 results","dateHint":"2024-03-15","startHint":"2024-03-15T14:00:00","endHint":"2024-03-15T15:00:00"}}]`;
      const response = await withTimeout(
        aiChat(
          state.aiServerUrl,
          prompt,
          state.assistantModel || undefined,
          undefined,
          signal,
        ),
        MAIL_AI_TIMEOUT_MS,
      );
      let parsed: AIAction[];
      try {
        parsed = parseJsonArray<AIAction>(response);
      } catch {
        // A weak/local model may understand the email but fail to serialize
        // its suggestions. Give it one short correction pass before showing
        // an error to the user.
        const corrected = await withTimeout(
          aiChat(
            state.aiServerUrl,
            `Convert the response below into a compact, valid JSON array. Preserve only actions with type, label, description, and optional payload. Return ONLY JSON with no markdown or explanation.\n\n${response}`,
            state.assistantModel || undefined,
            undefined,
            signal,
          ),
          MAIL_AI_TIMEOUT_MS,
        );
        parsed = parseJsonArray<AIAction>(corrected);
      }
      const usableActions = sanitizeSuggestedActions(parsed, {
        calendar: hasCalendar,
        tasks: hasTasks,
        notes: hasNotes,
      });
      // Do not issue a second expansion request: single-slot local servers
      // would queue it behind precomputation and make navigation appear stuck.
      // Fill a sparse response with safe local actions instead.
      if (usableActions.length < minimumTarget) {
        usableActions.push(...fallbackActions(msgs));
      }
      return orderSuggestedActions(usableActions).slice(0, maximumTarget);
  }

  function fallbackActions(msgs: GmailMessage[]): AIAction[] {
    const latest = msgs[msgs.length - 1];
    const actions: AIAction[] = [
      {
        type: "reply_draft",
        label: "Draft reply",
        description: "Starts a reply draft for this conversation.",
      },
      {
        type: "star_email",
        label: "Star email",
        description: "Marks this conversation as important.",
      },
    ];
    if (hasTasks) {
      actions.push({
        type: "create_task",
        label: "Create follow-up task",
        description: "Creates a task so this email is not forgotten.",
        payload: { title: latest?.subject || "Email follow-up" },
      });
    }
    if (hasNotes) {
      actions.push({
        type: "add_to_notes",
        label: "Save to notes",
        description: "Keeps the email content in your Mail notes category.",
        payload: { title: latest?.subject || "Email note" },
      });
    }
    return orderSuggestedActions(actions);
  }

  async function generateAIActions(
    threadId: string,
    msgs: GmailMessage[],
    background = false,
  ): Promise<AIAction[]> {
    const analysisEpoch = analysisEpochRef.current;
    if (!background && activeThreadIdRef.current === threadId) {
      setAiLoading(true);
      setAiError("");
      activeLoadingThreadRef.current = threadId;
    }
    let analysisPromise = analysisPromisesRef.current.get(threadId);
    const createdAnalysis = !analysisPromise;
    if (!analysisPromise) {
      const controller = new AbortController();
      analysisControllersRef.current.set(threadId, controller);
      analysisPromise = analyzeMessages(msgs, controller.signal);
      analysisPromisesRef.current.set(threadId, analysisPromise);
    }
    try {
      const actions = await analysisPromise;
      if (analysisEpochRef.current !== analysisEpoch) return actions;
      aiCacheRef.current.set(threadId, actions);
      setSuggestionCacheVersion((version) => version + 1);
      if (activeThreadIdRef.current === threadId) {
        setAiActions(actionsForMailbox(actions, archivedMailboxRef.current));
        setReviewActionIndex(0);
      }
      return actions;
    } catch (err: unknown) {
      if (
        !background &&
        analysisEpochRef.current === analysisEpoch &&
        activeThreadIdRef.current === threadId
      ) {
        setAiError(err instanceof Error ? err.message : "AI analysis failed");
        const fallback = fallbackActions(msgs);
        setAiActions(actionsForMailbox(fallback, archivedMailboxRef.current));
        aiCacheRef.current.set(threadId, fallback);
      }
      if (background) throw err;
      return fallbackActions(msgs);
    } finally {
      if (createdAnalysis && analysisPromisesRef.current.get(threadId) === analysisPromise) {
        analysisPromisesRef.current.delete(threadId);
        analysisControllersRef.current.delete(threadId);
      }
      if (
        !background &&
        analysisEpochRef.current === analysisEpoch &&
        activeThreadIdRef.current === threadId &&
        activeLoadingThreadRef.current === threadId
      ) {
        setAiLoading(false);
        activeLoadingThreadRef.current = null;
      }
    }
  }

  useEffect(() => {
    analysisEpochRef.current += 1;
    aiCacheRef.current.clear();
    suggestionInFlightRef.current.clear();
    suggestionFailedRef.current.clear();
    analysisPromisesRef.current.clear();
    for (const controller of analysisControllersRef.current.values()) {
      controller.abort();
    }
    analysisControllersRef.current.clear();
    setAiLoading(false);
    activeLoadingThreadRef.current = null;
    setAiError("");
    setSuggestionCacheVersion((version) => version + 1);
  }, [state.aiServerUrl, state.assistantModel, suggestionActionTarget]);

  useEffect(() => {
    if (!state.aiServerAvailable || gmail.threads.length === 0) return;
    const candidates = selectSuggestionPrecomputeCandidates(
      gmail.threads,
      new Set(aiCacheRef.current.keys()),
      new Set([
        ...suggestionInFlightRef.current,
        ...suggestionFailedRef.current,
      ]),
      suggestionTarget,
      PRECOMPUTE_CONCURRENCY - suggestionInFlightRef.current.size,
      activeThreadId,
    );
    for (const threadId of candidates) {
      suggestionInFlightRef.current.add(threadId);
      const scheduleRetry = () => {
        suggestionFailedRef.current.add(threadId);
        window.setTimeout(() => {
          suggestionFailedRef.current.delete(threadId);
          setSuggestionCacheVersion((version) => version + 1);
        }, 30_000);
      };
      void gmail.fetchThread(threadId, true).then(async (threadMessages) => {
        if (threadMessages?.length) {
          try {
            await generateAIActions(threadId, threadMessages, true);
          } catch {
            scheduleRetry();
          }
        } else {
          scheduleRetry();
        }
      }).finally(() => {
        suggestionInFlightRef.current.delete(threadId);
        setSuggestionCacheVersion((version) => version + 1);
      });
    }
    // This queue intentionally keys off cache-version updates; depending on
    // the render-local orchestration functions would restart it every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gmail.threads,
    state.aiServerAvailable,
    suggestionTarget,
    suggestionCacheVersion,
    activeThreadId,
  ]);

  const readySuggestionCount = countReadySuggestions(
    gmail.threads,
    new Set(aiCacheRef.current.keys()),
    suggestionTarget,
    activeThreadId,
  );
  const suggestionWindowTotal = suggestionWindowCount(
    gmail.threads,
    activeThreadId,
    suggestionTarget,
  );

  async function executeAction(action: AIAction, reviewMode = false) {
    const emailBody =
      messages.length > 0
        ? buildThreadEmailContext(messages)
        : (activeThread?.snippet ?? "");
    const reviewOrigin =
      reviewMode && activeThread ? { threadId: activeThread.id } : undefined;

    switch (action.type) {
      case "archive":
        if (activeThread) await handleArchive(activeThread.id);
        break;
      case "unarchive":
        if (activeThread) await handleUnarchive(activeThread.id);
        break;
      case "create_event":
        if (!hasCalendar) {
          notify("Calendar is disabled — enable it in Settings.", "error");
          break;
        }
        dispatch({
          type: "SET_PAGE_PREFILL",
          pageId: "calendar",
          prefill: {
            title:
              action.payload?.title ?? activeThread?.subject ?? "Email event",
            description: action.payload?.description,
            dateHint: action.payload?.dateHint,
            startHint: action.payload?.startHint,
            endHint: action.payload?.endHint,
            emailContext: emailBody || undefined,
            reviewOrigin,
          },
        });
        dispatch({ type: "SET_ACTIVE_PAGE", id: "calendar" });
        notify("Navigated to Calendar — event pre-filled", "info");
        break;
      case "create_task":
        if (!hasTasks) {
          notify("Tasks is disabled — enable it in Settings.", "error");
          break;
        }
        dispatch({
          type: "SET_PAGE_PREFILL",
          pageId: "tasks",
          prefill: {
            title:
              action.payload?.title ?? activeThread?.subject ?? "Email task",
            description:
              action.payload?.description ?? activeThread?.snippet ?? "",
            dueDate: action.payload?.dateHint,
            emailContext: emailBody || undefined,
            reviewOrigin,
          },
        });
        dispatch({ type: "SET_ACTIVE_PAGE", id: "tasks" });
        notify("Navigated to Tasks — task pre-filled", "info");
        break;
      case "add_to_notes": {
        if (!hasNotes) {
          notify("Notes is disabled — enable it in Settings.", "error");
          break;
        }
        dispatch({
          type: "SET_PAGE_PREFILL",
          pageId: "notes",
          prefill: {
            title:
              action.payload?.title ?? activeThread?.subject ?? "Email note",
            content: action.payload?.description ?? emailBody,
            category: "Mail notes",
            source: "mail",
            reviewOrigin,
          },
        });
        dispatch({ type: "SET_ACTIVE_PAGE", id: "notes" });
        notify("Navigated to Notes — note pre-filled", "info");
        break;
      }
      case "reply_draft":
        if (messages.length) {
          openReply(messages[messages.length - 1]);
          setPendingReplyReviewThreadId(reviewOrigin?.threadId ?? null);
          if (action.payload?.replyDraft)
            setComposeBody(action.payload.replyDraft);
        }
        break;
      case "star_email":
        if (activeThread)
          await gmail.toggleStar(activeThread.id, !activeThread.starred);
        break;
    }
  }

  async function handleArchive(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    const archived = await gmail.archiveThread(id);
    if (!archived) return false;
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeThreadId === id) {
      aiCacheRef.current.delete(id);
      setSuggestionCacheVersion((version) => version + 1);
      setAiActions([ARCHIVE_ACTION]);
      // Advance to the next thread in the list
      const remaining = gmail.threads.filter((t) => t.id !== id);
      const currentIdx = gmail.threads.findIndex((t) => t.id === id);
      const next = remaining[currentIdx] ?? remaining[currentIdx - 1] ?? null;
      if (next) openThread(next.id);
      else setActiveThreadId(null);
    }
    return true;
  }

  async function handleUnarchive(id: string) {
    const unarchived = await gmail.unarchiveThread(id);
    if (!unarchived) return false;
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeThreadId === id) {
      aiCacheRef.current.delete(id);
      setSuggestionCacheVersion((version) => version + 1);
      const remaining = gmail.threads.filter((thread) => thread.id !== id);
      const currentIndex = gmail.threads.findIndex((thread) => thread.id === id);
      const next =
        remaining[currentIndex] ?? remaining[currentIndex - 1] ?? null;
      if (next) void openThread(next.id);
      else setActiveThreadId(null);
    }
    return true;
  }

  async function handleTrash(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (e && !window.confirm("Move this thread to Gmail Trash?")) return false;
    const trashed = await gmail.trashThread(id);
    if (!trashed) return false;
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeThreadId === id) {
      aiCacheRef.current.delete(id);
      setSuggestionCacheVersion((version) => version + 1);
      setAiActions([ARCHIVE_ACTION]);
      const remaining = gmail.threads.filter((t) => t.id !== id);
      const currentIdx = gmail.threads.findIndex((t) => t.id === id);
      const next = remaining[currentIdx] ?? remaining[currentIdx - 1] ?? null;
      if (next) openThread(next.id);
      else setActiveThreadId(null);
    }
    return true;
  }

  async function bulkArchive() {
    await Promise.all(
      [...selected].map((id) =>
        isArchivedMailbox ? handleUnarchive(id) : handleArchive(id),
      ),
    );
    setSelected(new Set());
  }
  async function bulkTrash() {
    if (selected.size === 0 || !window.confirm(`Move ${selected.size} selected thread${selected.size === 1 ? "" : "s"} to Gmail Trash?`)) return;
    await Promise.all([...selected].map((id) => handleTrash(id)));
    setSelected(new Set());
  }

  function advanceWithoutArchive() {
    if (gmail.threads.length === 0) return;
    const currentIndex = gmail.threads.findIndex(
      (thread) => thread.id === activeThreadId,
    );
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + 1) % gmail.threads.length;
    void openThread(gmail.threads[nextIndex].id);
  }

  async function reviewSelectedAction(archiveAfterAction: boolean) {
    if (!activeThread) {
      advanceWithoutArchive();
      return;
    }
    const actions = actionsForMailbox(aiActions, isArchivedMailbox);
    const action = actions[Math.min(reviewActionIndex, actions.length - 1)];
    if (!action) return;
    const threadId = activeThread.id;
    await executeAction(action, archiveAfterAction);
    const waitsForDestination = waitsForReviewDestination(action.type);
    if (
      archiveAfterAction &&
      action.type !== "archive" &&
      action.type !== "unarchive" &&
      !waitsForDestination
    ) {
      await handleArchive(threadId);
    }
  }

  useEffect(() => {
    const actionCount = actionsForMailbox(aiActions, isArchivedMailbox).length;
    if (reviewActionIndex >= actionCount) setReviewActionIndex(0);
  }, [aiActions, isArchivedMailbox, reviewActionIndex]);

  useEffect(() => {
    const activePage = state.pages.find((page) => page.id === state.activePage);
    if (
      activePage?.type !== "mail" ||
      !quickReviewEnabled ||
      composeOpen ||
      state.aiOverlayOpen
    ) return;
    function handleReviewKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) return;

      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const actions = actionsForMailbox(aiActions, isArchivedMailbox);
      const command = quickReviewCommandForKey(event.key, gmailSettings);
      if (command === "previous-action" || command === "next-action") {
        event.preventDefault();
        const direction = command === "next-action" ? 1 : -1;
        setReviewActionIndex((index) =>
          (index + direction + actions.length) % actions.length,
        );
        return;
      }
      if (command === "skip") {
        event.preventDefault();
        advanceWithoutArchive();
        return;
      }
      if (command === "apply" || command === "apply-only") {
        event.preventDefault();
        void reviewSelectedAction(command === "apply");
      }
    }
    window.addEventListener("keydown", handleReviewKey);
    return () => window.removeEventListener("keydown", handleReviewKey);
    // The listener is recreated for the visible review state. The two local
    // orchestration functions are deliberately captured by that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeThreadId,
    aiActions,
    composeOpen,
    isArchivedMailbox,
    reviewActionIndex,
    state.activePage,
    state.aiOverlayOpen,
    state.pages,
    quickReviewEnabled,
    reviewKeys.next,
    reviewKeys.previous,
    reviewKeys.apply,
    reviewKeys.skip,
    reviewKeys.applyOnly,
  ]);

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected(
      selected.size === gmail.threads.length
        ? new Set()
        : new Set(gmail.threads.map((t) => t.id)),
    );
  }

  function openReply(msg: GmailMessage) {
    setReplyTo(msg);
    setComposeTo(msg.from);
    setComposeSubject(
      msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`,
    );
    setComposeBody("");
    setComposeOpen(true);
  }

  function openCompose() {
    setPendingReplyReviewThreadId(null);
    setReplyTo(null);
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setComposeOpen(true);
  }

  function closeCompose() {
    setComposeOpen(false);
    setPendingReplyReviewThreadId(null);
  }

  async function handleSend() {
    if (!composeTo || !composeSubject || !composeBody) {
      setSendError("To, subject, and body are required.");
      return;
    }
    setSending(true);
    setSendError("");
    const ok = await gmail.sendEmail({
      to: composeTo,
      subject: composeSubject,
      body: composeBody,
      threadId: replyTo?.threadId,
      inReplyTo: replyTo?.messageId || undefined,
      references: replyTo?.messageId
        ? buildReferences(
            messages.filter((m) => m.threadId === replyTo.threadId).map((m) => m.messageId),
            replyTo.messageId,
          ) || undefined
        : undefined,
    });
    setSending(false);
    if (!ok) {
      setSendError("Failed to send");
      return;
    }
    const reviewedThreadId = pendingReplyReviewThreadId;
    closeCompose();
    if (reviewedThreadId) await handleArchive(reviewedThreadId);
  }

  /* ── Render ───────────────────────────────────────────────────── */

  if (sessionStatus === "unauthenticated")
    return (
      <GoogleSignInPrompt reason="You need to sign in with Google to access your Gmail inbox." />
    );
  if (gmail.authError || session?.googleAuthStatus === "reauth-required")
    return (
      <GoogleSignInPrompt reason="Your Google session has expired. Sign in again to continue." />
    );
  if (gmail.loading && gmail.threads.length === 0)
    return <FullPageLoader label="Loading inbox…" />;

  return (
    <div className="flex flex-1 overflow-hidden bg-bg relative">
      {/* Thread list sidebar */}
      {sidebarVisible && (
        <aside
          className="flex-shrink-0 flex flex-col border-r border-border bg-bg overflow-hidden relative"
          style={{ width: threadListResize.width }}
        >
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <button
              aria-label="Hide sidebar"
              onClick={() => setSidebarVisible(false)}
              className="text-text-2 hover:text-text w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-2 transition-colors flex-shrink-0"
              title="Hide sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-surface border border-border-2 rounded-lg px-3 py-2 focus-within:border-accent transition-colors">
              <Search size={14} className="text-text-3 flex-shrink-0" />
              <input
                className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-text-3"
                placeholder="Search mail..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setQuery(searchInput);
                }}
              />
            </div>
            <button
              aria-label="Refresh"
              onClick={() => gmail.fetchThreads(query || "in:inbox")}
              className="w-8 h-8 flex items-center justify-center text-text-2 hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
              title="Refresh"
            >
              {gmail.loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
            <button
              aria-label="Compose"
              onClick={openCompose}
              className="w-8 h-8 flex items-center justify-center text-text-2 hover:text-accent hover:bg-surface-2 rounded-lg transition-colors"
              title="Compose"
            >
              <Pencil size={14} />
            </button>
          </div>

          {/* Keep every mailbox on one row and scroll only when necessary. */}
          <div className="mail-filter-scroll overflow-x-auto border-b border-border px-4 py-2.5">
            <div className="flex min-w-max gap-1">
              {[
                { query: "in:inbox", label: "Inbox", icon: Inbox },
                { query: "is:unread", label: "Unread", icon: MailOpen },
                { query: "is:starred", label: "Starred", icon: Star },
                { query: "in:sent", label: "Sent", icon: Send },
                {
                  query: ARCHIVED_QUERY,
                  label: "Archived",
                  icon: ArchiveRestore,
                },
              ].map(({ query: mailboxQuery, label, icon: Icon }) => {
                const isActive =
                  query === mailboxQuery ||
                  (!query && mailboxQuery === "in:inbox");
                return (
                  <button
                    key={mailboxQuery}
                    onClick={() => {
                      analysisEpochRef.current += 1;
                      for (const controller of analysisControllersRef.current.values()) {
                        controller.abort();
                      }
                      analysisControllersRef.current.clear();
                      analysisPromisesRef.current.clear();
                      setQuery(mailboxQuery);
                      setSearchInput("");
                      setSelected(new Set());
                      activeThreadIdRef.current = null;
                      setActiveThreadId(null);
                      setMessages([]);
                      setAiActions([
                        mailboxActionForMailbox(mailboxQuery === ARCHIVED_QUERY),
                      ]);
                      setAiError("");
                      setAiLoading(false);
                      activeLoadingThreadRef.current = null;
                      archivedMailboxRef.current = mailboxQuery === ARCHIVED_QUERY;
                    }}
                    className={`flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${
                      isActive
                        ? "border-accent/40 bg-accent/15 text-accent"
                        : "border-border-2 text-text-3 hover:text-text-2 hover:bg-surface-2/50"
                    }`}
                  >
                    <Icon size={13} className="flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface">
              <span className="text-sm text-text-2 flex-1">
                {selected.size} selected
              </span>
              <button
                onClick={bulkArchive}
                style={{ padding: "4px 12px" }}
                className="flex items-center gap-1.5 text-sm text-text-2 hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
              >
                {isArchivedMailbox ? (
                  <>
                    <ArchiveRestore size={14} /> Unarchive
                  </>
                ) : (
                  <>
                    <Archive size={14} /> Archive
                  </>
                )}
              </button>
              <button
                onClick={bulkTrash}
                style={{ padding: "4px 12px" }}
                className="flex items-center gap-1.5 text-sm text-text-2 hover:text-danger hover:bg-surface-2 rounded-lg transition-colors"
              >
                <Trash2 size={14} /> Trash
              </button>
              <button
                aria-label="Clear selection"
                onClick={() => setSelected(new Set())}
                className="text-text-3 hover:text-text-2 p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Select all */}
          {gmail.threads.length > 0 && (
            <div
              className="flex items-center gap-3 px-4 py-2.5 border-b border-border cursor-pointer hover:bg-surface transition-colors"
              onClick={toggleSelectAll}
            >
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  selected.size === gmail.threads.length &&
                  gmail.threads.length > 0
                    ? "bg-accent border-accent"
                    : selected.size > 0
                      ? "bg-accent/50 border-accent"
                      : "border-text-3"
                }`}
              >
                {(selected.size === gmail.threads.length ||
                  selected.size > 0) && (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    className="text-white"
                  >
                    {selected.size === gmail.threads.length ? (
                      <path
                        d="M2 5l2.5 2.5 5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : (
                      <path
                        d="M2 5h6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                )}
              </div>
              <span className="text-sm text-text-2">Select all</span>
            </div>
          )}

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto">
            {gmail.threads.length === 0 && !gmail.loading ? (
              <div className="flex flex-col items-center justify-center p-12 text-text-3 gap-3">
                <Inbox size={36} />
                <span className="text-sm">No messages</span>
              </div>
            ) : (
              <>
              {gmail.threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => openThread(t.id)}
                  className={`px-4 py-3 cursor-pointer border-b border-border/50 transition-colors group relative ${
                    activeThreadId === t.id
                      ? "bg-accent/10 border-l-2 border-l-accent"
                      : selected.has(t.id)
                        ? "bg-accent/5"
                        : "hover:bg-surface"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      onClick={(e) => toggleSelect(t.id, e)}
                      className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center cursor-pointer transition-all ${
                        selected.has(t.id)
                          ? "bg-accent border-accent"
                          : "border-border-2 opacity-60 group-hover:opacity-100"
                      }`}
                    >
                      {selected.has(t.id) && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          className="text-white"
                        >
                          <path
                            d="M2 5l2.5 2.5 5-5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5 pr-16">
                        <span
                          className={`text-sm truncate ${t.unread ? "font-semibold text-text" : "font-medium text-text-2"}`}
                        >
                          {extractName(t.from)}
                        </span>
                        <div className="flex items-center gap-1 flex-shrink-0 absolute right-2">
                          <button
                            aria-label="Archive"
                            onClick={(e) => handleArchive(t.id, e)}
                            className="p-1.5 text-text-3 hover:text-success hover:bg-success/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Archive"
                          >
                            <Archive size={16} />
                          </button>
                          <button
                            aria-label="Trash"
                            onClick={(e) => handleTrash(t.id, e)}
                            className="p-1.5 text-text-3 hover:text-danger hover:bg-danger/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Trash"
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              gmail.toggleStar(t.id, !t.starred);
                            }}
                            className={`p-1.5 rounded transition-colors ${
                              t.starred
                                ? "text-yellow-400 opacity-100"
                                : "text-text-3 hover:text-yellow-400 opacity-0 group-hover:opacity-100"
                            }`}
                            title={t.starred ? "Unstar" : "Star"}
                          >
                            <Star
                              size={14}
                              fill={t.starred ? "currentColor" : "none"}
                            />
                          </button>
                          <span className="text-xs text-text-3">
                            {formatDate(t.date)}
                          </span>
                        </div>
                      </div>
                      <div
                        className={`text-sm truncate mb-0.5 ${t.unread ? "font-medium text-text" : "text-text-2"}`}
                      >
                        {t.subject}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {t.unread && (
                          <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                        )}
                        <div className="text-xs text-text-3 truncate">
                          {t.snippet}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {gmail.nextPageToken && (
                <div className="p-3 text-center">
                  <button
                    className="rounded-lg border border-border-2 px-3 py-2 text-sm text-text-2 hover:border-accent hover:text-accent disabled:opacity-50"
                    disabled={gmail.loading}
                    onClick={() => void gmail.fetchThreads(query || "in:inbox", gmail.nextPageToken ?? undefined)}
                  >
                    {gmail.loading ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
              </>
            )}
          </div>
          <div
            className="resize-handle"
            style={{ right: 0 }}
            onPointerDown={threadListResize.onPointerDown}
            onPointerMove={threadListResize.onPointerMove}
            onPointerUp={threadListResize.onPointerUp}
            onPointerCancel={threadListResize.onPointerCancel}
            onLostPointerCapture={threadListResize.onLostPointerCapture}
          />
        </aside>
      )}
      {!sidebarVisible && (
        <div className="w-10 flex-shrink-0 flex flex-col items-center pt-3 border-r border-border bg-bg">
          <button
            aria-label="Show sidebar"
            onClick={() => setSidebarVisible(true)}
            className="text-text-2 hover:text-text w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-2 transition-colors"
            title="Show sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      )}

      {/* Reading pane */}
      <main className="flex-1 flex overflow-hidden min-w-0">
        {threadLoading ? (
          <FullPageLoader label="Loading conversation…" />
        ) : !activeThread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-text-3 gap-4">
            <div className="w-20 h-20 rounded-xl bg-surface border border-border flex items-center justify-center">
              <Inbox size={36} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-2">
                Select a conversation
              </p>
              <p className="text-xs text-text-3 mt-1">
                Choose an email from the sidebar
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden min-w-0">
            <div className="flex flex-col flex-1 overflow-hidden min-w-0">
              {/* Thread header */}
              <div className="flex items-center gap-4 px-6 py-3.5 border-b border-border bg-bg flex-shrink-0">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-text truncate">
                    {messages[0]?.subject ?? activeThread.subject}
                  </h2>
                  <p className="text-xs text-text-3 mt-0.5">
                    {messages.length} message
                    {messages.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() =>
                      gmail.toggleStar(activeThread.id, !activeThread.starred)
                    }
                    style={{ padding: "2px 12px" }}
                    className={`flex items-center gap-1.5 text-sm font-medium border rounded-lg transition-all ${
                      activeThread.starred
                        ? "border-yellow-400/50 text-yellow-400 bg-yellow-400/5"
                        : "border-border-2 text-text-2 hover:border-yellow-400/50 hover:text-yellow-400"
                    }`}
                  >
                    <Star
                      size={14}
                      fill={activeThread.starred ? "currentColor" : "none"}
                    />
                    {activeThread.starred ? "Starred" : "Star"}
                  </button>
                  <button
                    onClick={() =>
                      isArchivedMailbox
                        ? handleUnarchive(activeThread.id)
                        : handleArchive(activeThread.id)
                    }
                    style={{ padding: "2px 12px" }}
                    className="flex items-center gap-1.5 text-sm font-medium text-text-2 border border-border-2 rounded-lg hover:border-success hover:text-success transition-all"
                  >
                    {isArchivedMailbox ? (
                      <>
                        <ArchiveRestore size={14} /> Unarchive
                      </>
                    ) : (
                      <>
                        <Archive size={14} /> Archive
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => openReply(messages[messages.length - 1])}
                    style={{ padding: "2px 12px" }}
                    className="flex items-center gap-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-all"
                  >
                    <Reply size={14} /> Reply
                  </button>
                  <button
                    aria-label="Close"
                    onClick={() => {
                      translationControllerRef.current?.abort();
                      setTranslationBusy(false);
                      setActiveThreadId(null);
                      setMessages([]);
                      setAiActions([]);
                    }}
                    className="w-8 h-8 flex items-center justify-center text-text-3 hover:text-text hover:bg-surface-2 rounded-lg transition-colors"
                    title="Close"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-6 py-5 flex flex-col gap-5">
                  {messages.map((msg, idx) => {
                    const translation = translations[msg.id];
                    const showingOriginal = showOriginalMessages.has(msg.id);
                    const translatedBody =
                      translation?.status === "translated" && !showingOriginal
                        ? translation.body
                        : msg.body;
                    return (
                    <div
                      key={msg.id}
                      className="bg-surface border border-border-2 rounded-xl overflow-hidden"
                    >
                      <div className="flex items-start justify-between gap-4 px-5 py-3.5">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center flex-shrink-0 text-xs font-bold text-text-2">
                            {getInitials(extractName(msg.from))}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text">
                              {extractName(msg.from)}
                            </div>
                            <div className="text-xs text-text-2 mt-0.5">
                              {extractEmail(msg.from)}
                            </div>
                            <div className="text-xs text-text-3 mt-0.5">
                              To: {msg.to}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {translation?.status === "loading" && (
                            <span className="flex items-center gap-1 text-xs text-text-3">
                              <Loader2 size={11} className="animate-spin" />
                              {translation.progress !== undefined
                                ? `Downloading ${Math.round(translation.progress * 100)}%…`
                                : "Translating…"}
                            </span>
                          )}
                          {translation?.status === "translated" && (
                            <button
                              type="button"
                              onClick={() => toggleMessageTranslation(msg.id)}
                              className="rounded-lg border border-border-2 px-2 py-1 text-xs text-accent hover:bg-accent/10"
                            >
                              {showingOriginal
                                ? `Show ${languageName(normalizeMainLanguage(gmailSettings.mainLanguage))}`
                                : `Translated from ${translation.sourceLanguage} · Show original`}
                            </button>
                          )}
                          {translation?.status === "error" && (
                            <span
                              className="max-w-64 text-xs text-danger"
                              title={translation.message}
                            >
                              {translation.message}
                            </span>
                          )}
                          {!translationBusy &&
                            (!translation || translation.status === "error") && (
                              <button
                                type="button"
                                onClick={() =>
                                  void translateMessages([msg], { allowDownload: true })
                                }
                                className="rounded-lg border border-border-2 px-2 py-1 text-xs text-text-2 hover:border-accent hover:text-accent"
                                title={translation?.status === "error" ? translation.message : undefined}
                              >
                                {translation?.status === "error" && translation.downloadRequired
                                  ? "Download & translate"
                                  : translation?.status === "error"
                                    ? "Retry translation"
                                    : "Translate"}
                              </button>
                            )}
                          <span className="text-xs text-text-3">
                            {formatDate(msg.date)}
                          </span>
                          <button
                            aria-label="Reply"
                            onClick={() => openReply(msg)}
                            className="text-text-3 hover:text-accent p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                            title="Reply"
                          >
                            <Reply size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="h-px bg-border" />
                      <div className="px-6 py-5 overflow-hidden">
                        <EmailBody
                          key={`${msg.id}:${translation?.status === "translated" && !showingOriginal ? "translated" : "original"}`}
                          body={translatedBody}
                          snippet={msg.snippet}
                        />
                      </div>
                      {idx === messages.length - 1 && (
                        <div className="px-5 pb-4">
                          <button
                            onClick={() => openReply(msg)}
                            className="flex items-center gap-2 w-full px-4 py-2.5 border border-border-2 rounded-lg text-sm text-text-3 hover:border-accent hover:text-accent transition-all text-left"
                          >
                            <Reply size={14} /> Reply to {extractName(msg.from)}
                            ...
                          </button>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* AI actions sidebar */}
            <aside
              className="flex-shrink-0 flex flex-col border-l border-border/50 bg-bg/40 overflow-hidden relative"
              style={{ width: aiSidebarResize.width }}
            >
              <div
                className="resize-handle"
                style={{ left: 0 }}
                onPointerDown={aiSidebarResize.onPointerDown}
                onPointerMove={aiSidebarResize.onPointerMove}
                onPointerUp={aiSidebarResize.onPointerUp}
                onPointerCancel={aiSidebarResize.onPointerCancel}
                onLostPointerCapture={aiSidebarResize.onLostPointerCapture}
              />
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                <Sparkles size={13} className="text-accent" />
                <span className="text-xs font-semibold text-text-2 uppercase tracking-wide">
                  Suggestions
                </span>
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: "UPDATE_FEATURE_SETTINGS",
                      featureId: "mail",
                      settings: { quickReviewEnabled: !quickReviewEnabled },
                    })
                  }
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    quickReviewEnabled
                      ? "bg-accent/15 text-accent"
                      : "bg-surface-2 text-text-3"
                  }`}
                >
                  <kbd className="mr-1 font-mono uppercase">
                    {gmailSettings.quickReviewToggleKey || "r"}
                  </kbd>
                  Review {quickReviewEnabled ? "on" : "off"}
                </button>
                <span className="ml-auto text-[10px] text-text-3" title="Precomputed suggestions">
                  {readySuggestionCount}/{suggestionWindowTotal}
                </span>
                {aiLoading && (
                  <Loader2
                    size={11}
                    className="animate-spin text-text-3"
                  />
                )}
              </div>
              {state.assistantModel && (
                <div className="px-4 py-1.5 border-b border-border/50">
                  <span className="text-xs font-mono text-text-3">
                    model: {state.assistantModel.split("/").pop()}
                  </span>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                {aiError && !aiLoading && state.aiServerAvailable && (
                  <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
                    <p className="min-w-0 flex-1 text-xs text-danger leading-relaxed">
                      {aiError}
                    </p>
                    <button
                      onClick={() =>
                        messages.length &&
                        activeThreadId &&
                        generateAIActions(activeThreadId, messages)
                      }
                      className="flex-shrink-0 text-xs text-accent hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {!state.aiServerAvailable ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-8 px-3 text-center">
                    <Sparkles size={20} className="text-text-3" />
                    <p className="text-xs text-text-3 leading-relaxed">
                      AI server not connected.
                      <br />
                      Press{" "}
                      <kbd className="bg-surface-2 border border-border-2 rounded px-1 text-xs">
                        O
                      </kbd>{" "}
                      to configure.
                    </p>
                  </div>
                ) : aiLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-8 text-text-3">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-xs">Analysing…</span>
                  </div>
                ) : aiActions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-8 px-3 text-center">
                    <Sparkles size={20} className="text-text-3" />
                    <p className="text-xs text-text-3">No actions needed.</p>
                    <button
                      onClick={() =>
                        messages.length &&
                        activeThreadId &&
                        generateAIActions(activeThreadId, messages)
                      }
                      className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                    >
                      <Sparkles size={12} /> Re-analyse
                    </button>
                  </div>
                ) : (
                  actionsForMailbox(aiActions, isArchivedMailbox).map((action, i) => {
                    const style = ACTION_STYLES[action.type];
                    const isExpanded = expandedAction === i;
                    const hasDetails = action.description || action.payload;
                    return (
                      <div
                        key={i}
                        className="flex flex-col rounded-lg border transition-all overflow-hidden"
                        style={{
                          borderColor: style.border,
                          backgroundColor: style.bg,
                          boxShadow:
                            reviewActionIndex === i
                              ? `0 0 0 2px ${style.border}`
                              : undefined,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setReviewActionIndex(i);
                              if (quickReviewEnabled) {
                                void (async () => {
                                  const threadId = activeThread?.id;
                                  await executeAction(action, true);
                                  const waitsForDestination =
                                    waitsForReviewDestination(action.type);
                                  if (
                                    threadId &&
                                    action.type !== "archive" &&
                                    action.type !== "unarchive" &&
                                    !waitsForDestination
                                  ) {
                                    await handleArchive(threadId);
                                  }
                                })();
                              } else {
                                void executeAction(action);
                              }
                            }}
                            className="flex items-center gap-2 flex-1 px-3 py-2 text-left text-sm font-medium transition-all hover:opacity-90 min-w-0"
                            style={{
                              color: style.color,
                            }}
                          >
                            <span className="flex-shrink-0">{style.icon}</span>
                            <span className="truncate">{action.label}</span>
                          </button>
                          {hasDetails && (
                            <button
                              onClick={() =>
                                setExpandedAction(isExpanded ? null : i)
                              }
                              className="flex-shrink-0 p-1.5 mr-1.5 rounded hover:bg-white/5 transition-colors"
                              style={{
                                color: style.color,
                              }}
                              title={
                                isExpanded ? "Hide details" : "Show details"
                              }
                            >
                              {isExpanded ? (
                                <ChevronUp size={12} />
                              ) : (
                                <ChevronDown size={12} />
                              )}
                            </button>
                          )}
                        </div>
                        {isExpanded && hasDetails && (
                          <div className="px-3 pb-2.5 pt-0 flex flex-col gap-1.5 border-t border-white/5">
                            {action.description && (
                              <p className="text-xs text-text-2 leading-relaxed mt-1.5">
                                {action.description}
                              </p>
                            )}
                            {action.payload?.title && (
                              <div className="text-xs text-text-3">
                                <span className="font-semibold">Title:</span>{" "}
                                {action.payload.title}
                              </div>
                            )}
                            {action.payload?.dateHint && (
                              <div className="text-xs text-text-3">
                                <span className="font-semibold">Date:</span>{" "}
                                {action.payload.dateHint}
                              </div>
                            )}
                            {action.payload?.description && (
                              <div className="text-xs text-text-3">
                                <span className="font-semibold">
                                  Description:
                                </span>{" "}
                                {action.payload.description}
                              </div>
                            )}
                            {action.payload?.replyDraft && (
                              <div className="text-xs text-text-3">
                                <span className="font-semibold">Draft:</span>{" "}
                                {action.payload.replyDraft.slice(0, 120)}
                                {action.payload.replyDraft.length > 120
                                  ? "…"
                                  : ""}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
                {aiActions.length > 0 && !aiLoading && (
                  <>
                    {quickReviewEnabled && (
                      <div className="rounded-lg border border-border/60 px-2.5 py-2 text-[10px] leading-relaxed text-text-3">
                        {reviewKeys.previous}/{reviewKeys.next} choose · {reviewKeys.apply} apply + archive · {reviewKeys.skip} skip · {reviewKeys.applyOnly} apply only
                      </div>
                    )}
                    <button
                      onClick={() =>
                        messages.length &&
                        activeThreadId &&
                        generateAIActions(activeThreadId, messages)
                      }
                      className="flex items-center gap-1.5 justify-center w-full mt-1 py-2 text-xs text-text-3 hover:text-text-2 border border-border-2 rounded-lg transition-colors"
                    >
                      <RefreshCw size={11} /> Re-analyse
                    </button>
                  </>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* Compose modal */}
      {composeOpen && (
        <ComposeDialog
          dialogRef={composeDialogRef}
          replyToName={replyTo ? extractName(replyTo.from) : undefined}
          to={composeTo}
          setTo={setComposeTo}
          subject={composeSubject}
          setSubject={setComposeSubject}
          body={composeBody}
          setBody={setComposeBody}
          sending={sending}
          sendError={sendError}
          onSend={handleSend}
          onClose={closeCompose}
        />
      )}
    </div>
  );
}
