import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function AgentDeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  agent,
  isSubmitting = false,
}) {
  const [confirmText, setConfirmText] = useState('');
  const [forceDelete, setForceDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConfirmText('');
      setForceDelete(false);
    }
  }, [isOpen]);

  const expected = agent?.id || '';
  const canConfirm = useMemo(() => {
    return Boolean(expected) && confirmText.trim() === expected && !isSubmitting;
  }, [expected, confirmText, isSubmitting]);

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({ force: forceDelete });
  };

  if (!agent) return null;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={isSubmitting ? () => {} : onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-dark-900 border border-dark-800 p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-start gap-4">
                  <ExclamationTriangleIcon className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <Dialog.Title as="h3" className="text-lg font-semibold text-dark-100 mb-2">
                      Delete Agent
                    </Dialog.Title>

                    <p className="text-sm text-dark-300 mb-3">
                      You are about to delete <span className="font-semibold text-dark-100">{agent.displayName || agent.label}</span>{' '}
                      (<code className="text-red-400">{agent.id}</code>).
                    </p>

                    <ul className="text-xs text-dark-400 space-y-1 mb-4 list-disc pl-5">
                      <li>Removes runtime routing target from OpenClaw config.</li>
                      <li>Revokes active API keys for this agent.</li>
                      <li>Soft-deletes agent metadata and clears reporting references.</li>
                    </ul>

                    <label className="block text-xs font-medium text-dark-300 mb-1">
                      Type <code className="text-red-400">{expected}</code> to confirm
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-dark-100 focus:outline-none focus:border-red-500"
                      placeholder={expected}
                    />

                    <label className="mt-3 flex items-center gap-2 text-xs text-dark-300">
                      <input
                        type="checkbox"
                        checked={forceDelete}
                        disabled={isSubmitting}
                        onChange={(e) => setForceDelete(e.target.checked)}
                      />
                      Force delete if active sessions exist
                    </label>

                    <div className="flex justify-end gap-3 mt-5">
                      <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm font-medium text-dark-300 hover:text-dark-100 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isSubmitting ? 'Deleting…' : 'Delete Agent'}
                      </button>
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
