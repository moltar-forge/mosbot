import { useEffect, useState, Suspense, lazy, useRef } from 'react';
import { useTaskStore } from '../stores/taskStore';
import KanbanBoard from '../components/KanbanBoard';
import Header from '../components/Header';

const TaskModal = lazy(() => import('../components/TaskModal'));

const POLLING_INTERVAL = 30000; // 30 seconds

export default function Dashboard() {
  const { fetchTasks, refreshTasks, isLoading, error, searchQuery, setSearchQuery } =
    useTaskStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const pollingIntervalRef = useRef(null);

  // Initial fetch
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Auto-refresh polling
  useEffect(() => {
    // Start polling when component mounts
    pollingIntervalRef.current = setInterval(() => {
      refreshTasks();
    }, POLLING_INTERVAL);

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [refreshTasks]);

  // Refresh when tab becomes visible (user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshTasks();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshTasks]);

  // Listen for custom openTask events (from clicking parent epic or subtasks)
  useEffect(() => {
    const handleOpenTask = (event) => {
      const task = event.detail;
      if (task) {
        setSelectedTask(task);
        setIsModalOpen(true);
      }
    };

    window.addEventListener('openTask', handleOpenTask);

    return () => {
      window.removeEventListener('openTask', handleOpenTask);
    };
  }, []);

  const handleRefresh = async () => {
    await fetchTasks();
  };

  const handleCreateTask = () => {
    setSelectedTask(null);
    setIsModalOpen(true);
  };

  const handleTaskClick = (task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  if (isLoading && !useTaskStore.getState().tasks.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-dark-400">Loading tasks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 mb-2">Error loading tasks</p>
          <p className="text-dark-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Dashboard"
        subtitle="Kanban board for task management and workflow tracking"
        onCreateTask={handleCreateTask}
        onRefresh={handleRefresh}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="flex-1 p-3 md:p-6 overflow-hidden">
        <KanbanBoard onTaskClick={handleTaskClick} />
      </div>

      {isModalOpen && (
        <Suspense fallback={null}>
          <TaskModal isOpen={isModalOpen} onClose={handleCloseModal} task={selectedTask} />
        </Suspense>
      )}
    </div>
  );
}
