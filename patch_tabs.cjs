const fs = require('fs');
let code = fs.readFileSync('components/RankingView.tsx', 'utf8');

const tabsOld = `<button
          onClick={() => setActiveTab('global')}
          className={\`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 \${
            activeTab === 'global' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : \`text-white/40 hover:text-white\`
          }\`}
        >
          <BarChart3 className="w-4 h-4" />
          Global
        </button>`;

const tabsNew = `<button
          onClick={() => setActiveTab('global')}
          className={\`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 \${
            activeTab === 'global' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : \`text-white/40 hover:text-white\`
          }\`}
        >
          <BarChart3 className="w-4 h-4 hidden sm:block" />
          Global
        </button>
        <button
          onClick={() => setActiveTab('synergy')}
          className={\`flex-1 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 \${
            activeTab === 'synergy' 
              ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' 
              : \`text-white/40 hover:text-white\`
          }\`}
        >
          <BrainCircuit className="w-4 h-4 hidden sm:block" />
          Sinergia
        </button>`;

code = code.replace(tabsOld, tabsNew);

// Also add hidden sm:block to other tab icons to make space on mobile since there are 4 tabs now.
const tabsOld2 = `<Calendar className="w-4 h-4" />
          Destaques
        </button>`;
const tabsNew2 = `<Calendar className="w-4 h-4 hidden sm:block" />
          Destaques
        </button>`;
code = code.replace(tabsOld2, tabsNew2);

const tabsOld3 = `<Users className="w-4 h-4" />
          Individual
        </button>`;
const tabsNew3 = `<Users className="w-4 h-4 hidden sm:block" />
          Individual
        </button>`;
code = code.replace(tabsOld3, tabsNew3);


fs.writeFileSync('components/RankingView.tsx', code);
