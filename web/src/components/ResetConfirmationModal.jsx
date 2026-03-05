import { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ExclamationTriangleIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToastStore } from '../stores/toastStore';
import logger from '../utils/logger';

export default function ResetConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Reset Data',
  dataType = 'data',
  description,
  confirmButtonText = 'Reset',
  requirePassword = true,
}) {
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const showToast = useToastStore((state) => state.showToast);

  const defaultDescription = `Are you sure you want to reset all ${dataType}? This action will permanently delete all existing data and cannot be undone.`;

  const handleClose = () => {
    if (isSubmitting) return;
    setPassword('');
    setError(null);
    onClose();
  };

  const handleConfirm = async (e) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (requirePassword && !password.trim()) {
      setError('Password is required to confirm this action');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm(password);
      showToast(`${dataType} has been reset successfully`, 'success');
      setPassword('');
      onClose();
    } catch (err) {
      logger.error('Failed to reset data', err);
      const errorMessage = err.response?.data?.error?.message || `Failed to reset ${dataType}`;
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/75" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-lg bg-dark-900 border border-red-500/30 shadow-xl transition-all">
                {/* Warning Header */}
                <div className="bg-red-500/10 border-b border-red-500/20 p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                      <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <Dialog.Title className="text-lg font-semibold text-dark-100">
                        {title}
                      </Dialog.Title>
                      <p className="text-sm text-red-400 mt-0.5">This action cannot be undone</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleConfirm} className="p-6 space-y-4">
                  {/* Description */}
                  <div className="bg-dark-800/50 border border-dark-700 rounded-lg p-4">
                    <p className="text-sm text-dark-300">{description || defaultDescription}</p>
                  </div>

                  {/* Password Input */}
                  {requirePassword && (
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-1.5">
                        Confirm with your password *
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Enter your password"
                        disabled={isSubmitting}
                        className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 placeholder-dark-600 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 disabled:opacity-50"
                      />
                      <p className="text-xs text-dark-500 mt-1.5">
                        For security, please enter your password to confirm this destructive action.
                      </p>
                    </div>
                  )}

                  {/* Error Message */}
                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <p className="text-sm text-red-400">{error}</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-medium text-dark-300 hover:text-dark-100 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || (requirePassword && !password.trim())}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Resetting...</span>
                        </>
                      ) : (
                        <>
                          <TrashIcon className="w-4 h-4" />
                          <span>{confirmButtonText}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
