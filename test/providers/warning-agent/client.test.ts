import { describe, expect, it, vi } from 'vitest';
import { createWarningAgentClient } from '../../../src/providers/warning-agent/client.js';

describe('createWarningAgentClient', () => {
  it('fetches a completed warning-agent report payload from a configured endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          reportId: 'report-9',
          runId: 'wr_123',
          summary: 'cpu anomaly investigated'
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    );

    const client = createWarningAgentClient({
      baseUrl: 'https://warning-agent.local',
      fetchImpl
    });

    const payload = await client.fetchReport('report-9');

    expect(fetchImpl).toHaveBeenCalledWith('https://warning-agent.local/reports/report-9', {
      headers: {}
    });
    expect(payload).toEqual({
      reportId: 'report-9',
      runId: 'wr_123',
      summary: 'cpu anomaly investigated'
    });
  });
});
