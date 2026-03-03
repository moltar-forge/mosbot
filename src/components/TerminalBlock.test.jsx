import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TerminalBlock from './TerminalBlock';

describe('TerminalBlock', () => {
  it('renders terminal content', () => {
    const content = 'ls -la';
    render(<TerminalBlock content={content} />);

    expect(screen.getByText('ls -la')).toBeInTheDocument();
  });

  it('renders multiple lines', () => {
    const content = 'line 1\nline 2\nline 3';
    render(<TerminalBlock content={content} />);

    expect(screen.getByText('line 1')).toBeInTheDocument();
    expect(screen.getByText('line 2')).toBeInTheDocument();
    expect(screen.getByText('line 3')).toBeInTheDocument();
  });

  it('renders terminal header', () => {
    const content = 'test output';
    render(<TerminalBlock content={content} />);

    expect(screen.getByText('Terminal')).toBeInTheDocument();
  });

  it('handles non-string content', () => {
    const content = 12345;
    render(<TerminalBlock content={content} />);

    expect(screen.getByText('12345')).toBeInTheDocument();
  });

  it('handles object content', () => {
    const content = { toString: () => 'object output' };
    render(<TerminalBlock content={content} />);

    expect(screen.getByText('object output')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const content = 'test';
    const { container } = render(<TerminalBlock content={content} className="custom-class" />);

    const div = container.firstChild;
    expect(div).toHaveClass('custom-class');
  });

  it('has correct data attribute', () => {
    const content = 'test output';
    const { container } = render(<TerminalBlock content={content} />);

    const div = container.firstChild;
    expect(div).toHaveAttribute('data-block-type', 'terminal');
  });

  it('renders empty content', () => {
    const content = '';
    const { container } = render(<TerminalBlock content={content} />);

    const pre = container.querySelector('pre');
    expect(pre).toBeInTheDocument();
  });

  it('renders content with special characters', () => {
    const content = '$ npm install\n> Installing...\n✓ Done';
    render(<TerminalBlock content={content} />);

    expect(screen.getByText(/\$ npm install/i)).toBeInTheDocument();
  });

  it('preserves line breaks', () => {
    const content = 'line1\nline2';
    const { container } = render(<TerminalBlock content={content} />);

    const pre = container.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre.textContent).toContain('line1');
    expect(pre.textContent).toContain('line2');
  });
});
