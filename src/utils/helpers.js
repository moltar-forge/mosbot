import { format, formatDistanceToNow } from 'date-fns';

export const formatDate = (date) => {
  if (!date) return '';
  return format(new Date(date), 'MMM d, yyyy');
};

export const formatDateTime = (date) => {
  if (!date) return '';
  return format(new Date(date), 'MMM d, yyyy HH:mm');
};

export const formatRelativeTime = (date) => {
  if (!date) return '';
  const parsedDate = parseDatabaseDate(date);
  if (!parsedDate || isNaN(parsedDate.getTime())) return '';
  return formatDistanceToNow(parsedDate, { addSuffix: true });
};

// Parse date from database (PostgreSQL TIMESTAMP without timezone is typically UTC)
// If the date string doesn't have timezone info, treat it as UTC
export const parseDatabaseDate = (dateString) => {
  if (!dateString) return null;

  // If it's already a Date object, return it
  if (dateString instanceof Date) return dateString;

  // If it's a number (timestamp), create Date from it
  if (typeof dateString === 'number') return new Date(dateString);

  // If it's a string, check if it has timezone info
  const str = String(dateString).trim();

  // If it ends with Z or has timezone offset (+/-HH:MM), parse as-is (already has timezone)
  if (str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str)) {
    return new Date(str);
  }

  // PostgreSQL returns timestamps in format: "2026-02-04 09:18:17.087" (space-separated, no timezone)
  // Convert space to 'T' and append 'Z' to treat as UTC
  const isoString = str.replace(' ', 'T') + 'Z';
  return new Date(isoString);
};

// Format date/time in user's local timezone with full details
// Uses Singapore locale (en-SG) for dd/mm/yyyy format
export const formatDateTimeLocal = (date) => {
  if (!date) return '';
  const parsedDate = parseDatabaseDate(date);
  if (!parsedDate || isNaN(parsedDate.getTime())) return '';

  return parsedDate.toLocaleString('en-SG', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
};

/** Format token counts as K/M (e.g. 2.17M, 22.1K) for stat cards and charts */
export const formatTokens = (value) => {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
};

export const truncateText = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// Strip markdown formatting from text for plain text previews
export const stripMarkdown = (text) => {
  if (!text) return '';

  let stripped = String(text);

  // Remove code blocks (```code```)
  stripped = stripped.replace(/```[\s\S]*?```/g, '');

  // Remove inline code (`code`)
  stripped = stripped.replace(/`([^`]+)`/g, '$1');

  // Remove links but keep text: [text](url) -> text
  stripped = stripped.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove images: ![alt](url) -> alt
  stripped = stripped.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Remove headers (# Header -> Header)
  stripped = stripped.replace(/^#{1,6}\s+(.+)$/gm, '$1');

  // Remove bold (**text** or __text__)
  stripped = stripped.replace(/\*\*([^*]+)\*\*/g, '$1');
  stripped = stripped.replace(/__([^_]+)__/g, '$1');

  // Remove italic (*text* or _text_)
  stripped = stripped.replace(/\*([^*]+)\*/g, '$1');
  stripped = stripped.replace(/_([^_]+)_/g, '$1');

  // Remove strikethrough (~~text~~)
  stripped = stripped.replace(/~~([^~]+)~~/g, '$1');

  // Remove list markers (-, *, 1.)
  stripped = stripped.replace(/^[\s]*[-*+]\s+/gm, '');
  stripped = stripped.replace(/^[\s]*\d+\.\s+/gm, '');

  // Remove horizontal rules (---)
  stripped = stripped.replace(/^---+$/gm, '');

  // Convert markdown tables to plain text: | A | B | -> A B (skip separator rows)
  stripped = stripped.replace(/^\|.+\|$/gm, (match) => {
    const cells = match
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.every((c) => /^-+$/.test(c))) return '';
    return cells.join(' ');
  });

  // Clean up extra whitespace
  stripped = stripped.replace(/\n{3,}/g, '\n\n');
  stripped = stripped.trim();

  return stripped;
};

export const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const classNames = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

/**
 * Build a shareable URL for viewing a workspace file.
 * Use with React Router's Link or for copying to clipboard.
 *
 * @param {string} filePath - Full workspace path, e.g. "/tasks/012-subagents-page/PRD.md"
 * @param {string} baseUrl - Optional base URL (default: '/workspaces'). Use '/docs' for docs pages.
 * @returns {string} - Route path like "/workspaces/tasks/012-subagents-page/PRD.md" or "/docs/README.md"
 *
 * @example
 * <Link to={getWorkspaceFileUrl('/tasks/012-subagents-page/PRD.md')}>View PRD</Link>
 * <Link to={getWorkspaceFileUrl('/README.md', '/docs')}>View Docs</Link>
 */
export const getWorkspaceFileUrl = (filePath, baseUrl = '/workspaces') => {
  if (!filePath || typeof filePath !== 'string') return baseUrl;
  const normalized = filePath.trim().replace(/\/+/g, '/');
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${baseUrl}${withSlash}`;
};

/**
 * Check if a string looks like a workspace file path (for auto-linking in markdown).
 * Matches paths like tasks/012-subagents-page/PRD.md, docs/README.md, /docs/file.md
 *
 * @param {string} str - String to check (e.g. from inline code or link href)
 * @returns {boolean}
 */
export const isWorkspaceFilePath = (str) => {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  if (!trimmed || trimmed.includes('..')) return false;
  // Exclude URLs, anchors, mailto
  if (/^(https?:|mailto:|#)/i.test(trimmed)) return false;
  // Match path-like strings: must have file extension or multi-segment path
  // e.g. tasks/012/PRD.md, docs/README.md, tasks/012-subagents-page/PRD
  return (
    /^\/?[\w./-]+\.(md|mdx|txt|json|yaml|yml|js|jsx|ts|tsx|css|html)$/i.test(trimmed) ||
    /^\/?[\w-]+\/[\w./-]+$/.test(trimmed)
  );
};

/**
 * Check if a path is inside a symlink directory by checking all ancestor directories.
 * @param {string} path - The path to check (e.g., "/skills/subfolder/file.txt")
 * @param {Object} childrenCache - Cache of directory listings keyed by path
 * @param {string} agentId - Agent ID for cache key construction (unused but kept for API consistency)
 * @returns {boolean} - True if any ancestor directory is a symlink
 */
export const isPathInsideSymlink = (path, childrenCache, _agentId) => {
  if (!path || path === '/') return false;

  // Build list of all ancestor directory paths to check
  // For "/skills/subfolder/file.txt", check: "/skills" and "/skills/subfolder"
  const pathParts = path.split('/').filter(Boolean);
  const ancestorPaths = [];

  // Build each ancestor path: /skills, /skills/subfolder, etc.
  for (let i = 1; i <= pathParts.length; i++) {
    const ancestorPath = '/' + pathParts.slice(0, i).join('/');
    ancestorPaths.push(ancestorPath);
  }

  // Check each ancestor directory to see if it's a symlink
  for (const ancestorPath of ancestorPaths) {
    // Get the parent directory to look up the listing
    const ancestorParts = ancestorPath.split('/').filter(Boolean);
    const parentPath = ancestorParts.length > 1 ? '/' + ancestorParts.slice(0, -1).join('/') : '/';

    // Look up the parent directory's listing
    const listing = childrenCache[parentPath];
    if (listing && Array.isArray(listing)) {
      // Find the ancestor directory in the parent's listing
      const ancestorDir = listing.find((f) => f.path === ancestorPath && f.type === 'directory');
      if (ancestorDir && ancestorDir.isSymlink === true) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Check if a file or directory node is a symlink or inside a symlink.
 * @param {Object} file - File/directory node with path and isSymlink properties
 * @param {Object} childrenCache - Cache of directory listings keyed by path
 * @param {string} agentId - Agent ID (unused but kept for consistency)
 * @returns {boolean} - True if the file is a symlink or inside a symlink
 */
export const isFileOrPathInsideSymlink = (file, childrenCache, agentId) => {
  if (!file) return false;

  // If the file itself is a symlink, return true
  if (file.isSymlink === true) return true;

  // Check if any ancestor directory is a symlink
  return isPathInsideSymlink(file.path, childrenCache, agentId);
};
