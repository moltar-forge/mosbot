import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toast from './Toast';

describe('Toast', () => {
  it('renders toast message when shown', () => {
    render(<Toast show={true} message="Test message" onClose={vi.fn()} />);

    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('does not render when show is false', () => {
    render(<Toast show={false} message="Hidden message" onClose={vi.fn()} />);

    // Transition component may still render but content should not be visible
    expect(screen.queryByText('Hidden message')).not.toBeInTheDocument();
  });

  it('displays success icon for success type', () => {
    const { container } = render(
      <Toast show={true} message="Success" type="success" onClose={vi.fn()} />,
    );

    const icon = container.querySelector('.text-green-400');
    expect(icon).toBeInTheDocument();
  });

  it('displays error icon for error type', () => {
    render(<Toast show={true} message="Error" type="error" onClose={vi.fn()} />);

    const icon = document.querySelector('.text-red-400');
    expect(icon).toBeInTheDocument();
  });

  it('displays info icon for info type', () => {
    render(<Toast show={true} message="Info" type="info" onClose={vi.fn()} />);

    const icon = document.querySelector('.text-blue-400');
    expect(icon).toBeInTheDocument();
  });

  it('defaults to success type when type is not provided', () => {
    render(<Toast show={true} message="Default" onClose={vi.fn()} />);

    const icon = document.querySelector('.text-green-400');
    expect(icon).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<Toast show={true} message="Test" onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders close button', () => {
    render(<Toast show={true} message="Test" onClose={vi.fn()} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    expect(closeButton).toBeInTheDocument();
  });

  it('applies correct styling for success type', () => {
    const { container } = render(
      <Toast show={true} message="Success" type="success" onClose={vi.fn()} />,
    );

    const toast = container.querySelector('.border-green-500');
    expect(toast).toBeInTheDocument();
  });

  it('applies correct styling for error type', () => {
    const { container } = render(
      <Toast show={true} message="Error" type="error" onClose={vi.fn()} />,
    );

    const toast = container.querySelector('.border-red-500');
    expect(toast).toBeInTheDocument();
  });

  it('applies correct styling for info type', () => {
    const { container } = render(
      <Toast show={true} message="Info" type="info" onClose={vi.fn()} />,
    );

    const toast = container.querySelector('.border-blue-500');
    expect(toast).toBeInTheDocument();
  });

  it('handles long messages correctly', () => {
    const longMessage = 'A'.repeat(200);
    render(<Toast show={true} message={longMessage} onClose={vi.fn()} />);

    expect(screen.getByText(longMessage)).toBeInTheDocument();
  });

  it('handles empty message', () => {
    const { container } = render(<Toast show={true} message="" onClose={vi.fn()} />);

    // Empty message should still render the toast structure
    const toast = container.querySelector('.bg-green-900\\/90');
    expect(toast).toBeInTheDocument();
  });
});
