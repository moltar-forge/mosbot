import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatCard from './StatCard';

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Cost" value="$12.50" />);
    expect(screen.getByText('Cost')).toBeInTheDocument();
    expect(screen.getByText('$12.50')).toBeInTheDocument();
  });

  it('renders sublabel when provided', () => {
    render(<StatCard label="Tokens" sublabel="Last 24h" value="1.2M" />);
    expect(screen.getByText('Tokens')).toBeInTheDocument();
    expect(screen.getByText('Last 24h')).toBeInTheDocument();
    expect(screen.getByText('1.2M')).toBeInTheDocument();
  });

  it('does not render sublabel when not provided', () => {
    render(<StatCard label="Sessions" value="42" />);
    expect(screen.getByText('Sessions')).toBeInTheDocument();
    expect(screen.queryByText('Last 24h')).not.toBeInTheDocument();
  });
});
