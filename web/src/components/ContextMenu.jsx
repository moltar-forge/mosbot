import { useEffect, useRef } from 'react';
import {
  DocumentPlusIcon,
  FolderPlusIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import { isFileOrPathInsideSymlink } from '../utils/helpers';

export default function ContextMenu({
  x,
  y,
  file,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onView,
  onDownload,
  onUpload,
  onCopyPath,
  canModify,
  childrenCache = {},
  agentId = 'coo',
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  if (!file) return null;

  const isDirectory = file.type === 'directory';
  const isInsideSymlink = isFileOrPathInsideSymlink(file, childrenCache, agentId);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-56 rounded-lg bg-dark-900 border border-dark-700 shadow-xl py-1"
      style={{
        top: `${y}px`,
        left: `${x}px`,
      }}
    >
      {/* View option - available to all users */}
      {!isDirectory && (
        <button
          onClick={() => {
            onView(file);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-dark-300 hover:bg-dark-800 hover:text-dark-100 transition-colors"
        >
          <EyeIcon className="w-4 h-4" />
          <span>View</span>
        </button>
      )}

      {/* Download option - files only */}
      {!isDirectory && (
        <button
          onClick={() => {
            onDownload(file);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-dark-300 hover:bg-dark-800 hover:text-dark-100 transition-colors"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          <span>Download</span>
        </button>
      )}

      {/* Upload option - directories only */}
      {isDirectory && (
        <button
          onClick={() => {
            if (canModify && !isInsideSymlink) {
              onUpload(file);
              onClose();
            }
          }}
          disabled={!canModify || isInsideSymlink}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-dark-300 hover:bg-dark-800 hover:text-dark-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-dark-300"
          title={
            isInsideSymlink
              ? 'Cannot upload files inside symlink directories'
              : canModify
                ? 'Upload files to this folder'
                : 'Admin access required'
          }
        >
          <ArrowUpTrayIcon className="w-4 h-4" />
          <span>Upload Files</span>
        </button>
      )}

      {/* Copy path option - available to all users */}
      <button
        onClick={() => {
          onCopyPath(file);
          onClose();
        }}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-dark-300 hover:bg-dark-800 hover:text-dark-100 transition-colors"
      >
        <ClipboardDocumentIcon className="w-4 h-4" />
        <span>Copy Workspace Path</span>
      </button>

      {/* Separator */}
      <div className="my-1 border-t border-dark-800" />

      {/* Modification options - visible to all, disabled for non-admin or symlinks */}
      {/* New File - only for directories */}
      {isDirectory && (
        <button
          onClick={() => {
            if (canModify && !isInsideSymlink) {
              onNewFile(file);
              onClose();
            }
          }}
          disabled={!canModify || isInsideSymlink}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-dark-300 hover:bg-dark-800 hover:text-dark-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-dark-300"
          title={
            isInsideSymlink
              ? 'Cannot create files inside symlink directories'
              : canModify
                ? 'Create new file in this folder'
                : 'Admin access required'
          }
        >
          <DocumentPlusIcon className="w-4 h-4" />
          <span>New File</span>
        </button>
      )}

      {/* New Folder - only for directories */}
      {isDirectory && (
        <button
          onClick={() => {
            if (canModify && !isInsideSymlink) {
              onNewFolder(file);
              onClose();
            }
          }}
          disabled={!canModify || isInsideSymlink}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-dark-300 hover:bg-dark-800 hover:text-dark-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-dark-300"
          title={
            isInsideSymlink
              ? 'Cannot create folders inside symlink directories'
              : canModify
                ? 'Create new folder in this folder'
                : 'Admin access required'
          }
        >
          <FolderPlusIcon className="w-4 h-4" />
          <span>New Folder</span>
        </button>
      )}

      {/* Separator if we have new file/folder options */}
      {isDirectory && <div className="my-1 border-t border-dark-800" />}

      {/* Rename - only for files (directories not supported yet) */}
      {!isDirectory && (
        <button
          onClick={() => {
            if (canModify && !isInsideSymlink) {
              onRename(file);
              onClose();
            }
          }}
          disabled={!canModify || isInsideSymlink}
          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-dark-300 hover:bg-dark-800 hover:text-dark-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-dark-300"
          title={
            isInsideSymlink
              ? 'Cannot rename files inside symlink directories'
              : canModify
                ? 'Rename this file'
                : 'Admin access required'
          }
        >
          <PencilIcon className="w-4 h-4" />
          <span>Rename</span>
        </button>
      )}

      {/* Delete */}
      <button
        onClick={() => {
          if (canModify && !isInsideSymlink) {
            onDelete(file);
            onClose();
          }
        }}
        disabled={!canModify || isInsideSymlink}
        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-dark-800 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-red-400"
        title={
          isInsideSymlink
            ? 'Cannot delete files or folders inside symlink directories'
            : canModify
              ? 'Delete this item'
              : 'Admin access required'
        }
      >
        <TrashIcon className="w-4 h-4" />
        <span>Delete</span>
      </button>
    </div>
  );
}
