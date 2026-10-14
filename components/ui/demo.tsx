import React, { useState } from 'react';
import { 
  Search, 
  LayoutDashboard, 
  Users, 
  Settings, 
  LogOut,
  ChevronDown,
  ChevronRight,
  Inbox,
  Calendar,
  Layers,
  Facebook,
  Instagram,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
  Command,
  X,
  TrendingUp,
  Clock,
  ShieldCheck
} from 'lucide-react';

export type NavItemData = {
  id: string;
  title: string;
  icon: React.ElementType;
  badge?: number | string;
  shortcut?: string;
  children?: NavItemData[];
};

export type NavGroupData = {
  heading?: string;
  items: NavItemData[];
};

export const crmNavGroups: NavGroupData[] = [
  {
    items: [
      { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, shortcut: '⌘D' },
      { id: 'leads', title: 'Leads', icon: Users, shortcut: '⌘L' },
      { id: 'inbox', title: 'Messages', icon: Inbox, shortcut: '⌘M' },
      { id: 'pipeline', title: 'Pipelines', icon: Layers, shortcut: '⌘P' },
    ]
  },
  {
    heading: 'Management',
    items: [
      { id: 'tasks', title: 'Follow-ups', icon: Calendar, shortcut: '⌘T' },
      { 
        id: 'channels', 
        title: 'Meta Channels', 
        icon: Facebook,
        children: [
          { id: 'fb-pages', title: 'Facebook Pages', icon: Facebook },
          { id: 'ig-accounts', title: 'Instagram Direct', icon: Instagram },
        ]
      },
      { id: 'integrations', title: 'Integrations', icon: Zap },
    ]
  }
];

export const crmBottomItems: NavItemData[] = [
  { id: 'settings', title: 'Settings', icon: Settings, shortcut: '⌘,' },
  { id: 'logout', title: 'Log out', icon: LogOut },
];

export function WorkspaceSwitcher({ selected, onSelect }: { selected?: string, onSelect?: (ws: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSelected, setInternalSelected] = useState('MetaCRM Workspace');
  
  const current = selected || internalSelected;
  const handleSelect = onSelect || setInternalSelected;

  return (
    <div className="relative">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-2 py-2 mb-4 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors select-none group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[6px] bg-primary text-primary-foreground flex items-center justify-center font-semibold text-[13px] shadow-sm">
            {current.charAt(0)}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-[13px] font-medium leading-none mb-1 text-foreground truncate max-w-[120px]">{current}</span>
            <span className="text-[11px] text-muted-foreground leading-none">Production Plan</span>
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-muted-foreground/50 group-hover:text-foreground/70 transition-colors shrink-0" strokeWidth={1.5} />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-[52px] left-0 w-full bg-card border border-border/50 rounded-lg shadow-xl z-50 py-1 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100">
            {['MetaCRM Workspace', 'Production CRM'].map(ws => (
              <div 
                key={ws}
                onClick={() => { handleSelect(ws); setIsOpen(false); }}
                className={`px-3 py-2 mx-1 text-[13px] rounded-md cursor-pointer transition-colors ${current === ws ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                {ws}
              </div>
            ))}
            <div className="h-px bg-border/50 my-1 mx-2" />
            <div className="px-3 py-2 mx-1 text-[13px] text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-md cursor-pointer flex items-center gap-2 transition-colors">
              <span className="text-[16px] leading-none mb-0.5">+</span> Create Workspace
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function NavItem({ 
  item, 
  activeId, 
  onSelect,
  level = 0
}: { 
  item: NavItemData; 
  activeId: string; 
  onSelect: (id: string) => void;
  level?: number;
}) {
  const isActive = activeId === item.id;
  const hasChildren = !!item.children;
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = () => {
    if (hasChildren) {
      setIsOpen(!isOpen);
    } else {
      onSelect(item.id);
    }
  };

  return (
    <div className="flex flex-col w-full">
      <div 
        className={`group flex items-center justify-between px-2.5 py-[7px] rounded-[6px] cursor-pointer transition-all duration-200 select-none
          ${isActive 
            ? 'bg-black/5 dark:bg-white/10 text-foreground font-medium' 
            : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground/90'
          }
        `}
        style={{ paddingLeft: `${level * 12 + 10}px` }}
        onClick={handleClick}
      >
        <div className="flex items-center gap-2.5">
          <item.icon 
            className={`w-[16px] h-[16px] transition-colors
              ${isActive ? 'text-foreground' : 'text-muted-foreground/70 group-hover:text-foreground/70'}
            `} 
            strokeWidth={1.5} 
          />
          <span className="text-[13px] tracking-wide truncate">
            {item.title}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {item.shortcut && (
             <kbd className="hidden group-hover:inline-flex items-center justify-center h-5 px-1.5 text-[10px] font-medium font-mono text-muted-foreground/60 bg-background/50 border border-border/50 rounded-[4px] shadow-xs">
               {item.shortcut}
             </kbd>
          )}
          {item.badge && (
            <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-medium rounded-full bg-primary/10 text-primary">
              {item.badge}
            </span>
          )}
          {hasChildren && (
            <ChevronRight 
              className={`w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} 
              strokeWidth={2}
            />
          )}
        </div>
      </div>

      {hasChildren && (
        <div 
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
            isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          }`}
        >
          <div className="overflow-hidden min-h-0 relative flex flex-col gap-0.5 mt-0.5">
            <div 
              className="absolute top-0 bottom-0 border-l border-black/5 dark:border-white/5"
              style={{ left: `${level * 12 + 17.5}px` }}
            />
            {item.children!.map(child => (
              <NavItem 
                key={child.id} 
                item={child} 
                activeId={activeId} 
                onSelect={onSelect} 
                level={level + 1} 
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SidebarNav({ 
  className = '',
  activeId,
  onSelect,
  activeWorkspace,
  onWorkspaceSelect
}: { 
  className?: string,
  activeId?: string,
  onSelect?: (id: string) => void,
  activeWorkspace?: string,
  onWorkspaceSelect?: (ws: string) => void
}) {
  const [internalId, setInternalId] = useState('dashboard');
  const currentId = activeId !== undefined ? activeId : internalId;
  const handleSelect = onSelect || setInternalId;

  return (
    <div className={`flex flex-col w-[260px] h-full bg-card/50 border-r border-border/50 p-3 font-sans ${className}`}>
      <WorkspaceSwitcher selected={activeWorkspace} onSelect={onWorkspaceSelect} />

      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col gap-4 mt-2">
        {crmNavGroups.map((group, idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
            {group.heading && (
              <span className="px-2.5 mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/50 uppercase">
                {group.heading}
              </span>
            )}
            {group.items.map(item => (
              <NavItem 
                key={item.id} 
                item={item} 
                activeId={currentId} 
                onSelect={handleSelect} 
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-auto pt-4 border-t border-border/50 flex flex-col gap-0.5">
        {crmBottomItems.map(item => (
          <NavItem 
            key={item.id} 
            item={item} 
            activeId={currentId} 
            onSelect={handleSelect} 
          />
        ))}
      </div>
    </div>
  );
}

const allItems = [...crmNavGroups.flatMap(g => g.items), ...crmBottomItems];
const flattenItems = (items: NavItemData[]): NavItemData[] => {
  return items.reduce((acc, item) => {
    acc.push(item);
    if (item.children) acc.push(...flattenItems(item.children));
    return acc;
  }, [] as NavItemData[]);
};
const flatNavData = flattenItems(allItems);

export default function SidebarNavPreview() {
  const [isOpen, setIsOpen] = useState(true);
  const [activeId, setActiveId] = useState('dashboard');
  const [activeWorkspace, setActiveWorkspace] = useState('MetaCRM Workspace');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const activeItem = flatNavData.find(i => i.id === activeId);
  const activeTitle = activeItem ? activeItem.title : 'Dashboard';

  const handleSelect = (id: string) => {
    setActiveId(id);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[700px] bg-background p-4 md:p-8">
      <div className="relative w-full max-w-5xl h-[720px] bg-card rounded-xl border border-border/50 flex overflow-hidden shadow-sm ring-1 ring-black/5 dark:ring-white/5">
        <div 
          className={`h-full transition-all duration-300 ease-in-out shrink-0 overflow-hidden bg-card/50 border-r border-border/50 ${
            isOpen ? 'w-[260px] opacity-100' : 'w-0 opacity-0 border-none'
          }`}
        >
          <SidebarNav 
            className="w-[260px] border-none bg-transparent" 
            activeId={activeId}
            onSelect={handleSelect}
            activeWorkspace={activeWorkspace}
            onWorkspaceSelect={setActiveWorkspace}
          />
        </div>
        
        <div className="flex-1 bg-black/[0.02] dark:bg-white/[0.02] flex flex-col min-w-0 transition-all duration-300">
           <div className="h-14 border-b border-border/50 flex items-center px-4 justify-between bg-card shrink-0">
             <div className="flex items-center gap-3">
               <button 
                 onClick={() => setIsOpen(!isOpen)}
                 className="p-1.5 rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-colors"
                 aria-label="Toggle navigation"
               >
                 {isOpen ? <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.5} /> : <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.5} />}
               </button>
               <div className="flex items-center gap-2 text-sm text-muted-foreground">
                 <span className="truncate">{activeWorkspace}</span>
                 <span>/</span>
                 <span className="font-medium text-foreground truncate">{activeTitle}</span>
               </div>
             </div>
             
             <div className="flex items-center gap-3">
               <button 
                 onClick={() => setIsSearchOpen(true)}
                 className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-black/5 dark:bg-white/5 border border-border/50 rounded-md hover:text-foreground transition-colors"
               >
                 <Search className="w-3.5 h-3.5" />
                 <span>Search CRM (⌘K)</span>
               </button>
               <div className="w-8 h-8 bg-primary/10 text-primary rounded-full border border-primary/20 flex items-center justify-center font-bold text-xs">
                 A
               </div>
             </div>
           </div>

           <div className="p-6 md:p-8 overflow-y-auto flex-1">
             <div className="flex items-center justify-between mb-6">
               <div>
                 <h2 className="text-xl font-bold text-foreground">Welcome to MetaCRM</h2>
                 <p className="text-xs text-muted-foreground">Real-time Lead Ads and Messenger ingestion dashboard</p>
               </div>
               <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 rounded-full border border-emerald-200 dark:border-emerald-800">
                 <ShieldCheck className="w-3.5 h-3.5" />
                 System Healthy
               </span>
             </div>
             
             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
               <div className="bg-card p-4 rounded-xl border border-border/50 shadow-xs flex flex-col justify-between">
                 <div className="flex items-center justify-between text-muted-foreground mb-2">
                   <span className="text-xs font-medium">Total Leads</span>
                   <Users className="w-4 h-4 text-blue-500" />
                 </div>
                 <div className="text-2xl font-bold text-foreground">Live Pipeline</div>
                 <span className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                   <TrendingUp className="w-3 h-3 text-emerald-500" /> Synced with Meta Lead Ads
                 </span>
               </div>

               <div className="bg-card p-4 rounded-xl border border-border/50 shadow-xs flex flex-col justify-between">
                 <div className="flex items-center justify-between text-muted-foreground mb-2">
                   <span className="text-xs font-medium">Speed to Lead</span>
                   <Clock className="w-4 h-4 text-amber-500" />
                 </div>
                 <div className="text-2xl font-bold text-foreground">&lt; 5 mins</div>
                 <span className="text-[11px] text-muted-foreground mt-1">SLA Target Compliance</span>
               </div>

               <div className="bg-card p-4 rounded-xl border border-border/50 shadow-xs flex flex-col justify-between">
                 <div className="flex items-center justify-between text-muted-foreground mb-2">
                   <span className="text-xs font-medium">Connected Channels</span>
                   <Facebook className="w-4 h-4 text-blue-600" />
                 </div>
                 <div className="text-2xl font-bold text-foreground">Facebook &amp; IG</div>
                 <span className="text-[11px] text-muted-foreground mt-1">Direct Webhook Ingestion</span>
               </div>
             </div>

             <div className="w-full bg-card rounded-xl border border-border/50 shadow-xs p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Active Pipelines &amp; Channels</h3>
                  <span className="text-xs text-muted-foreground">Ready for production routing</span>
                </div>
                
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-border/40 text-xs">
                    <span className="font-medium text-foreground">Meta Lead Ads Instant Ingestion</span>
                    <span className="text-emerald-600 font-semibold">Active</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-border/40 text-xs">
                    <span className="font-medium text-foreground">Instagram &amp; Messenger Live Sync</span>
                    <span className="text-emerald-600 font-semibold">Active</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-border/40 text-xs">
                    <span className="font-medium text-foreground">Automated Lead Assignment &amp; Follow-up Reminders</span>
                    <span className="text-emerald-600 font-semibold">Active</span>
                  </div>
               </div>
             </div>
           </div>
        </div>

        {isSearchOpen && (
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-[15vh] bg-background/40 backdrop-blur-sm px-4">
            <div className="absolute inset-0" onClick={() => setIsSearchOpen(false)} />
            <div className="relative w-full max-w-xl bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center px-4 border-b border-border/50">
                <Search className="w-[18px] h-[18px] text-muted-foreground/70 mr-3 shrink-0" strokeWidth={1.5} />
                <input 
                  autoFocus
                  className="flex-1 bg-transparent py-4 outline-none text-[14px] text-foreground placeholder:text-muted-foreground/50"
                  placeholder="Search leads, pipelines, channels..."
                />
                <kbd 
                  onClick={() => setIsSearchOpen(false)}
                  className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 ml-2 text-[10px] font-medium font-mono text-muted-foreground/70 bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-[4px] cursor-pointer hover:text-foreground hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                >
                  ESC
                </kbd>
                <button 
                  onClick={() => setIsSearchOpen(false)}
                  className="ml-3 p-1 rounded-md text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                >
                  <X className="w-[18px] h-[18px]" strokeWidth={1.5} />
                </button>
              </div>
              <div className="p-2 py-8 flex flex-col items-center justify-center">
                 <Command className="w-6 h-6 text-muted-foreground/30 mb-2" strokeWidth={1.5} />
                 <p className="text-[13px] text-muted-foreground font-medium">Type a search query for leads or navigation...</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
