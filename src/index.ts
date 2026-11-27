/**
 * @bill-and-go/acleda (#1687): ACLEDA ToanChet Pay (XPAY) for Node — open a KHQR payment (its text,
 * or an image of it), ask whether it was paid, refund it, and the hash ACLEDA checks. Credentials
 * are passed in, never read from the environment; amounts are integer minor units with their
 * currency. The PHP twin, `bill-and-go/acleda`, has the same calls (`AcledaClient`,
 * `AcledaClient::hash`, …).
 */
export {
  AcledaClient,
  acledaHash,
  acledaUrl,
  acledaPurchaseDate,
  acledaCallbackToken,
  acledaCallbackUrl,
  acledaCallbackTokenHash,
  verifyAcledaCallback,
  ACLEDA_SANDBOX_URL,
  ACLEDA_SANDBOX_REFUND_URL,
  ACLEDA_SERVICE_PATH,
  ACLEDA_NOT_REFUNDABLE,
  type AcledaConfig,
  type AcledaLogLevel,
  type AcledaOpened,
  type AcledaOpenParams,
  type AcledaRefundOutcome,
  type AcledaSigner,
  type AcledaStatus,
} from './client.js';
export {
  AcledaError,
  AcledaConfigError,
  AcledaInputError,
  AcledaRefusedError,
  AcledaUnreachableError,
  type AcledaInputProblem,
} from './errors.js';
