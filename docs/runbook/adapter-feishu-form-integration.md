# adapter-feishu form webhook integration

## Scope and honest boundary

`adapter-feishu` exposes one bounded form-write surface:

- endpoint: `POST /providers/form-webhook`
- legacy mode: caller sends table-field `fields` and uses the configured default target or an explicitly allowed raw `target`
- managed mode: caller sends `formKey + fields`; the adapter resolves the target and field mapping from a server-side registry file
- primary behavior: write one record into an **existing** Feishu Base / Bitable table
- optional behavior: preflight submitted fields against an **existing** Feishu form schema before record creation

Managed mode is a routing and mapping layer over the same record-write path. It is intentionally not a form-design/control platform.

This integration is intentionally **not**:

- a full smart-form control plane
- a Base / table / form creation workflow
- a form field patch / view patch / option expansion workflow
- an attachment upload pipeline
- a field value transform DSL or option lookup service
- a cross-instance write coordinator

Repo truth stays bounded to the APIs already wired in code:

- record write: `bitable.appTableRecord.create`
- optional schema preflight: `bitable.appTableForm.get` + `bitable.appTableFormField.list`
- managed registry load: local JSON file configured by `ADAPTER_FEISHU_FORM_REGISTRY_PATH`

## Prerequisites

Before calling `/providers/form-webhook`, make sure all of the following are true:

1. You have a Feishu self-built app with valid:
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
2. That app can write to the target Base/table used by this integration.
3. The target Base, table, and optional form already exist.
4. If `validateFormSchema=true` or a managed binding has `policy.validateFormSchemaByDefault=true`, the app must also be able to read the target form metadata and form fields for the same `appToken/tableId/formId`.
5. The Base is shared/configured so this app can access it in the target tenant.
6. For managed mode, the registry file exists on local disk inside the runtime/container and uses placeholder-free real target IDs in deployed environments.

If these prerequisites are missing, the adapter fails honestly with upstream-facing errors such as:

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
```

### Managed-mode registry config

Set this for managed `formKey` routing:

```env
ADAPTER_FEISHU_FORM_REGISTRY_PATH=config/form-bindings.example.json
```

`config/form-bindings.example.json` is tracked as a placeholder-only example. Copy it or mount a tenant-specific file for real deployments; do not commit private tenant target IDs.

### Legacy default-target config

Keep these for legacy/default-target requests that do not send `formKey`:

```env
ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN=bascnxxxxxxxxxxxx
ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID=tblxxxxxxxxxxxx
ADAPTER_FEISHU_FORM_DEFAULT_FORM_ID=formxxxxxxxxxxxx
```

### Env contract notes

| Variable | Required | Meaning |
|---|---|---|
| `ADAPTER_FEISHU_FORM_WEBHOOK_AUTH_TOKEN` | recommended in deployed envs | Protects `/providers/form-webhook`; accepted via `Authorization: Bearer <token>` or `x-adapter-form-token`. |
| `ADAPTER_FEISHU_FORM_REGISTRY_PATH` | managed mode only | Local JSON file containing `forms[formKey]` bindings. Empty/unset keeps legacy-only/default-target startup. Invalid path/JSON/binding fails fast during runtime creation. |
| `ADAPTER_FEISHU_FORM_ALLOW_TARGET_OVERRIDE` | no | Legacy-mode only. When `false`, request bodies without `formKey` must not send `target`. Managed mode always rejects caller-supplied `target`. |
| `ADAPTER_FEISHU_FORM_USER_ID_TYPE` | no | Passed through to Feishu record creation. Supported: `user_id`, `union_id`, `open_id`. Default: `user_id`. |
| `ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN` | with default target | Legacy default Base app token. Must be set together with `ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID`. |
| `ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID` | with default target | Legacy default target table ID. Must be set together with `ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN`. |
| `ADAPTER_FEISHU_FORM_DEFAULT_FORM_ID` | optional | Optional legacy default form ID. Needed only when callers want `validateFormSchema=true` against the default target. |

Operational rules from code:

- `ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN` and `ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID` must be set together
- `ADAPTER_FEISHU_FORM_USER_ID_TYPE` must be one of `user_id`, `union_id`, `open_id`
- `ADAPTER_FEISHU_FORM_REGISTRY_PATH` is trimmed; empty/unset means no registry is loaded
- invalid registry file path, invalid JSON, or invalid binding shape fails fast at startup
- form webhook auth is separate from `ADAPTER_FEISHU_PROVIDER_WEBHOOK_AUTH_TOKEN`

## Managed registry contract

Registry root:

```json
{
  "version": 1,
  "forms": {
    "pms-intake": {
      "enabled": true,
      "target": {
        "appToken": "bascn_example_app_token",
        "tableId": "tbl_example_table_id",
        "formId": "form_example_form_id"
      },
      "fieldMap": {
        "title": "Title",
        "severity": "Severity",
        "description": "Description"
      },
      "fixedFields": {
        "Source": "adapter-feishu-managed-form",
        "Ingress": "formKey:pms-intake"
      },
      "policy": {
        "validateFormSchemaByDefault": true,
        "rejectUnmappedFields": true
      }
    }
  }
}
```

Binding semantics:

| Registry field | Required | Meaning |
|---|---|---|
| `version` | yes | Must be `1`. |
| `forms` | yes | Object keyed by public `formKey`. Must contain at least one binding. |
| `forms.<formKey>.enabled` | yes | `false` disables the binding without deleting it. Disabled keys return `form_key_disabled:<formKey>`. |
| `forms.<formKey>.target.appToken` | yes | Server-side Base app token used for record create. |
| `forms.<formKey>.target.tableId` | yes | Server-side target table ID used for record create. |
| `forms.<formKey>.target.formId` | optional | Server-side form ID used for schema preflight. Required when schema validation is enabled for that binding. |
| `forms.<formKey>.fieldMap` | yes | Maps request business keys to Feishu table/form field names, e.g. `title -> Title`. |
| `forms.<formKey>.fixedFields` | optional | Static Feishu fields injected after mapping, e.g. `Source`. Caller input cannot override these. |
| `forms.<formKey>.policy.validateFormSchemaByDefault` | yes | Default schema preflight behavior for this binding. Caller may still send explicit `validateFormSchema` boolean. |
| `forms.<formKey>.policy.rejectUnmappedFields` | yes | When `true`, managed mode rejects unknown business keys instead of passing them through. Keep `true` for controlled handoff. |

## Request contract

`POST /providers/form-webhook`

### Managed payload: preferred for multi-form routing

```json
{
  "formKey": "pms-intake",
  "clientToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "fields": {
    "title": "adapter-feishu",
    "severity": "warning",
    "description": "record created from managed routing"
  }
}
```

Managed payload semantics:

| Field | Required | Notes |
|---|---|---|
| `formKey` | yes for managed mode | Non-empty string resolved through `forms[formKey]` in the loaded registry. |
| `clientToken` | yes | Must be a UUIDv4 string. It is forwarded to Feishu as `client_token` and used for adapter-side dedupe. |
| `fields` | yes | Business-field JSON object. Keys are mapped through the binding `fieldMap` before record creation. |
| `validateFormSchema` | no | Optional boolean. If omitted, managed mode uses `binding.policy.validateFormSchemaByDefault`. |
| `target` | never in managed mode | Managed mode rejects caller-supplied `target` with `target_not_allowed_for_managed_form`; target truth comes from the registry. |

Managed write preparation order:

1. parse `formKey`, `clientToken`, `fields`, and optional `validateFormSchema`
2. resolve `forms[formKey]` from the loaded registry
3. reject disabled or unknown binding keys
4. reject caller-supplied `target`
5. map business field keys through `fieldMap`
6. reject unmapped keys when `rejectUnmappedFields=true`
7. inject `fixedFields` and reject caller attempts to override them
8. optionally run existing form schema preflight
9. reuse existing dedupe, same-table queue, and `createRecord` path

### Legacy payload: default target or raw target override

Legacy mode is selected when `formKey` is absent.

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

Legacy field semantics:

| Field | Required | Notes |
|---|---|---|
| `clientToken` | yes | Must be a UUIDv4 string. |
| `fields` | yes | Feishu table-field JSON object. Keys should match the actual table column names. |
| `validateFormSchema` | no | Optional boolean. Defaults to `false` in legacy mode. |
| `target` | conditional | Only allowed when `ADAPTER_FEISHU_FORM_ALLOW_TARGET_OVERRIDE=true`. Otherwise requests rely on the configured default target. |

Important boundaries:

- Managed mode is preferred for multi-form routing because it keeps `target`, `fieldMap`, and `fixedFields` server-side.
- Legacy raw `target` override is an explicit escape hatch, not the recommended onboarding path.
- Field values are not transformed into a local schema DSL; callers must send values Feishu can accept for the mapped table fields.
- If schema validation is enabled but no usable `formId` is available for the resolved target, the adapter returns `form_id_required_for_schema_validation`.
- Same-table writes are serialized **in-process** by `appToken:tableId`; this does not provide cross-instance coordination.

## Auth contract

When `ADAPTER_FEISHU_FORM_WEBHOOK_AUTH_TOKEN` is configured, send one of:

- `Authorization: Bearer <token>`
- `x-adapter-form-token: <token>`

If the env var is empty, the endpoint is anonymous. That is acceptable for local testing but not recommended for deployed environments.

## Example calls

### 1. Managed formKey request

Set registry path:

```env
ADAPTER_FEISHU_FORM_REGISTRY_PATH=config/form-bindings.example.json
```

Then call the existing endpoint without a raw `target`:

```bash
curl -X POST http://127.0.0.1:8787/providers/form-webhook \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer form-token-1' \
  -d '{
    "formKey": "pms-intake",
    "clientToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "fields": {
      "title": "adapter-feishu",
      "severity": "warning",
      "description": "managed routing smoke"
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
  "schemaValidated": true,
  "targetSource": "managed",
  "target": {
    "appToken": "bascn_example_app_token",
    "tableId": "tbl_example_table_id",
    "formId": "form_example_form_id"
  }
}
```

### 2. Legacy default target, no schema preflight

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

A successful response reports `targetSource: "default"`.

### 3. Legacy default target with schema preflight

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

### 4. Legacy raw target override when override is enabled

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

Do not document this raw-target override as the preferred multi-form onboarding path; use managed `formKey` bindings instead.

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
| `400` | `invalid_payload` | Missing/invalid `clientToken`, `fields`, `target`, `formKey`, managed mapping, or schema-validation payload issues. |
| `405` | `method_not_allowed` | Non-POST request. |
| `404` | `not_found` | Wrong path. |
| `502` | `schema_validation_failed` | Upstream form metadata lookup failed. |
| `502` | `record_create_failed` | Upstream record creation failed. |

### Common `invalid_payload.errors`

General/legacy examples already proved by tests:

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

Managed-mode examples already proved by tests:

- `form_key_invalid`
- `form_registry_not_configured`
- `form_key_unknown:<formKey>`
- `form_key_disabled:<formKey>`
- `target_not_allowed_for_managed_form`
- `field_not_mapped:<businessField>`
- `fixed_field_conflict:<FeishuFieldName>`
- schema drift after mapping, for example `required_field_missing:Title` and `field_not_in_form:RenamedTitle`

## Verification baseline

Repo-level verification command:

```bash
npm run verify
```

This runs:

- `npm run build`
- `npm run test`

Targeted form-webhook and docs regression surface:

```bash
npm test -- test/docs-boundary.test.ts test/config.test.ts test/runtime.test.ts test/server/formWebhook.test.ts
```

## Operational troubleshooting

### Startup fails on `ADAPTER_FEISHU_FORM_REGISTRY_PATH`

The runtime loads the registry synchronously during startup when `ADAPTER_FEISHU_FORM_REGISTRY_PATH` is set.

Typical causes:

- file path does not exist inside the current working directory or container
- JSON is invalid
- registry root is not `version: 1`
- a binding is missing `enabled`, `target.appToken`, `target.tableId`, `fieldMap`, or required `policy` booleans

### `form_registry_not_configured`

The request sent `formKey`, but no registry was loaded. Set `ADAPTER_FEISHU_FORM_REGISTRY_PATH` or send a legacy no-`formKey` request.

### `form_key_unknown:*` or `form_key_disabled:*`

The caller sent a `formKey` that is not present/enabled in `forms`. Update the server-side registry; do not send raw `target` to work around managed routing.

### `target_not_allowed_for_managed_form`

Managed mode shields targets from callers. Remove `target` from the request and fix the registry binding if the destination is wrong.

### `field_not_mapped:*`

A business field in `fields` is missing from `fieldMap` and `rejectUnmappedFields=true`. Add an intentional mapping or remove the field.

### `fixed_field_conflict:*`

Caller input mapped to a Feishu field that is also injected by `fixedFields`. Rename the business field mapping or remove caller control over that field.

### `permission denied`

Usually means one of:

- the Feishu app lacks access to the target Base/table
- the Base was not shared/configured for that app
- schema preflight is enabled, but the app can write records and cannot read form metadata

### `field_not_in_form:*`

Schema validation was enabled, and a submitted/mapped field key does not exist in the resolved form field list.

### `field_not_visible:*`

The submitted/mapped field exists in the form metadata, but is not visible in that form.

### `required_field_missing:*`

A required form field was not populated before createRecord.

### `duplicate_ignored`

The same `clientToken` already succeeded recently for the same `appToken:tableId`. The adapter intentionally suppresses a second create inside the current dedupe window.

## Related repo docs

- `README.md`
- `.env.example`
- `config/form-bindings.example.json`
- `docs/runbook/adapter-feishu-local-runbook.md`
- `docs/runbook/adapter-feishu-provider-integration.md`
- `docs/plan/README.md`
- `docs/archive/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_PLAN.md`
- `docs/archive/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_CLOSEOUT.md`
