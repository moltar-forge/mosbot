/**
 * Stub for @monaco-editor/react so tests can run when the package is not installed.
 * Real behavior is provided by vi.mock() in OpenClawConfigSettings.test.jsx.
 */
export default function MonacoEditorStub({ value, onChange, options = {} }) {
  return (
    <textarea
      data-testid="monaco-editor"
      value={value ?? ''}
      readOnly={options.readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}
