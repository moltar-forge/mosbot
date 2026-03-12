jest.mock('../openclawGatewayClient', () => ({
  sessionsHistory: jest.fn(),
  sessionsHistoryViaWs: jest.fn(),
  sessionsListAllViaWs: jest.fn(),
}));

jest.mock('../openclawWorkspaceClient', () => ({
  getFileContent: jest.fn(),
}));

const {
  sessionsHistory,
  sessionsHistoryViaWs,
  sessionsListAllViaWs,
} = require('../openclawGatewayClient');
const { getFileContent } = require('../openclawWorkspaceClient');
const { getSessionMessagesData } = require('../sessionMessageService');

describe('sessionMessageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getFileContent.mockResolvedValue('');
    sessionsListAllViaWs.mockResolvedValue({ sessions: [] });
  });

  it('requires session key', async () => {
    await expect(
      getSessionMessagesData({
        userId: 'u1',
        sessionId: 's1',
        sessionKey: '',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('reads cron-run transcript from JSONL when key matches run format', async () => {
    getFileContent.mockResolvedValueOnce(
      '{"type":"message","timestamp":"2026-03-10T10:00:00.000Z","message":{"role":"assistant","content":"Run complete"}}\n',
    );

    sessionsListAllViaWs.mockResolvedValueOnce({
      sessions: [
        {
          sessionId: 's1',
          key: 'agent:main:cron:daily:run:abc',
          label: 'Daily Run',
          kind: 'cron',
          updatedAt: new Date().toISOString(),
          contextTokens: 100,
          totalTokens: 10,
        },
      ],
    });

    const data = await getSessionMessagesData({
      userId: 'u1',
      sessionId: 's1',
      sessionKey: 'agent:main:cron:daily:run:abc',
      limit: 20,
      includeTools: false,
    });

    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].content).toContain('Run complete');
    expect(data.session.kind).toBe('cron');
  });

  it('returns transformed messages from websocket history', async () => {
    sessionsHistoryViaWs.mockResolvedValueOnce({
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
          provider: 'openrouter',
          model: 'anthropic/claude-sonnet-4.5',
          timestamp: 123,
        },
      ],
    });

    const data = await getSessionMessagesData({
      userId: 'u1',
      sessionId: 's1',
      sessionKey: 'agent:main:main',
      limit: 20,
      includeTools: false,
    });

    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].content).toContain('Hello');
  });

  it('uses tool fallback and supports details.messages shape', async () => {
    sessionsHistoryViaWs.mockRejectedValueOnce(new Error('ws down'));
    sessionsHistory.mockResolvedValueOnce({
      details: {
        messages: [
          {
            role: 'assistant',
            content: 'Fallback response',
            provider: 'openrouter',
            model: 'anthropic/claude-sonnet-4.5',
          },
        ],
      },
    });

    const data = await getSessionMessagesData({
      userId: 'u1',
      sessionId: 's1',
      sessionKey: 'agent:main:main',
      limit: 20,
      includeTools: true,
    });

    expect(data.messages).toHaveLength(1);
    expect(data.messages[0].content).toContain('Fallback response');
  });

  it('returns AGENT_TO_AGENT_DISABLED when tool fallback is forbidden', async () => {
    sessionsHistoryViaWs.mockRejectedValueOnce(new Error('ws down'));
    sessionsHistory.mockResolvedValueOnce({
      details: {
        status: 'forbidden',
        error: 'disabled',
      },
    });

    await expect(
      getSessionMessagesData({
        userId: 'u1',
        sessionId: 's1',
        sessionKey: 'agent:main:main',
        limit: 20,
        includeTools: true,
      }),
    ).rejects.toMatchObject({ code: 'AGENT_TO_AGENT_DISABLED', status: 403 });
  });

  it('handles unexpected tool fallback object by returning empty messages', async () => {
    sessionsHistoryViaWs.mockRejectedValueOnce(new Error('ws down'));
    sessionsHistory.mockResolvedValueOnce({ unexpected: true });

    const data = await getSessionMessagesData({
      userId: 'u1',
      sessionId: 's1',
      sessionKey: 'agent:main:main',
      limit: 20,
      includeTools: true,
    });

    expect(data.messages).toEqual([]);
  });
});
