"use client";

import { useState } from "react";
import { LockKeyhole, UnlockKeyhole, Copy } from "lucide-react";
import { useApp } from "@crewmate/state";
import {
  decryptEnvironmentFile,
  encryptEnvironmentFile,
  generateEnvironmentPassword,
  SettingRow,
} from "@crewmate/lib";

/** Create, unlock, and re-encrypt the PIN-protected environment file synced through Notes. */
export default function EnvironmentVaultSetting() {
  const { state, dispatch, notify } = useApp();
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [environmentUnlocked, setEnvironmentUnlocked] = useState(false);
  const [environmentDraft, setEnvironmentDraft] = useState("");
  const [environmentPin, setEnvironmentPin] = useState("");
  const [environmentBusy, setEnvironmentBusy] = useState(false);

  async function unlockEnvironment() {
    if (!state.environmentVault) {
      setEnvironmentUnlocked(true);
      setEnvironmentDraft("");
      return;
    }
    setEnvironmentBusy(true);
    try {
      setEnvironmentDraft(
        await decryptEnvironmentFile(
          state.environmentVault,
          state.environmentPassword,
          environmentPin,
        ),
      );
      setEnvironmentUnlocked(true);
      notify("Environment file unlocked for this settings session", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not unlock environment file", "error");
    } finally {
      setEnvironmentBusy(false);
    }
  }

  async function saveEnvironment() {
    setEnvironmentBusy(true);
    try {
      const vault = await encryptEnvironmentFile(
        environmentDraft,
        state.environmentPassword,
        environmentPin,
      );
      dispatch({ type: "SET_ENVIRONMENT_VAULT", vault });
      setEnvironmentUnlocked(false);
      setEnvironmentDraft("");
      setEnvironmentPin("");
      notify("Encrypted environment file saved; Notes will sync it", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not encrypt environment file", "error");
    } finally {
      setEnvironmentBusy(false);
    }
  }

  return (
    <SettingRow
      label="Sensitive environment file"
      description="Encrypted with your password and 4 digit PIN; only ciphertext is backed up below the visible Notes content."
    >
      <button
        type="button"
        onClick={() => {
          setEnvironmentOpen((open) => !open);
          setEnvironmentUnlocked(false);
          setEnvironmentDraft("");
          setEnvironmentPin("");
        }}
        className="flex items-center gap-2 rounded-lg border border-border-2 px-3 py-2 text-sm text-text-2 hover:border-accent hover:text-text"
      >
        <LockKeyhole size={14} />
        {state.environmentVault ? "Unlock .env" : "Create encrypted .env"}
      </button>
      {environmentOpen && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-bg p-3">
          <div className="flex gap-2">
            <input
              readOnly
              className="settings-input flex-1 font-mono text-xs"
              aria-label="Generated environment encryption password"
              value={state.environmentPassword}
            />
            <button
              aria-label="Copy generated password"
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(state.environmentPassword)
                  .then(() => notify("Encryption password copied", "success"))
                  .catch(() => notify("Could not copy password", "error"));
              }}
              className="rounded-lg border border-border-2 px-2.5 text-text-2"
              title="Copy generated password"
            >
              <Copy size={13} />
            </button>
            <button
              type="button"
              disabled={Boolean(state.environmentVault)}
              title={state.environmentVault ? "Delete or re-encrypt the existing vault before changing its password" : "Generate a new password"}
              onClick={() =>
                dispatch({
                  type: "SET_ENVIRONMENT_PASSWORD",
                  password: generateEnvironmentPassword(),
                })
              }
              className="rounded-lg border border-border-2 px-2.5 text-xs text-text-2 disabled:opacity-40"
            >
              Regenerate
            </button>
          </div>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            className="settings-input"
            placeholder="4 digit PIN"
            value={environmentPin}
            onChange={(event) =>
              setEnvironmentPin(event.target.value.replace(/\D/g, "").slice(0, 4))
            }
          />
          {!environmentUnlocked ? (
            <button
              type="button"
              disabled={environmentBusy}
              onClick={unlockEnvironment}
              className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <UnlockKeyhole size={14} />
              {state.environmentVault ? "Unlock" : "Create file"}
            </button>
          ) : (
            <>
              <textarea
                className="min-h-48 w-full resize-y rounded-lg border border-border-2 bg-surface p-3 font-mono text-xs text-text outline-none focus:border-accent"
                spellCheck={false}
                aria-label="Sensitive environment file"
                placeholder={"SERVICE_API_KEY=\nPRIVATE_TOKEN="}
                value={environmentDraft}
                onChange={(event) => setEnvironmentDraft(event.target.value)}
              />
              <button
                type="button"
                disabled={environmentBusy}
                onClick={saveEnvironment}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Encrypt and save
              </button>
            </>
          )}
          <p className="text-xs leading-relaxed text-text-3">
            The generated password stays in this browser and combines with your PIN to unlock the file. Back it up separately if you need cross-device recovery. Server OAuth values still belong in apps/web/.env.local.
          </p>
        </div>
      )}
    </SettingRow>
  );
}
