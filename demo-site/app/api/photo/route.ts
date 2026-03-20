import { NextResponse } from 'next/server';
import { errorResponse } from '../_shared/api-error';
import { deletePhotoWithValidation } from '../_shared/services/photo-deletion-service';
import { withApiPolicy } from '../_shared/with-api-policy';

export const DELETE = withApiPolicy({ scopes: ['photos:delete'] }, async (request: Request) => {
  try {
    const body = await request.json().catch(() => null);
    const result = await deletePhotoWithValidation(body);
    if (!result.ok) {
      return errorResponse({
        status: result.error.status,
        code: result.error.code,
        message: result.error.message,
      });
    }
    return NextResponse.json(result.value);
  } catch (error: unknown) {
    return errorResponse({
      status: 500,
      code: 'PHOTO_DELETE_FAILED',
      message: 'Delete failed',
      cause: error,
    });
  }
});
