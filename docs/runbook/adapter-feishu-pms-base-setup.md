# adapter-feishu PMS Base setup contract

> Scope: S2 setup contract for `adapter-feishu-pms-smart-intake-v1-2026-04-24`.
> This document tells an operator how to create a sandbox Feishu Base for light PMS smart intake before sandbox/live smoke.

## 1. Boundary and build rules

- Build these tables, fields, forms, views, roles, and automations manually in Feishu Base.
- `adapter-feishu` only writes records through the existing `/providers/form-webhook` managed `formKey` route.
- Do not add code that creates, patches, or provisions Feishu Base resources from this repo.
- Do not store real app tokens, table IDs, form IDs, app secrets, full guest identity documents, full payment cards, or invoice data in git.
- Keep v1 narrow: room state visibility, checkout intake, housekeeping completion intake, maintenance report intake, audit fields, and operator views.
- Out of scope for this setup: payment, invoice, police upload, door-lock, OTA channel sync, member/loyalty, night audit, and complete commercial PMS replacement.

## 2. Base creation checklist

1. Create one Feishu Base named `PMS Smart Intake Sandbox` or equivalent.
2. Create the seven tables in section 3 using the logical table names exactly enough for operators to recognize them.
3. Create the views in section 4.
4. Configure role-based permissions in section 5 before sharing the Base broadly.
5. Create three form views over `PMS Operation Requests` for the initial managed formKeys:
   - `pms-checkout`
   - `pms-maintenance-report`
   - `pms-housekeeping-done`
6. Copy the generated server-side `appToken`, `tableId`, and `formId` values into deployment secrets or a non-git registry file derived from `config/pms-form-bindings.example.json`.
7. Keep `policy.rejectUnmappedFields=true` and `policy.validateFormSchemaByDefault=true` for the three S1 bindings.

## 3. Table schemas

Field names below are the stable operator-facing names expected by the S1 registry example unless explicitly marked as view-only or later-wave. Use Feishu field types closest to the suggestions.

### 3.1 `Room Ledger`

Purpose: room-state truth for frontdesk, housekeeping, engineering, and manager views.

| Field | Type suggestion | Required | Notes |
|---|---|---:|---|
| `RoomNumber` | Text | yes | Unique room key; examples: `0301`, `A-1208`. |
| `Store` | Single select / Link | optional | Use when one Base covers multiple properties. |
| `Floor` | Single select / Text | yes | Used to group the room wall. |
| `RoomType` | Single select / Link | yes | Standard, king, suite, etc. |
| `OccupancyStatus` | Single select | yes | `Vacant`, `Arrival`, `InHouse`, `Departure`. |
| `CleaningStatus` | Single select | yes | `Clean`, `Dirty`, `Cleaning`, `Inspection`, `Rework`. |
| `SellableStatus` | Single select | yes | `Sellable`, `StopSellMaintenance`, `StopSellHold`, `StopSellOwner`. |
| `RoomCode` | Formula / Single select | yes | Derived PMS code: `VC`, `VD`, `OC`, `OD`, `ARR`, `DEP`, `CLN`, `INS`, `OOO`, `OOS`. |
| `CurrentReservationCode` | Text / Link | optional | Link to `Reservations.ReservationCode` when occupied/assigned. |
| `TodayArrival` | Checkbox / Formula | optional | View helper based on reservations. |
| `TodayDeparture` | Checkbox / Formula | optional | View helper based on reservations. |
| `MaintenanceNote` | Long text | optional | Short visible reason for stop-sell rooms. |
| `HousekeepingTaskStatus` | Lookup / Single select | optional | Current open housekeeping task state. |
| `LastReason` | Long text | yes | Human-readable reason for last operator change. |
| `LastOperator` | Text / Person | yes | Operator identity; avoid untrusted free-form values when possible. |
| `LastUpdatedAt` | Date time | yes | Sort and audit helper. |

Uniqueness: `RoomNumber` must be unique inside one property. If multi-property, uniqueness is `Store + RoomNumber`.

### 3.2 `PMS Operation Requests`

Purpose: managed smart-intake destination for `adapter-feishu` S1 formKeys. This is the first table that receives records from `/providers/form-webhook`.

| Field | Type suggestion | Required | Notes |
|---|---|---:|---|
| `RequestId` | Text | optional | Optional display ID; can mirror `ClientToken` through automation. |
| `ClientToken` | Text | yes | UUIDv4 idempotency key from caller; may be populated by a form field or automation. |
| `Source` | Single select / Text | yes | Fixed by registry: `adapter-feishu-pms-smart-intake`. |
| `Ingress` | Text | yes | Fixed by registry: `formKey:<formKey>`. |
| `Action` | Single select | yes | Fixed by registry; initial values: `CHECK_OUT`, `REPORT_MAINTENANCE`, `HOUSEKEEPING_DONE`. |
| `Status` | Single select | yes | Initial default `Pending`; allowed: `Pending`, `Processing`, `Done`, `Failed`, `NeedsManualReview`. |
| `RoomNumber` | Text / Link | yes | Business room key. |
| `Operator` | Text / Person | yes | Submitter identity or service account label. |
| `ReservationCode` | Text / Link | conditional | Required for checkout when known. |
| `RequestedAt` | Date time | conditional | Checkout or housekeeping completion time. |
| `Reason` | Long text | conditional | Required for checkout and high-risk actions. |
| `Category` | Single select | conditional | Maintenance category: `HVAC`, `Plumbing`, `Electric`, `Network`, `DoorLock`, `Other`. |
| `Severity` | Single select | conditional | `Low`, `Medium`, `High`, `StopSell`. |
| `Description` | Long text | conditional | Required for maintenance reports. |
| `StopSellRequested` | Checkbox | optional | Maintenance report asks manager/engineering to stop sell. |
| `AttachmentUrl` | URL / Attachment | optional | Link to photo; avoid storing sensitive documents. |
| `TaskId` | Text / Link | conditional | Housekeeping task reference when completion is submitted. |
| `Result` | Single select / Text | conditional | Housekeeping result, e.g. `Done`, `NeedsInspection`, `IssueFound`. |
| `InspectionRequired` | Checkbox | optional | Whether supervisor inspection is needed. |
| `Notes` | Long text | optional | Non-sensitive operator notes. |
| `PayloadJSON` | Long text | optional | Sanitized original request; never include full ID docs/payment data. |
| `ResultJSON` | Long text | optional | Later automation/workflow result. |
| `ErrorCode` | Text | optional | Stable adapter or automation error code. |
| `SchemaVersion` | Text | yes | Fixed by registry: `pms-smart-intake-v1`. |
| `CreatedAt` | Created time | yes | Feishu system field. |
| `ProcessedAt` | Date time | optional | Set by automation/workflow after handling. |

Uniqueness: `ClientToken` should be unique. For adapter dedupe, uniqueness is effectively target table plus `clientToken`; keep a Base-level view that highlights duplicate `ClientToken` values.

### 3.3 `Housekeeping Tasks`

Purpose: operational task board for room cleaning, inspection, and rework. S2 does not require adapter to create these tasks; Base automation or later waves may derive them from operation requests.

| Field | Type suggestion | Required | Notes |
|---|---|---:|---|
| `TaskId` | Text | yes | Unique task key, e.g. `HK-YYYYMMDD-001`. |
| `RoomNumber` | Text / Link | yes | Link to `Room Ledger`. |
| `TaskType` | Single select | yes | `CheckoutClean`, `StayoverClean`, `Turndown`, `Rework`, `Inspection`. |
| `Status` | Single select | yes | `PendingAssign`, `Assigned`, `Cleaning`, `Inspection`, `Done`, `Rework`. |
| `Priority` | Single select | yes | `Low`, `Medium`, `High`, `Urgent`. |
| `AssignedTo` | Person / Text | optional | Housekeeper. |
| `StartedAt` | Date time | optional | SLA start. |
| `FinishedAt` | Date time | optional | SLA end. |
| `Inspector` | Person / Text | optional | Supervisor. |
| `IssueNote` | Long text | optional | Rework/exception note. |
| `PhotoUrl` | URL / Attachment | optional | Avoid sensitive guest content. |
| `SourceRequestId` | Text / Link | optional | Link to `PMS Operation Requests`. |

Uniqueness: `TaskId`.

### 3.4 `Maintenance Tickets`

Purpose: engineering tickets and stop-sell rationale.

| Field | Type suggestion | Required | Notes |
|---|---|---:|---|
| `TicketId` | Text | yes | Unique ticket key, e.g. `MT-YYYYMMDD-001`. |
| `RoomNumber` | Text / Link | conditional | Required for room issue; optional for public-area issue. |
| `Category` | Single select | yes | `HVAC`, `Plumbing`, `Electric`, `Network`, `DoorLock`, `Other`. |
| `Severity` | Single select | yes | `Low`, `Medium`, `High`, `StopSell`. |
| `StopSell` | Checkbox | yes | If true, room may appear in maintenance stop-sell view. |
| `Status` | Single select | yes | `Open`, `InProgress`, `PendingAcceptance`, `Done`, `Cancelled`. |
| `Description` | Long text | yes | Problem description. |
| `Reporter` | Text / Person | yes | Submitter. |
| `Assignee` | Person / Text | optional | Engineering owner. |
| `ExpectedRecoveryAt` | Date time | optional | Manager visibility for stop-sell recovery. |
| `ResolvedAt` | Date time | optional | Completion time. |
| `AttachmentUrl` | URL / Attachment | optional | Issue photo, not guest ID/payment data. |
| `SourceRequestId` | Text / Link | optional | Link to operation request. |

Uniqueness: `TicketId`.

### 3.5 `Reservations`

Purpose: arrivals, departures, in-house context, and room assignment; not a payment or OTA source of truth.

| Field | Type suggestion | Required | Notes |
|---|---|---:|---|
| `ReservationCode` | Text | yes | Unique reservation/order key. |
| `Channel` | Single select | optional | `Direct`, `OTA`, `Corporate`, `Group`, `Other`; do not implement OTA sync here. |
| `GuestDisplayName` | Text | conditional | Use masked or display name only. |
| `PhoneLast4` | Text | optional | Last 4 digits only; do not store complete phone by default. |
| `ArrivalDate` | Date | yes | Arrival filter. |
| `DepartureDate` | Date | yes | Departure filter. |
| `RoomType` | Single select / Link | yes | Booked room type. |
| `RoomNumber` | Text / Link | optional | Assigned room. |
| `Status` | Single select | yes | `Booked`, `InHouse`, `CheckedOut`, `Cancelled`, `NoShow`. |
| `RatePublic` | Number / Currency | optional | Optional summary only; do not store full payment method/card. |
| `Notes` | Long text | optional | Non-sensitive notes. |

Uniqueness: `ReservationCode`.

### 3.6 `Operation Logs`

Purpose: audit trail for adapter writes, Base automations, and human corrections.

| Field | Type suggestion | Required | Notes |
|---|---|---:|---|
| `LogId` | Text | yes | Unique log key. |
| `OccurredAt` | Date time | yes | Audit time. |
| `Source` | Single select / Text | yes | `adapter-feishu`, `feishu_form`, `base_automation`, `manual`. |
| `Action` | Text / Single select | yes | Action name. |
| `ClientToken` | Text | optional | Correlates with adapter request. |
| `Operator` | Text / Person | yes | Actor. |
| `RoomNumber` | Text / Link | optional | Affected room. |
| `Reason` | Long text | conditional | Required for manual/high-risk changes. |
| `BeforeJSON` | Long text | optional | Sanitized previous state. |
| `AfterJSON` | Long text | optional | Sanitized resulting state. |
| `Result` | Single select | yes | `Accepted`, `Rejected`, `Done`, `Failed`. |
| `ErrorCode` | Text | optional | Stable code for failure. |

Uniqueness: `LogId`.

### 3.7 `Inventory Calendar`

Purpose: room-type/date inventory view for simple sellable-room planning; not a revenue-management or OTA sync module.

| Field | Type suggestion | Required | Notes |
|---|---|---:|---|
| `InventoryDate` | Date | yes | Calendar date. |
| `RoomType` | Single select / Link | yes | Room type. |
| `TotalRooms` | Number | yes | Physical rooms of this type. |
| `OutOfOrderRooms` | Number / Rollup | yes | Maintenance stop-sell count. |
| `ReservedRooms` | Number / Rollup | yes | Booked/assigned count. |
| `OccupiedRooms` | Number / Rollup | yes | In-house count. |
| `SellableRooms` | Formula / Number | yes | `TotalRooms - OutOfOrderRooms - ReservedRooms` or property-specific rule. |
| `Notes` | Long text | optional | Manager notes. |

Uniqueness: `InventoryDate + RoomType`.

## 4. View contract

Create these views before smoke testing. Each view should expose only the minimal fields listed here; add role-specific detail views separately if needed.

| View | Table | Purpose | Minimal visible fields | Filter / grouping guidance |
|---|---|---|---|---|
| `Frontdesk Room Wall` | `Room Ledger` | Main room-state wall for frontdesk decisions. | `RoomNumber`, `Floor`, `RoomType`, `RoomCode`, `OccupancyStatus`, `CleaningStatus`, `SellableStatus`, `TodayArrival`, `TodayDeparture`, `MaintenanceNote`, `HousekeepingTaskStatus` | Group by `Floor`; sort by `RoomNumber`; no full guest documents. |
| `Today Arrivals` | `Reservations` | Rooms/orders expected to arrive today. | `ReservationCode`, `GuestDisplayName`, `PhoneLast4`, `ArrivalDate`, `RoomType`, `RoomNumber`, `Status` | `ArrivalDate = today` and status in `Booked`, `InHouse`; frontdesk/manager only. |
| `Today Departures` | `Reservations` | Checkout workload and departure tracking. | `ReservationCode`, `GuestDisplayName`, `PhoneLast4`, `DepartureDate`, `RoomNumber`, `Status` | `DepartureDate = today` and status in `InHouse`, `CheckedOut`; frontdesk/manager only. |
| `Sellable Rooms` | `Room Ledger` | Fast list of VC/sellable rooms. | `RoomNumber`, `Floor`, `RoomType`, `RoomCode`, `CleaningStatus`, `SellableStatus` | `OccupancyStatus = Vacant`, `CleaningStatus = Clean`, `SellableStatus = Sellable`. |
| `Dirty Rooms` | `Room Ledger` | Rooms needing cleaning or rework. | `RoomNumber`, `Floor`, `RoomType`, `CleaningStatus`, `HousekeepingTaskStatus`, `LastUpdatedAt` | `CleaningStatus in Dirty, Rework`; housekeeping/frontdesk. |
| `Inspection Queue` | `Housekeeping Tasks` | Supervisor rooms waiting for inspection. | `TaskId`, `RoomNumber`, `TaskType`, `Status`, `AssignedTo`, `FinishedAt`, `Inspector`, `IssueNote` | `Status = Inspection`; group by `Inspector` or `Floor`. |
| `Cleaning In Progress` | `Housekeeping Tasks` | Active housekeeping workload. | `TaskId`, `RoomNumber`, `TaskType`, `Status`, `AssignedTo`, `StartedAt`, `Priority` | `Status in Assigned, Cleaning`; housekeeper sees assigned rows only. |
| `Maintenance Stop-Sell` | `Maintenance Tickets` | Engineering stop-sell / OOO monitor. | `TicketId`, `RoomNumber`, `Category`, `Severity`, `StopSell`, `Status`, `ExpectedRecoveryAt`, `Assignee`, `Description` | `StopSell = true` and status not in `Done`, `Cancelled`; manager/engineering. |
| `Exceptions` | `PMS Operation Requests` plus task/ticket detail views | Intake and workflow records requiring manual attention. | `CreatedAt`, `ClientToken`, `Action`, `Status`, `RoomNumber`, `Operator`, `ErrorCode`, `Reason`, `Notes` | `Status in Failed, NeedsManualReview` or `ErrorCode is not empty`; manager/frontdesk lead. |

Optional manager dashboard cards may summarize total rooms, sellable rooms, dirty rooms, OOO rooms, today arrivals/departures, overdue housekeeping tasks, and open stop-sell tickets. Those dashboard cards are not required for S2 completion.

## 5. Permissions and sensitivity notes

### 5.1 Suggested roles

| Role | Read | Write | Notes |
|---|---|---|---|
| `Base Admin` | All tables | Schema/config only | Small trusted group. |
| `Manager` | All operational views | Approvals, exception status, maintenance stop-sell notes | Can see reason fields and sanitized JSON. |
| `Frontdesk` | Room wall, arrivals/departures, operation requests | Submit checkout and frontdesk intake; do not edit engineering acceptance fields | No full identity document or payment data. |
| `Housekeeping` | Assigned housekeeping tasks, dirty/cleaning/inspection views | Task status, finish notes, photos | Row-level filtering to assigned tasks where possible. |
| `Engineering` | Maintenance tickets and stop-sell rooms | Ticket status, expected recovery, completion notes | Cannot mark room `VC` directly after maintenance. |
| `Auditor` | Operation logs and exceptions | None or comments only | For review/export. |

### 5.2 Sensitive fields

- `GuestDisplayName`: use masked/display name; avoid full legal identity unless a separate compliance design exists.
- `PhoneLast4`: store last four digits only by default; avoid full phone number in v1.
- Identity documents, passport/ID card numbers, police-upload data, full payment cards, invoices, and deposits are out of scope and must not be stored in this schema.
- `Operator`, `Reporter`, `AssignedTo`, and `Inspector` are operational identity fields; restrict write access to prevent impersonation.
- `Reason`, `Description`, `IssueNote`, and `Notes` can contain sensitive text; make them manager/frontdesk-lead visible, not public hotel-wide views.
- `PayloadJSON`, `ResultJSON`, `BeforeJSON`, and `AfterJSON` must be sanitized. Never place app secrets, tenant tokens, payment data, or complete guest documents in JSON fields.
- Role-based views should hide `Reason`, JSON fields, and guest display details from housekeeping/engineering unless needed for the task.

## 6. Managed formKey mapping

These mappings must match the server-side managed registry derived from `config/pms-form-bindings.example.json`. Callers send only `formKey`, `clientToken`, and `fields`; callers do not send `target`.

| formKey | Target table | Fixed `Action` | Required fields | Optional fields | Stable adapter error expectations |
|---|---|---|---|---|---|
| `pms-checkout` | `PMS Operation Requests` | `CHECK_OUT` | `roomNumber`, `operator`, `checkoutAt`, `reason` | `reservationCode`, `notes` | `target_not_allowed_for_managed_form` if caller sends `target`; `field_not_mapped:<name>` for unmapped fields; `fixed_field_conflict:Source/Ingress/Action/SchemaVersion` if caller tries to override fixed fields; `form_key_unknown:pms-checkout` only if registry not deployed; `schema_validation_failed` if Feishu schema preflight fails; `record_create_failed` if Feishu record create fails. |
| `pms-maintenance-report` | `PMS Operation Requests` | `REPORT_MAINTENANCE` | `roomNumber`, `reporter`, `category`, `severity`, `description` | `stopSell`, `photoUrl`, `notes` | Same managed-target shielding and mapping errors; schema preflight should catch missing/renamed Feishu fields. |
| `pms-housekeeping-done` | `PMS Operation Requests` | `HOUSEKEEPING_DONE` | `roomNumber`, `operator`, `finishedAt`, `result` | `taskId`, `inspectionRequired`, `notes` | Same managed-target shielding and mapping errors; duplicate `clientToken` is ignored by adapter dedupe for the same target table. |

### 6.1 Registry-to-table field compatibility

The initial S1 registry maps business keys to these `PMS Operation Requests` fields:

| Business key | Feishu field |
|---|---|
| `roomNumber` | `RoomNumber` |
| `operator` / `reporter` | `Operator` |
| `reservationCode` | `ReservationCode` |
| `checkoutAt` / `finishedAt` | `RequestedAt` |
| `reason` | `Reason` |
| `category` | `Category` |
| `severity` | `Severity` |
| `description` | `Description` |
| `stopSell` | `StopSellRequested` |
| `photoUrl` | `AttachmentUrl` |
| `taskId` | `TaskId` |
| `result` | `Result` |
| `inspectionRequired` | `InspectionRequired` |
| `notes` | `Notes` |

Fixed fields injected by the server-side registry are `Source`, `Ingress`, `Action`, and `SchemaVersion`. Operators must create those fields in `PMS Operation Requests` before schema preflight is enabled.

## 7. Sandbox smoke readiness checklist

A human operator can create a sandbox Base from this document without reading the PRD when all checks below pass:

- All seven tables exist: `Room Ledger`, `PMS Operation Requests`, `Housekeeping Tasks`, `Maintenance Tickets`, `Reservations`, `Operation Logs`, and `Inventory Calendar`.
- `PMS Operation Requests` contains every field referenced by the three formKey mappings and fixed fields.
- The required views exist and hide sensitive columns by role.
- The three form views exist over `PMS Operation Requests` and only collect the business fields listed in section 6.
- Deployment secrets or a non-git registry contain the real `appToken`, `tableId`, and `formId`; git contains only placeholder examples.
- A local or sandbox request uses only:

```json
{
  "formKey": "pms-checkout",
  "clientToken": "00000000-0000-4000-8000-000000000001",
  "fields": {
    "roomNumber": "0301",
    "operator": "frontdesk-a",
    "checkoutAt": "2026-04-24T11:30:00+08:00",
    "reason": "guest checked out"
  }
}
```

Expected adapter behavior for the request above is a managed record create into `PMS Operation Requests`; it must not create or patch Base schema, change room state, create housekeeping tasks, or execute a PMS workflow inside `adapter-feishu`.
