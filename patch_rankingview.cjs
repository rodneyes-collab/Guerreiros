const fs = require('fs');
let code = fs.readFileSync('components/RankingView.tsx', 'utf8');

if (!code.includes('BrainCircuit')) {
  code = code.replace(/import \{([^}]+)\} from 'lucide-react';/, "import {$1, BrainCircuit} from 'lucide-react';");
}

code = code.replace("import { Player, Match, SystemMetadata } from '../types';", "import { Player, Match, SystemMetadata } from '../types';\nimport { SynergyAnalysis } from './SynergyAnalysis';");

const stateOld = `const [activeTab, setActiveTab] = useState<'daily' | 'individual' | 'global'>('daily');`;
const stateNew = `const [activeTab, setActiveTab] = useState<'daily' | 'individual' | 'global' | 'synergy'>('daily');`;
code = code.replace(stateOld, stateNew);

const buttonsOld = `<button
          onClick={() => setActiveTab('global')}
          className={\`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 \${
            activeTab === 'global' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : \`text-white/40 hover:text-white\`
          }\`}
        >
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">Global</span>
        </button>`;

const buttonsNew = `<button
          onClick={() => setActiveTab('global')}
          className={\`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 \${
            activeTab === 'global' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : \`text-white/40 hover:text-white\`
          }\`}
        >
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">Global</span>
        </button>
        <button
          onClick={() => setActiveTab('synergy')}
          className={\`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 \${
            activeTab === 'synergy' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : \`text-white/40 hover:text-white\`
          }\`}
        >
          <BrainCircuit className="w-4 h-4" />
          <span className="hidden sm:inline">Sinergia</span>
        </button>`;
code = code.replace(buttonsOld, buttonsNew);

const renderOld = `        ) : activeTab === 'daily' ? (`;
const renderNew = `        ) : activeTab === 'synergy' ? (
          <motion.div
            key="synergy"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <SynergyAnalysis players={allPlayers} matches={allMatches} />
          </motion.div>
        ) : activeTab === 'daily' ? (`;

code = code.replace(renderOld, renderNew);

fs.writeFileSync('components/RankingView.tsx', code);
