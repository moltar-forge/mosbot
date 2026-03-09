import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserPlusIcon, PencilIcon, TrashIcon, Bars3Icon } from '@heroicons/react/24/outline';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { api } from '../api/client';
import logger from '../utils/logger';
import UserModal from '../components/UserModal';
import UserDeleteConfirmModal from '../components/UserDeleteConfirmModal';
import { useMobileNav } from '../components/MobileNavContext';

export default function Settings() {
  const { user: currentUser, isAdmin } = useAuthStore();
  const { showToast } = useToastStore();
  const navigate = useNavigate();
  const location = useLocation();
  const onOpenNav = useMobileNav();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [error, setError] = useState('');
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({
    isOpen: false,
    userId: null,
    userName: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    // Redirect to /settings/users if on /settings
    if (location.pathname === '/settings') {
      navigate('/settings/users', { replace: true });
      return;
    }

    // Fetch users when on /settings/users (all authenticated users can view)
    if (location.pathname === '/settings/users') {
      fetchUsers();

      // Track view-only mode encounter for non-admin users
      const hasModifyPermission = isAdmin();
      if (!hasModifyPermission) {
        logger.info('View-only mode encountered in Settings', {
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          userRole: currentUser?.role,
          page: 'settings/users',
          mode: 'view-only',
        });
      }
    }
  }, [location.pathname, navigate, isAdmin, currentUser]);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/users?includeAgentConfig=true');
      setUsers(response.data.data || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = () => {
    setSelectedUser(null);
    setIsModalOpen(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const handleDeleteUser = (user) => {
    setDeleteConfirmModal({
      isOpen: true,
      userId: user.id,
      userName: user.name,
    });
  };

  const handleConfirmDelete = async () => {
    if (isDeleting || !deleteConfirmModal.userId) return;

    setIsDeleting(true);
    try {
      await api.delete(`/admin/users/${deleteConfirmModal.userId}`);
      await fetchUsers();
      showToast('User deleted successfully', 'success');
      setDeleteConfirmModal({ isOpen: false, userId: null, userName: null });
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Failed to delete user', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseDeleteModal = () => {
    if (!isDeleting) {
      setDeleteConfirmModal({ isOpen: false, userId: null, userName: null });
    }
  };

  const handleSaveUser = async (userData, userId) => {
    if (userId) {
      await api.put(`/admin/users/${userId}`, userData);
    } else {
      await api.post('/admin/users', userData);
    }

    await fetchUsers();
    setIsModalOpen(false);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const canModifyUsers = useMemo(() => {
    const hasPermission = isAdmin();
    logger.info('User permission check for user management', {
      userId: currentUser?.id,
      userEmail: currentUser?.email,
      userRole: currentUser?.role,
      canModifyUsers: hasPermission,
    });
    return hasPermission;
  }, [isAdmin, currentUser]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 bg-dark-900 border-b border-dark-800">
        <div className="flex items-center gap-3">
          {onOpenNav && (
            <button
              type="button"
              className="md:hidden p-2 -ml-2 rounded-lg text-dark-300 hover:text-dark-100 hover:bg-dark-800 transition-colors"
              onClick={onOpenNav}
            >
              <span className="sr-only">Open sidebar</span>
              <Bars3Icon className="h-6 w-6" aria-hidden="true" />
            </button>
          )}
          <div className="flex flex-col gap-1">
            <h1 className="text-xl md:text-2xl font-bold text-dark-100">Settings</h1>
            <p className="text-sm text-dark-500">Manage users and system configuration</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-3 md:p-6 overflow-y-auto">
        {location.pathname === '/settings/users' && (
          <>
            {error && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-dark-100">User Management</h2>
                  {!canModifyUsers && (
                    <p className="text-xs text-dark-500 mt-1">View-only access</p>
                  )}
                </div>
                {canModifyUsers && (
                  <button
                    onClick={handleAddUser}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                  >
                    <UserPlusIcon className="w-5 h-5" />
                    Add User
                  </button>
                )}
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-dark-400">No users found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-dark-800">
                        <th className="text-left text-sm font-medium text-dark-400 pb-3 px-4">
                          Name
                        </th>
                        <th className="text-left text-sm font-medium text-dark-400 pb-3 px-4">
                          ID
                        </th>
                        <th className="text-left text-sm font-medium text-dark-400 pb-3 px-4">
                          Email
                        </th>
                        <th className="text-left text-sm font-medium text-dark-400 pb-3 px-4">
                          Role
                        </th>
                        <th className="text-left text-sm font-medium text-dark-400 pb-3 px-4">
                          Status
                        </th>
                        <th className="text-left text-sm font-medium text-dark-400 pb-3 px-4">
                          Created
                        </th>
                        {canModifyUsers && (
                          <th className="text-right text-sm font-medium text-dark-400 pb-3 px-4">
                            Actions
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr
                          key={user.id}
                          className="border-b border-dark-800 hover:bg-dark-800 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-600 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-dark-100">{user.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-dark-400 text-sm font-mono">{user.id}</td>
                          <td className="py-3 px-4 text-dark-300">{user.email}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                                user.role === 'owner'
                                  ? 'bg-amber-900/30 text-amber-300'
                                  : user.role === 'admin'
                                    ? 'bg-purple-900/30 text-purple-300'
                                    : user.role === 'agent'
                                      ? 'bg-blue-900/30 text-blue-300'
                                      : 'bg-dark-700 text-dark-300'
                              }`}
                            >
                              {user.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                                user.active !== false
                                  ? 'bg-green-900/30 text-green-300'
                                  : 'bg-red-900/30 text-red-300'
                              }`}
                            >
                              {user.active !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-dark-400 text-sm">
                            {formatDate(user.created_at)}
                          </td>
                          {canModifyUsers && (
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleEditUser(user)}
                                  className="p-2 text-dark-400 hover:text-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Edit user"
                                  disabled={user.role === 'owner' && currentUser?.role !== 'owner'}
                                >
                                  <PencilIcon className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(user)}
                                  className="p-2 text-dark-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Delete user"
                                  disabled={user.id === currentUser?.id || user.role === 'owner'}
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* User Modal */}
      <UserModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        user={selectedUser}
        onSave={handleSaveUser}
      />

      {/* Delete Confirmation Modal */}
      <UserDeleteConfirmModal
        isOpen={deleteConfirmModal.isOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        userName={deleteConfirmModal.userName}
        isSubmitting={isDeleting}
      />
    </div>
  );
}
