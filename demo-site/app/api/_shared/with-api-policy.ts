import type { NextResponse } from 'next/server';
import { requireApiAuth, requireApiScopes, type ApiScope } from './auth';

type PolicyConfig = {
  scopes?: ApiScope[];
};

type RouteHandler = (request: Request) => Promise<NextResponse>;

export function withApiPolicy(
  config: PolicyConfig,
  handler: RouteHandler
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    const denied =
      config.scopes && config.scopes.length > 0
        ? requireApiScopes(request, config.scopes)
        : requireApiAuth(request);
    if (denied) return denied;
    return handler(request);
  };
}
