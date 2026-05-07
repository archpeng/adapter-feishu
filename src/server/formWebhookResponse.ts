import { createHash } from 'node:crypto';
import type { FeishuFormDefaultTargetConfig } from '../config.js';
import type { FormWebhookResponse } from './formWebhook.js';

export type FormWebhookTargetSource = 'default' | 'override' | 'managed';

export interface FormWebhookRedactedTargetShape {
  targetSource: FormWebhookTargetSource;
  targetConfigured: true;
  targetRefHash: string;
  rawTargetLogged: false;
}

export function redactedTargetResponseFields(
  targetSource: FormWebhookTargetSource,
  target: FeishuFormDefaultTargetConfig
): FormWebhookRedactedTargetShape {
  return {
    targetSource,
    targetConfigured: true,
    targetRefHash: hashFormTarget(target),
    rawTargetLogged: false
  };
}

export function duplicateIgnoredResponse(input: {
  clientToken: string;
  targetSource: FormWebhookTargetSource;
  target: FeishuFormDefaultTargetConfig;
}): FormWebhookResponse {
  return {
    statusCode: 202,
    body: {
      code: 0,
      status: 'duplicate_ignored',
      clientToken: input.clientToken,
      ...redactedTargetResponseFields(input.targetSource, input.target)
    }
  };
}

function hashFormTarget(target: FeishuFormDefaultTargetConfig): string {
  return createHash('sha256')
    .update(`${target.appToken}:${target.tableId}:${target.formId ?? ''}`)
    .digest('hex')
    .slice(0, 16);
}
