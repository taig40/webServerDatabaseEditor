import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useLanguageStore } from '../store/useLanguageStore';
import { API_URL } from '../config/env';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  Connection,
  Node,
  Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import {
  Network,
  Save,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Layers,
  Sparkles,
  Search,
  X
} from 'lucide-react';

// ─── CUSTOM SKILL NODE COMPONENT ─────────────────────────────────────────────

interface SkillNodeData extends Record<string, unknown> {
  Name: string;
  Id: number;
  Description: string;
  MaxLevel: number;
  IconUrl: string;
  onDeleteNode?: (name: string) => void;
}

const SkillNodeComponent = ({ data }: { data: SkillNodeData }) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="bg-[#181824]/90 border border-indigo-500/30 hover:border-indigo-500 rounded-2xl p-3.5 shadow-xl min-w-[200px] max-w-[240px] transition-all group backdrop-blur-md">
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-[#181824]"
      />

      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-black/50 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
          {!imgError ? (
            <img
              src={data.IconUrl}
              alt={data.Name}
              onError={() => setImgError(true)}
              className="w-full h-full object-contain"
            />
          ) : (
            <Sparkles className="w-5 h-5 text-indigo-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="font-bold text-xs text-white truncate block">
              {data.Description || data.Name}
            </span>
            {data.onDeleteNode && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  data.onDeleteNode?.(data.Name);
                }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-rose-400 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-[10px] font-mono text-indigo-300 block truncate">
            {data.Name}
          </span>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded">
              Max Lv: {data.MaxLevel}
            </span>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-[#181824]"
      />
    </div>
  );
};

// ─── CUSTOM PREREQUISITE EDGE COMPONENT ──────────────────────────────────────

const PrerequisiteEdgeComponent = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const level = (data?.level as number) || 1;
  const onLevelChange = data?.onLevelChange as ((edgeId: string, lv: number) => void) | undefined;
  const onDeleteEdge = data?.onDeleteEdge as ((edgeId: string) => void) | undefined;

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        strokeWidth={2.5}
        stroke="#6366f1"
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all'
          }}
          className="flex items-center gap-1 bg-[#13131c] border border-indigo-500/40 rounded-full px-2.5 py-1 shadow-lg text-[10px] text-white"
        >
          <span className="text-indigo-300 font-semibold">Lv</span>
          <input
            type="number"
            min={1}
            max={20}
            value={level}
            onChange={e => onLevelChange?.(id, parseInt(e.target.value) || 1)}
            className="w-8 bg-black/50 border border-white/10 rounded text-center text-white text-[10px] focus:outline-none focus:border-indigo-500"
          />
          {onDeleteEdge && (
            <button
              onClick={() => onDeleteEdge(id)}
              className="text-gray-400 hover:text-rose-400 ml-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // SkillNodeComponent width and height matching UI components
  const nodeWidth = 240;
  const nodeHeight = 100;

  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: 80,
    nodesep: 60,
  });

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: direction === 'TB' ? Position.Top : Position.Left,
      sourcePosition: direction === 'TB' ? Position.Bottom : Position.Right,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2
      }
    };
  });

  return { nodes: layoutedNodes, edges };
};

// ─── MAIN SKILL TREE EDITOR PAGE ─────────────────────────────────────────────

interface JobSummary {
  Job: string;
  SkillCount: number;
  category?: string;
}

const SkillTreeEditor: React.FC = () => {
  const t = useLanguageStore(state => state.t);
  const [jobsSummary, setJobsSummary] = useState<JobSummary[]>([]);
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // React Flow states
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Modal states for adding skill
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [skillSearchQuery, setSkillSearchQuery] = useState<string>('');
  const [allSkillsDB, setAllSkillsDB] = useState<Array<{ Id: number; Name: string; Description?: string; MaxLevel?: number }>>([]);
  const [loadingSkills, setLoadingSkills] = useState<boolean>(false);

  // Memoized custom node & edge types for React Flow
  const nodeTypes = useMemo(() => ({
    skillNode: SkillNodeComponent
  }), []);

  const edgeTypes = useMemo(() => ({
    prereqEdge: PrerequisiteEdgeComponent
  }), []);

  const fetchJobsSummary = useCallback(async () => {
    setLoading(true);
    setToastMessage(null);
    try {
      const res = await axios.get(`${API_URL}/api/progression/skill_tree`);
      const list = res.data.jobs || [];
      setJobsSummary(list);
      if (list.length > 0 && !selectedJob) {
        setSelectedJob(list[0].Job);
      }
    } catch (err: any) {
      console.error('Error fetching skill tree jobs:', err);
      setToastMessage({ text: t('skill_tree_editor.save_error', { error: err.message }), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [selectedJob, t]);

  const fetchAllSkills = useCallback(async () => {
    setLoadingSkills(true);
    try {
      const res = await axios.get(`${API_URL}/api/skills?limit=3000`);
      setAllSkillsDB(res.data.skills || []);
    } catch (err) {
      console.error('Error fetching skills DB:', err);
    } finally {
      setLoadingSkills(false);
    }
  }, []);

  useEffect(() => {
    fetchJobsSummary();
    fetchAllSkills();
  }, [fetchJobsSummary, fetchAllSkills]);

  const handleDeleteNode = useCallback((name: string) => {
    setNodes(nds => nds.filter(n => n.id !== name));
    setEdges(eds => eds.filter(e => e.source !== name && e.target !== name));
  }, [setNodes, setEdges]);

  const handleLevelChange = useCallback((edgeId: string, newLevel: number) => {
    setEdges(eds =>
      eds.map(e => (e.id === edgeId ? { ...e, data: { ...e.data, level: newLevel } } : e))
    );
  }, [setEdges]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges(eds => eds.filter(e => e.id !== edgeId));
  }, [setEdges]);

  const loadJobSkillTree = useCallback(async (jobName: string) => {
    setLoading(true);
    setToastMessage(null);
    try {
      const res = await axios.get(`${API_URL}/api/progression/skill_tree/${jobName}`);
      const treeList = res.data.Tree || [];

      // Convert tree nodes and prerequisites into React Flow nodes and edges
      const flowNodes: Node[] = [];
      const flowEdges: Edge[] = [];

      treeList.forEach((skill: any, index: number) => {
        // Compute simple initial grid layout
        const col = index % 4;
        const row = Math.floor(index / 4);

        flowNodes.push({
          id: skill.Name,
          type: 'skillNode',
          position: { x: col * 280 + 50, y: row * 180 + 50 },
          data: {
            Name: skill.Name,
            Id: skill.Id || 0,
            Description: skill.Description || skill.Name,
            MaxLevel: skill.MaxLevel || 10,
            IconUrl: skill.IconUrl || `/api/grf/skill_icon?name=${skill.Name}`,
            onDeleteNode: handleDeleteNode
          }
        });

        const reqs = skill.Requires || [];
        reqs.forEach((r: any) => {
          flowEdges.push({
            id: `${r.Name}->${skill.Name}`,
            source: r.Name,
            target: skill.Name,
            type: 'prereqEdge',
            data: {
              level: r.Level || 1,
              onLevelChange: handleLevelChange,
              onDeleteEdge: handleDeleteEdge
            }
          });
        });
      });

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges);
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } catch (err: any) {
      console.error(`Error loading tree for ${jobName}:`, err);
      setToastMessage({ text: t('skill_tree_editor.save_error', { error: err.message }), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [handleDeleteNode, handleLevelChange, handleDeleteEdge, setNodes, setEdges, t]);

  useEffect(() => {
    if (selectedJob) {
      loadJobSkillTree(selectedJob);
    }
  }, [selectedJob, loadJobSkillTree]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return;
      const edgeId = `${params.source}->${params.target}`;
      const newEdge: Edge = {
        id: edgeId,
        source: params.source,
        target: params.target,
        type: 'prereqEdge',
        data: {
          level: 1,
          onLevelChange: handleLevelChange,
          onDeleteEdge: handleDeleteEdge
        }
      };
      setEdges(eds => addEdge(newEdge, eds));
    },
    [setEdges, handleLevelChange, handleDeleteEdge]
  );

  const handleAutoLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [nodes, edges, setNodes, setEdges]);


  const handleSaveTree = async () => {
    if (!selectedJob) return;
    setSaving(true);
    setToastMessage(null);
    try {
      // Reconstruct Tree payload from React Flow nodes & edges
      const treePayload = nodes.map(node => {
        const incomingEdges = edges.filter(e => e.target === node.id);
        const requires = incomingEdges.map(e => ({
          Name: e.source,
          Level: (e.data?.level as number) || 1
        }));

        return {
          Name: node.data.Name as string,
          MaxLevel: (node.data.MaxLevel as number) || 10,
          Requires: requires
        };
      });

      await axios.put(`${API_URL}/api/progression/skill_tree/${selectedJob}`, {
        tree: treePayload
      });

      setToastMessage({ text: t('skill_tree_editor.save_success'), type: 'success' });
    } catch (err: any) {
      setToastMessage({ text: t('skill_tree_editor.save_error', { error: err.message }), type: 'error' });
    } finally {
      setSaving(false);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleAddNewSkill = (skill: { Id: number; Name: string; Description?: string; MaxLevel?: number }) => {
    // Check if skill already exists in tree
    if (nodes.some(n => n.id === skill.Name)) {
      setIsAddModalOpen(false);
      return;
    }

    const newNode: Node = {
      id: skill.Name,
      type: 'skillNode',
      position: { x: 100, y: 100 },
      data: {
        Name: skill.Name,
        Id: skill.Id,
        Description: skill.Description || skill.Name,
        MaxLevel: skill.MaxLevel || 10,
        IconUrl: `/api/grf/skill_icon?name=${skill.Name}&id=${skill.Id}`,
        onDeleteNode: handleDeleteNode
      }
    };

    setNodes(nds => [...nds, newNode]);
    setIsAddModalOpen(false);
  };

  const filteredModalSkills = useMemo(() => {
    if (!skillSearchQuery.trim()) return allSkillsDB.slice(0, 40);
    const q = skillSearchQuery.toLowerCase();
    return allSkillsDB.filter(sk =>
      sk.Name.toLowerCase().includes(q) ||
      (sk.Description && sk.Description.toLowerCase().includes(q)) ||
      String(sk.Id).includes(q)
    ).slice(0, 40);
  }, [allSkillsDB, skillSearchQuery]);

  return (
    <div className="flex flex-col h-full w-full bg-[#0f0f14] overflow-hidden">
      {/* Top Header */}
      <div className="px-8 py-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 bg-[#13131c]/80 backdrop-blur-md z-10">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Network className="w-6 h-6 text-indigo-400" />
            {t('skill_tree_editor.title')}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">{t('skill_tree_editor.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Job Selector */}
          <select
            value={selectedJob}
            onChange={e => setSelectedJob(e.target.value)}
            className="bg-black/40 border border-white/10 text-white text-xs rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500"
          >
            <optgroup label={t('skill_tree_editor.cat_non_transcendent')}>
              {jobsSummary
                .filter(js => js.category !== 'Transcendent')
                .map(js => (
                  <option key={js.Job} value={js.Job}>
                    {js.Job} ({js.SkillCount} skills)
                  </option>
                ))}
            </optgroup>
            <optgroup label={t('skill_tree_editor.cat_transcendent')}>
              {jobsSummary
                .filter(js => js.category === 'Transcendent')
                .map(js => (
                  <option key={js.Job} value={js.Job}>
                    {js.Job} ({js.SkillCount} skills)
                  </option>
                ))}
            </optgroup>
          </select>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            {t('skill_tree_editor.add_skill_btn')}
          </button>

          <button
            onClick={handleAutoLayout}
            className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all"
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            {t('skill_tree_editor.auto_layout_btn')}
          </button>

          {toastMessage && (
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold animate-in fade-in ${
                toastMessage.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              {toastMessage.type === 'success' ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {toastMessage.text}
            </div>
          )}

          <button
            onClick={handleSaveTree}
            disabled={saving || !selectedJob}
            className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 disabled:opacity-50 transition-all"
          >
            <Save className="w-4 h-4" />
            {t('skill_tree_editor.save_btn')}
          </button>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 w-full h-full relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          className="bg-[#0f0f14]"
        >
          <Background gap={20} size={1} color="#ffffff10" />
          <Controls className="!bg-[#181824] !border-white/10 !rounded-xl !overflow-hidden" />
          <MiniMap
            nodeColor="#6366f1"
            maskColor="#0f0f1480"
            className="!bg-[#181824] !border !border-white/10 !rounded-xl"
          />
        </ReactFlow>
      </div>

      {/* Add Skill Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#181824] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {t('skill_tree_editor.modal_add_title')}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={skillSearchQuery}
                  onChange={e => setSkillSearchQuery(e.target.value)}
                  placeholder={t('skill_tree_editor.modal_search_placeholder')}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-white/5 border border-white/10 rounded-xl">
                {filteredModalSkills.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-500">
                    ---
                  </div>
                ) : (
                  filteredModalSkills.map(skill => (
                    <div
                      key={skill.Id}
                      className="p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                    >
                      <div>
                        <span className="font-semibold text-xs text-white block">
                          {skill.Description || skill.Name}
                        </span>
                        <span className="text-[10px] font-mono text-indigo-300">
                          {skill.Name} (ID: {skill.Id})
                        </span>
                      </div>
                      <button
                        onClick={() => handleAddNewSkill(skill)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                      >
                        {t('skill_tree_editor.btn_add')}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillTreeEditor;
