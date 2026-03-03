import { NextResponse } from 'next/server';
import { errorResponse } from '../_shared/api-error';
import { buildPhotoCatalogResponse } from '../_shared/services/photo-catalog-service';
import { withApiPolicy } from '../_shared/with-api-policy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const GET = withApiPolicy({ scopes: ['photos:read', 'proofs:read'] }, async (request: Request) => {
  try {
    const responseBody = await buildPhotoCatalogResponse({
      requestUrl: new URL(request.url),
    });
    return NextResponse.json(responseBody);
  } catch (error: unknown) {
    return errorResponse({
      status: 500,
      code: 'PHOTO_LIST_FAILED',
      message: 'Failed to build photo list response',
      cause: error,
    });
  }
});
