import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { khqrImage, type KhqrImageOptions } from '@bill-and-go/khqr/image';
import { AcledaConfigError, AcledaInputError, AcledaRefusedError, AcledaUnreachableError } from './errors.js';

/**
 * ACLEDA ToanChet Pay (XPAY): ACLEDA makes the KHQR text for a payment (`openSessionV2`), its
 * `getTxnStatus` is the proof of payment, and `refundTxn` gives money back. Paths and fields are
 * the ones in ACLEDA's documentation; several answers are not yet confirmed (see the README).
 */

/** ACLEDA's UAT (test) addresses, what `sandbox: true` talks to. Production addresses are given per merchant by ACLEDA. */
export const ACLEDA_SANDBOX_URL = 'https://epaymentuat.acledabank.com.kh';
export const ACLEDA_SANDBOX_REFUND_URL = 'https://epaymentuat.acledabank.com.kh:8443';

/** The service path every operation sits under. */
export const ACLEDA_SERVICE_PATH = 'XPAYConnectorServiceInterfaceImplV2/XPAYConnectorServiceInterfaceImplV2RS';

/** ACLEDA's refundTxn code for "not refundable" (docs, KHQR String section). */
export const ACLEDA_NOT_REFUNDABLE = '334845';

/** The shortest `expiryTime` sent, in minutes. */
const MIN_EXPIRY_MIN = 1;
const DEFAULT_MAX_EXPIRY_MIN = 5;
const DEFAULT_TIMEOUT_MS = 10_000;
const DECIMALS: Readonly<Record<string, number>> = { KHR: 0, USD: 2 };

/** The credentials the hash is made of. */
export type AcledaSigner = { merchantId: string; loginId: string; password: string; secretKey: string };

/** The hash ACLEDA checks: HMAC-SHA512 with the secret key, over merchantID + loginId + password + the values, upper-case hex. */
export function acledaHash(account: AcledaSigner, ...parts: string[]): string {
  const message = [account.merchantId, account.loginId, account.password, ...parts].join('');
  return createHmac('sha512', account.secretKey).update(message, 'utf8').digest('hex').toUpperCase();
}

/** An ACLEDA call's URL: `<base>/<MERCHANTNAME>/<service>/<operation>`. */
export function acledaUrl(base: string, merchantName: string, operation: string): string {
  return `${base.replace(/\/+$/, '')}/${merchantName}/${ACLEDA_SERVICE_PATH}/${operation}`;
}

/** ACLEDA's own date stamp for `purchaseDate`: UTC `YYYYMMDDHHmmss` (format unconfirmed). */
export const acledaPurchaseDate = (now: Date): string => now.toISOString().replace(/[-:T]/g, '').slice(0, 14);

/**
 * ACLEDA's callback carries no signature: it is a doorbell. Put a one-time token of your own in its
 * address (`acledaCallbackUrl`), keep only its SHA-256 (`acledaCallbackTokenHash`), accept a callback
 * once for a token you issued (`verifyAcledaCallback`), then ask `status` — never settle on the
 * callback's body.
 */
export const acledaCallbackToken = (): string => randomBytes(32).toString('base64url');

/** The SHA-256 of a callback token, hex: what to keep instead of the token. */
export const acledaCallbackTokenHash = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

/**
 * The callback's token is the one issued for this payment: its hash is the one kept, compared in
 * constant time. Claim it once (refuse a replay), then ask `status`: the callback itself proves nothing.
 */
export function verifyAcledaCallback(token: string | null | undefined, storedHash: string): boolean {
  if (!token) return false;
  const expected = Buffer.from(storedHash.toLowerCase(), 'utf8');
  const given = Buffer.from(acledaCallbackTokenHash(token), 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The callback address for one payment: your base, with the token in its query. */
export function acledaCallbackUrl(base: string, token: string): string {
  return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

export type AcledaLogLevel = 'info' | 'warn' | 'error';

export interface AcledaConfig {
  loginId: string;
  password: string;
  merchantId: string;
  /** The merchant's path name: ACLEDA's `<MERCHANTNAME>` in its URLs. */
  merchantName: string;
  /** The shared secret the hash is made with. */
  secretKey: string;
  /** ACLEDA's UAT environment (`ACLEDA_SANDBOX_URL`) instead of production. */
  sandbox?: boolean;
  /** The address for openSessionV2 and getTxnStatus. UAT's for a sandbox client; production needs it given. */
  baseUrl?: string;
  /** The address for refundTxn. UAT's (port 8443) for a sandbox client; production needs it given. */
  refundBaseUrl?: string;
  /** The moneys ACLEDA takes for this merchant. US dollars only unless given. */
  currencies?: readonly string[];
  /** The longest `expiryTime` ACLEDA allows, in minutes; a longer lifetime is cut to it. 5 unless given. */
  maxExpiryMin?: number;
  /** Sent as `operationType` and `terminalId` on openSessionV2 when given. */
  operationType?: string;
  terminalId?: string;
  /** Your `fetch`, for a test or a runtime without a global one. Read at each call otherwise. */
  fetch?: typeof fetch;
  /** How long one call may take, in milliseconds. 10 seconds unless given. */
  timeoutMs?: number;
  /** The clock: `purchaseDate` and a QR's expiry read it. The system's unless given. */
  now?: () => Date;
  /** Minor units in a major unit, per money. Riel 0 and dollars 2 unless given. */
  decimals?: (currency: string) => number;
  /** Told what happened, without a secret in it. Silent unless given. */
  log?: (level: AcledaLogLevel, message: string) => void;
}

/** A payment opened with ACLEDA: its session, the token ACLEDA knows it by, and the KHQR text. */
export interface AcledaOpened {
  /** Your transaction id (`txid`). */
  txid: string;
  sessionId: string;
  paymentTokenId: string;
  /** The KHQR text ACLEDA made. */
  qr: string;
  expiresAt: Date;
  /** With `format: 'image'`: the QR drawn from `qr`, as a `data:` URL (ACLEDA sends none). */
  image?: string;
}

export interface AcledaOpenParams {
  /** Your transaction id: unique per payment. */
  txid: string;
  /** Integer minor units. */
  amount: number;
  currency: string;
  description: string;
  /** How long the QR takes payment, in minutes; cut to 1…`maxExpiryMin`. */
  lifetimeMin: number;
  /** Where ACLEDA posts when the money moves (`acledaCallbackUrl`). */
  callbackUrl: string;
  /** `string` (the default): the KHQR text. `image`: the text and an image drawn from it. */
  format?: 'string' | 'image';
  image?: KhqrImageOptions;
}

/** ACLEDA's answer on a payment: paid only on proof, else pending. */
export type AcledaStatus = 'pending' | 'paid';

/**
 * What `refundTxn` answered (the PHP twin: `AcledaRefundOutcome`, with `kind`, `code`, `words`):
 * `refunded`; `refused` with ACLEDA's code and words (334845: not refundable), not to try again;
 * `pending` on no answer or no refund address: try again later.
 */
export type AcledaRefundOutcome = { kind: 'refunded' } | { kind: 'refused'; code: string; words: string } | { kind: 'pending' };

/** What ACLEDA sent back, read loosely: a field may be missing and is never trusted by itself. */
interface AcledaReply {
  code?: string | number | null;
  errorDetails?: string | null;
  sessionid?: string;
  qrValue?: string;
  coreRefNum?: string | null;
  xTran?: {
    paymentTokenid?: string;
    purchaseAmount?: string | number;
    purchaseCurrency?: string;
    confirmDate?: string;
  } | null;
  // The status answer's amount field is not documented in what we have: read from
  // `xTran.purchaseAmount` or `amount`; with neither, a status is never "paid" (fail closed).
  amount?: string | number;
  currency?: string;
}

const isOk = (code: AcledaReply['code']) => code === 0 || code === '0';

/**
 * One ACLEDA ToanChet Pay merchant. Opening a payment throws a typed error when ACLEDA gives no QR;
 * asking and refunding never throw — a dropped connection is "pending".
 */
export class AcledaClient {
  constructor(private readonly config: AcledaConfig) {}

  /** The moneys this client opens payments in. */
  get currencies(): readonly string[] {
    return this.config.currencies ?? ['USD'];
  }

  /** The amount as ACLEDA takes it: a decimal string in major units, two places for dollars (format unconfirmed). */
  private amount(minor: number, currency: string): string {
    const major = minor / 10 ** this.decimals(currency);
    return currency === 'USD' ? major.toFixed(2) : String(major);
  }

  /**
   * Opens a payment: ACLEDA makes the KHQR text for it (`openSessionV2`). Throws, before sending
   * anything, `AcledaInputError` for a format other than `string` or `image`, `AcledaConfigError`
   * for production with no address, `AcledaInputError` for a money not taken; then
   * `AcledaUnreachableError` when ACLEDA does not answer, `AcledaRefusedError` when it gives no QR.
   */
  async open(params: AcledaOpenParams): Promise<AcledaOpened> {
    const format = params.format ?? 'string';
    if (format !== 'string' && format !== 'image') throw new AcledaInputError('format', `A QR is asked as 'string' or 'image', not '${String(format)}'`);
    const base = this.base();
    if (!this.currencies.includes(params.currency)) {
      throw new AcledaInputError('currency', `ACLEDA takes ${this.currencies.join(', ')} only for now, not ${params.currency}`);
    }
    const now = this.now();
    const expiry = Math.max(MIN_EXPIRY_MIN, Math.min(params.lifetimeMin, this.config.maxExpiryMin ?? DEFAULT_MAX_EXPIRY_MIN));
    const xpayTransaction: Record<string, unknown> = {
      txid: params.txid,
      purchaseAmount: this.amount(params.amount, params.currency),
      purchaseCurrency: params.currency,
      purchaseDate: acledaPurchaseDate(now),
      purchaseDesc: params.description,
      invoiceid: params.txid,
      item: params.description,
      quantity: 1,
      expiryTime: expiry,
      ...(this.config.operationType && { operationType: this.config.operationType }),
      ...(this.config.terminalId && { terminalId: this.config.terminalId }),
    };
    const reply = await this.call<AcledaReply>(
      acledaUrl(base, this.config.merchantName, 'openSessionV2'),
      { ...this.login(), hash: acledaHash(this.config, params.txid), xpayTransaction, callbackUrl: params.callbackUrl },
      'open',
    );
    if (!reply) throw new AcledaUnreachableError('open');
    const token = reply.xTran?.paymentTokenid;
    if (!isOk(reply.code ?? 0) || !reply.qrValue || !token || !reply.sessionid) {
      throw new AcledaRefusedError(reply.code == null ? null : String(reply.code), reply.errorDetails || null);
    }
    return {
      txid: params.txid,
      sessionId: reply.sessionid,
      paymentTokenId: token,
      qr: reply.qrValue,
      expiresAt: new Date(now.getTime() + expiry * 60_000),
      ...(format === 'image' ? { image: await khqrImage(reply.qrValue, { ...params.image, as: 'dataUrl' }) } : {}),
    };
  }

  /**
   * Paid or not, asked of ACLEDA (`getTxnStatus`). Paid only when ACLEDA says success, gives a
   * `coreRefNum`, and its amount and currency are the ones the QR asked for (`expected`, minor
   * units). Anything else is pending, and a person confirms. Never throws.
   */
  async status(paymentTokenId: string, expected: { amount: number; currency: string }): Promise<AcledaStatus> {
    try {
      const base = this.base();
      const reply = await this.call<AcledaReply>(
        acledaUrl(base, this.config.merchantName, 'getTxnStatus'),
        { ...this.login(), hash: acledaHash(this.config, paymentTokenId), paymentTokenid: paymentTokenId },
        'status',
      );
      if (!reply) return 'pending';
      if (!isOk(reply.code ?? 1)) return 'pending';
      if (!reply.coreRefNum) return 'pending';
      const amount = reply.xTran?.purchaseAmount ?? reply.amount;
      const currency = reply.xTran?.purchaseCurrency ?? reply.currency;
      if (amount === undefined || !currency) {
        this.log('warn', 'ACLEDA status carries no amount or currency: left pending, the cashier confirms');
        return 'pending';
      }
      const matches =
        String(currency).toUpperCase() === expected.currency &&
        Math.abs(Number(amount) - expected.amount / 10 ** this.decimals(expected.currency)) < 0.005;
      if (!matches) {
        this.log('error', `ACLEDA ${paymentTokenId}: paid ${amount} ${currency}, not what the QR asked`);
        return 'pending';
      }
      return 'paid';
    } catch (e) {
      this.log('warn', `ACLEDA status could not be checked: ${e instanceof Error ? e.message : String(e)}`);
      return 'pending';
    }
  }

  /**
   * Gives money back on one payment (`refundTxn`). `code` 0 is given back; 334845 is not
   * refundable; any other refusal keeps ACLEDA's words. No answer — or no refund address — is
   * pending: try again. Never throws.
   */
  async refund(
    payment: { txid: string; paymentTokenId: string; sessionId: string },
    amount: number,
    currency: string,
    reason: string,
  ): Promise<AcledaRefundOutcome> {
    const base = this.config.refundBaseUrl ?? (this.config.sandbox ? ACLEDA_SANDBOX_REFUND_URL : '');
    if (!base) return { kind: 'pending' };
    const reply = await this.call<AcledaReply>(
      acledaUrl(base, this.config.merchantName, 'refundTxn'),
      {
        ...this.login(),
        hash: acledaHash(this.config, payment.txid),
        paymentTokenId: payment.paymentTokenId,
        sessionId: payment.sessionId,
        amount: this.amount(amount, currency),
        currency,
        reason,
      },
      'refund',
    );
    if (!reply) return { kind: 'pending' };
    if (isOk(reply.code ?? 1)) return { kind: 'refunded' };
    const code = String(reply.code ?? '');
    if (code === ACLEDA_NOT_REFUNDABLE) {
      return { kind: 'refused', code, words: 'ACLEDA says this payment cannot be refunded (not refundable).' };
    }
    return { kind: 'refused', code, words: reply.errorDetails || 'ACLEDA refused the refund.' };
  }

  private login() {
    return { loginId: this.config.loginId, password: this.config.password, merchantID: this.config.merchantId };
  }

  private base(): string {
    const base = this.config.baseUrl ?? (this.config.sandbox ? ACLEDA_SANDBOX_URL : '');
    if (!base) throw new AcledaConfigError('ACLEDA production needs its address (baseUrl): ACLEDA gives it per merchant');
    return base;
  }

  /** One POST. Null on no answer or an unreadable one; the body and the secrets are never logged, only the operation and the HTTP status. */
  private async call<T>(url: string, body: unknown, operation: string): Promise<T | null> {
    const send = this.config.fetch ?? globalThis.fetch;
    try {
      const res = await send(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.log('warn', `ACLEDA ${operation} answered ${res.status}`);
        return null;
      }
      return ((await res.json().catch(() => null)) as T | null) ?? null;
    } catch (e) {
      this.log('warn', `ACLEDA ${operation} did not answer: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  private now(): Date {
    return this.config.now?.() ?? new Date();
  }

  private decimals(currency: string): number {
    return this.config.decimals?.(currency) ?? DECIMALS[currency] ?? 2;
  }

  private log(level: AcledaLogLevel, message: string): void {
    this.config.log?.(level, message);
  }
}
