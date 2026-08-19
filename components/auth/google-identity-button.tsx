"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type CredentialResponse = {
  credential?: string;
};

type GoogleIdentityApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce: string;
    ux_mode: "popup";
    use_fedcm_for_prompt: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type: "standard";
      theme: "outline";
      size: "large";
      text: "signin_with" | "signup_with";
      shape: "pill";
      logo_alignment: "left";
      width: number;
    },
  ) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleIdentityApi;
      };
    };
  }
}

async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes));
  const encoded = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const hashed = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

export function GoogleIdentityButton({
  mode,
  disabled = false,
  onCredential,
  onError,
}: {
  mode: "login" | "signup";
  disabled?: boolean;
  onCredential: (credential: string, nonce: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const credentialHandlerRef = useRef(onCredential);
  const errorHandlerRef = useRef(onError);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    credentialHandlerRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    errorHandlerRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!scriptReady || !containerRef.current) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      errorHandlerRef.current(
        "Google sign-in is not configured for this deployment yet.",
      );
      return;
    }
    const google = window.google?.accounts.id;
    if (!google) {
      errorHandlerRef.current("Google sign-in could not be loaded. Please try again.");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const nonce = await createNonce();
        if (cancelled || !containerRef.current) return;
        google.initialize({
          client_id: clientId,
          callback: (response) => {
            if (!response.credential) {
              errorHandlerRef.current(
                "Google did not return a sign-in credential. Please try again.",
              );
              return;
            }
            void credentialHandlerRef.current(response.credential, nonce.raw);
          },
          nonce: nonce.hashed,
          ux_mode: "popup",
          use_fedcm_for_prompt: true,
        });
        containerRef.current.replaceChildren();
        const width = Math.max(
          240,
          Math.min(Math.floor(containerRef.current.clientWidth || 400), 400),
        );
        google.renderButton(containerRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: mode === "login" ? "signin_with" : "signup_with",
          shape: "pill",
          logo_alignment: "left",
          width,
        });
      } catch {
        errorHandlerRef.current("Google sign-in could not be prepared. Please try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, scriptReady]);

  return (
    <>
      <Script
        id="google-identity-services"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() =>
          errorHandlerRef.current(
            "Google sign-in could not be loaded. Please try again.",
          )
        }
      />
      <div
        className={disabled ? "pointer-events-none opacity-50" : undefined}
        aria-disabled={disabled}
      >
        <div ref={containerRef} className="min-h-11 w-full" />
      </div>
    </>
  );
}
