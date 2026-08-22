import "server-only";

import { createSign } from "node:crypto";
import { dialogueSsml } from "@/lib/audio/dialogue-speech";

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface GoogleSpeechConfig {
  languageCode: string;
  voiceName: string;
  speakingRate: number;
}

export interface GoogleSpeechResult extends GoogleSpeechConfig {
  audio: Uint8Array;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64Url(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function serviceAccount(): GoogleServiceAccount {
  const raw =
    process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error("Google Text-to-Speech is not configured.");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("The Google Text-to-Speech service account JSON is invalid.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The Google Text-to-Speech service account JSON is invalid.");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.client_email !== "string" ||
    typeof record.private_key !== "string"
  ) {
    throw new Error("The Google Text-to-Speech service account is incomplete.");
  }
  return {
    client_email: record.client_email,
    private_key: record.private_key,
    token_uri:
      typeof record.token_uri === "string"
        ? record.token_uri
        : "https://oauth2.googleapis.com/token",
  };
}

export function googleSpeechConfig(): GoogleSpeechConfig {
  const rate = Number(process.env.GOOGLE_TTS_SPEAKING_RATE ?? "0.95");
  return {
    languageCode: "ja-JP",
    voiceName: process.env.GOOGLE_TTS_VOICE?.trim() || "ja-JP-Neural2-B",
    speakingRate:
      Number.isFinite(rate) && rate >= 0.5 && rate <= 2 ? rate : 0.95,
  };
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const account = serviceAccount();
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: account.token_uri,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer
    .sign(account.private_key, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const response = await fetch(account.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
    cache: "no-store",
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== "object") {
    throw new Error("Google Text-to-Speech authentication failed.");
  }
  const token = (result as Record<string, unknown>).access_token;
  const expiresIn = (result as Record<string, unknown>).expires_in;
  if (typeof token !== "string") {
    throw new Error("Google Text-to-Speech did not return an access token.");
  }
  cachedToken = {
    value: token,
    expiresAt:
      Date.now() +
      (typeof expiresIn === "number" ? expiresIn : 3600) * 1000,
  };
  return token;
}

export async function synthesizeGoogleSpeech(
  japaneseText: string,
): Promise<GoogleSpeechResult> {
  const config = googleSpeechConfig();
  const ssml = dialogueSsml(japaneseText);
  const response = await fetch(
    "https://texttospeech.googleapis.com/v1/text:synthesize",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: ssml ? { ssml } : { text: japaneseText },
        voice: {
          languageCode: config.languageCode,
          name: config.voiceName,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: config.speakingRate,
        },
      }),
      cache: "no-store",
    },
  );
  const result: unknown = await response.json().catch(() => null);
  const audioContent =
    result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>).audioContent
      : null;
  if (!response.ok || typeof audioContent !== "string") {
    const detail =
      result && typeof result === "object" && !Array.isArray(result)
        ? JSON.stringify(result).slice(0, 400)
        : "unknown response";
    throw new Error(`Google Text-to-Speech failed: ${detail}`);
  }
  return {
    ...config,
    audio: Uint8Array.from(Buffer.from(audioContent, "base64")),
  };
}
