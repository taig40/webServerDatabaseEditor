/**
 * MapSpawnsTab.tsx — Visual drag-and-drop management tab for custom map spawns.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import axios from 'axios';
import { API_URL } from '../../config/env';
import { Loader2, Search, Skull, Target, Trash2, Globe, RefreshCw, AlertCircle, Edit2, Save } from 'lucide-react';
import MonsterAnimator from '../MonsterAnimator';

/**
 * Renders an editable spawn card showing monster animation, coordinates, amount, and respawn delay.
 */
const SpawnCard: React.FC<{ spawn: SpawnEntry, activeMap: string, deleteSpawn: (id: string) => void, fetchSpawns: (map: string) => void }> = ({ spawn, activeMap, deleteSpawn, fetchSpawns }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({
    amount: spawn.amount,
    delay1: spawn.delay1,
    x: spawn.x,
    y: spawn.y
  });

  const handleSave = async () => {
    try {
      await axios.put(`${API_URL}/api/scripts/custom-spawns/maps/${activeMap}/${spawn.uuid}`, {
        ...spawn,
        amount: Number(form.amount) || 1,
        delay1: Number(form.delay1) || 0,
        x: Number(form.x) || 0,
        y: Number(form.y) || 0,
      });
      setIsEditing(false);
      fetchSpawns(activeMap);
    } catch (err) {
      console.error('Error saving spawn:', err);
    }
  };

  return (
    <div className="group relative bg-gray-900/80 border border-gray-800 hover:border-teal-500/50 rounded-xl overflow-hidden shadow-md transition-all duration-300">
       {/* Actions Overlay */}
       <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
         {isEditing ? (
           <button onClick={handleSave} className="bg-emerald-500/90 hover:bg-emerald-500 text-white p-2 rounded-lg shadow-lg hover:scale-110 transition-transform" title="Salvar">
             <Save className="w-4 h-4" />
           </button>
         ) : (
           <button onClick={() => setIsEditing(true)} className="bg-blue-500/90 hover:bg-blue-500 text-white p-2 rounded-lg shadow-lg hover:scale-110 transition-transform" title="Editar">
             <Edit2 className="w-4 h-4" />
           </button>
         )}
         <button onClick={() => deleteSpawn(spawn.uuid)} className="bg-red-500/90 hover:bg-red-500 text-white p-2 rounded-lg shadow-lg hover:scale-110 transition-transform" title="Remover Spawn">
           <Trash2 className="w-4 h-4" />
         </button>
       </div>

       {/* Header & GIF */}
       <div className="h-32 bg-gray-950 flex items-center justify-center p-2 relative overflow-hidden group-hover:bg-gray-950/80 transition-colors">
          <div className="scale-75 transform origin-center">
            <MonsterAnimator mobId={spawn.mobid as number} mobName={spawn.mobname} size="md" />
          </div>
          <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[10px] font-mono text-gray-400 border border-white/5">
            ID: {spawn.mobid}
          </div>
       </div>

       {/* Info Panel */}
       <div className="p-4 bg-gray-900/50 border-t border-gray-800">
         <h4 className="font-bold text-gray-200 text-sm truncate mb-3" title={spawn.mobname}>
           {spawn.mobname}
         </h4>
         
         <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-[10px] font-mono">
           <div className="flex flex-col bg-gray-950/50 p-1.5 rounded border border-gray-800/50">
             <span className="text-gray-500 mb-0.5">Amount</span>
             {isEditing ? (
               <input type="number" min="1" max="1000" className="bg-gray-900 border border-gray-700 rounded px-1 text-emerald-400 text-xs w-full" value={form.amount} onChange={e => setForm({...form, amount: Number(e.target.value)})} />
             ) : (
               <span className="text-emerald-400 text-xs font-bold">{spawn.amount}</span>
             )}
           </div>
           <div className="flex flex-col bg-gray-950/50 p-1.5 rounded border border-gray-800/50">
             <span className="text-gray-500 mb-0.5">Respawn (ms)</span>
             {isEditing ? (
               <input type="number" min="0" className="bg-gray-900 border border-gray-700 rounded px-1 text-yellow-400 text-xs w-full" value={form.delay1} onChange={e => setForm({...form, delay1: Number(e.target.value)})} />
             ) : (
               <span className="text-yellow-400 text-xs font-bold">{spawn.delay1}ms</span>
             )}
           </div>
           <div className="flex flex-col col-span-2 bg-gray-950/50 p-1.5 rounded border border-gray-800/50">
             <span className="text-gray-500 mb-0.5">Coords (0 = Random)</span>
             {isEditing ? (
               <div className="flex gap-2">
                 <input type="number" min="0" className="bg-gray-900 border border-gray-700 rounded px-1 text-cyan-300 text-xs w-full" placeholder="X" value={form.x} onChange={e => setForm({...form, x: Number(e.target.value)})} />
                 <input type="number" min="0" className="bg-gray-900 border border-gray-700 rounded px-1 text-cyan-300 text-xs w-full" placeholder="Y" value={form.y} onChange={e => setForm({...form, y: Number(e.target.value)})} />
               </div>
             ) : (
               <span className="text-cyan-300 text-xs">
                 ({spawn.x === 0 ? 'Random' : spawn.x}, {spawn.y === 0 ? 'Random' : spawn.y})
               </span>
             )}
           </div>
         </div>
       </div>
    </div>
  );
};

/** Lightweight reference object for monster lookup entries. */
interface MobRef {
  Id: number;
  AegisName: string;
  Name: string;
  is_custom?: boolean;
}

/** Data contract representing a single custom spawn row inside a map file. */
interface SpawnEntry {
  uuid: string;
  map: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
  mobname: string;
  mobid: number | string;
  amount: number;
  delay1: number;
  delay2: number;
  event: string;
  raw_line: string;
}

/**
 * Main management interface for drag-and-drop custom monster spawns on active maps.
 */
export const MapSpawnsTab: React.FC = () => {
  const [mobList, setMobList] = useState<MobRef[]>([]);
  const [loadingMobs, setLoadingMobs] = useState(false);
  const [mobSearch, setMobSearch] = useState('');

  const [mapsList, setMapsList] = useState<string[]>([]);
  const [activeMap, setActiveMap] = useState('');
  const [newMapName, setNewMapName] = useState('');
  
  const [spawns, setSpawns] = useState<SpawnEntry[]>([]);
  const [loadingSpawns, setLoadingSpawns] = useState(false);

  useEffect(() => {
    fetchMaps();
    fetchMobs();
  }, []);

  const fetchMaps = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/scripts/custom-spawns/maps`);
      const maps = res.data.maps || [];
      setMapsList(maps);
      if (maps.length > 0 && !activeMap) {
        setActiveMap(maps[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMobs = async () => {
    setLoadingMobs(true);
    try {
      const res = await axios.get(`${API_URL}/api/mobs/references`);
      setMobList(res.data.mobs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMobs(false);
    }
  };

  useEffect(() => {
    if (activeMap) fetchSpawns(activeMap);
  }, [activeMap]);

  const fetchSpawns = async (mapName: string) => {
    setLoadingSpawns(true);
    try {
      const res = await axios.get(`${API_URL}/api/scripts/custom-spawns/maps/${mapName}`);
      setSpawns(res.data.spawns || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSpawns(false);
    }
  };

  const filteredMobs = useMemo(() => {
    const q = mobSearch.toLowerCase().trim();
    if (!q) return mobList.slice(0, 50);
    return mobList.filter(m => 
      String(m.Id).includes(q) || 
      (m.Name && m.Name.toLowerCase().includes(q)) || 
      (m.AegisName && m.AegisName.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [mobList, mobSearch]);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    if (result.destination.droppableId === 'canvas-droppable') {
      const mobIdStr = result.draggableId.replace('mob-', '');
      const mob = mobList.find(m => String(m.Id) === mobIdStr);
      if (!mob || !activeMap) return;

      try {
        await axios.post(`${API_URL}/api/scripts/custom-spawns/maps/${activeMap}`, {
          mapname: activeMap,
          x: 0,
          y: 0,
          rx: 0,
          ry: 0,
          mobid: mob.Id,
          mobname: mob.AegisName || mob.Name,
          amount: 1,
          delay1: 0,
          event: ""
        });
        fetchSpawns(activeMap);
      } catch (err) {
        console.error('Error injecting spawn via DnD', err);
      }
    }
  };

  const deleteSpawn = async (uuid: string) => {
    try {
      await axios.delete(`${API_URL}/api/scripts/custom-spawns/maps/${activeMap}/${uuid}`);
      fetchSpawns(activeMap);
      fetchMaps();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateMap = () => {
    if (newMapName.trim()) {
      setActiveMap(newMapName.trim());
      if (!mapsList.includes(newMapName.trim())) {
         setMapsList([...mapsList, newMapName.trim()]);
      }
      setNewMapName('');
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col lg:flex-row flex-1 gap-4 overflow-hidden h-full text-gray-100">
        
        {/* LEFT SIDEBAR: Maps & Mobs */}
        <div className="w-full lg:w-[320px] flex flex-col gap-4 shrink-0 overflow-hidden">
          
          {/* Maps Selector */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-xl flex flex-col shrink-0 p-3">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Active Maps</h3>
            <select 
              value={activeMap}
              onChange={e => setActiveMap(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-teal-300 focus:outline-none focus:border-teal-500 mb-2"
            >
              <option value="" disabled>Select a map...</option>
              {mapsList.map(m => (
                 <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <input 
                 type="text" 
                 placeholder="New Map (e.g. prt_fild01)"
                 value={newMapName}
                 onChange={e => setNewMapName(e.target.value)}
                 className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200"
              />
              <button 
                onClick={handleCreateMap}
                className="bg-teal-600 hover:bg-teal-500 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors"
              >
                Go
              </button>
            </div>
          </div>

          {/* Mobs Draggable List */}
          <div className="flex-1 flex flex-col bg-gray-900/80 border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-gray-800">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  value={mobSearch}
                  onChange={e => setMobSearch(e.target.value)}
                  placeholder="Search Mobs to Drop..."
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-9 pr-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
            
            <Droppable droppableId="mobs-droppable" isDropDisabled={true}>
              {(provided) => (
                <div 
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="flex-1 overflow-y-auto p-2 space-y-2"
                >
                  {loadingMobs ? (
                    <div className="flex justify-center p-4"><Loader2 className="animate-spin w-5 h-5 text-purple-500" /></div>
                  ) : filteredMobs.length === 0 ? (
                    <div className="text-center text-xs text-gray-500 p-4">No mobs found.</div>
                  ) : (
                    filteredMobs.map((mob, index) => (
                      <Draggable key={`mob-${mob.Id}`} draggableId={`mob-${mob.Id}`} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${snapshot.isDragging ? 'bg-purple-900/80 border-purple-500 shadow-2xl z-50 scale-105' : 'bg-gray-950/60 border-gray-800 hover:border-gray-600'}`}
                            style={{ ...provided.draggableProps.style }}
                          >
                            <div className="w-10 h-10 flex-shrink-0 bg-black/40 rounded flex items-center justify-center overflow-hidden">
                               <MonsterAnimator mobId={mob.Id} mobName={mob.AegisName} size="sm" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold text-gray-200 truncate">{mob.Name || mob.AegisName}</div>
                              <div className="text-xs text-gray-500 font-mono">ID: {mob.Id}</div>
                            </div>
                            <Skull className="w-4 h-4 text-purple-500/50" />
                          </div>
                        )}
                      </Draggable>
                    ))
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>

        {/* RIGHT CANVAS: Droppable Area */}
        <Droppable droppableId="canvas-droppable">
          {(provided, snapshot) => (
            <div 
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`flex-1 flex flex-col border-2 rounded-xl overflow-hidden transition-all duration-300 relative ${snapshot.isDraggingOver ? 'bg-teal-900/20 border-teal-500 border-dashed shadow-inner' : 'bg-gray-900/40 border-gray-800'}`}
            >
               {snapshot.isDraggingOver && (
                  <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none opacity-20">
                     <Target className="w-32 h-32 text-teal-500 animate-pulse" />
                  </div>
               )}

               <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/60 shadow-sm shrink-0 z-10 relative">
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-teal-400" />
                    <span className="font-bold text-gray-200">
                      {activeMap ? `Canvas: ${activeMap}` : 'Selecione um mapa para iniciar'}
                    </span>
                  </div>
                  <button
                    onClick={() => activeMap && fetchSpawns(activeMap)}
                    disabled={!activeMap || loadingSpawns}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 border border-gray-700 rounded-md text-xs font-medium transition-colors shadow-sm"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingSpawns ? 'animate-spin' : ''}`} />
                    Atualizar
                  </button>
               </div>

               <div className="flex-1 overflow-y-auto p-6 z-10 relative">
                  {!activeMap ? (
                     <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3 opacity-50">
                        <Globe className="w-12 h-12" />
                        <p className="text-sm font-medium">Selecione ou crie um mapa primeiro.</p>
                     </div>
                  ) : loadingSpawns ? (
                     <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
                     </div>
                  ) : spawns.length === 0 ? (
                     <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                        <p className="text-sm font-medium">Nenhum monstro. Arraste um da lista para cá!</p>
                     </div>
                  ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                        {spawns.map(spawn => (
                           <SpawnCard key={spawn.uuid} spawn={spawn} activeMap={activeMap} deleteSpawn={deleteSpawn} fetchSpawns={fetchSpawns} />
                        ))}
                     </div>
                  )}
                  {provided.placeholder}
               </div>
            </div>
          )}
        </Droppable>
      </div>
    </DragDropContext>
  );
};
