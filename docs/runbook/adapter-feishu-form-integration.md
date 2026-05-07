# adapter-feishu form integration runbook

## Scope

`/providers/form-webhook` writes incoming form payloads into existing Feishu Base/Bitable tables. It is a transport/projection helper only; PMS business truth remains in `pms-platform`.

Supported modes:

1. **Managed formKey mode** — preferred. Caller sends `formKey`; adapter loads a server-side registry, maps business fields, injects fixed fields, and writes to the registry-bound Base target.
2. **Default-target mode** — caller omits `formKey`; adapter writes table-field names to the configured default target. Raw `target` override is accepted only when `ADAPTER_FEISHU_FORM_ALLOW_TARGET_OVERRIDE=true`.

There is no separate operation-request forwarding path in `adapter-feishu`. PMS operation-request facts are either captured as managed Base records or handled by `pms-agent-v2 -> pms-platform` product tools.

## Environment

```env
ADAPTER_FEISHU_FORM_WEBHOOK_AUTH_TOKEN=<local secret, do not commit>
ADAPTER_FEISHU_FORM_USER_ID_TYPE=user_id
ADAPTER_FEISHU_FORM_REGISTRY_PATH=config/pms-form-bindings.example.json
ADAPTER_FEISHU_FORM_ALLOW_TARGET_OVERRIDE=false

# default-target mode only
ADAPTER_FEISHU_FORM_DEFAULT_APP_TOKEN=<base app token>
ADAPTER_FEISHU_FORM_DEFAULT_TABLE_ID=<table id>
ADAPTER_FEISHU_FORM_DEFAULT_FORM_ID=<optional form id>
```

## Registry contract

Registry file shape:

```json
{
  "version": 1,
  "forms": {
    "pms-checkout": {
      "enabled": true,
      "target": {
        "appToken": "example_pms_base_app_token",
        "tableId": "example_pms_operation_requests_table",
        "formId": "example_pms_checkout_form"
      },
      "fieldMap": {
        "roomNumber": "RoomNumber",
        "operator": "Operator"
      },
      "fixedFields": {
        "Source": "adapter-feishu-pms-smart-intake",
        "Ingress": "formKey:pms-checkout",
        "SchemaVersion": "pms-smart-intake-v1"
      },
      "policy": {
        "validateFormSchemaByDefault": true,
        "rejectUnmappedFields": true
      }
    }
  }
}
```

Rules:

- `forms.<formKey>.target` is required.
- `delivery.kind` is optional and, when present, must be `base_record`.
- Callers may not send `target` with `formKey` payloads; violations return `target_not_allowed_for_managed_form`.
- Managed mode rejects unmapped fields when `rejectUnmappedFields=true`; violations return `field_not_mapped`.
- Caller fields cannot override `fixedFields`; violations return `fixed_field_conflict`.
- Optional schema preflight uses existing Feishu form/table metadata only; adapter does not create Base resources.

## Managed request example

```json
{
  "formKey": "pms-checkout",
  "clientToken": "00000000-0000-4000-8000-000000000001",
  "fields": {
    "roomNumber": "0308",
    "operator": "frontdesk-01",
    "reason": "guest checked out"
  }
}
```

Successful managed writes include `"targetSource": "managed"`, `"targetConfigured": true`, `"targetRefHash": "<sha256-prefix>"`, and `"rawTargetLogged": false` in the response. They do not return raw `appToken`, `tableId`, or `formId`.

## Validation

```bash
npm run test -- test/server/formWebhook.test.ts test/docs-boundary.test.ts
npm run verify
```

PMS examples in `config/pms-form-bindings.example.json` include `CHECK_OUT`, `REPORT_MAINTENANCE`, and `HOUSEKEEPING_DONE` fixed actions. PMS Base setup remains documented in `docs/runbook/adapter-feishu-pms-base-setup.md`.

Do not log or commit Feishu app secrets, raw tenant Base IDs, raw Feishu IDs, callback tokens, or PMS payloads.
