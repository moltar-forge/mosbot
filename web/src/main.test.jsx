import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRender = vi.fn();
const mockCreateRoot = vi.fn(() => ({
  render: mockRender,
}));

vi.mock('react-dom/client', () => ({
  default: {
    createRoot: mockCreateRoot,
  },
  createRoot: mockCreateRoot,
}));

vi.mock('./App.jsx', () => ({
  default: () => <div data-testid="mock-app">Mocked App</div>,
}));

vi.mock('./index.css', () => ({}));

describe('main.jsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('creates a root using #root and renders the app', async () => {
    const rootEl = document.getElementById('root');
    await import('./main.jsx');

    expect(mockCreateRoot).toHaveBeenCalledWith(rootEl);
    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});
