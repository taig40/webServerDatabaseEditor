import React, { useState } from 'react';
import Layout, { type ModuleId } from './components/Layout';
import ItemEditor from './pages/ItemEditor';
import MonsterEditor from './pages/MonsterEditor';
import SkillEditor from './pages/SkillEditor';
import MobSkillEditor from './pages/MobSkillEditor';
import ComboEditor from './pages/ComboEditor';
import QuestEditor from './pages/QuestEditor';
import PetEditor from './pages/PetEditor';
import ClientItemEditor from './pages/ClientItemEditor';

function App() {
  const [activeView, setActiveView] = useState<ModuleId>('items');

  const renderContent = () => {
    switch (activeView) {
      case 'items':          return <ItemEditor />;
      case 'mobs':           return <MonsterEditor />;
      case 'skills':         return <SkillEditor />;
      case 'mob_skills':     return <MobSkillEditor />;
      case 'item_combos':    return <ComboEditor />;
      case 'server_quests':  return <QuestEditor />;
      case 'pets':           return <PetEditor />;
      case 'client_items':   return <ClientItemEditor />;
      default:               return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
          <span className="text-5xl">🚧</span>
          <span className="text-lg font-medium">Em desenvolvimento</span>
          <span className="text-sm">Este módulo estará disponível em breve.</span>
        </div>
      );
    }
  };

  return (
    <Layout activeView={activeView} onViewChange={setActiveView}>
      {renderContent()}
    </Layout>
  );
}

export default App;
