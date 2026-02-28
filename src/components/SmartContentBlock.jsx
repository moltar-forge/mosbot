import { useMemo } from 'react';
import PropTypes from 'prop-types';
import JsonBlock from './JsonBlock';
import TerminalBlock from './TerminalBlock';

/**
 * Detects if content is valid JSON (object or array).
 * More strict: checks for JSON-like structure, not just starting with { or [
 */
function looksLikeJson(str) {
  const trimmed = typeof str === 'string' ? str.trim() : '';
  if (!trimmed || trimmed.length < 2) return false;

  // Must start with { or [
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;

  // For arrays starting with [, check if it looks like JSON array structure
  // (not just text with brackets like "[ Subagent Context ]")
  if (trimmed.startsWith('[')) {
    // JSON arrays should have quoted strings, numbers, objects, or arrays inside
    // Simple heuristic: if it's just text with brackets (like "[ text ]"), it's not JSON
    const afterBracket = trimmed.slice(1).trim();
    // If it's just text followed by ], it's probably not JSON
    if (/^[^"{[\d-]/.test(afterBracket)) {
      // Doesn't start with quote, brace, bracket, digit, or minus - probably not JSON
      return false;
    }
  }

  // For objects starting with {, check for JSON-like structure (quoted keys)
  if (trimmed.startsWith('{')) {
    // JSON objects should have quoted keys
    // Simple heuristic: if there's a quote followed by colon, it's likely JSON
    if (!/"[^"]*"\s*:/.test(trimmed)) {
      // No quoted key pattern found - might not be JSON
      // But still allow it if it has proper structure (braces, brackets)
      const hasStructure = trimmed.includes(':') && (trimmed.includes('"') || trimmed.match(/\d/));
      if (!hasStructure) return false;
    }
  }

  return true;
}

/**
 * Extracts individual JSON objects from a string that may contain multiple JSON objects.
 * Returns an array of valid JSON strings, or null if none found.
 */
function extractJsonObjects(str) {
  const trimmed = typeof str === 'string' ? str.trim() : '';
  if (!trimmed || trimmed.length < 2) return null;

  const jsonObjects = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{' || char === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}' || char === ']') {
      depth--;
      if (depth === 0 && start !== -1) {
        const jsonStr = trimmed.slice(start, i + 1);
        try {
          JSON.parse(jsonStr);
          jsonObjects.push(jsonStr);
        } catch {
          // Invalid JSON, skip
        }
        start = -1;
      }
    }
  }

  return jsonObjects.length > 0 ? jsonObjects : null;
}

/**
 * Attempts to format incomplete JSON with proper indentation.
 * This is a best-effort formatter for JSON that can't be fully parsed.
 */
function formatIncompleteJson(str) {
  const trimmed = typeof str === 'string' ? str.trim() : '';
  if (!trimmed || trimmed.length < 2) return trimmed;

  let result = '';
  let indentLevel = 0;
  const indentSize = 2;
  let i = 0;
  let inString = false;
  let escapeNext = false;
  let lastChar = '';

  while (i < trimmed.length) {
    const char = trimmed[i];

    if (escapeNext) {
      result += char;
      escapeNext = false;
      lastChar = char;
      i++;
      continue;
    }

    if (char === '\\') {
      result += char;
      escapeNext = true;
      lastChar = char;
      i++;
      continue;
    }

    if (char === '"') {
      result += char;
      inString = !inString;
      lastChar = char;
      i++;
      continue;
    }

    if (inString) {
      result += char;
      lastChar = char;
      i++;
      continue;
    }

    // Handle closing braces/brackets - decrease indent before adding
    if (char === '}' || char === ']') {
      indentLevel = Math.max(0, indentLevel - 1);
      // Only add newline if previous char wasn't already a newline or opening brace
      if (lastChar && lastChar !== '\n' && lastChar !== '{' && lastChar !== '[') {
        result += '\n';
      }
      result += ' '.repeat(indentLevel * indentSize) + char;
      lastChar = char;
      i++;
      continue;
    }

    // Handle opening braces/brackets - add then increase indent
    if (char === '{' || char === '[') {
      result += char;
      indentLevel++;
      // Add newline and indent if there's more content
      const remaining = trimmed.slice(i + 1).trim();
      if (remaining && remaining[0] !== '}' && remaining[0] !== ']') {
        result += '\n' + ' '.repeat(indentLevel * indentSize);
        lastChar = '\n';
      } else {
        lastChar = char;
      }
      i++;
      continue;
    }

    // Handle colons - add space after
    if (char === ':') {
      result += char + ' ';
      lastChar = ' ';
      i++;
      continue;
    }

    // Handle commas - add newline and indent if there's more content
    if (char === ',') {
      result += char;
      const remaining = trimmed.slice(i + 1).trim();
      if (remaining && remaining[0] !== '}' && remaining[0] !== ']') {
        result += '\n' + ' '.repeat(indentLevel * indentSize);
        lastChar = '\n';
      } else {
        lastChar = char;
      }
      i++;
      continue;
    }

    // Skip extra whitespace
    if (char === ' ' || char === '\n' || char === '\t') {
      if (
        lastChar &&
        lastChar !== ' ' &&
        lastChar !== '\n' &&
        lastChar !== ':' &&
        lastChar !== ','
      ) {
        result += char === ' ' ? ' ' : '\n';
        lastChar = char === ' ' ? ' ' : '\n';
      }
      i++;
      continue;
    }

    result += char;
    lastChar = char;
    i++;
  }

  return result;
}

/**
 * Detects if content looks like file paths (absolute or relative).
 * Matches paths like /home/user/file.md or ./relative/path/file.txt
 */
function looksLikeFilePath(str) {
  const trimmed = typeof str === 'string' ? str.trim() : '';
  if (!trimmed || trimmed.length < 3) return false;

  // Split by whitespace to check if all parts look like file paths
  const parts = trimmed.split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return false;

  // Check if all parts are file paths
  // Pattern: absolute paths (/path/to/file) or relative paths (./path/to/file or path/to/file)
  // Must contain at least one slash and optionally end with a file extension
  // Updated pattern to handle paths with dots (like .openclaw) and various characters
  const filePathPattern = /^(\/|\.\/|~\/)?([\w.\-~]+\/)*[\w.\-~]+(\.[\w]+)?$/;
  const allArePaths = parts.every((part) => {
    // Must have at least one slash (forward or backslash) or be a simple filename with extension
    // Exclude URLs and other non-path patterns
    if (/^(https?:|mailto:|#)/i.test(part)) return false;
    if (!part.includes('/') && !part.includes('\\')) {
      // If no slash, must be a simple filename with extension
      return /^[\w.\-~]+\.\w+$/.test(part);
    }
    return filePathPattern.test(part);
  });

  return allArePaths && parts.length >= 1;
}

/**
 * Detects if content looks like terminal/shell output.
 * Heuristics: ls -la style (total N, permission strings), or multi-line command output.
 */
function looksLikeTerminalOutput(str) {
  const trimmed = typeof str === 'string' ? str.trim() : '';
  if (!trimmed || trimmed.length < 10) return false;

  // ls -la style: starts with "total " followed by a number
  if (/^total\s+\d+/.test(trimmed)) return true;

  // Permission strings (drwxrwsr-x, -rw-r--r--, etc.)
  // Pattern matches: file type (d or -) + 9 permission characters + space + number
  // This catches ls -la output like: -rw-r--r-- 1 node node 2733 Feb 24 08:40 /path/to/file
  // The pattern is: (d|-) + exactly 9 chars from [rwxs-] + whitespace + digits
  if (/^(d|-)[rwxs-]{9}\s+\d+/.test(trimmed)) {
    return true;
  }

  // Multiple lines with shell prompt characters ($ % # >), not just digits (avoids matching "4. Item" lists)
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length >= 2 && lines.some((l) => /^\s*[$%#>]\s*/.test(l))) {
    return true;
  }

  return false;
}

/**
 * SmartContentBlock - Detects content type and renders JSON or terminal blocks
 * with appropriate formatting. Falls through to children for normal content.
 */
function SmartContentBlock({ content, children, fallback }) {
  const { type, renderBlock, jsonObjects, rawJsonContent } = useMemo(() => {
    const str = typeof content === 'string' ? content : String(content || '');
    const trimmed = str.trim();

    // First, try parsing the entire content as a single JSON object
    if (looksLikeJson(trimmed)) {
      try {
        JSON.parse(trimmed);
        return { type: 'json', renderBlock: true, jsonObjects: [trimmed], rawJsonContent: null };
      } catch {
        // Not a single JSON object, try extracting multiple JSON objects
        const extracted = extractJsonObjects(trimmed);
        if (extracted && extracted.length > 0) {
          return { type: 'json', renderBlock: true, jsonObjects: extracted, rawJsonContent: null };
        }
        // If it looks like JSON but can't be parsed, still render it as JSON (might be incomplete)
        // But only if it has actual JSON structure, not just brackets/braces in plain text
        if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 10) {
          // Check for actual JSON structure indicators:
          // - Quoted strings (keys or values)
          // - Colons (key-value separators)
          // - Commas (separators)
          // - Nested structures
          const hasQuotes = trimmed.includes('"');
          const hasColons = trimmed.includes(':');
          const hasNestedStructure =
            (trimmed.match(/{/g) || []).length > 1 ||
            (trimmed.match(/\[/g) || []).length > 1 ||
            (trimmed.includes('{') && trimmed.includes('['));

          // For arrays, check if it has JSON-like content (quoted strings, objects, arrays, numbers)
          const isArrayLike = trimmed.startsWith('[');
          const hasArrayContent =
            isArrayLike &&
            (hasQuotes || trimmed.match(/\d/) || trimmed.includes('{') || trimmed.includes('['));

          // Only treat as JSON if it has clear JSON structure indicators
          // Avoid false positives like "[ Subagent Context ]" which is just text
          if (
            (hasQuotes && hasColons) || // Object with quoted keys
            (isArrayLike && hasArrayContent && (hasQuotes || hasNestedStructure)) || // Array with JSON content
            (hasNestedStructure && (hasQuotes || hasColons))
          ) {
            // Nested structures with JSON indicators
            return { type: 'json', renderBlock: true, jsonObjects: null, rawJsonContent: trimmed };
          }
        }
      }
    } else {
      // Even if it doesn't start with { or [, try extracting JSON objects
      const extracted = extractJsonObjects(trimmed);
      if (extracted && extracted.length > 0) {
        return { type: 'json', renderBlock: true, jsonObjects: extracted, rawJsonContent: null };
      }
    }

    if (looksLikeTerminalOutput(trimmed)) {
      return { type: 'terminal', renderBlock: true, jsonObjects: null, rawJsonContent: null };
    }

    // Check for file paths (after terminal, since terminal output might contain paths)
    if (looksLikeFilePath(trimmed)) {
      return { type: 'filepath', renderBlock: true, jsonObjects: null, rawJsonContent: null };
    }

    return { type: 'default', renderBlock: false, jsonObjects: null, rawJsonContent: null };
  }, [content]);

  if (renderBlock && type === 'json') {
    // Render parsed JSON objects if available
    if (jsonObjects) {
      if (jsonObjects.length === 1) {
        return <JsonBlock content={jsonObjects[0]} className="mb-3 last:mb-0" />;
      } else if (jsonObjects.length > 1) {
        return (
          <div className="space-y-2 mb-3 last:mb-0">
            {jsonObjects.map((jsonStr, idx) => (
              <JsonBlock key={idx} content={jsonStr} className="" />
            ))}
          </div>
        );
      }
    }

    // Render raw JSON content (incomplete/unparseable JSON that still looks like JSON)
    if (rawJsonContent) {
      // Format with proper indentation
      const formatted = formatIncompleteJson(rawJsonContent);

      // Basic syntax highlighting for incomplete JSON (similar to JsonBlock)
      const tokens = [];
      let i = 0;
      const len = formatted.length;
      let inString = false;
      let escapeNext = false;

      while (i < len) {
        const char = formatted[i];

        if (escapeNext) {
          tokens.push({ type: 'string', value: char });
          escapeNext = false;
          i++;
          continue;
        }

        if (char === '\\') {
          tokens.push({ type: 'string', value: char });
          escapeNext = true;
          i++;
          continue;
        }

        if (char === '"') {
          const start = i;
          i++;
          while (i < len && formatted[i] !== '"') {
            if (formatted[i] === '\\') i++;
            i++;
          }
          if (i < len) i++;
          const str = formatted.slice(start, i);
          const isKey = formatted[i] === ':' || formatted.slice(i).match(/^\s*:/);
          tokens.push({
            type: isKey ? 'key' : 'string',
            value: str,
          });
          inString = !inString;
          continue;
        }

        if (inString) {
          tokens.push({ type: 'string', value: char });
          i++;
          continue;
        }

        if (/[0-9-]/.test(char) && (char === '-' || /[0-9]/.test(char))) {
          let start = i;
          if (char === '-') i++;
          while (i < len && /[0-9.eE+-]/.test(formatted[i])) i++;
          tokens.push({ type: 'number', value: formatted.slice(start, i) });
          continue;
        }

        if (formatted.slice(i, i + 4) === 'true') {
          tokens.push({ type: 'boolean', value: 'true' });
          i += 4;
          continue;
        }
        if (formatted.slice(i, i + 5) === 'false') {
          tokens.push({ type: 'boolean', value: 'false' });
          i += 5;
          continue;
        }
        if (formatted.slice(i, i + 4) === 'null') {
          tokens.push({ type: 'null', value: 'null' });
          i += 4;
          continue;
        }

        tokens.push({ type: 'plain', value: char });
        i++;
      }

      const colorMap = {
        key: 'text-primary-400',
        string: 'text-emerald-400',
        number: 'text-amber-400',
        boolean: 'text-violet-400',
        null: 'text-dark-500',
        plain: 'text-dark-300',
      };

      return (
        <div
          className="rounded-lg border border-dark-700 bg-dark-900 overflow-x-auto mb-3 last:mb-0"
          data-block-type="json"
        >
          <pre className="px-4 py-3 text-sm font-mono whitespace-pre m-0">
            {tokens.map((t, idx) => (
              <span key={idx} className={colorMap[t.type] || colorMap.plain}>
                {t.value}
              </span>
            ))}
          </pre>
        </div>
      );
    }

    // Fallback to original content if extraction failed
    return <JsonBlock content={content} className="mb-3 last:mb-0" />;
  }

  if (renderBlock && type === 'terminal') {
    return <TerminalBlock content={content} className="mb-3 last:mb-0" />;
  }

  if (renderBlock && type === 'filepath') {
    // Render file paths as a code block with monospace font
    const text = typeof content === 'string' ? content : String(content || '');
    return (
      <div className="rounded-lg border border-dark-700 bg-dark-900 overflow-x-auto mb-3 last:mb-0">
        <pre className="px-4 py-3 text-sm font-mono text-primary-400 whitespace-pre m-0 break-words">
          {text}
        </pre>
      </div>
    );
  }

  return fallback ?? children ?? null;
}

SmartContentBlock.propTypes = {
  content: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  children: PropTypes.node,
  fallback: PropTypes.node,
};

export default SmartContentBlock;
