import { useParams, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Header from '../components/Header';
import WorkspaceExplorer from '../components/WorkspaceExplorer';
import { useAgentStore } from '../stores/agentStore';

export default function Workspace() {
  const { agentId, '*': filePathParam } = useParams();
  const { agents, isLoading, fetchAgents, getAgentById, isValidAgentId, getDefaultAgent } =
    useAgentStore();

  // Fetch agents on mount (store handles staleness/refresh windows)
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Wait for agents to load
  if (isLoading || agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-dark-400">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  // Redirect to default agent if invalid agentId
  if (!isValidAgentId(agentId)) {
    const defaultAgent = getDefaultAgent();
    return <Navigate to={`/workspaces/${defaultAgent.id}`} replace />;
  }

  const agent = getAgentById(agentId);

  return (
    <div className="flex flex-col h-full">
      <Header title="Workspaces" subtitle={`Browse and preview ${agent.name} workspace files`} />

      <div className="flex-1 flex flex-col p-3 md:p-6 overflow-hidden">
        <WorkspaceExplorer
          agentId={agentId}
          agent={agent}
          initialFilePath={filePathParam || null}
        />
      </div>
    </div>
  );
}
