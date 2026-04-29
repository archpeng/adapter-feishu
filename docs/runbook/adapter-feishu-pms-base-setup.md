# adapter-feishu PMS Base registry handoff

> Active boundary: `adapter-feishu` executes Feishu/Lark-facing projection wrappers and consumes generated registry targets. It does **not** own the PMS Base table schema.

## 1. Active schema SSOT

The active source of truth for the PMS Base table definition and end-user Chinese display language lives in `pms-platform`:

```text
/home/peng/dt-git/github/pms-platform/packages/provisioning/src/index.ts
/home/peng/dt-git/github/pms-platform/docs/pms-base-provisioning-v1.md
```

Use these PMS-owned symbols as the schema contract:

- `HotelProfile`
- `PmsBaseProvisioningSpec`
- `createSmallHotelPmsBaseProvisioningSpec()`
- `validatePmsBaseProvisioningSpec()`

`adapter-feishu` tracked files may include example registry shapes for parser/runtime tests, but those examples are not the table-definition SSOT.

## 2. adapter-feishu responsibility

`adapter-feishu` owns only the Feishu capability layer:

1. Load `ADAPTER_FEISHU_PMS_BASE_REGISTRY_PATH`.
2. Shield callers from raw `appToken` / `tableId` targets.
3. Map PMS business keys through registry `fieldMap` into existing Feishu Base field display names.
4. Preflight schema drift through Feishu Bitable field listing when enabled.
5. Execute bounded `pms_base_*` wrappers:
   - `pms_base_dashboard_projection`
   - `pms_base_get_room_projection`
   - `pms_base_upsert_operation_request`
   - `pms_base_update_operation_result`
   - `pms_base_upsert_room_projection`
   - `pms_base_update_room_projection`
   - `pms_base_append_operation_log`
   - `pms_base_upsert_housekeeping_task_projection`
   - `pms_base_upsert_maintenance_ticket_projection`
   - `pms_base_get_reservation_projection`
   - `pms_base_upsert_reservation_projection`
   - `pms_base_upsert_inventory_calendar_projection`
   - `pms_base_prune_inventory_calendar_projection`
   - `pms_base_upsert_projection_status`
   - `pms_base_prune_projection_status`
   - `pms_base_today_arrivals_projection`
   - `pms_base_today_departures_projection`

The projection-status wrappers write only display-safe freshness/failure metadata to `投影状态`; they redact error summaries and must not become PMS command sources.

It must not define PMS business schema, own PMS state transitions, or become a generic arbitrary Bitable tool.

## 3. Registry handoff contract

A local provisioning lane may generate ignored registry files from the PMS-owned spec, for example:

```text
/home/peng/dt-git/github/adapter-feishu/config/pms-base-projections.local.json
```

The runtime registry contains deployment-specific values:

- real Feishu `appToken`
- real Feishu `tableId`
- enabled binding flags
- business-field-to-Feishu-field `fieldMap`
- required field and update allowlist policy

Keep real target values out of git. Tracked example registry files are placeholders only.

## 4. Operational checklist

Before starting `adapter-feishu` PMS Base projection runtime:

1. Generate or mount a registry from the PMS-owned `PmsBaseProvisioningSpec`.
2. Set `ADAPTER_FEISHU_PMS_BASE_REGISTRY_PATH` to the ignored local registry path or secret mount.
3. Set `ADAPTER_FEISHU_PMS_BASE_WEBHOOK_AUTH_TOKEN`.
4. Ensure the Feishu app has permission to read fields, list records, create records, and update records for the target Base tables.
5. Run a registry mount probe without printing raw target values.
6. Run targeted wrapper probes for dashboard, room, operation request, room update, inventory calendar upsert/prune, projection status upsert/prune, and operation log paths.

## 5. Stable failure expectations

Common adapter-owned failures remain stable for troubleshooting:

| Error | Meaning |
| --- | --- |
| `projection_registry_missing_binding` | Required or invoked binding is not present in the mounted registry. |
| `projection_binding_disabled` | Binding exists but is disabled. |
| `schema_drift` | Mapped Feishu field name is absent from the target table. |
| `field_not_allowed` | Caller tried to write a business field not allowed by the binding. |
| `invalid_payload` | Required request payload fields are missing or malformed. |

Schema drift repair should update the PMS-owned spec first when the desired schema changes, then regenerate/apply Feishu resources and local registries.
