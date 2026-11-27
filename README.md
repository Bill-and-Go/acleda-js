# @bill-and-go/acleda

ACLEDA ToanChet Pay (XPAY) for Node: open a KHQR payment (its text, or an image of it), ask
whether it was paid, refund it, and the hash ACLEDA checks. No framework; your credentials are
passed in, never read from the environment.

- Money in **integer minor units** with a currency code: riel whole, dollars in cents.
- Paid only on proof: ACLEDA's success, its `coreRefNum`, and the amount and money you asked for.
- Typed errors, a `log` hook that never sees a secret, an injectable `fetch` and clock.
- ES modules and CommonJS, with types. Node 18 or later (it uses `fetch` and Node's `crypto`).

Made by bill&go for [BasilBook](https://billandgo.app), MIT. The PHP twin is
[`bill-and-go/acleda`](https://packagist.org/packages/bill-and-go/acleda) on Packagist, with **the same
calls** (see [the same calls in PHP](#the-same-calls-in-php)). KHQR itself is
[`@bill-and-go/khqr`](https://www.npmjs.com/package/@bill-and-go/khqr).

## Install

```sh
npm install @bill-and-go/acleda
```

## Quick start

```ts
import { AcledaClient, acledaCallbackToken, acledaCallbackTokenHash, acledaCallbackUrl, verifyAcledaCallback } from '@bill-and-go/acleda';

const acleda = new AcledaClient({
  loginId: 'shop-login',
  password: process.env.ACLEDA_PASSWORD!,
  merchantId: 'MID-7',
  merchantName: 'LOTUSLIME', // the <MERCHANTNAME> in ACLEDA's URLs
  secretKey: process.env.ACLEDA_SECRET_KEY!,
  sandbox: true, // ACLEDA's UAT
});

const token = acledaCallbackToken();
saveSomewhere(acledaCallbackTokenHash(token)); // keep only the hash

const opened = await acleda.open({
  txid: crypto.randomUUID().replace(/-/g, ''),
  amount: 450,
  currency: 'USD',
  description: 'Order 20261115-0007',
  lifetimeMin: 5,
  callbackUrl: acledaCallbackUrl('https://api.example.com/acleda/callback', token),
});
// { txid, sessionId, paymentTokenId, qr: '000201…', expiresAt }

await acleda.status(opened.paymentTokenId, { amount: 450, currency: 'USD' }); // 'paid' | 'pending'
```

Keep `txid`, `sessionId` and `paymentTokenId`: the status and the refund name them.

## A string or an image

```ts
const withImage = await acleda.open({ ...params, format: 'image' });
withImage.image; // 'data:image/png;base64,…', drawn from withImage.qr
```

ACLEDA sends only the text; with `format: 'image'` the image is drawn from it by
`@bill-and-go/khqr/image` (`image: { type: 'svg', size, margin }` to choose).

## Callbacks

ACLEDA's callback **carries no signature**: it proves nothing by itself. Put a one-time token of
your own in its address (`acledaCallbackToken`, `acledaCallbackUrl`), keep only its SHA-256
(`acledaCallbackTokenHash`), accept a callback once for a token you issued, then ask `status` — and
settle only on `paid`. A callback that is lost is caught by asking `status` while the QR lives.

```ts
app.post('/acleda/callback', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  // Look the payment up by the token's hash and claim it once: null when unknown or already used.
  const row = token ? await claimOnce(acledaCallbackTokenHash(token)) : null;
  if (!row || !verifyAcledaCallback(token, row.tokenHash)) return res.status(401).end();
  if ((await acleda.status(row.paymentTokenId, row.expected)) === 'paid') await settle(row);
  res.json({ ok: true });
});
```

## Refunds

```ts
await acleda.refund({ txid, paymentTokenId, sessionId }, 450, 'USD', 'Customer cancelled');
// { kind: 'refunded' } | { kind: 'refused', code, words } | { kind: 'pending' }
```

Code `334845` (`ACLEDA_NOT_REFUNDABLE`) is a payment ACLEDA will not refund. `pending` (no answer)
is worth trying again.

## API

Every call, with its PHP twin. A TypeScript options object is PHP named arguments with the same
names; `Promise<T>` is `T` in PHP.

| TypeScript | PHP (`BasilBook\Acleda\AcledaClient`) | Returns | Throws |
|---|---|---|---|
| `new AcledaClient(config)` | `new AcledaClient($config, $http?, $requests?, $streams?)` | | |
| `open({ txid, amount, currency, description, lifetimeMin, callbackUrl, format?, image? })` | `->open(txid:, amount:, currency:, description:, lifetimeMin:, callbackUrl:, format:, image:)` | `AcledaOpened`; the lifetime is cut to 1…`maxExpiryMin` | `AcledaInputError` (`format`), `AcledaConfigError`, `AcledaInputError` (`currency`), all before sending; then `AcledaUnreachableError`, `AcledaRefusedError` |
| `status(paymentTokenId, { amount, currency })` | `->status($paymentTokenId, amount:, currency:)` | `'paid'` or `'pending'` | never |
| `refund({ txid, paymentTokenId, sessionId }, amount, currency, reason)` | `->refund(txid:, paymentTokenId:, sessionId:, amount:, currency:, reason:)` | `AcledaRefundOutcome` | never |
| `currencies` | `->currencies()` | The moneys taken | |
| `acledaHash(signer, ...parts)` | `AcledaClient::hash($signer, ...$parts)` | HMAC-SHA512 under `secretKey` of merchantId + loginId + password + parts, upper-case hex. Open and refund sign `txid`; status signs `paymentTokenId` | |
| `acledaUrl(base, merchantName, operation)` | `AcledaClient::url($base, $merchantName, $operation)` | `<base>/<MERCHANTNAME>/XPAYConnectorServiceInterfaceImplV2/XPAYConnectorServiceInterfaceImplV2RS/<operation>` | |
| `acledaPurchaseDate(now)` | `AcledaClient::purchaseDate($now)` | UTC `YYYYMMDDHHmmss` | |
| `acledaCallbackToken()` | `AcledaClient::callbackToken()` | 32 random bytes, base64url | |
| `acledaCallbackTokenHash(token)` | `AcledaClient::callbackTokenHash($token)` | Its SHA-256, hex: what to keep | |
| `acledaCallbackUrl(base, token)` | `AcledaClient::callbackUrl($base, $token)` | `base` with `token=` in its query | |
| `verifyAcledaCallback(token, storedHash)` | `AcledaClient::verifyCallback($token, $storedHash)` | The token's hash is the one kept (constant time) | |
| `ACLEDA_SANDBOX_URL`, `ACLEDA_SANDBOX_REFUND_URL`, `ACLEDA_SERVICE_PATH`, `ACLEDA_NOT_REFUNDABLE` | `AcledaClient::SANDBOX_URL`, `::SANDBOX_REFUND_URL`, `::SERVICE_PATH`, `::NOT_REFUNDABLE` | | |

| `AcledaConfig` | |
|---|---|
| `loginId`, `password`, `merchantId`, `secretKey` | ACLEDA's credentials for the merchant |
| `merchantName` | The merchant's path name in ACLEDA's URLs |
| `sandbox?` | `true`: UAT, `https://epaymentuat.acledabank.com.kh` (refunds on `:8443`) |
| `baseUrl?` | The address for open and status; **required for production** (ACLEDA gives it) |
| `refundBaseUrl?` | The address for refunds; required for production (without it a refund stays `pending`) |
| `currencies?` | The moneys ACLEDA takes for you; `['USD']` unless given |
| `maxExpiryMin?` | The longest lifetime ACLEDA allows; 5 unless given |
| `operationType?`, `terminalId?` | Sent on open when given |
| `timeoutMs?` | 10000 |
| `now?()` | The clock (`purchaseDate`, expiry), a `Date` |
| `decimals?(currency)` | Minor units per major; riel 0 and dollars 2 unless given |
| `log?(level, message)` | `info`, `warn`, `error`; never a secret |
| `fetch?` | Your `fetch`; the global one otherwise (PHP: a PSR-18 client) |

`AcledaOpened`: `txid`, `sessionId`, `paymentTokenId`, `qr`, `expiresAt`, `image?`.
`AcledaRefundOutcome`: `kind` `refunded`, `refused` (with `code` and `words`; `334845` is not
refundable) or `pending` (no answer, or no refund address: try again).

## Errors

All extend `AcledaError` (PHP: `AcledaException`, and each below is `…Exception` there).

| Class | Carries | When |
|---|---|---|
| `AcledaConfigError` | | Production without `baseUrl`; nothing was sent |
| `AcledaInputError` | `problem` (`currency`, `format`) | A money not in `currencies`, or a format that is not `string` / `image`; nothing was sent |
| `AcledaRefusedError` | `acledaCode`, `details` | ACLEDA gave no QR; `acledaCode` is its code, `details` its `errorDetails` |
| `AcledaUnreachableError` | `operation` | No answer, an HTTP error, or an unreadable one |

## The same calls in PHP

`composer require bill-and-go/acleda` gives the same calls, the same requests, the same results and
the same errors, checked by tests that run this package's own requests and answers
(`tests/fixtures/ts-vectors.json`). What differs is only each language's own way: a function here
is a static method of `AcledaClient` there, without the word ACLEDA (`acledaHash` →
`AcledaClient::hash`, `verifyAcledaCallback` → `AcledaClient::verifyCallback`); an options object
here is named arguments there (`refund`'s payment object is its first three arguments); `Promise`
here, a plain return there; `Date` here, `DateTimeImmutable` there; a getter here (`currencies`) is
a method there; `fetch` here, a PSR-18 HTTP client there; `…Error` here, `…Exception` there, with
the same properties.

## Sandbox and production

`sandbox: true` uses ACLEDA's UAT. Production addresses are given by ACLEDA per merchant; pass them
as `baseUrl` and `refundBaseUrl`. **Not yet confirmed by ACLEDA**: the callback field name and
whether its address may change per payment, the status answer's amount field (read from
`xTran.purchaseAmount` or `amount`; with neither, never paid), the `purchaseDate` format, riel,
the longest lifetime, and `operationType` / `terminalId`. Start in UAT, with dollars.

## Contributing and tests

In BasilBook's BasilBook repository at `packages/acleda`; the PHP twin at `packages/php/acleda`. A
change to one is made to both: build, then run `node packages/php-vectors.mjs` to write the PHP
tests' vectors from this package, and run both test suites. Tests use a fake `fetch`; nothing
reaches ACLEDA.

```sh
pnpm --filter @bill-and-go/acleda... build
pnpm --filter @bill-and-go/acleda test
```

Report a security issue privately through GitHub's *Report a vulnerability*, not in a public issue.

## License

MIT © BasilBook. See [LICENSE](./LICENSE).
