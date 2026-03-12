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
});
