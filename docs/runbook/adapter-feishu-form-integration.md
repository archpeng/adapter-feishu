# adapter-feishu form webhook integration

## Scope and honest boundary

`adapter-feishu` now exposes a bounded form-write surface:

- `POST /providers/form-webhook`
- primary behavior: write one record into an **existing** Feishu Base / Bitable table
- optional behavior: preflight submitted fields against an **existing** Feishu form schema before record creation

This POC v1 is intentionally **not**:

- a full smart-form control plane
- a Base / table / form creation workflow
- a form field patch / view patch / option expansion workflow
- an attachment upload pipeline
- a cross-instance write coordinator

Repo truth stays bounded to the APIs already wired in code:

- record write: `bitable.appTableRecord.create`
- optional schema preflight: `bitable.appTableForm.get` + `bitable.appTableFormField.list`

## Prerequisites

Before calling `/providers/form-webhook`, make sure all of the following are true:

1. You have a Feishu self-built app with valid:
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
2. That app can write to the target Base/table used by this integration.
3. The target Base, table, and optional form already exist.
4. If you want `validateFormSchema=true`, the app must also be able to read the target form metadata and form fields for the same `appToken/tableId/formId`.
5. The Base is shared/configured so this app can access it in the target tenant.

If these prerequisites are missing, the adapter will fail honestly with upstream-facing errors such as:

- `record_create_failed`
- `schema_validation_failed`
- error strings like `permission denied` or field/schema mismatch messages

## Required configuration

### Core app config

```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=app_secret_xxx
```

### Form webhook config

```env
ADAPTER_FEISHU_FORM_WEBHOOK_AUTH_TOKEN=form-token-1
ADAPTER_FEISHU_FORM_ALLOW_TARGET_OVERRIDE=false
ADAPTER_FEISHU_FORM_USER_ID_TYPE=user_id
ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN=bascnxxxxxxxxxxxx
ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID=tblxxxxxxxxxxxx
ADAPTER_FEISHU_FORM_DEFAULT_FORM_ID=formxxxxxxxxxxxx
```

### Env contract notes

| Variable | Required | Meaning |
|---|---|---|
| `ADAPTER_FEISHU_FORM_WEBHOOK_AUTH_TOKEN` | recommended in deployed envs | Protects `/providers/form-webhook`; accepted via `Authorization: Bearer <token>` or `x-adapter-form-token`. |
| `ADAPTER_FEISHU_FORM_ALLOW_TARGET_OVERRIDE` | no | When `false`, request bodies must not send `target`. When `true`, callers may send `target.appToken/tableId/formId`. |
| `ADAPTER_FEISHU_FORM_USER_ID_TYPE` | no | Passed through to Feishu record creation. Supported: `user_id`, `union_id`, `open_id`. Default: `user_id`. |
| `ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN` | with default target | Default Base app token. Must be set together with `ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID`. |
| `ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID` | with default target | Default target table ID. Must be set together with `ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN`. |
| `ADAPTER_FEISHU_FORM_DEFAULT_FORM_ID` | optional | Optional default form ID. Needed only when callers want `validateFormSchema=true` against the default target. |

Operational rules from `src/config.ts`:

- `ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN` and `ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID` must be set together
- `ADAPTER_FEISHU_FORM_USER_ID_TYPE` must be one of `user_id`, `union_id`, `open_id`
- form webhook auth is separate from `ADAPTER_FEISHU_PROVIDER_WEBHOOK_AUTH_TOKEN`

## Request contract

`POST /providers/form-webhook`

### Minimum payload

```json
{
  "clientToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "fields": {
    "Title": "adapter-feishu",
    "Severity": "warning"
  }
}
```

### Full bounded payload shape

```json
{
  "clientToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "fields": {
    "Title": "adapter-feishu",
    "Severity": "warning",
    "Summary": "record created from provider payload"
  },
  "validateFormSchema": true,
  "target": {
    "appToken": "bascnxxxxxxxxxxxx",
    "tableId": "tblxxxxxxxxxxxx",
    "formId": "formxxxxxxxxxxxx"
  }
}
```

### Field semantics

| Field | Required | Notes |
|---|---|---|
| `clientToken` | yes | Must be a UUIDv4 string. It is forwarded to Feishu as `client_token` and is also used for adapter-side dedupe. |
| `fields` | yes | JSON object passed through to `bitable.appTableRecord.create`. Keys should match the actual table column names. |
| `validateFormSchema` | no | Optional boolean. When `true`, adapter runs form metadata/field preflight before record creation. |
| `target` | conditional | Only allowed when `ADAPTER_FEISHU_FORM_ALLOW_TARGET_OVERRIDE=true`. Otherwise requests must rely on the configured default target. |

Important boundaries:

- `fields` are not transformed into a local schema DSL; callers must match the real Feishu table field names and value types.
- If `validateFormSchema=true` but no usable `formId` is available for the resolved target, the adapter returns `form_id_required_for_schema_validation`.
- Same-table writes are serialized **in-process** by `appToken:tableId`; this does not provide cross-instance coordination.

## Auth contract

When `ADAPTER_FEISHU_FORM_WEBHOOK_AUTH_TOKEN` is configured, send one of:

- `Authorization: Bearer <token>`
- `x-adapter-form-token: <token>`

If the env var is empty, the endpoint is anonymous. That is acceptable for local testing but not recommended for deployed environments.

## Example calls

### 1. Default target, no schema preflight

```bash
curl -X POST http://127.0.0.1:8787/providers/form-webhook \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer form-token-1' \
  -d '{
    "clientToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "fields": {
      "Title": "adapter-feishu",
      "Severity": "warning"
    }
  }'
```

Expected success shape:

```json
{
  "code": 0,
  "status": "record_created",
  "recordId": "rec_1",
  "clientToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "targetSource": "default",
  "target": {
    "appToken": "bascnxxxxxxxxxxxx",
    "tableId": "tblxxxxxxxxxxxx",
    "formId": "formxxxxxxxxxxxx"
  }
}
```

### 2. Default target with schema preflight

```bash
curl -X POST http://127.0.0.1:8787/providers/form-webhook \
  -H 'content-type: application/json' \
  -H 'x-adapter-form-token: form-token-1' \
  -d '{
    "clientToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "validateFormSchema": true,
    "fields": {
      "Title": "adapter-feishu",
      "Severity": "warning"
    }
  }'
```

If schema preflight succeeds, the success body also includes:

```json
{
  "schemaValidated": true
}
```

### 3. Override target when override is enabled

This request shape only works when:

```env
ADAPTER_FEISHU_FORM_ALLOW_TARGET_OVERRIDE=true
```

```bash
curl -X POST http://127.0.0.1:8787/providers/form-webhook \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer form-token-1' \
  -d '{
    "clientToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "validateFormSchema": true,
    "fields": {
      "Title": "override path"
    },
    "target": {
      "appToken": "bascn_override",
      "tableId": "tbl_override",
      "formId": "form_override"
    }
  }'
```

A successful response reports:

- `targetSource: "override"`
- the resolved override `target`

## Stable response / error boundary

### Success classes

| HTTP | `status` / `message` | Meaning |
|---|---|---|
| `200` | `record_created` | Record write succeeded. |
| `202` | `duplicate_ignored` | Same `clientToken` + `appToken` + `tableId` was already accepted in the current dedupe window. |

### Stable failure classes

| HTTP | `message` | Typical cause |
|---|---|---|
| `401` | `unauthorized` | Missing or wrong form webhook token. |
| `400` | `invalid_json` | Request body is not valid JSON. |
| `400` | `invalid_payload` | Missing/invalid `clientToken`, `fields`, `target`, or schema-validation payload issues. |
| `405` | `method_not_allowed` | Non-POST request. |
| `404` | `not_found` | Wrong path. |
| `502` | `schema_validation_failed` | Upstream form metadata lookup failed. |
| `502` | `record_create_failed` | Upstream record creation failed. |

### Common `invalid_payload.errors`

Examples already proved by tests:

- `client_token_required`
- `client_token_invalid`
- `fields_required`
- `target_missing`
- `target_invalid`
- `target_override_not_allowed`
- `app_token_required`
- `table_id_required`
- `form_id_invalid`
- `validate_form_schema_invalid`
- `form_id_required_for_schema_validation`
- `required_field_missing:Severity`
- `field_not_visible:HiddenField`
- `field_not_in_form:UnknownField`

## Verification baseline

Repo-level verification command:

```bash
npm run verify
```

This runs:

- `npm run build`
- `npm run test`

If you only want the targeted form-webhook regression surface first, run:

```bash
npm test -- test/channels/feishu/bitableClient.test.ts test/server/httpHost.test.ts test/server/formWebhook.test.ts test/runtime.test.ts test/state/tableWriteQueue.test.ts
```

## Operational troubleshooting

### `permission denied`

Usually means one of:

- the Feishu app lacks access to the target Base/table
- the Base was not shared/configured for that app
- schema preflight is enabled, but the app can write records and cannot read form metadata

### `field_not_in_form:*`

`validateFormSchema=true` was enabled, and a submitted field key does not exist in the resolved form field list.

### `field_not_visible:*`

The submitted field exists in the form metadata, but is not visible in that form.

### `required_field_missing:*`

A required form field was not populated before createRecord.

### `duplicate_ignored`

The same `clientToken` already succeeded recently for the same `appToken:tableId`. The adapter intentionally suppresses a second create inside the current dedupe window.

## Related repo docs

- `README.md`
- `docs/runbook/adapter-feishu-local-runbook.md`
- `docs/runbook/adapter-feishu-provider-integration.md`
- `docs/plan/README.md`
- `docs/archive/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_PLAN.md`
- `docs/archive/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_CLOSEOUT.md`
