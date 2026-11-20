/**
 * Minimal GitHub REST client over the built-in fetch (ADR-0006: no Octokit).
 *
 * Security properties:
 *  - the token is only ever sent to the configured API base URL;
 *  - response sizes are capped; requests time out;
 *  - errors never include the token, and untrusted strings are sanitized.
 */

import { sanitizeInline, sanitizeText } from '@contribspec/core';

export const GITHUB_API_VERSION = '2022-11-28';
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export class ForgeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = 'ForgeApiError';
  }
}

export interface GitHubClientOptions {
  token: string;
  apiBaseUrl?: string;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type Json = Record<string, unknown>;

function asString(value: unknown, max = 500): string {
  return typeof value === 'string' ? sanitizeText(value, max) : '';
}

export class GitHubClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GitHubClientOptions) {
    // Normalize and pin the base URL; the token is never sent anywhere else.
    const base = (options.apiBaseUrl ?? 'https://api.github.com').replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/.test(base)) {
      throw new ForgeApiError(
        `Invalid API base URL: ${sanitizeInline(base, 100)}`,
        0,
        'apiBaseUrl',
      );
    }
    this.baseUrl = base;
    this.headers = {
      accept: 'application/vnd.github+json',
      'x-github-api-version': GITHUB_API_VERSION,
      'user-agent': options.userAgent ?? 'contribspec',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /** GET a JSON endpoint. Throws ForgeApiError on non-2xx. */
  async getJson(path: string): Promise<Json> {
    return this.request('GET', path);
  }

  /** POST a JSON body. Returns null when the server answers 2xx without content. */
  async postJson(path: string, body: Json): Promise<Json | null> {
    return this.request('POST', path, body);
  }

  /** POST that reports permission problems instead of throwing (checks:write fallback). */
  async postJsonOptional(path: string, body: Json): Promise<{ ok: boolean; status: number }> {
    try {
      await this.request('POST', path, body);
      return { ok: true, status: 201 };
    } catch (err) {
      if (err instanceof ForgeApiError && (err.status === 403 || err.status === 404)) {
        return { ok: false, status: err.status };
      }
      throw err;
    }
  }

  private async request(method: 'GET' | 'POST', path: string, body?: Json): Promise<Json> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: this.headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      });
    } catch (err) {
      throw new ForgeApiError(
        `GitHub API request failed (${method} ${sanitizeInline(path, 200)}): ${sanitizeInline((err as Error).message, 200)}`,
        0,
        path,
      );
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new ForgeApiError(
        `GitHub API response too large (${text.length} bytes) for ${sanitizeInline(path, 200)}.`,
        response.status,
        path,
      );
    }

    if (!response.ok) {
      // Never echo bodies verbatim: they may contain untrusted content.
      throw new ForgeApiError(
        `GitHub API error ${response.status} for ${sanitizeInline(path, 200)}: ${sanitizeInline(text, 300)}`,
        response.status,
        path,
      );
    }

    if (text.trim() === '') {
      return {};
    }
    try {
      return JSON.parse(text) as Json;
    } catch {
      throw new ForgeApiError(
        `GitHub API returned invalid JSON for ${sanitizeInline(path, 200)}.`,
        response.status,
        path,
      );
    }
  }
}

/** Extracts a bounded string field from a loosely typed API payload. */
export function field(payload: Json, key: string, max = 500): string {
  return asString(payload[key], max);
}

/** Extracts a bounded numeric field (undefined when absent or not finite). */
export function numberField(payload: Json, key: string): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
