import { isAllowedPhotoKey } from '../auth';
import { deletePhotoObject, getStorageConfig } from '../storage-adapter';

type DeletePhotoInput = {
  key: string;
  deleteSidecar: boolean;
};

type DeletePhotoValidationFailure = {
  status: 400;
  code: 'PHOTO_MISSING_KEY' | 'PHOTO_INVALID_KEY';
  message: string;
};

type DeletePhotoServiceError = DeletePhotoValidationFailure;

type DeletePhotoServiceResult = {
  ok: true;
  bucket: string;
  key: string;
  sidecarDeleted: boolean;
};

export async function deletePhotoWithValidation(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env
): Promise<
  | {
      ok: true;
      value: DeletePhotoServiceResult;
    }
  | {
      ok: false;
      error: DeletePhotoServiceError;
    }
> {
  const parsed = parseDeletePhotoInput(body);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const { bucket } = getStorageConfig(env);
  const { sidecarDeleted } = await deletePhotoObject({
    key: parsed.value.key,
    deleteSidecar: parsed.value.deleteSidecar,
  });

  return {
    ok: true,
    value: {
      ok: true,
      bucket,
      key: parsed.value.key,
      sidecarDeleted,
    },
  };
}

function parseDeletePhotoInput(
  body: unknown
): { ok: true; value: DeletePhotoInput } | { ok: false; error: DeletePhotoValidationFailure } {
  const payload = isRecord(body) ? body : {};
  const key = String(payload.key ?? '').trim();
  const deleteSidecar = payload.deleteSidecar !== false;

  if (!key) {
    return {
      ok: false,
      error: {
        status: 400,
        code: 'PHOTO_MISSING_KEY',
        message: 'Missing key',
      },
    };
  }

  if (!isAllowedPhotoKey(key)) {
    return {
      ok: false,
      error: {
        status: 400,
        code: 'PHOTO_INVALID_KEY',
        message: 'Invalid or unauthorized key',
      },
    };
  }

  return {
    ok: true,
    value: {
      key,
      deleteSidecar,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
