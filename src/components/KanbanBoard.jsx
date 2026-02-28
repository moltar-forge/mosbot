import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import { MultiBackend, TouchTransition, MouseTransition } from 'dnd-multi-backend';
import { useTaskStore } from '../stores/taskStore';
import { useToastStore } from '../stores/toastStore';
import Column from './Column';
import { KANBAN_COLUMNS } from '../utils/constants';

// Multi-backend configuration for touch and mouse support
const HTML5toTouch = {
  backends: [
    {
      id: 'html5',
      backend: HTML5Backend,
      transition: MouseTransition,
    },
    {
      id: 'touch',
      backend: TouchBackend,
      options: { enableMouseEvents: true },
      preview: true,
      transition: TouchTransition,
    },
  ],
};

export default function KanbanBoard({ onTaskClick }) {
  const { moveTask, getFilteredTasks, isRefreshing } = useTaskStore();
  const { showToast } = useToastStore();
  const tasks = getFilteredTasks();

  const handleTaskDrop = async (taskId, newStatus) => {
    try {
      await moveTask(taskId, newStatus);
    } catch (error) {
      // Handle dependency blocking (409 Conflict)
      if (error.response?.status === 409) {
        const blockingTasks = error.response?.data?.error?.blocking_tasks || [];
        const taskKeys = blockingTasks
          .map((t) => (t.key || t.task_number ? `TASK-${t.task_number}` : t.id || 'Unknown task'))
          .filter(Boolean)
          .join(', ');
        showToast(`Task is blocked by: ${taskKeys || 'unfinished dependencies'}`, 'error');
      } else {
        showToast(error.response?.data?.error?.message || 'Failed to move task', 'error');
      }
    }
  };

  // Ensure tasks is always an array
  const tasksArray = Array.isArray(tasks) ? tasks : [];

  return (
    <DndProvider backend={MultiBackend} options={HTML5toTouch}>
      <div className="relative h-full">
        {/* Background refresh indicator */}
        {isRefreshing && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary-600/20 overflow-hidden z-10">
            <div className="h-full bg-primary-600 animate-pulse-slow"></div>
          </div>
        )}

        {/* Mobile: Horizontal scroll with snap, Desktop: Grid */}
        <div className="flex md:grid md:grid-cols-2 xl:grid-cols-4 gap-4 h-full overflow-x-auto md:overflow-x-visible snap-x snap-mandatory md:snap-none pb-2">
          {KANBAN_COLUMNS.map((column) => {
            const columnTasks = tasksArray.filter((task) => task.status === column.id);
            return (
              <div
                key={column.id}
                className="card flex flex-col min-h-0 min-w-[85vw] md:min-w-0 snap-start flex-shrink-0"
              >
                <Column
                  column={column}
                  tasks={columnTasks}
                  onTaskClick={onTaskClick}
                  onTaskDrop={handleTaskDrop}
                />
              </div>
            );
          })}
        </div>
      </div>
    </DndProvider>
  );
}
