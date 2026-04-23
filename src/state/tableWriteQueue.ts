import type { BitableTableTarget } from '../channels/feishu/bitableClient.js';

export interface TableWriteQueue {
  run<T>(target: BitableTableTarget, operation: () => Promise<T>): Promise<T>;
  listActiveScopes(): string[];
}

export function createTableWriteQueue(): TableWriteQueue {
  const tails = new Map<string, Promise<void>>();

  return {
    async run<T>(target: BitableTableTarget, operation: () => Promise<T>) {
      const scopeKey = toScopeKey(target);
      const previous = tails.get(scopeKey);
      let execution: Promise<unknown>;

      if (previous) {
        execution = previous.catch(() => undefined).then(operation);
      } else {
        try {
          execution = Promise.resolve(operation());
        } catch (error) {
          execution = Promise.reject(error);
        }
      }

      const settled = execution.then(
        () => undefined,
        () => undefined
      );

      tails.set(scopeKey, settled);

      try {
        return (await execution) as T;
      } finally {
        if (tails.get(scopeKey) === settled) {
          tails.delete(scopeKey);
        }
      }
    },
    listActiveScopes() {
      return [...tails.keys()];
    }
  };
}

function toScopeKey(target: BitableTableTarget): string {
  return `${target.appToken}:${target.tableId}`;
}
