import { NextResponse } from 'next/server';

type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    cause?: string;
  };
};

export type ApiDegraded = {
  code: string;
  message: string;
};

function errorEnvelope(params: {
  code: string;
  message: string;
  cause?: string;
}): ApiErrorEnvelope {
  return {
    error: {
      code: params.code,
      message: params.message,
      ...(params.cause ? { cause: params.cause } : {}),
    },
  };
}

export function errorResponse(params: {
  status: number;
  code: string;
  message: string;
  cause?: unknown;
}): NextResponse {
  const cause = params.cause
    ? String((params.cause as { message?: string })?.message ?? params.cause)
    : undefined;
  return NextResponse.json(
    errorEnvelope({
      code: params.code,
      message: params.message,
      cause,
    }),
    { status: params.status }
  );
}

export function degraded(params: { code: string; message: string }): ApiDegraded {
  return {
    code: params.code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
    message: params.message.trim(),
  };
}

export function warningToDegraded(warning: string | null): ApiDegraded | null {
  if (!warning) return null;
  const [rawCode, ...messageParts] = warning.split(':');
  const code = rawCode?.trim();
  const message = messageParts.join(':').trim() || warning.trim();
  if (!code) {
    return degraded({ code: 'UPSTREAM_DEGRADED', message });
  }
  return degraded({ code, message });
}
