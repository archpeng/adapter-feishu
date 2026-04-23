import { describe, expect, it } from 'vitest';
import { createTableWriteQueue } from '../../src/state/tableWriteQueue.js';

describe('createTableWriteQueue', () => {
  it('serializes operations for the same appToken/tableId scope and clears bounded state after completion', async () => {
    const queue = createTableWriteQueue();
    const order: string[] = [];
    let releaseFirst = () => undefined;

    const first = queue.run(
      {
        appToken: 'app_token_1',
        tableId: 'tbl_1'
      },
      async () => {
        order.push('first:start');
        await new Promise<void>((resolve) => {
          releaseFirst = () => {
            order.push('first:end');
            resolve();
          };
        });
        return 'first';
      }
    );

    const second = queue.run(
      {
        appToken: 'app_token_1',
        tableId: 'tbl_1'
      },
      async () => {
        order.push('second:start');
        order.push('second:end');
        return 'second';
      }
    );

    await Promise.resolve();

    expect(order).toEqual(['first:start']);
    expect(queue.listActiveScopes()).toEqual(['app_token_1:tbl_1']);

    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    expect(queue.listActiveScopes()).toEqual([]);
  });

  it('allows different table scopes to proceed independently', async () => {
    const queue = createTableWriteQueue();
    const order: string[] = [];
    let releaseFirst = () => undefined;

    const first = queue.run(
      {
        appToken: 'app_token_1',
        tableId: 'tbl_1'
      },
      async () => {
        order.push('first:start');
        await new Promise<void>((resolve) => {
          releaseFirst = () => {
            order.push('first:end');
            resolve();
          };
        });
        return 'first';
      }
    );

    const second = queue.run(
      {
        appToken: 'app_token_1',
        tableId: 'tbl_2'
      },
      async () => {
        order.push('second:start');
        order.push('second:end');
        return 'second';
      }
    );

    await Promise.resolve();

    expect(order).toContain('first:start');
    expect(order).toContain('second:start');
    expect(order.indexOf('second:start')).toBeGreaterThanOrEqual(0);

    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
  });
});
