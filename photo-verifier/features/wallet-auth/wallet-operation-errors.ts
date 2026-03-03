export type WalletOperation =
  | 'connect'
  | 'sign_in'
  | 'sign_message'
  | 'sign_and_send_transaction';

const RETRYABLE_AUTH_PATTERNS = [
  'authorization request failed',
  'authorization failed',
  'not authorized',
];

class WalletOperationError extends Error {
  readonly code: 'WALLET_AUTHORIZATION_FAILED' | 'WALLET_OPERATION_FAILED';
  readonly operation: WalletOperation;
  readonly retryAttempted: boolean;
  override readonly cause?: unknown;

  constructor(params: {
    operation: WalletOperation;
    cause: unknown;
    code: 'WALLET_AUTHORIZATION_FAILED' | 'WALLET_OPERATION_FAILED';
    retryAttempted: boolean;
  }) {
    const causeMessage = String((params.cause as { message?: string })?.message ?? params.cause ?? 'unknown error');
    const operationText = params.operation.replace(/_/g, ' ');
    const prefix =
      params.code === 'WALLET_AUTHORIZATION_FAILED'
        ? 'Wallet authorization failed'
        : 'Wallet operation failed';

    super(`${prefix} during ${operationText}: ${causeMessage}`);
    this.name = 'WalletOperationError';
    this.code = params.code;
    this.operation = params.operation;
    this.retryAttempted = params.retryAttempted;
    this.cause = params.cause;
  }
}

export function isRetryableWalletAuthorizationFailure(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return RETRYABLE_AUTH_PATTERNS.some((pattern) => message.includes(pattern));
}

export function asWalletOperationError(
  operation: WalletOperation,
  error: unknown,
  retryAttempted: boolean
): WalletOperationError {
  return new WalletOperationError({
    operation,
    cause: error,
    code: isRetryableWalletAuthorizationFailure(error)
      ? 'WALLET_AUTHORIZATION_FAILED'
      : 'WALLET_OPERATION_FAILED',
    retryAttempted,
  });
}

export function isWalletAuthorizationError(error: unknown): error is WalletOperationError {
  return error instanceof WalletOperationError && error.code === 'WALLET_AUTHORIZATION_FAILED';
}
