# Changelog

Every version of `@bill-and-go/acleda`, newest first. The PHP twin `bill-and-go/acleda` carries the same
version for the same change: the same calls, checked against the same test vectors. Versions follow
[semantic versioning](https://semver.org).


## Renamed

Published as `@bill-and-go/acleda`, from `github.com/Bill-and-Go/acleda-js`, made by bill&go;
`@basilbook/acleda` is deprecated for it. The calls and their behavior are unchanged.
## 0.1.0 — unreleased

The first release, taken out of BasilBook.

- `AcledaClient`: `open` (KHQR text, or an image with `format: 'image'`), `status` (paid only on proof), `refund`.
- Signing and addresses: `acledaHash`, `acledaUrl`, `acledaPurchaseDate`; the one-time callback token: `acledaCallbackToken`, `acledaCallbackUrl`, `acledaCallbackTokenHash`, `verifyAcledaCallback`.
- Typed errors: `AcledaConfigError`, `AcledaInputError`, `AcledaRefusedError`, `AcledaUnreachableError`.
