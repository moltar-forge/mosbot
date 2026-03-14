function buildDeviceAuth(deviceId = 'device-1', deviceToken = 'device-token-1') {
  const crypto = require('crypto');
  const keyPair = crypto.generateKeyPairSync('ed25519');
  const publicKeyDer = keyPair.publicKey.export({ format: 'der', type: 'spki' });
  const publicKeyBytes = publicKeyDer.slice(12);
  const publicKeyB64 = publicKeyBytes.toString('base64url');

  return {
    deviceId,
    publicKey: publicKeyB64,
    privateKey: keyPair.privateKey,
    deviceToken,
  };
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('openclawGatewayClient persistent RPC mode', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPersistentOverride = process.env.OPENCLAW_WS_PERSISTENT_RPC;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.OPENCLAW_WS_PERSISTENT_RPC = originalPersistentOverride;
    jest.resetModules();
    jest.clearAllMocks();
  });

  function setupPersistentClient() {
    process.env.NODE_ENV = 'test';
    process.env.OPENCLAW_WS_PERSISTENT_RPC = 'true';
    jest.resetModules();

    const wsInstances = [];
    const WebSocketMock = jest.fn().mockImplementation(() => {
      const handlers = {};
      const ws = {
        on: jest.fn((event, handler) => {
          handlers[event] = handler;
        }),
        send: jest.fn(),
        close: jest.fn(),
        __handlers: handlers,
      };
      wsInstances.push(ws);
      return ws;
    });

    jest.doMock('ws', () => WebSocketMock);
    jest.doMock('../../config', () => ({
      openclaw: {
        gatewayUrl: 'http://test-gateway:18789',
        gatewayToken: null,
        gatewayTimeoutMs: 1000,
      },
    }));
    jest.doMock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }));
    jest.doMock('../openclawWorkspaceClient', () => ({
      getFileContent: jest.fn(),
    }));

    const client = require('../openclawGatewayClient');
    return { client, WebSocketMock, wsInstances };
  }

  function wireRpcResponses(ws) {
    ws.send.mockImplementation((payload) => {
      const message = JSON.parse(payload);
      if (message.method === 'connect') {
        setImmediate(() => {
          ws.__handlers.message?.(
            JSON.stringify({ type: 'res', id: message.id, ok: true, payload: {} }),
          );
        });
        return;
      }

      setImmediate(() => {
        ws.__handlers.message?.(
          JSON.stringify({
            type: 'res',
            id: message.id,
            ok: true,
            payload: { method: message.method },
          }),
        );
      });
    });
  }

  function emitConnectChallenge(ws, nonce = 'nonce-123') {
    ws.__handlers.open?.();
    ws.__handlers.message?.(
      JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce } }),
    );
  }

  it('reuses a single websocket for multiple RPC calls with same auth', async () => {
    const { client, WebSocketMock, wsInstances } = setupPersistentClient();
    const deviceAuth = buildDeviceAuth('device-1', 'token-1');

    const first = client.gatewayWsRpc('sessions.list', { limit: 1 }, { deviceAuth });
    await nextTick();
    expect(WebSocketMock).toHaveBeenCalledTimes(1);

    const ws1 = wsInstances[0];
    wireRpcResponses(ws1);
    emitConnectChallenge(ws1);
    await expect(first).resolves.toEqual({ method: 'sessions.list' });

    const second = client.gatewayWsRpc('sessions.list', { limit: 2 }, { deviceAuth });
    await expect(second).resolves.toEqual({ method: 'sessions.list' });

    expect(WebSocketMock).toHaveBeenCalledTimes(1);
  });

  it('reconnects with a new websocket when device auth changes', async () => {
    const { client, WebSocketMock, wsInstances } = setupPersistentClient();
    const authA = buildDeviceAuth('device-a', 'token-a');
    const authB = buildDeviceAuth('device-b', 'token-b');

    const first = client.gatewayWsRpc('sessions.list', {}, { deviceAuth: authA });
    await nextTick();
    expect(WebSocketMock).toHaveBeenCalledTimes(1);

    const ws1 = wsInstances[0];
    wireRpcResponses(ws1);
    emitConnectChallenge(ws1, 'nonce-a');
    await expect(first).resolves.toEqual({ method: 'sessions.list' });

    const second = client.gatewayWsRpc('sessions.list', {}, { deviceAuth: authB });
    await nextTick();
    expect(WebSocketMock).toHaveBeenCalledTimes(2);

    const ws2 = wsInstances[1];
    wireRpcResponses(ws2);
    emitConnectChallenge(ws2, 'nonce-b');
    await expect(second).resolves.toEqual({ method: 'sessions.list' });
  });
});
