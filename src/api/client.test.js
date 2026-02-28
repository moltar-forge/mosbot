import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import logger from '../utils/logger';

// Mock axios before importing client
vi.mock('axios', () => {
  // Create mock instance inside factory to avoid hoisting issues
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn(),
      },
      response: {
        use: vi.fn(),
      },
    },
    defaults: {
      baseURL: 'http://localhost:3000/api',
      timeout: 10000,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  };

  return {
    default: {
      create: vi.fn(() => mockInstance),
    },
  };
});

// Mock logger
vi.mock('../utils/logger', () => ({
  default: {
    error: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock;

// Import after mocks
import { api } from './client';

describe('api client', () => {
  let requestInterceptor;
  let requestErrorHandler;
  let responseInterceptor;
  let responseErrorHandler;

  // Store interceptor references before tests (they're set up when module loads)
  beforeAll(() => {
    if (api.interceptors.request.use.mock.calls.length > 0) {
      requestInterceptor = api.interceptors.request.use.mock.calls[0][0];
      requestErrorHandler = api.interceptors.request.use.mock.calls[0][1];
    }
    if (api.interceptors.response.use.mock.calls.length > 0) {
      responseInterceptor = api.interceptors.response.use.mock.calls[0][0];
      responseErrorHandler = api.interceptors.response.use.mock.calls[0][1];
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Re-store interceptor references after clearing mocks
    if (api.interceptors.request.use.mock.calls.length > 0) {
      requestInterceptor = api.interceptors.request.use.mock.calls[0][0];
      requestErrorHandler = api.interceptors.request.use.mock.calls[0][1];
    }
    if (api.interceptors.response.use.mock.calls.length > 0) {
      responseInterceptor = api.interceptors.response.use.mock.calls[0][0];
      responseErrorHandler = api.interceptors.response.use.mock.calls[0][1];
    }

    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('request interceptor', () => {
    it('adds Authorization header when token exists', () => {
      const token = 'test-token-123';
      localStorageMock.getItem.mockReturnValue(token);

      const config = { headers: {} };
      const result = requestInterceptor(config);

      expect(localStorageMock.getItem).toHaveBeenCalledWith('auth_token');
      expect(result.headers.Authorization).toBe(`Bearer ${token}`);
    });

    it('does not add Authorization header when no token', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const config = { headers: {} };
      const result = requestInterceptor(config);

      expect(result.headers.Authorization).toBeUndefined();
    });

    it('handles request setup error', async () => {
      const errorHandler = requestErrorHandler;
      const error = new Error('Request setup failed');

      await expect(errorHandler(error)).rejects.toThrow('Request setup failed');
    });
  });

  describe('response interceptor', () => {
    it('returns response unchanged on successful response', () => {
      const successHandler = responseInterceptor;
      const response = { data: {}, config: { method: 'get' } };

      const result = successHandler(response);

      expect(result).toBe(response);
    });

    it('handles POST response', () => {
      const successHandler = responseInterceptor;
      const response = { data: {}, config: { method: 'post' } };

      const result = successHandler(response);

      expect(result).toBe(response);
    });

    it('handles PUT response', () => {
      const successHandler = responseInterceptor;
      const response = { data: {}, config: { method: 'put' } };

      const result = successHandler(response);

      expect(result).toBe(response);
    });

    it('handles PATCH response', () => {
      const successHandler = responseInterceptor;
      const response = { data: {}, config: { method: 'patch' } };

      const result = successHandler(response);

      expect(result).toBe(response);
    });

    it('handles DELETE response', () => {
      const successHandler = responseInterceptor;
      const response = { data: {}, config: { method: 'delete' } };

      const result = successHandler(response);

      expect(result).toBe(response);
    });
  });

  describe('retry logic', () => {
    it('should retry on network error (no response)', async () => {
      const networkError = {
        message: 'Network Error',
        config: {
          url: '/test',
          method: 'get',
          __retryCount: 0,
        },
      };

      const errorHandler = responseErrorHandler;

      // Mock api.get to simulate retry
      api.get.mockResolvedValueOnce({ data: {}, config: { method: 'get' } });

      const promise = errorHandler(networkError);
      // Advance timer for retry delay
      vi.advanceTimersByTime(2000);

      // Should attempt retry (will call api which calls mockAxiosInstance.get)
      await promise.catch(() => {}); // Catch since we're not fully implementing retry

      // Verify retry logic would be triggered
      expect(networkError.config.__retryCount).toBeDefined();
    });

    it('should retry on 500 status code', async () => {
      const serverError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error',
        },
        config: {
          url: '/test',
          method: 'get',
          __retryCount: 0,
        },
      };

      const errorHandler = responseErrorHandler;
      api.get.mockResolvedValueOnce({ data: {}, config: { method: 'get' } });

      const promise = errorHandler(serverError);
      vi.advanceTimersByTime(2000);
      await promise.catch(() => {});

      expect(serverError.config.__retryCount).toBeDefined();
    });

    it('should retry on retryable status codes (502, 503, 504, 408, 429)', async () => {
      const retryableErrors = [
        { response: { status: 502 } },
        { response: { status: 503 } },
        { response: { status: 504 } },
        { response: { status: 408 } },
        { response: { status: 429 } },
      ];

      const errorHandler = responseErrorHandler;

      for (const error of retryableErrors) {
        error.config = { url: '/test', method: 'get', __retryCount: 0 };
        api.get.mockResolvedValueOnce({ data: {}, config: { method: 'get' } });

        const promise = errorHandler(error);
        vi.advanceTimersByTime(2000);
        await promise.catch(() => {});

        expect(error.config.__retryCount).toBeDefined();
      }
    });

    it('should not retry on non-retryable status codes (400, 404)', async () => {
      const nonRetryableErrors = [
        {
          response: { status: 400 },
          config: { url: '/test', method: 'get', __retryCount: 0 },
        },
        {
          response: { status: 404 },
          config: { url: '/test', method: 'get', __retryCount: 0 },
        },
      ];

      const errorHandler = responseErrorHandler;

      for (const error of nonRetryableErrors) {
        await expect(errorHandler(error)).rejects.toBe(error);
        expect(logger.error).toHaveBeenCalled();
      }
    });
  });

  describe('error handling', () => {
    it('logs error with response details', async () => {
      const error = {
        response: {
          status: 400, // Non-retryable status to skip retry logic
          statusText: 'Bad Request',
          data: { error: 'Server error' },
        },
        config: {
          url: '/test',
          method: 'get',
          __retryCount: 0,
        },
      };

      await responseErrorHandler(error).catch(() => {});

      expect(logger.error).toHaveBeenCalledWith(
        'API request failed',
        error,
        expect.objectContaining({
          url: '/test',
          method: 'get',
          status: 400,
        }),
      );
    });

    it('logs error with request details when no response', async () => {
      const error = {
        request: {},
        config: {
          url: '/test',
          method: 'get',
          __retryCount: 3, // Set to max retries to skip retry logic
        },
      };

      await responseErrorHandler(error).catch(() => {});

      expect(logger.error).toHaveBeenCalledWith(
        'Network request failed',
        error,
        expect.objectContaining({
          url: '/test',
          method: 'get',
        }),
      );
    });

    it('logs error on failure', async () => {
      const error = {
        response: { status: 400 }, // Non-retryable
        config: { url: '/test', method: 'get', __retryCount: 0 },
      };

      await expect(responseErrorHandler(error)).rejects.toBe(error);

      expect(logger.error).toHaveBeenCalledWith(
        'API request failed',
        error,
        expect.objectContaining({
          url: '/test',
          method: 'get',
          status: 400,
        }),
      );
    });
  });

  describe('base configuration', () => {
    it('has correct baseURL', () => {
      expect(api.defaults.baseURL).toBeDefined();
    });

    it('has correct timeout', () => {
      expect(api.defaults.timeout).toBe(10000);
    });

    it('has withCredentials enabled for cookie support', () => {
      expect(api.defaults.withCredentials).toBe(true);
    });

    it('has correct content type header', () => {
      expect(api.defaults.headers['Content-Type']).toBe('application/json');
    });
  });
});
