import posthog from 'posthog-js';

let isInitialized = false;

/**
 * Checks if PostHog can and should be initialized in the current environment.
 */
export function isPostHogConfigured(): boolean {
  if (typeof window === 'undefined') return false;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  return Boolean(key && key.trim().length > 0);
}

/**
 * Defensive initializer for PostHog.
 * Gracefully no-ops if NEXT_PUBLIC_POSTHOG_KEY is not set.
 */
export function initPostHog(): void {
  if (typeof window === 'undefined') return;
  if (isInitialized) return;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey || !apiKey.trim()) {
    return;
  }

  try {
    const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
    posthog.init(apiKey.trim(), {
      api_host: apiHost,
      person_profiles: 'identified_only',
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      disable_session_recording: true,
      respect_dnt: true,
      persistence: 'localStorage+cookie',
      loaded: () => {
        isInitialized = true;
      },
    });
    isInitialized = true;
  } catch (err) {
    // Fail silently so analytics can never crash the application
    console.warn('[PostHog] Initialization error (non-fatal):', err);
  }
}

/**
 * Identify authenticated user using stable internal UID only.
 * Explicitly sends NO email, name, or other personal profile attributes.
 */
export function identifyUser(uid: string): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    if (isPostHogConfigured()) {
      posthog.identify(uid);
    }
  } catch {
    // Non-fatal no-op
  }
}

/**
 * Resets user identification on logout to return to anonymous state.
 */
export function resetUser(): void {
  if (typeof window === 'undefined') return;
  try {
    if (isPostHogConfigured()) {
      posthog.reset();
    }
  } catch {
    // Non-fatal no-op
  }
}

/**
 * Sanitizes an error message by stripping potential API keys, auth headers,
 * tokens, full URLs with secrets, or massive dumps.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  let message = typeof error === 'string' ? error : (error as any)?.message || String(error);

  // Redact potential API keys (AIza..., sk-..., Bearer ...)
  message = message.replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED_API_KEY]');
  message = message.replace(/sk-[0-9A-Za-z_-]{15,}/g, '[REDACTED_API_KEY]');
  message = message.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]');
  message = message.replace(/(?:key|token|secret|password|auth|apiKey)=([^\s&]+)/gi, '$1=[REDACTED]');
  
  // Clean full URLs to origin + pathname only (strip query strings / tokens)
  message = message.replace(/https?:\/\/[^\s]+/gi, (url: string) => {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}${u.pathname}`;
    } catch {
      return '[URL]';
    }
  });

  // Limit length to safe classification
  if (message.length > 200) {
    message = message.slice(0, 197) + '...';
  }

  return message.trim();
}

/**
 * Extracts clean domain/hostname from user input.
 * Strips protocols, query parameters, hash fragments, ports, and 'www.' prefixes.
 */
export function extractDomain(input: string): string {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();
  const withProtocol = !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
  try {
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    const withoutProto = trimmed.replace(/^https?:\/\//i, '');
    const hostOnly = withoutProto.split('/')[0]?.split('?')[0]?.split('#')[0] || '';
    return hostOnly.replace(/^www\./i, '').toLowerCase();
  }
}

/**
 * Captures a PostHog event safely.
 * Under no circumstances does this function throw or reject.
 */
export function captureEvent(eventName: string, properties?: Record<string, any>): void {
  if (typeof window === 'undefined') return;

  try {
    if (!isPostHogConfigured()) return;

    // Filter out any undefined or accidental sensitive keys
    const cleanProperties: Record<string, any> = {};
    if (properties && typeof properties === 'object') {
      for (const [k, v] of Object.entries(properties)) {
        // Explicitly reject any sensitive keys
        const lowerKey = k.toLowerCase();
        if (
          lowerKey.includes('key') ||
          lowerKey.includes('token') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('password') ||
          lowerKey.includes('auth') ||
          lowerKey.includes('cookie') ||
          lowerKey.includes('email')
        ) {
          continue;
        }
        if (v !== undefined) {
          cleanProperties[k] = v;
        }
      }
    }

    posthog.capture(eventName, cleanProperties);
  } catch (err) {
    // Non-fatal: analytics failure must NEVER break user flow
    console.debug('[PostHog] Event capture bypassed:', eventName);
  }
}
