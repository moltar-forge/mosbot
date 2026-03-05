import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import Header from '../components/Header';
import WorkspaceExplorer from '../components/WorkspaceExplorer';
import { useAgentStore } from '../stores/agentStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useAuthStore } from '../stores/authStore';

const AGENT_ID = 'projects';
const ROOT_PATH = '/projects';

export default function Projects() {
  const { '*': filePathParam } = useParams();
  const { fetchAgents } = useAgentStore();
  const { createDirectory, setWorkspaceRootPath } = useWorkspaceStore();
  const { isAdmin } = useAuthStore();
  const [isEnsuring, setIsEnsuring] = useState(false);
  const [ensureComplete, setEnsureComplete] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    const ensureDir = async () => {
      if (isEnsuring || ensureComplete) return;
      setIsEnsuring(true);
      setWorkspaceRootPath(ROOT_PATH);
      try {
        if (isAdmin()) {
          await createDirectory({ path: '/', agentId: AGENT_ID });
        }
      } catch {
        // Directory likely already exists (409) — that's fine
      } finally {
        setIsEnsuring(false);
        setEnsureComplete(true);
      }
    };
    ensureDir();
  }, [createDirectory, setWorkspaceRootPath, isAdmin, isEnsuring, ensureComplete]);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Projects"
        subtitle="Shared projects space for all agents"
        actions={
          isAdmin() && (
            <button
              onClick={() => {}}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
              title="New project folder (use the file explorer below)"
            >
              <PlusIcon className="w-4 h-4" />
              <span>New Project</span>
            </button>
          )
        }
      />

      <div className="flex-1 flex flex-col p-3 md:p-6 overflow-hidden">
        {ensureComplete ? (
          <WorkspaceExplorer
            agentId={AGENT_ID}
            agent={{
              id: AGENT_ID,
              name: 'Projects',
              workspaceRootPath: ROOT_PATH,
              icon: '📁',
            }}
            initialFilePath={filePathParam || null}
            routeBase="/projects"
            showAgentSelector={false}
            workspaceRootPath={ROOT_PATH}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="inline-block w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-dark-400">Setting up projects space...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
