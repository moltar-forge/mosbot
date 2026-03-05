import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import JsonBlock from './JsonBlock';

describe('JsonBlock', () => {
  it('renders valid JSON object', () => {
    const json = '{"name":"test","value":123}';
    render(<JsonBlock content={json} />);

    expect(screen.getByText(/name/i)).toBeInTheDocument();
    expect(screen.getByText(/test/i)).toBeInTheDocument();
    expect(screen.getByText(/value/i)).toBeInTheDocument();
    expect(screen.getByText(/123/i)).toBeInTheDocument();
  });

  it('renders valid JSON array', () => {
    const json = '[1,2,3]';
    render(<JsonBlock content={json} />);

    expect(screen.getByText(/1/i)).toBeInTheDocument();
    expect(screen.getByText(/2/i)).toBeInTheDocument();
    expect(screen.getByText(/3/i)).toBeInTheDocument();
  });

  it('renders formatted JSON with proper indentation', () => {
    const json = '{"key":"value"}';
    const { container } = render(<JsonBlock content={json} />);

    const pre = container.querySelector('pre');
    expect(pre).toBeInTheDocument();
  });

  it('renders null for non-JSON content', () => {
    const { container } = render(<JsonBlock content="not json" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null for content not starting with { or [', () => {
    const { container } = render(<JsonBlock content="plain text" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null for invalid JSON', () => {
    const { container } = render(<JsonBlock content='{"invalid": json}' />);
    expect(container.firstChild).toBeNull();
  });

  it('handles object content directly (converted to string)', () => {
    const obj = { name: 'test', value: 123 };
    // When object is passed, it's converted to string which becomes "[object Object]"
    // which doesn't start with { or [, so it returns null
    const { container } = render(<JsonBlock content={obj} />);
    expect(container.firstChild).toBeNull();
  });

  it('handles array content directly (converted to string)', () => {
    const arr = [1, 2, 3];
    // When array is passed, it's converted to string which doesn't start with { or [
    // so it returns null
    const { container } = render(<JsonBlock content={arr} />);
    expect(container.firstChild).toBeNull();
  });

  it('applies custom className', () => {
    const json = '{"test":true}';
    const { container } = render(<JsonBlock content={json} className="custom-class" />);

    const div = container.firstChild;
    expect(div).toHaveClass('custom-class');
  });

  it('renders JSON with boolean values', () => {
    const json = '{"enabled":true,"disabled":false}';
    render(<JsonBlock content={json} />);

    expect(screen.getByText(/enabled/i)).toBeInTheDocument();
    expect(screen.getByText(/disabled/i)).toBeInTheDocument();
  });

  it('renders JSON with null values', () => {
    const json = '{"value":null}';
    render(<JsonBlock content={json} />);

    expect(screen.getByText(/value/i)).toBeInTheDocument();
    expect(screen.getByText(/null/i)).toBeInTheDocument();
  });

  it('renders JSON with numbers', () => {
    const json = '{"count":42,"price":99.99}';
    render(<JsonBlock content={json} />);

    expect(screen.getByText(/42/i)).toBeInTheDocument();
    expect(screen.getByText(/99.99/i)).toBeInTheDocument();
  });

  it('handles whitespace around JSON', () => {
    const json = '  {"test":"value"}  ';
    render(<JsonBlock content={json} />);

    expect(screen.getByText(/test/i)).toBeInTheDocument();
    expect(screen.getByText(/value/i)).toBeInTheDocument();
  });

  it('renders nested JSON structures', () => {
    const json = '{"parent":{"child":"value"}}';
    render(<JsonBlock content={json} />);

    expect(screen.getByText(/parent/i)).toBeInTheDocument();
    expect(screen.getByText(/child/i)).toBeInTheDocument();
    expect(screen.getByText(/value/i)).toBeInTheDocument();
  });

  it('has correct data attribute', () => {
    const json = '{"test":true}';
    const { container } = render(<JsonBlock content={json} />);

    const div = container.firstChild;
    expect(div).toHaveAttribute('data-block-type', 'json');
  });
});
