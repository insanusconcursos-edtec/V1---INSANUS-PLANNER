import React, { useState, useEffect } from 'react';
import { User, StudyPlan, Discipline, Subject, Goal, Cycle, Folder, SubGoal, GoalType } from '../types';
import { Icon } from '../components/Icons';
import { uuid } from '../constants';
import { fetchUsersFromDB, saveUserToDB, deleteUserFromDB, fetchPlansFromDB, savePlanToDB } from '../services/db';

// --- Users Manager ---
const UsersManager = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', cpf: '', password: '' });
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<StudyPlan[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
      setLoading(true);
      const [dbUsers, dbPlans] = await Promise.all([fetchUsersFromDB(), fetchPlansFromDB()]);
      setUsers(dbUsers);
      setPlans(dbPlans);
      setLoading(false);
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email) return alert("Preencha campos obrigatórios");
    
    const user: User = {
      id: uuid(),
      name: newUser.name,
      email: newUser.email,
      cpf: newUser.cpf,
      level: 'iniciante',
      isAdmin: false,
      allowedPlans: [],
      planExpirations: {},
      routine: { days: {} },
      progress: {
        completedGoalIds: [],
        completedRevisionIds: [],
        totalStudySeconds: 0,
        planStudySeconds: {}
      },
      ...({ tempPassword: newUser.password }) as any
    };

    setLoading(true);
    await saveUserToDB(user);
    await loadData(); // Reload to refresh
    setNewUser({ name: '', email: '', cpf: '', password: '' });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Excluir usuário permanentemente?')) {
        setLoading(true);
        await deleteUserFromDB(id);
        await loadData();
    }
  };

  const togglePlanAccess = async (userId: string, planId: string) => {
    const userToUpdate = users.find(u => u.id === userId);
    if (!userToUpdate) return;

    // Safety check for undefined allowedPlans
    const currentAllowed = userToUpdate.allowedPlans || [];
    const hasAccess = currentAllowed.includes(planId);
    
    const updatedUser = {
        ...userToUpdate,
        allowedPlans: hasAccess ? currentAllowed.filter(pid => pid !== planId) : [...currentAllowed, planId]
    };

    // Optimistic update
    setUsers(users.map(u => u.id === userId ? updatedUser : u));
    
    // Background Save
    await saveUserToDB(updatedUser);
  };

  const filtered = users.filter(u => 
    u.name.toLowerCase().includes(filter.toLowerCase()) || 
    u.email.toLowerCase().includes(filter.toLowerCase()) || 
    u.cpf.includes(filter)
  );

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-end border-b border-white/10 pb-4">
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Gestão de <span className="text-insanus-red">Usuários</span></h2>
            <div className="text-xs font-mono text-gray-500">
                {loading ? <span className="animate-pulse text-insanus-red">SINCRONIZANDO...</span> : `TOTAL: ${users.length}`}
            </div>
        </div>
        
        {/* Create User */}
        <div className="glass p-6 rounded-xl border-l-4 border-insanus-red">
            <h3 className="mb-4 font-bold text-gray-300 text-sm uppercase tracking-wider">Novo Cadastro</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <input className="bg-black/50 p-3 rounded border border-white/10 focus:border-insanus-red focus:outline-none transition-colors" placeholder="Nome Completo" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
            <input className="bg-black/50 p-3 rounded border border-white/10 focus:border-insanus-red focus:outline-none transition-colors" placeholder="CPF (000.000.000-00)" value={newUser.cpf} onChange={e => setNewUser({...newUser, cpf: e.target.value})} />
            <input className="bg-black/50 p-3 rounded border border-white/10 focus:border-insanus-red focus:outline-none transition-colors" placeholder="E-mail" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
            <input className="bg-black/50 p-3 rounded border border-white/10 focus:border-insanus-red focus:outline-none transition-colors" placeholder="Senha Padrão" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
            <button onClick={handleAddUser} disabled={loading} className="bg-insanus-red hover:bg-red-600 text-white p-3 rounded font-bold shadow-neon transition-all disabled:opacity-50">CADASTRAR</button>
            </div>
        </div>

        {/* List */}
        <div className="space-y-4">
            <input className="w-full bg-black/50 p-4 rounded-xl border border-white/10 focus:border-insanus-red focus:outline-none text-lg" placeholder="Pesquisar aluno..." value={filter} onChange={e => setFilter(e.target.value)} />
            <div className="grid gap-3">
            {filtered.map(u => (
                <div key={u.id} className="glass hover:bg-white/5 border border-white/5 p-4 rounded-lg flex flex-col md:flex-row justify-between items-center gap-4 transition-all duration-300">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded bg-gradient-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center font-bold text-gray-500">
                            {u.name.charAt(0)}
                        </div>
                        <div>
                            <div className="font-bold text-white text-lg">{u.name}</div>
                            <div className="text-xs font-mono text-gray-500">{u.email} <span className="text-gray-700">|</span> {u.cpf}</div>
                        </div>
                    </div>
                    
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <div className="flex gap-2">
                            {plans.map((p: StudyPlan) => (
                                <button 
                                    key={p.id}
                                    onClick={() => togglePlanAccess(u.id, p.id)}
                                    className={`px-3 py-1 text-[10px] uppercase font-bold tracking-wider rounded border transition-all ${u.allowedPlans?.includes(p.id) ? 'bg-insanus-red/20 border-insanus-red text-insanus-red shadow-[0_0_10px_rgba(255,31,31,0.2)]' : 'bg-black/50 border-white/10 text-gray-600 hover:border-gray-500'}`}
                                >
                                    {p.name}
                                </button>
                            ))}
                        </div>
                        <div className="h-8 w-px bg-white/10 hidden md:block"></div>
                        <button onClick={() => handleDelete(u.id)} className="text-gray-600 hover:text-red-500 p-2"><Icon.Trash className="w-5 h-5" /></button>
                    </div>
                </div>
            ))}
            </div>
        </div>
      </div>
    </div>
  );
};

// --- Plan Editor Helpers ---

const PRESET_COLORS = [
    { label: 'Insanus Red', value: '#FF1F1F' },
    { label: 'Blue', value: '#3B82F6' },
    { label: 'Green', value: '#10B981' },
    // Removed Yellow
    { label: 'Purple', value: '#A855F7' },
    { label: 'Pink', value: '#EC4899' },
    { label: 'Orange', value: '#F97316' },
    { label: 'Cyan', value: '#06B6D4' },
];

const GoalEditor = ({ goal, onChange, onClose }: { goal: Goal, onChange: (g: Goal) => void, onClose: () => void }) => {
    const handleChange = (field: keyof Goal, value: any) => {
        onChange({ ...goal, [field]: value });
    };

    const addSubGoal = () => {
        const newSub: SubGoal = { id: uuid(), title: 'Nova Aula', link: '', duration: 30 };
        handleChange('subGoals', [...(goal.subGoals || []), newSub]);
    };

    const updateSubGoal = (idx: number, field: keyof SubGoal, val: any) => {
        const subs = [...(goal.subGoals || [])];
        subs[idx] = { ...subs[idx], [field]: val };
        handleChange('subGoals', subs);
    };

    const removeSubGoal = (idx: number) => {
        const subs = [...(goal.subGoals || [])];
        subs.splice(idx, 1);
        handleChange('subGoals', subs);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
            <div className="bg-insanus-card border border-white/10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col">
                <div className="p-6 border-b border-white/10 flex justify-between items-center sticky top-0 bg-insanus-card z-10">
                    <div>
                        <span className="text-xs font-mono text-insanus-red uppercase tracking-widest">Editor de Meta</span>
                        <h3 className="text-2xl font-black text-white">{goal.type.replace('_', ' ')}</h3>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center transition-colors">✕</button>
                </div>

                <div className="p-8 space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs uppercase text-gray-500 font-bold tracking-wider">Título da Meta</label>
                        <input className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-insanus-red focus:outline-none" value={goal.title} onChange={e => handleChange('title', e.target.value)} />
                    </div>

                     <div className="space-y-2">
                        <label className="text-xs uppercase text-gray-500 font-bold tracking-wider">Cor da Meta</label>
                        <div className="flex flex-wrap gap-2">
                            {PRESET_COLORS.map(c => (
                                <button
                                    key={c.value}
                                    onClick={() => handleChange('color', c.value)}
                                    className={`w-8 h-8 rounded-full border-2 transition-all ${goal.color === c.value ? 'border-white scale-110 shadow-neon' : 'border-transparent opacity-50 hover:opacity-100 hover:scale-105'}`}
                                    style={{ backgroundColor: c.value }}
                                    title={c.label}
                                />
                            ))}
                            <div className="relative">
                                <input 
                                    type="color" 
                                    className="w-8 h-8 rounded-full overflow-hidden opacity-0 absolute inset-0 cursor-pointer"
                                    value={goal.color || '#FF1F1F'}
                                    onChange={e => handleChange('color', e.target.value)}
                                />
                                <div className="w-8 h-8 rounded-full border border-white/20 bg-gradient-to-br from-gray-800 to-black flex items-center justify-center text-white pointer-events-none">
                                    <Icon.Edit className="w-3 h-3" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs uppercase text-gray-500 font-bold tracking-wider">Observações / Dicas</label>
                        <textarea className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-insanus-red focus:outline-none h-24 resize-none" value={goal.description || ''} onChange={e => handleChange('description', e.target.value)} />
                    </div>

                    {/* Specific Logic Based on Type */}
                    {goal.type === 'AULA' && (
                        <div className="bg-black/20 p-5 rounded-xl border border-white/5 space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-bold text-blue-400 uppercase tracking-wider">Conteúdo Programático (Aulas)</label>
                                <button onClick={addSubGoal} className="text-[10px] uppercase font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded hover:bg-blue-500/20 transition">+ Adicionar Bloco</button>
                            </div>
                            <div className="space-y-2">
                                {goal.subGoals?.map((sub, idx) => (
                                    <div key={sub.id} className="flex gap-2 items-center group">
                                        <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center text-xs text-gray-500">{idx + 1}</div>
                                        <input className="bg-black/50 border border-white/10 rounded p-2 text-sm flex-1 focus:border-blue-500/50 focus:outline-none" placeholder="Título da Aula" value={sub.title} onChange={e => updateSubGoal(idx, 'title', e.target.value)} />
                                        <div className="relative w-24">
                                            <input className="bg-black/50 border border-white/10 rounded p-2 text-sm w-full focus:border-blue-500/50 focus:outline-none" type="number" value={sub.duration} onChange={e => updateSubGoal(idx, 'duration', parseInt(e.target.value))} />
                                            <span className="absolute right-2 top-2 text-xs text-gray-600">min</span>
                                        </div>
                                        <input className="bg-black/50 border border-white/10 rounded p-2 text-sm w-1/3 focus:border-blue-500/50 focus:outline-none" placeholder="Link URL" value={sub.link} onChange={e => updateSubGoal(idx, 'link', e.target.value)} />
                                        <button onClick={() => removeSubGoal(idx)} className="text-gray-600 hover:text-red-500 p-2"><Icon.Trash className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                {(!goal.subGoals || goal.subGoals.length === 0) && <div className="text-center py-4 border border-dashed border-white/10 rounded text-gray-600 text-sm">Nenhuma aula cadastrada ainda.</div>}
                            </div>
                        </div>
                    )}

                    {(goal.type === 'MATERIAL' || goal.type === 'QUESTOES' || goal.type === 'LEI_SECA') && (
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs uppercase text-gray-500 font-bold tracking-wider">Quantidade de Páginas</label>
                                <input type="number" className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-insanus-red focus:outline-none font-mono text-lg" value={goal.pages || 0} onChange={e => handleChange('pages', parseInt(e.target.value))} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs uppercase text-gray-500 font-bold tracking-wider">Arquivo PDF</label>
                                <label className="cursor-pointer bg-black/30 border border-dashed border-white/20 hover:border-insanus-red/50 rounded-lg p-3 flex items-center justify-center gap-2 h-[54px] transition-colors group">
                                    <Icon.FileText className="w-5 h-5 text-gray-500 group-hover:text-insanus-red" />
                                    <span className="text-sm text-gray-400 group-hover:text-white truncate">{goal.pdfUrl ? goal.pdfUrl : 'Carregar PDF'}</span>
                                    <input type="file" className="hidden" onChange={(e) => {
                                        if (e.target.files?.[0]) handleChange('pdfUrl', e.target.files[0].name);
                                    }} />
                                </label>
                            </div>
                        </div>
                    )}

                    {goal.type === 'LEI_SECA' && (
                        <div className="grid grid-cols-2 gap-6 bg-purple-900/5 p-4 rounded-xl border border-purple-500/10">
                            <div className="space-y-2">
                                <label className="text-xs uppercase text-purple-400 font-bold tracking-wider">Artigos (Ex: 1 ao 50)</label>
                                <input className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none" value={goal.articles || ''} onChange={e => handleChange('articles', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs uppercase text-purple-400 font-bold tracking-wider">Modo Repetição</label>
                                <select className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white focus:border-purple-500 focus:outline-none appearance-none" value={goal.multiplier || 1} onChange={e => handleChange('multiplier', parseInt(e.target.value))}>
                                    <option value={1}>1x (Leitura única)</option>
                                    <option value={2}>2x (Repetir 2 vezes)</option>
                                    <option value={3}>3x (Repetir 3 vezes)</option>
                                    <option value={4}>4x (Repetir 4 vezes)</option>
                                    <option value={5}>5x (Repetir 5 vezes)</option>
                                </select>
                            </div>
                        </div>
                    )}
                    
                    {/* Revision System */}
                    <div className="border-t border-white/10 pt-6">
                         <div className="flex items-center gap-3 mb-4">
                            <div className="relative inline-block w-10 h-6 transition duration-200 ease-in-out select-none">
                                <input type="checkbox" name="toggle" id="toggle" className="toggle-checkbox absolute block w-4 h-4 rounded-full bg-white border-4 appearance-none cursor-pointer translate-x-1" style={{top: '4px', left: goal.hasRevision ? '18px' : '2px', backgroundColor: goal.hasRevision ? '#FF1F1F' : '#333'}} checked={goal.hasRevision || false} onChange={e => handleChange('hasRevision', e.target.checked)}/>
                                <label htmlFor="toggle" className="toggle-label block overflow-hidden h-6 rounded-full bg-black border border-white/20 cursor-pointer"></label>
                            </div>
                            <span className={`font-bold uppercase text-sm ${goal.hasRevision ? 'text-insanus-red' : 'text-gray-500'}`}>Sistema de Revisão Espaçada</span>
                        </div>
                        
                        {goal.hasRevision && (
                            <div className="bg-gradient-to-r from-insanus-red/10 to-transparent p-4 rounded-r-xl border-l-2 border-insanus-red space-y-4 animate-fade-in">
                                <div className="space-y-2">
                                    <label className="text-xs uppercase text-red-400 font-bold tracking-wider">Intervalos (Dias)</label>
                                    <input className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-insanus-red focus:outline-none font-mono tracking-widest" placeholder="1, 7, 15, 30" value={goal.revisionIntervals || ''} onChange={e => handleChange('revisionIntervals', e.target.value)} />
                                    <p className="text-[10px] text-gray-500">Insira os dias separados por vírgula.</p>
                                </div>
                                <label className="flex items-center gap-3 text-sm text-gray-300 hover:text-white cursor-pointer">
                                    <input type="checkbox" className="accent-insanus-red w-4 h-4" checked={goal.repeatLastInterval || false} onChange={e => handleChange('repeatLastInterval', e.target.checked)} />
                                    <span>Repetir infinitamente o último intervalo?</span>
                                </label>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-white/10 bg-black/20 flex justify-end gap-3 sticky bottom-0">
                    <button onClick={onClose} className="px-6 py-3 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition font-bold text-sm">CANCELAR</button>
                    <button onClick={onClose} className="px-8 py-3 rounded-lg bg-insanus-red hover:bg-red-600 text-white font-bold text-sm shadow-neon transition-all">CONCLUIR EDIÇÃO</button>
                </div>
            </div>
        </div>
    );
};

const CycleEditor = ({ plan, onUpdate }: { plan: StudyPlan, onUpdate: (p: StudyPlan) => void }) => {
    
    // Helper to get discipline name safely
    const getDisciplineName = (id: string) => plan.disciplines.find(d => d.id === id)?.name || 'Desconhecida';

    const addCycle = () => {
        const newCycle: Cycle = {
            id: uuid(),
            name: `Ciclo ${plan.cycles.length + 1}`,
            order: plan.cycles.length,
            items: []
        };
        onUpdate({ ...plan, cycles: [...plan.cycles, newCycle] });
    };

    const removeCycle = (cycleId: string) => {
        if(confirm("Remover este ciclo?")) {
            onUpdate({ ...plan, cycles: plan.cycles.filter(c => c.id !== cycleId) });
        }
    };

    const moveCycle = (idx: number, direction: 'up' | 'down') => {
        const newCycles = [...plan.cycles];
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= newCycles.length) return;
        [newCycles[idx], newCycles[swapIdx]] = [newCycles[swapIdx], newCycles[idx]];
        onUpdate({ ...plan, cycles: newCycles });
    };

    const updateCycleName = (id: string, name: string) => {
        onUpdate({...plan, cycles: plan.cycles.map(c => c.id === id ? {...c, name} : c)});
    }

    const addItemToCycle = (cycleId: string, value: string) => {
        // Value can be a disciplineID or "FOLDER:folderID"
        const isFolder = value.startsWith("FOLDER:");
        const id = isFolder ? value.split(":")[1] : value;
        
        let newItems: {disciplineId: string, subjectsCount: number}[] = [];

        if (isFolder) {
            // Add all disciplines from folder
            const discsInFolder = plan.disciplines.filter(d => d.folderId === id);
            newItems = discsInFolder.map(d => ({ disciplineId: d.id, subjectsCount: 1 }));
        } else {
            newItems = [{ disciplineId: id, subjectsCount: 1 }];
        }

        onUpdate({
            ...plan,
            cycles: plan.cycles.map(c => c.id === cycleId ? {
                ...c,
                items: [...c.items, ...newItems]
            } : c)
        });
    };

    const removeItemFromCycle = (cycleId: string, itemIdx: number) => {
        onUpdate({
            ...plan,
            cycles: plan.cycles.map(c => c.id === cycleId ? {
                ...c,
                items: c.items.filter((_, i) => i !== itemIdx)
            } : c)
        });
    };

    const updateItemCount = (cycleId: string, itemIdx: number, count: number) => {
        onUpdate({
            ...plan,
            cycles: plan.cycles.map(c => c.id === cycleId ? {
                ...c,
                items: c.items.map((item, i) => i === itemIdx ? { ...item, subjectsCount: count } : item)
            } : c)
        });
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-fade-in">
             {/* System Configuration */}
             <div className="glass p-6 rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white uppercase tracking-wider">Sistema de Rodagem</h3>
                    <p className="text-sm text-gray-500 mt-1 max-w-lg">Defina como o algoritmo deve transitar entre os ciclos após a conclusão das metas.</p>
                </div>
                <div className="flex bg-black/50 p-1 rounded-lg border border-white/10">
                    <button onClick={() => onUpdate({...plan, cycleSystem: 'continuo'})} className={`px-4 py-2 rounded font-bold text-xs uppercase tracking-widest transition-all ${plan.cycleSystem === 'continuo' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-500 hover:text-white'}`}>
                        Contínuo
                    </button>
                    <button onClick={() => onUpdate({...plan, cycleSystem: 'rotativo'})} className={`px-4 py-2 rounded font-bold text-xs uppercase tracking-widest transition-all ${plan.cycleSystem === 'rotativo' ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(147,51,234,0.5)]' : 'text-gray-500 hover:text-white'}`}>
                        Rotativo
                    </button>
                </div>
             </div>

             {/* Cycles List */}
             <div className="space-y-6">
                {plan.cycles.map((cycle, idx) => (
                    <div key={cycle.id} className="glass border border-white/10 rounded-xl overflow-hidden">
                        {/* Header */}
                        <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                                <div className="w-8 h-8 rounded bg-insanus-red flex items-center justify-center font-bold text-white">{idx + 1}</div>
                                <input className="bg-transparent font-black text-xl text-white outline-none w-full uppercase" 
                                       value={cycle.name} onChange={e => updateCycleName(cycle.id, e.target.value)} />
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => moveCycle(idx, 'up')} className="p-2 hover:bg-white/10 rounded text-gray-500 hover:text-white"><Icon.ArrowUp className="w-4 h-4" /></button>
                                <button onClick={() => moveCycle(idx, 'down')} className="p-2 hover:bg-white/10 rounded text-gray-500 hover:text-white"><Icon.ArrowDown className="w-4 h-4" /></button>
                                <div className="h-6 w-px bg-white/10 mx-2"></div>
                                <button onClick={() => removeCycle(cycle.id)} className="p-2 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-500"><Icon.Trash className="w-4 h-4" /></button>
                            </div>
                        </div>

                        {/* Items */}
                        <div className="p-6 bg-black/20 space-y-3">
                            {cycle.items.length === 0 ? (
                                <div className="text-center py-8 border border-dashed border-white/10 rounded-lg text-gray-600 font-mono text-sm">
                                    Nenhuma disciplina adicionada a este ciclo.
                                </div>
                            ) : (
                                cycle.items.map((item, iIdx) => (
                                    <div key={iIdx} className="flex items-center gap-4 bg-insanus-card p-3 rounded border border-white/5">
                                        <div className="text-xs font-mono text-gray-500 w-6">{iIdx + 1}.</div>
                                        <div className="flex-1 flex items-center gap-2 font-bold text-gray-300">
                                            <Icon.BookOpen className="w-4 h-4 text-insanus-red" />
                                            {getDisciplineName(item.disciplineId)}
                                        </div>
                                        <div className="flex items-center gap-2 bg-black/40 px-3 py-1 rounded border border-white/10">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold">Assuntos/Vez:</span>
                                            <input type="number" min="1" className="w-12 bg-transparent text-center font-mono text-white outline-none" 
                                                   value={item.subjectsCount} onChange={e => updateItemCount(cycle.id, iIdx, parseInt(e.target.value))} />
                                        </div>
                                        <button onClick={() => removeItemFromCycle(cycle.id, iIdx)} className="text-gray-600 hover:text-red-500"><Icon.Trash className="w-4 h-4" /></button>
                                    </div>
                                ))
                            )}

                            {/* Add Dropdown */}
                            <div className="mt-4 pt-4 border-t border-white/5">
                                <select 
                                    className="w-full bg-black/50 border border-white/10 rounded p-3 text-gray-400 hover:text-white hover:border-insanus-red focus:outline-none transition-colors cursor-pointer appearance-none"
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            addItemToCycle(cycle.id, e.target.value);
                                            e.target.value = ""; // Reset
                                        }
                                    }}
                                >
                                    <option value="">+ Adicionar Disciplina ou Pasta ao Ciclo...</option>
                                    {/* Folders */}
                                    {plan.folders.map(f => (
                                        <option key={f.id} value={`FOLDER:${f.id}`}>📁 PASTA: {f.name} (Adicionar Tudo)</option>
                                    ))}
                                    <option disabled>──────────</option>
                                    {/* Individual Disciplines */}
                                    {plan.disciplines.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                ))}

                <button onClick={addCycle} className="w-full py-6 border border-dashed border-white/20 rounded-xl text-gray-400 font-bold hover:border-insanus-red hover:text-insanus-red hover:bg-insanus-red/5 transition flex justify-center items-center gap-3">
                    <Icon.Plus className="w-5 h-5" /> ADICIONAR NOVO CICLO
                </button>
             </div>
        </div>
    );
};

// --- Main Tree Editor ---

export const PlanEditor = () => {
    const [plans, setPlans] = useState<StudyPlan[]>([]);
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const [expandedDisciplines, setExpandedDisciplines] = useState<Record<string, boolean>>({});
    const [editingGoal, setEditingGoal] = useState<{disciplineIdx: number, subjectIdx: number, goalIdx: number, data: Goal} | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [viewMode, setViewMode] = useState<'structure' | 'cycles'>('structure');

    useEffect(() => {
        const loadPlans = async () => {
            const dbPlans = await fetchPlansFromDB();
            setPlans(dbPlans);
        };
        loadPlans();
    }, []);

    const savePlansLocal = (newPlans: StudyPlan[]) => {
        setPlans(newPlans); // Updates local state for UI
    };

    const handleSync = async () => {
        if (!currentPlan) return;
        setIsSaving(true);
        try {
            await savePlanToDB(currentPlan);
            alert("Plano sincronizado com sucesso com o Banco de Dados!");
        } catch (e) {
            alert("Erro ao sincronizar plano.");
        } finally {
            setIsSaving(false);
        }
    };

    const currentPlan = plans.find(p => p.id === selectedPlanId);

    // --- Helpers for Tree Manipulation ---
    const updatePlan = (fn: (p: StudyPlan) => StudyPlan) => {
        if (!currentPlan) return;
        const updated = plans.map(p => p.id === currentPlan.id ? fn(p) : p);
        savePlansLocal(updated);
    };

    const handleUpdatePlanDirect = (updatedPlan: StudyPlan) => {
        savePlansLocal(plans.map(p => p.id === updatedPlan.id ? updatedPlan : p));
    };

    // --- Folder Operations ---
    const addFolder = () => {
        updatePlan(p => ({
            ...p,
            folders: [...p.folders, { id: uuid(), name: 'Nova Pasta', order: p.folders.length }]
        }));
    };

    const deleteFolder = (folderId: string) => {
        if (confirm('Ao apagar a pasta, as disciplinas dentro dela serão movidas para a raiz. Confirmar?')) {
            updatePlan(p => ({
                ...p,
                folders: p.folders.filter(f => f.id !== folderId),
                disciplines: p.disciplines.map(d => d.folderId === folderId ? { ...d, folderId: undefined } : d)
            }));
        }
    };

    const addDiscipline = (folderId?: string) => {
        updatePlan(p => ({
            ...p,
            disciplines: [...p.disciplines, { id: uuid(), name: 'Nova Disciplina', folderId, subjects: [], order: p.disciplines.length }]
        }));
    };

    const addSubject = (disciplineId: string) => {
        updatePlan(p => ({
            ...p,
            disciplines: p.disciplines.map(d => d.id === disciplineId ? {
                ...d,
                subjects: [...d.subjects, { id: uuid(), name: 'Novo Assunto', goals: [], order: d.subjects.length }]
            } : d)
        }));
    };

    const addGoal = (disciplineId: string, subjectId: string, type: GoalType) => {
        updatePlan(p => ({
            ...p,
            disciplines: p.disciplines.map(d => d.id === disciplineId ? {
                ...d,
                subjects: d.subjects.map(s => s.id === subjectId ? {
                    ...s,
                    goals: [...s.goals, { id: uuid(), title: `Nova Meta`, type, order: s.goals.length, subGoals: [] }]
                } : s)
            } : d)
        }));
    };
    
    const moveItem = (arr: any[], idx: number, direction: 'up' | 'down') => {
        const newArr = [...arr];
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= arr.length) return arr;
        [newArr[idx], newArr[swapIdx]] = [newArr[swapIdx], newArr[idx]];
        return newArr;
    };

    const moveDisciplineToFolder = (disciplineId: string, targetFolderId: string | undefined) => {
        updatePlan(p => ({
            ...p,
            disciplines: p.disciplines.map(d => d.id === disciplineId ? { ...d, folderId: targetFolderId } : d)
        }));
    };

    // Render Discipline Component (Recursive-like structure helper)
    const renderDiscipline = (disc: Discipline, discIdx: number) => (
        <div key={disc.id} className="relative group pl-6">
            {/* Connector Line */}
            <div className="absolute left-0 top-8 w-6 h-px bg-white/10 group-hover:bg-insanus-red/50 transition-colors"></div>
            <div className="absolute left-0 top-8 w-2 h-2 rounded-full bg-insanus-black border border-white/30 group-hover:border-insanus-red group-hover:bg-insanus-red transition-all"></div>

            <div className="glass border border-white/5 rounded-xl overflow-hidden transition-all duration-300 hover:border-white/20">
                {/* Discipline Header */}
                <div className="flex items-center justify-between p-4 bg-white/5 cursor-pointer select-none" onClick={() => setExpandedDisciplines(prev => ({...prev, [disc.id]: !prev[disc.id]}))}>
                    <div className="flex items-center gap-4 flex-1">
                        <div className={`transition-transform duration-300 ${expandedDisciplines[disc.id] ? 'rotate-90 text-insanus-red' : 'text-gray-500'}`}>
                            <Icon.ChevronRight className="w-5 h-5" />
                        </div>
                        <Icon.BookOpen className="w-5 h-5 text-gray-400" />
                        <input onClick={e => e.stopPropagation()} className="bg-transparent font-bold text-lg text-white outline-none w-full" 
                                value={disc.name} onChange={e => updatePlan(p => ({...p, disciplines: p.disciplines.map(d => d.id === disc.id ? {...d, name: e.target.value} : d)}))} />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         {/* Move Folder Dropdown */}
                         <div onClick={e => e.stopPropagation()} className="relative group/move mr-2">
                             <div className="text-[10px] bg-white/5 px-2 py-1 rounded cursor-pointer hover:bg-white/10 text-gray-400 flex items-center gap-1">
                                 <Icon.Folder className="w-3 h-3"/> Mover
                             </div>
                             <div className="absolute right-0 top-full mt-1 w-48 bg-black border border-white/20 rounded-lg shadow-xl hidden group-hover/move:block z-50">
                                 <div onClick={() => moveDisciplineToFolder(disc.id, undefined)} className="px-3 py-2 text-xs hover:bg-white/10 cursor-pointer text-gray-300">
                                     Raiz (Sem Pasta)
                                 </div>
                                 {currentPlan?.folders.map(f => (
                                     <div key={f.id} onClick={() => moveDisciplineToFolder(disc.id, f.id)} className="px-3 py-2 text-xs hover:bg-white/10 cursor-pointer text-gray-300">
                                         {f.name}
                                     </div>
                                 ))}
                             </div>
                         </div>

                        <button onClick={(e) => { e.stopPropagation(); updatePlan(p => ({...p, disciplines: moveItem(p.disciplines, discIdx, 'up')}))}} className="p-2 hover:bg-white/10 rounded text-gray-500 hover:text-white"><Icon.ArrowUp className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); updatePlan(p => ({...p, disciplines: moveItem(p.disciplines, discIdx, 'down')}))}} className="p-2 hover:bg-white/10 rounded text-gray-500 hover:text-white"><Icon.ArrowDown className="w-4 h-4" /></button>
                        <div className="w-px h-4 bg-white/10 mx-1"></div>
                        <button onClick={(e) => { e.stopPropagation(); if(confirm('Apagar?')) updatePlan(p => ({...p, disciplines: p.disciplines.filter(d => d.id !== disc.id)}))}} className="p-2 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-500"><Icon.Trash className="w-4 h-4" /></button>
                    </div>
                </div>

                {/* Subjects List */}
                <div className={`transition-all duration-500 overflow-hidden ${expandedDisciplines[disc.id] ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="p-4 space-y-4 bg-black/20 border-t border-white/5 relative">
                        {/* Inner hierarchy line */}
                        <div className="absolute left-6 top-0 bottom-0 w-px bg-white/5"></div>

                        {disc.subjects.map((sub, subIdx) => (
                            <div key={sub.id} className="pl-8 relative">
                                {/* Subject Line */}
                                <div className="absolute left-6 top-5 w-2 h-px bg-white/20"></div>

                                <div className="bg-insanus-card border border-white/5 rounded-lg p-4 hover:border-white/10 transition-all">
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-3 w-full">
                                            <div className="w-2 h-2 rounded-full bg-insanus-red/50"></div>
                                            <input className="bg-transparent font-semibold text-gray-200 outline-none w-full text-sm" 
                                                    value={sub.name} onChange={e => updatePlan(p => ({...p, disciplines: p.disciplines.map(d => d.id === disc.id ? {...d, subjects: d.subjects.map(s => s.id === sub.id ? {...s, name: e.target.value} : s)} : d)}))} />
                                        </div>
                                        <div className="flex gap-1">
                                                <button onClick={() => updatePlan(p => ({...p, disciplines: p.disciplines.map(d => d.id === disc.id ? {...d, subjects: moveItem(d.subjects, subIdx, 'up')} : d)}))} className="text-gray-600 hover:text-white p-1"><Icon.ArrowUp className="w-3 h-3"/></button>
                                                <button onClick={() => updatePlan(p => ({...p, disciplines: p.disciplines.map(d => d.id === disc.id ? {...d, subjects: moveItem(d.subjects, subIdx, 'down')} : d)}))} className="text-gray-600 hover:text-white p-1"><Icon.ArrowDown className="w-3 h-3"/></button>
                                                <button onClick={() => {if(confirm('Apagar?')) updatePlan(p => ({...p, disciplines: p.disciplines.map(d => d.id === disc.id ? {...d, subjects: d.subjects.filter(s => s.id !== sub.id)} : d)}))}} className="text-gray-600 hover:text-red-500 p-1"><Icon.Trash className="w-3 h-3"/></button>
                                        </div>
                                    </div>

                                    {/* Goals List */}
                                    <div className="space-y-2">
                                        {sub.goals.map((goal, goalIdx) => (
                                            <div key={goal.id} className="flex justify-between items-center bg-black/40 p-3 rounded border border-white/5 hover:border-insanus-red/30 transition group hover:shadow-[0_0_15px_rgba(0,0,0,0.5)] cursor-pointer" onClick={() => setEditingGoal({disciplineIdx: discIdx, subjectIdx: subIdx, goalIdx, data: goal})}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs text-white`} style={{ backgroundColor: goal.color || '#333' }}>
                                                        {goal.type[0]}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs text-gray-500 font-mono leading-none mb-1">{goal.type}</span>
                                                        <span className="text-sm font-medium text-white group-hover:text-insanus-red transition-colors truncate max-w-[200px]">{goal.title}</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity items-center">
                                                    <div className="text-[10px] text-gray-600 font-mono mr-2">EDITAR</div>
                                                    <Icon.Edit className="w-4 h-4 text-gray-400" />
                                                    
                                                    <div className="w-px h-4 bg-white/10 mx-1"></div>
                                                    
                                                    <div className="flex flex-col">
                                                        <button onClick={(e) => { e.stopPropagation(); updatePlan(p => ({...p, disciplines: p.disciplines.map(d => d.id === disc.id ? {...d, subjects: d.subjects.map(s => s.id === sub.id ? {...s, goals: moveItem(s.goals, goalIdx, 'up')} : s)} : d)}))}} className="text-gray-500 hover:text-white"><Icon.ArrowUp className="w-3 h-3"/></button>
                                                        <button onClick={(e) => { e.stopPropagation(); updatePlan(p => ({...p, disciplines: p.disciplines.map(d => d.id === disc.id ? {...d, subjects: d.subjects.map(s => s.id === sub.id ? {...s, goals: moveItem(s.goals, goalIdx, 'down')} : s)} : d)}))}} className="text-gray-500 hover:text-white"><Icon.ArrowDown className="w-3 h-3"/></button>
                                                    </div>
                                                    <button onClick={(e) => { e.stopPropagation(); if(confirm('Apagar?')) updatePlan(p => ({...p, disciplines: p.disciplines.map(d => d.id === disc.id ? {...d, subjects: d.subjects.map(s => s.id === sub.id ? {...s, goals: s.goals.filter(g => g.id !== goal.id)} : s)} : d)}))}} className="text-gray-600 hover:text-red-500"><Icon.Trash className="w-4 h-4" /></button>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        {/* Add Buttons */}
                                        <div className="flex gap-2 pt-2 overflow-x-auto pb-2 scrollbar-hide">
                                            {['AULA', 'MATERIAL', 'QUESTOES', 'LEI_SECA', 'RESUMO'].map(type => (
                                                <button key={type} onClick={() => addGoal(disc.id, sub.id, type as GoalType)} className="shrink-0 text-[9px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 hover:bg-white hover:text-black hover:border-white px-3 py-2 rounded transition">
                                                    + {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div className="pl-8">
                            <button onClick={() => addSubject(disc.id)} className="w-full py-3 border border-dashed border-white/10 rounded text-gray-500 text-xs font-mono hover:border-insanus-red hover:text-insanus-red transition flex justify-center items-center gap-2">
                                <Icon.Plus className="w-3 h-3" /> ADICIONAR NOVO ASSUNTO
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    if (!selectedPlanId) {
        return (
            <div className="p-10 h-full overflow-y-auto">
                <div className="max-w-7xl mx-auto">
                    <div className="flex justify-between items-end mb-10 border-b border-white/10 pb-6">
                        <div>
                            <h2 className="text-4xl font-black text-white tracking-tighter">MEUS <span className="text-insanus-red">PLANOS</span></h2>
                            <p className="text-gray-500 font-mono text-xs mt-2">SELECIONE UM PLANO PARA EDITAR OU CRIE UM NOVO.</p>
                        </div>
                        <button onClick={() => {
                            const newPlan: StudyPlan = {
                                id: uuid(), name: 'Plano Sem Título', coverImage: 'https://picsum.photos/800/400',
                                folders: [], disciplines: [], cycles: [], cycleSystem: 'continuo'
                            };
                            savePlansLocal([...plans, newPlan]);
                            setSelectedPlanId(newPlan.id);
                        }} className="bg-white text-black hover:bg-insanus-red hover:text-white px-6 py-3 rounded-lg font-bold flex gap-2 items-center transition-all duration-300">
                            <Icon.Plus className="w-5 h-5" /> CRIAR NOVO PLANO
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {plans.map(p => (
                            <div key={p.id} onClick={() => setSelectedPlanId(p.id)} className="group relative bg-insanus-card border border-white/10 rounded-2xl overflow-hidden cursor-pointer hover:border-insanus-red transition-all duration-500 hover:shadow-neon hover:-translate-y-1">
                                <div className="h-48 overflow-hidden relative">
                                    <div className="absolute inset-0 bg-gradient-to-t from-insanus-card via-transparent to-transparent z-10" />
                                    <img src={p.coverImage} className="w-full h-full object-cover group-hover:scale-110 transition duration-700 opacity-60 group-hover:opacity-100" />
                                    <div className="absolute bottom-4 left-4 z-20">
                                        <h3 className="text-2xl font-black text-white leading-none mb-1 group-hover:text-insanus-red transition-colors">{p.name}</h3>
                                        <div className="h-1 w-12 bg-insanus-red rounded-full"></div>
                                    </div>
                                </div>
                                <div className="p-5 flex justify-between items-center bg-black/40">
                                    <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                                        <Icon.Book className="w-4 h-4" />
                                        <span>{p.disciplines.length} DISCIPLINAS</span>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded border ${p.cycleSystem === 'continuo' ? 'border-blue-500/30 text-blue-400' : 'border-purple-500/30 text-purple-400'}`}>
                                        {p.cycleSystem.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!currentPlan) return null;

    return (
        <div className="flex flex-col h-full bg-insanus-black">
            {/* Header */}
            <div className="bg-insanus-card border-b border-white/10 p-4 flex items-center justify-between shrink-0 z-20 shadow-lg">
                <div className="flex items-center gap-6">
                    <button onClick={() => setSelectedPlanId(null)} className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white text-gray-400 hover:text-black transition-all">
                        <span className="font-bold text-lg">←</span>
                    </button>
                    <div>
                        <input className="bg-transparent text-2xl font-black text-white outline-none placeholder-gray-600 focus:text-insanus-red transition-colors w-96" 
                               value={currentPlan.name} 
                               onChange={e => updatePlan(p => ({ ...p, name: e.target.value }))} />
                        <div className="text-[10px] font-mono text-gray-500 tracking-widest uppercase mt-1">Modo Edição Avançado</div>
                    </div>
                </div>
                <div className="flex gap-3">
                     {/* SYNC BUTTON */}
                     <button 
                        onClick={handleSync} 
                        disabled={isSaving}
                        className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 px-6 py-2 rounded shadow-neon transition-all ${isSaving ? 'bg-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white'}`}
                    >
                        {isSaving ? (
                            <>
                                <Icon.RefreshCw className="w-4 h-4 animate-spin" /> SALVANDO...
                            </>
                        ) : (
                            <>
                                <Icon.RefreshCw className="w-4 h-4" /> SINCRONIZAR PLANO
                            </>
                        )}
                    </button>
                    <div className="flex bg-white/5 border border-white/10 rounded-lg p-1">
                        <button 
                            onClick={() => setViewMode('structure')}
                            className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'structure' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            Estrutura
                        </button>
                        <button 
                            onClick={() => setViewMode('cycles')}
                            className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'cycles' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            Ciclos
                        </button>
                    </div>
                </div>
            </div>

            {/* Tree Editor */}
            <div className="flex-1 overflow-y-auto p-8 relative">
                {viewMode === 'cycles' ? (
                    <CycleEditor plan={currentPlan} onUpdate={handleUpdatePlanDirect} />
                ) : (
                    <div className="max-w-5xl space-y-8 pl-4">
                        
                        {/* Folders Render */}
                        {currentPlan.folders.map((folder, fIdx) => (
                            <div key={folder.id} className="relative">
                                <div className="flex items-center justify-between p-4 bg-white/5 rounded-t-xl border-x border-t border-white/10 cursor-pointer" onClick={() => setExpandedFolders(prev => ({...prev, [folder.id]: !prev[folder.id]}))}>
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className={`transition-transform duration-300 ${expandedFolders[folder.id] ? 'rotate-90' : ''}`}>
                                            <Icon.ChevronRight className="w-5 h-5 text-gray-500" />
                                        </div>
                                        <Icon.Folder className="w-6 h-6 text-insanus-red" />
                                        <input onClick={e => e.stopPropagation()} className="bg-transparent font-bold text-xl text-white outline-none w-full uppercase tracking-tight"
                                            value={folder.name} onChange={e => updatePlan(p => ({...p, folders: p.folders.map(f => f.id === folder.id ? {...f, name: e.target.value} : f)}))} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); updatePlan(p => ({...p, folders: moveItem(p.folders, fIdx, 'up')}))}} className="p-2 hover:bg-white/10 rounded text-gray-500 hover:text-white"><Icon.ArrowUp className="w-4 h-4" /></button>
                                        <button onClick={(e) => { e.stopPropagation(); updatePlan(p => ({...p, folders: moveItem(p.folders, fIdx, 'down')}))}} className="p-2 hover:bg-white/10 rounded text-gray-500 hover:text-white"><Icon.ArrowDown className="w-4 h-4" /></button>
                                        <button onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id) }} className="p-2 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-500"><Icon.Trash className="w-4 h-4" /></button>
                                    </div>
                                </div>
                                
                                {/* Inside Folder */}
                                <div className={`${expandedFolders[folder.id] ? 'block' : 'hidden'} bg-white/5 border-x border-b border-white/10 rounded-b-xl p-4 pl-8 space-y-4`}>
                                    {currentPlan.disciplines.filter(d => d.folderId === folder.id).length === 0 && (
                                        <div className="text-center py-6 text-gray-600 font-mono text-sm border border-dashed border-white/5 rounded-xl">
                                            Pasta Vazia. Adicione ou mova disciplinas para cá.
                                        </div>
                                    )}
                                    {currentPlan.disciplines.filter(d => d.folderId === folder.id).map((disc, idx) => renderDiscipline(disc, idx))}
                                    
                                    <button onClick={() => addDiscipline(folder.id)} className="w-full py-4 border border-dashed border-white/10 rounded-xl text-gray-500 font-bold hover:border-insanus-red hover:text-insanus-red transition flex justify-center items-center gap-2">
                                        <Icon.Plus className="w-3 h-3" /> NOVA DISCIPLINA NA PASTA
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Button to Create Folder */}
                        <button onClick={addFolder} className="w-full py-6 bg-insanus-red/10 border border-insanus-red/30 rounded-xl text-insanus-red font-bold hover:bg-insanus-red/20 transition flex justify-center items-center gap-3">
                            <Icon.FolderPlus className="w-6 h-6" /> CRIAR NOVA PASTA
                        </button>

                        <div className="border-t border-white/10 my-8"></div>
                        <div className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-4">Disciplinas Soltas (Raiz)</div>

                        {/* Root Disciplines */}
                        <div className="space-y-6">
                            {currentPlan.disciplines.filter(d => !d.folderId).map((disc, discIdx) => renderDiscipline(disc, discIdx))}
                            
                            <button onClick={() => addDiscipline()} className="w-full py-6 border border-dashed border-white/20 rounded-2xl text-gray-400 font-bold hover:border-insanus-red hover:text-insanus-red hover:bg-insanus-red/5 transition flex justify-center items-center gap-3 group">
                                <div className="w-8 h-8 rounded-full border border-current flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Icon.Plus className="w-4 h-4" />
                                </div>
                                <span className="tracking-widest uppercase text-sm">Criar Nova Disciplina (Raiz)</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal for Goal Editing */}
            {editingGoal && (
                <GoalEditor 
                    goal={editingGoal.data} 
                    onClose={() => setEditingGoal(null)}
                    onChange={(updatedGoal) => {
                        updatePlan(p => {
                            const newDisciplines = [...p.disciplines];
                            const d = newDisciplines[editingGoal.disciplineIdx];
                            const s = d.subjects[editingGoal.subjectIdx];
                            s.goals[editingGoal.goalIdx] = updatedGoal;
                            return { ...p, disciplines: newDisciplines };
                        });
                        // Prevent modal from closing by updating local state with new data
                        setEditingGoal(prev => prev ? { ...prev, data: updatedGoal } : null);
                    }}
                />
            )}
        </div>
    );
};

export const AdminDashboard: React.FC<{ user: User, onSwitchToUser: () => void }> = ({user, onSwitchToUser}) => {
  const [tab, setTab] = useState<'users' | 'plans'>('plans');

  return (
    <div className="flex w-full h-full">
      {/* Sidebar */}
      <div className="w-20 lg:w-72 bg-insanus-black border-r border-white/10 flex flex-col shrink-0">
        <div className="p-6 border-b border-white/5 flex items-center justify-center lg:justify-start gap-3">
            <div className="w-8 h-8 bg-insanus-red rounded shadow-neon shrink-0"></div>
            <div className="hidden lg:block">
                <h1 className="text-white font-black text-lg tracking-tighter leading-none">INSANUS<span className="text-insanus-red">.ADMIN</span></h1>
                <p className="text-[10px] text-gray-500 font-mono mt-1 tracking-widest">COMMAND CENTER</p>
            </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
            <button onClick={() => setTab('plans')} className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all group ${tab === 'plans' ? 'bg-gradient-to-r from-insanus-red to-red-900 text-white shadow-neon' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                <Icon.Book className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="hidden lg:block font-bold text-sm uppercase tracking-wide">Planos de Estudo</span>
            </button>
            <button onClick={() => setTab('users')} className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all group ${tab === 'users' ? 'bg-gradient-to-r from-insanus-red to-red-900 text-white shadow-neon' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                <Icon.User className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="hidden lg:block font-bold text-sm uppercase tracking-wide">Base de Alunos</span>
            </button>
        </nav>

        <div className="p-4 border-t border-white/5">
            {/* View As Student Button */}
            <button onClick={onSwitchToUser} className="w-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white p-3 rounded-xl flex items-center justify-center lg:justify-start gap-3 transition-all group mb-4 border border-white/5">
                <Icon.Eye className="w-5 h-5 text-insanus-red group-hover:scale-110 transition-transform" />
                <span className="hidden lg:block font-bold text-sm">Visualizar como Aluno</span>
            </button>

            <div className="bg-white/5 rounded-lg p-3 flex items-center gap-3 hidden lg:flex">
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold">A</div>
                <div className="overflow-hidden">
                    <div className="text-xs font-bold text-white truncate">{user.name}</div>
                    <div className="text-[10px] text-insanus-red font-mono uppercase">Administrador</div>
                </div>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-black relative flex flex-col min-w-0">
        <div className="absolute inset-0 bg-tech-grid opacity-20 pointer-events-none" />
        <div className="relative h-full flex flex-col">
            {tab === 'users' ? <UsersManager /> : <PlanEditor />}
        </div>
      </div>
    </div>
  );
};