import type { InboundTurn } from '../core/contracts.js';
import type { FeishuActorRole, FeishuTurnInput } from './contracts.js';

export function inboundTurnToFeishuTurnInput(turn: InboundTurn): FeishuTurnInput | undefined {
  const text = turn.text?.trim();
  const tenantId = turn.actor?.tenantKey ?? stringMetadata(turn, 'tenantKey') ?? turn.target.chatId;
  const sessionId = turn.target.chatId ?? turn.target.openId ?? turn.target.userId ?? turn.target.unionId;
  const messageId = turn.target.messageId ?? turn.turnId;
  const actorId = turn.actor?.openId ?? turn.actor?.userId ?? turn.actor?.tenantKey;

  if (!text || !tenantId || !sessionId || !messageId || !actorId) {
    return undefined;
  }

  return {
    channel: 'feishu',
    tenantId,
    sessionId,
    messageId,
    actor: {
      role: actorRole(turn),
      id: actorId,
      ...(turn.actor?.displayName ? { displayName: turn.actor.displayName } : {})
    },
    message: {
      text
    },
    receivedAt: turn.receivedAt
  };
}

function actorRole(turn: InboundTurn): FeishuActorRole {
  const value = stringMetadata(turn, 'actorRole');
  return value === 'staff' || value === 'admin' || value === 'internal' ? value : 'customer';
}

function stringMetadata(turn: InboundTurn, key: string): string | undefined {
  const value = turn.metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}
