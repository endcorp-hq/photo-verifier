import { timingSafeEqual } from 'crypto';
import type { NextResponse } from 'next/server';
import { errorResponse } from './api-error';

const ALL_SCOPES = ['photos:read', 'photos:delete', 'proofs:read'] as const;

export type ApiScope = (typeof ALL_SCOPES)[number];

type ApiClaims = {
  scopes: Set<ApiScope>;
};

type ApiAuthResult =
  | { ok: true; claims: ApiClaims }
  | { ok: false; response: NextResponse };

function isSameToken(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
}

function isApiScope(value: string): value is ApiScope {
  return (ALL_SCOPES as readonly string[]).includes(value);
}

function configuredScopes(): Set<ApiScope> {
  const raw = process.env.DEMO_SITE_API_TOKEN_SCOPES?.trim();
  if (!raw) {
    return new Set<ApiScope>(ALL_SCOPES);
  }

  const scopes = raw
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope): scope is ApiScope => isApiScope(scope));

  if (!scopes.length) {
    return new Set<ApiScope>(ALL_SCOPES);
  }
  return new Set<ApiScope>(scopes);
}

function authenticateApiRequest(request: Request): ApiAuthResult {
  const claims: ApiClaims = { scopes: configuredScopes() };
  const configuredToken = process.env.DEMO_SITE_API_TOKEN?.trim();

  if (!configuredToken) {
    if (process.env.NODE_ENV !== 'production') {
      return { ok: true, claims };
    }
    return {
      ok: false,
      response: errorResponse({
        status: 500,
        code: 'AUTH_CONFIG_ERROR',
        message: 'Server misconfigured: DEMO_SITE_API_TOKEN is required in production.',
      }),
    };
  }

  const authorization = request.headers.get('authorization') ?? '';
  const providedToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  if (!providedToken || !isSameToken(providedToken, configuredToken)) {
    return {
      ok: false,
      response: errorResponse({
        status: 401,
        code: 'AUTH_UNAUTHORIZED',
        message: 'Unauthorized',
      }),
    };
  }

  return { ok: true, claims };
}

export function requireApiAuth(request: Request): NextResponse | null {
  const result = authenticateApiRequest(request);
  return result.ok ? null : result.response;
}

function requireApiScope(request: Request, scope: ApiScope): NextResponse | null {
  const result = authenticateApiRequest(request);
  if (!result.ok) return result.response;
  if (!result.claims.scopes.has(scope)) {
    return errorResponse({
      status: 403,
      code: 'AUTH_FORBIDDEN_SCOPE',
      message: `Forbidden: missing scope '${scope}'`,
    });
  }
  return null;
}

export function requireApiScopes(request: Request, scopes: ApiScope[]): NextResponse | null {
  for (const scope of scopes) {
    const failure = requireApiScope(request, scope);
    if (failure) return failure;
  }
  return null;
}

function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/` : '';
}

export function isAllowedPhotoKey(key: string): boolean {
  const normalizedKey = key.replace(/^\/+/, '');
  const safePrefix = normalizePrefix(process.env.S3_PREFIX || 'photos/');
  if (!normalizedKey.startsWith(safePrefix)) {
    return false;
  }
  if (normalizedKey.includes('..') || normalizedKey.includes('\\')) {
    return false;
  }
  return /\.(jpg|jpeg|png|webp)$/i.test(normalizedKey);
}
