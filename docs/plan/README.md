# Repo Plan Control Plane

## Active Pack

- `docs/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_PLAN.md`
- `docs/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_STATUS.md`
- `docs/plan/adapter-feishu-form-webhook-poc-v1-2026-04-23_WORKSET.md`

## Current Active Slice

- `FW1.S1`

## Intended Handoff

- `execute-plan`

## Notes

- predecessor pack `adapter-feishu-standalone-multi-service-bootstrap-2026-04-19` remains closed and must not be reopened for this new workstream
- this successor pack is the single active control-plane truth for Feishu Base / form-backed record-write POC v1
- active slice ID must stay aligned with WORKSET `Active Stage` and any future routed `autopilot_report.stepId`
- this POC is bounded to writing records into an existing Feishu Base / table and optional form-schema preflight; it does not claim a full generic smart-form control plane
