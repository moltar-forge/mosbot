import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ToastContainer from './ToastContainer';
import { useToastStore } from '../stores/toastStore';

// Mock the toast store
vi.mock('../stores/toastStore', () => ({
  useToastStore: vi.fn(),
}));

describe('ToastContainer', () => {
  const mockHideToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders no toasts when store is empty', () => {
    useToastStore.mockReturnValue({
      toasts: [],
      hideToast: mockHideToast,
    });

    const { container } = render(<ToastContainer />);

    expect(container.querySelector('.fixed')).toBeInTheDocument();
    expect(screen.queryByText(/test/i)).not.toBeInTheDocument();
  });

  it('renders single toast', () => {
    useToastStore.mockReturnValue({
      toasts: [
        {
          id: '1',
          message: 'Test message',
          type: 'success',
          show: true,
        },
      ],
      hideToast: mockHideToast,
    });

    render(<ToastContainer />);

    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('renders multiple toasts', () => {
    useToastStore.mockReturnValue({
      toasts: [
        {
          id: '1',
          message: 'First message',
          type: 'success',
          show: true,
        },
        {
          id: '2',
          message: 'Second message',
          type: 'error',
          show: true,
        },
        {
          id: '3',
          message: 'Third message',
          type: 'info',
          show: true,
        },
      ],
      hideToast: mockHideToast,
    });

    render(<ToastContainer />);

    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
    expect(screen.getByText('Third message')).toBeInTheDocument();
  });

  it('calls hideToast with correct id when toast is closed', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    useToastStore.mockReturnValue({
      toasts: [
        {
          id: 'toast-123',
          message: 'Test message',
          type: 'success',
          show: true,
        },
      ],
      hideToast: mockHideToast,
    });

    render(<ToastContainer />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(mockHideToast).toHaveBeenCalledWith('toast-123');
  });

  it('does not render toasts that are hidden', () => {
    useToastStore.mockReturnValue({
      toasts: [
        {
          id: '1',
          message: 'Hidden toast',
          type: 'success',
          show: false,
        },
        {
          id: '2',
          message: 'Visible toast',
          type: 'success',
          show: true,
        },
      ],
      hideToast: mockHideToast,
    });

    render(<ToastContainer />);

    expect(screen.queryByText('Hidden toast')).not.toBeInTheDocument();
    expect(screen.getByText('Visible toast')).toBeInTheDocument();
  });

  it('renders toasts in correct order', () => {
    useToastStore.mockReturnValue({
      toasts: [
        {
          id: '1',
          message: 'First',
          type: 'success',
          show: true,
        },
        {
          id: '2',
          message: 'Second',
          type: 'success',
          show: true,
        },
      ],
      hideToast: mockHideToast,
    });

    render(<ToastContainer />);

    const messages = screen.getAllByText(/First|Second/);
    expect(messages[0]).toHaveTextContent('First');
    expect(messages[1]).toHaveTextContent('Second');
  });

  it('applies correct container styling', () => {
    useToastStore.mockReturnValue({
      toasts: [],
      hideToast: mockHideToast,
    });

    const { container } = render(<ToastContainer />);

    // Check for the fixed positioning and bottom-4, with responsive classes
    const containerElement = container.querySelector('.fixed.bottom-4');
    expect(containerElement).toBeInTheDocument();
    // Verify it has the responsive positioning classes
    expect(containerElement).toHaveClass('inset-x-4');
    expect(containerElement).toHaveClass('sm:left-auto');
    expect(containerElement).toHaveClass('sm:right-4');
  });
});
