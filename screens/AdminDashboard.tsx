import React, { useState, useEffect } from 'react';
import { User, StudyPlan, Folder, Discipline, Subject, Goal, SubGoal, Cycle, CycleItem, EditalDiscipline, EditalTopic, PlanCategory, SimuladoClass, Simulado } from '../types';
import { Icon } from '../components/Icons';
import { uuid } from '../constants';
import { fetchUsersFromDB, saveUserToDB, deleteUserFromDB, fetchPlansFromDB, savePlanToDB, deletePlanFromDB, fetchSimuladoClassesFromDB, saveSimuladoClassToDB, deleteSimuladoClassFromDB } from '../services/db';
import { uploadFileToStorage } from '../services/storage';

// --- COMPONENTS HELPER ---

interface SafeDeleteBtnProps {
    onDelete: () => void;
    label?: string;
    className?: string;
}

const SafeDeleteBtn: React.FC<SafeDeleteBtnProps> = ({ onDelete, label = "", className = "" }) => {
    const [confirming, setConfirming] = useState(false);

    if (confirming) {
        return (
            <div className="flex items-center gap-1 animate-fade-in">
                <button onClick={onDelete} className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold px-2 py-1 rounded">SIM</button>
                <button onClick={() => setConfirming(false)} className="bg-gray-700 hover:bg-gray-600 text-white text-[10px] font-bold px-2 py-1 rounded">NÃO</button>
            </div>
        );
    }

    return (
        <button onClick={() => setConfirming(true)} className={`text-gray-500 hover:text-red-500 transition-colors ${className}`}>
            <Icon.Trash className="w-4 h-4" />
            {label && <span className="ml-1">{label}</span>}
        </button>
    );
};

// --- SUB-COMPONENT: EDITAL TOPIC EDITOR ---
interface EditalTopicEditorProps {
    topic: EditalTopic;
    plan: StudyPlan;
    onUpdate: (t: EditalTopic) => void;
    onDelete: () => void;
}

const EditalTopicEditor: React.FC<EditalTopicEditorProps> = ({ topic, plan, onUpdate, onDelete }) => {
    const [expanded, setExpanded] = useState(false);

    const toggleContest = (contest: string) => {
        const current = topic.relatedContests || [];
        const updated = current.includes(contest)
            ? current.filter(c => c !== contest)
            : [...current, contest];
        onUpdate({ ...topic, relatedContests: updated });
    };

    const renderGoalSelector = (
        label: string, 
        currentId: string | undefined, 
        onChange: (val: string) => void,
        icon: any
    ) => {
        return (
            <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 mb-1 text-[10px] font-bold text-gray-500 uppercase">
                    {icon} {label}
                </div>
                <select 
                    value={currentId || ''}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded p-2 text-xs text-white focus:outline-none focus:border-white/30 truncate"
                >
                    <option value="">(Não vinculado)</option>
                    {plan.disciplines.map(d => (
                        <optgroup key={d.id} label={d.name}>
                            {d.subjects.map(s => (
                                s.goals.map(g => (
                                    <option key={g.id} value={g.id}>
                                        {s.name} - {g.title} ({g.type})
                                    </option>
                                ))
                            ))}
                        </optgroup>
                    ))}
                </select>
            </div>
        );
    };

    return (
        <div className="bg-black/30 border border-white/5 rounded-lg mb-2 overflow-hidden">
            <div className="flex items-center p-3 gap-3">
                <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-white">
                    {expanded ? <Icon.ChevronDown className="w-4 h-4 rotate-180" /> : <Icon.ChevronRight className="w-4 h-4" />}
                </button>
                <input 
                    value={topic.name}
                    onChange={(e) => onUpdate({...topic, name: e.target.value})}
                    className="flex-1 bg-transparent text-sm font-bold text-white focus:outline-none"
                    placeholder="Nome do Tópico (Ex: Atos Administrativos)"
                />
                <div className="flex gap-1">
                    {topic.relatedContests?.map(c => (
                        <span key={c} className="text-[9px] bg-insanus-red/20 text-insanus-red px-1 rounded font-bold">{c}</span>
                    ))}
                </div>
                <SafeDeleteBtn onDelete={onDelete} />
            </div>

            {expanded && (
                <div className="p-3 bg-black/20 border-t border-white/5 animate-fade-in grid gap-4">
                    {plan.category === 'CARREIRAS_POLICIAIS' && plan.linkedContests && plan.linkedContests.length > 0 && (
                        <div className="mb-2 p-2 bg-white/5 rounded border border-white/5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Aplicável aos Concursos:</label>
                            <div className="flex flex-wrap gap-2">
                                {plan.linkedContests.map(contest => {
                                    const isSelected = topic.relatedContests?.includes(contest);
                                    return (
                                        <button 
                                            key={contest}
                                            onClick={() => toggleContest(contest)}
                                            className={`text-[10px] px-2 py-1 rounded border transition-all ${isSelected ? 'bg-insanus-red text-white border-insanus-red shadow-neon' : 'bg-black text-gray-500 border-gray-700 hover:border-gray-500'}`}
                                        >
                                            {contest}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderGoalSelector("Aula", topic.links.aula, (v) => onUpdate({...topic, links: {...topic.links, aula: v}}), <Icon.Play className="w-3 h-3"/>)}
                        {renderGoalSelector("PDF / Material", topic.links.material, (v) => onUpdate({...topic, links: {...topic.links, material: v}}), <Icon.FileText className="w-3 h-3"/>)}
                        {renderGoalSelector("Questões", topic.links.questoes, (v) => onUpdate({...topic, links: {...topic.links, questoes: v}}), <Icon.Code className="w-3 h-3"/>)}
                        {renderGoalSelector("Lei Seca", topic.links.leiSeca, (v) => onUpdate({...topic, links: {...topic.links, leiSeca: v}}), <Icon.Book className="w-3 h-3"/>)}
                        {renderGoalSelector("Resumo", topic.links.resumo, (v) => onUpdate({...topic, links: {...topic.links, resumo: v}}), <Icon.Edit className="w-3 h-3"/>)}
                        {renderGoalSelector("Revisão Específica", topic.links.revisao, (v) => onUpdate({...topic, links: {...topic.links, revisao: v}}), <Icon.RefreshCw className="w-3 h-3"/>)}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- SUB-COMPONENT: CYCLE EDITOR ---
interface CycleEditorProps {
    cycle: Cycle;
    allDisciplines: Discipline[];
    onUpdate: (c: Cycle) => void;
    onDelete: () => void;
}

const CycleEditor: React.FC<CycleEditorProps> = ({ cycle, allDisciplines, onUpdate, onDelete }) => {
    const [selectedDiscId, setSelectedDiscId] = useState('');

    const addItem = () => {
        if (!selectedDiscId) return;
        const newItem: CycleItem = { disciplineId: selectedDiscId, subjectsCount: 1 };
        onUpdate({ ...cycle, items: [...cycle.items, newItem] });
        setSelectedDiscId('');
    };

    const updateItem = (index: number, field: keyof CycleItem, value: any) => {
        const newItems = [...cycle.items];
        newItems[index] = { ...newItems[index], [field]: value };
        onUpdate({ ...cycle, items: newItems });
    };

    const removeItem = (index: number) => {
        const newItems = cycle.items.filter((_, i) => i !== index);
        onUpdate({ ...cycle, items: newItems });
    };

    return (
        <div className="glass rounded-xl border border-white/5 overflow-hidden mb-6">
            <div className="bg-white/5 p-4 flex justify-between items-center border-b border-white/5">
                <div className="flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 rounded-full bg-insanus-red/20 text-insanus-red flex items-center justify-center font-black text-xs border border-insanus-red">
                        {cycle.order + 1}
                    </div>
                    <input 
                        value={cycle.name} 
                        onChange={e => onUpdate({...cycle, name: e.target.value})}
                        className="bg-transparent font-bold text-white focus:outline-none w-full text-lg placeholder-gray-600"
                        placeholder="Nome do Ciclo"
                    />
                </div>
                <SafeDeleteBtn onDelete={onDelete} />
            </div>

            <div className="p-4">
                <div className="space-y-2 mb-4">
                    {cycle.items.map((item, idx) => {
                        const discName = allDisciplines.find(d => d.id === item.disciplineId)?.name || 'Disciplina Removida';
                        return (
                            <div key={idx} className="flex items-center gap-4 bg-black/30 p-2 rounded border border-white/5">
                                <div className="text-gray-500 font-mono text-xs w-6 text-center">{idx + 1}.</div>
                                <div className="flex-1 text-sm font-bold text-gray-200">{discName}</div>
                                <div className="flex items-center gap-2 bg-black/50 rounded px-2 py-1 border border-white/5">
                                    <span className="text-[10px] text-gray-500 uppercase">Qtd. Metas:</span>
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={item.subjectsCount}
                                        onChange={(e) => updateItem(idx, 'subjectsCount', parseInt(e.target.value) || 1)}
                                        className="w-12 bg-transparent text-center text-white text-sm font-bold focus:outline-none"
                                    />
                                </div>
                                <button onClick={() => removeItem(idx)} className="text-gray-600 hover:text-red-500 p-1"><Icon.Trash className="w-4 h-4" /></button>
                            </div>
                        );
                    })}
                </div>
                <div className="flex gap-2 pt-2 border-t border-white/5">
                    <select 
                        value={selectedDiscId}
                        onChange={(e) => setSelectedDiscId(e.target.value)}
                        className="flex-1 bg-white/5 text-gray-300 text-xs rounded p-2 outline-none"
                    >
                        <option value="">Selecione uma disciplina...</option>
                        {allDisciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <button onClick={addItem} disabled={!selectedDiscId} className="bg-insanus-red/20 text-insanus-red hover:bg-insanus-red hover:text-white px-4 py-2 rounded text-xs font-bold transition-all">ADICIONAR</button>
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: GOAL EDITOR ---
interface GoalEditorProps {
    goal: Goal;
    onUpdate: (g: Goal) => void;
    onDelete: () => void;
}

const GoalEditor: React.FC<GoalEditorProps> = ({ goal, onUpdate, onDelete }) => {
    const [uploading, setUploading] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        setUploading(true);
        try {
            const url = await uploadFileToStorage(e.target.files[0]);
            onUpdate({ ...goal, pdfUrl: url });
        } catch (err) { alert("Erro no upload"); } 
        finally { setUploading(false); }
    };

    const addSubGoal = () => {
        const newSub: SubGoal = { id: uuid(), title: 'Nova Aula', link: '', duration: 30 };
        onUpdate({ ...goal, subGoals: [...(goal.subGoals || []), newSub] });
    };

    const updateSubGoal = (index: number, field: keyof SubGoal, value: any) => {
        if (!goal.subGoals) return;
        const newSubs = [...goal.subGoals];
        newSubs[index] = { ...newSubs[index], [field]: value };
        onUpdate({ ...goal, subGoals: newSubs });
    };

    const removeSubGoal = (index: number) => {
        if (!goal.subGoals) return;
        const newSubs = goal.subGoals.filter((_, i) => i !== index);
        onUpdate({ ...goal, subGoals: newSubs });
    };

    const totalDuration = goal.subGoals?.reduce((acc, curr) => acc + (Number(curr.duration)||0), 0) || 0;

    return (
        <div className="bg-black/40 p-3 rounded border border-white/5 hover:border-white/20 transition-all mb-2">
            <div className="flex items-center gap-2 mb-2">
                <div 
                    className="w-3 h-8 rounded shrink-0 cursor-pointer border border-white/10"
                    style={{ backgroundColor: goal.color || '#333' }}
                >
                    <input type="color" className="opacity-0 w-full h-full cursor-pointer" value={goal.color || '#333333'} onChange={(e) => onUpdate({...goal, color: e.target.value})} />
                </div>
                <select value={goal.type} onChange={e => onUpdate({...goal, type: e.target.value as any})} className="bg-white/5 text-[10px] font-bold rounded p-2 text-gray-300 border-none outline-none uppercase">
                    <option value="AULA">AULA</option>
                    <option value="MATERIAL">PDF</option>
                    <option value="QUESTOES">QUESTÕES</option>
                    <option value="LEI_SECA">LEI SECA</option>
                    <option value="RESUMO">RESUMO</option>
                    <option value="REVISAO">REVISÃO</option>
                </select>
                <input value={goal.title} onChange={e => onUpdate({...goal, title: e.target.value})} className="bg-transparent flex-1 text-sm font-bold text-white focus:outline-none border-b border-transparent focus:border-insanus-red placeholder-gray-600" placeholder="Título da Meta" />
                <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-white">{expanded ? <Icon.ArrowUp className="w-4 h-4" /> : <Icon.Edit className="w-4 h-4" />}</button>
                <SafeDeleteBtn onDelete={onDelete} />
            </div>
            
            {expanded && (
                <div className="mt-4 pt-4 border-t border-white/5 space-y-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-4">
                        <input value={goal.description || ''} onChange={e => onUpdate({...goal, description: e.target.value})} placeholder="Observações..." className="col-span-2 bg-white/5 p-2 rounded text-xs text-gray-300 focus:outline-none" />
                        
                        {(goal.type === 'MATERIAL' || goal.type === 'LEI_SECA' || goal.type === 'QUESTOES') && (
                            <div className="flex items-center gap-2 bg-white/5 p-2 rounded">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">Páginas/Qtd:</span>
                                <input type="number" value={goal.pages || 0} onChange={e => onUpdate({...goal, pages: Number(e.target.value)})} className="bg-transparent w-full text-white font-mono text-sm focus:outline-none text-right" />
                            </div>
                        )}
                        {goal.type === 'RESUMO' && (
                             <div className="flex items-center gap-2 bg-white/5 p-2 rounded">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">Tempo Manual (min):</span>
                                <input type="number" value={goal.manualTime || 0} onChange={e => onUpdate({...goal, manualTime: Number(e.target.value)})} className="bg-transparent w-full text-white font-mono text-sm focus:outline-none text-right" />
                            </div>
                        )}
                        
                        <input value={goal.link || ''} onChange={e => onUpdate({...goal, link: e.target.value})} placeholder="Link Geral (Opcional)" className="bg-white/5 p-2 rounded text-xs text-gray-400 focus:text-white focus:outline-none" />
                        <div className="relative">
                            <input type="file" id={`file-${goal.id}`} className="hidden" onChange={handleFileUpload} accept="application/pdf" />
                            <label htmlFor={`file-${goal.id}`} className={`block w-full text-center p-2 rounded cursor-pointer text-xs font-bold transition-colors ${goal.pdfUrl ? 'bg-green-900/30 text-green-500 border border-green-900' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}>
                                {uploading ? 'ENVIANDO...' : goal.pdfUrl ? 'PDF ANEXADO' : 'ANEXAR PDF'}
                            </label>
                        </div>
                        <div className="col-span-2 border-t border-white/5 pt-4 mt-2">
                             <div className="flex items-center gap-2 mb-2">
                                <input type="checkbox" id={`rev-${goal.id}`} checked={goal.hasRevision || false} onChange={e => onUpdate({...goal, hasRevision: e.target.checked})} className="cursor-pointer accent-insanus-red w-4 h-4" />
                                <label htmlFor={`rev-${goal.id}`} className="text-xs font-bold text-gray-300 cursor-pointer select-none hover:text-white flex items-center gap-2">ATIVAR REVISÕES AUTOMÁTICAS</label>
                             </div>
                             {goal.hasRevision && (
                                 <div className="pl-6 space-y-2 bg-white/5 p-3 rounded-lg border border-white/5">
                                     <label className="text-[10px] text-gray-500 uppercase font-bold">Intervalos (Dias):</label>
                                     <input value={goal.revisionIntervals || '1,7,15,30'} onChange={e => onUpdate({...goal, revisionIntervals: e.target.value})} placeholder="Ex: 1, 7, 15, 30" className="bg-black/30 p-2 rounded text-xs text-white focus:outline-none border border-white/10 w-full font-mono tracking-widest" />
                                 </div>
                             )}
                        </div>
                    </div>
                    {goal.type === 'AULA' && (
                        <div className="bg-black/20 p-3 rounded border border-white/5">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Aulas ({goal.subGoals?.length || 0})</span>
                                <span className="text-[10px] font-mono text-insanus-red">{totalDuration} min total</span>
                            </div>
                            <div className="space-y-2">
                                {goal.subGoals?.map((sub, idx) => (
                                    <div key={sub.id} className="flex gap-2 items-center">
                                        <span className="text-gray-600 font-mono text-xs">{idx + 1}.</span>
                                        <input value={sub.title} onChange={(e) => updateSubGoal(idx, 'title', e.target.value)} className="flex-1 bg-white/5 p-1 px-2 rounded text-xs text-white focus:outline-none" placeholder="Título da Aula" />
                                        <input value={sub.link} onChange={(e) => updateSubGoal(idx, 'link', e.target.value)} className="w-1/4 bg-white/5 p-1 px-2 rounded text-xs text-gray-400 focus:text-white focus:outline-none" placeholder="Link URL" />
                                        <input type="number" value={sub.duration} onChange={(e) => updateSubGoal(idx, 'duration', Number(e.target.value))} className="w-16 bg-white/5 p-1 px-2 rounded text-xs text-white text-center focus:outline-none" placeholder="Min" />
                                        <button onClick={() => removeSubGoal(idx)} className="text-gray-600 hover:text-red-500"><Icon.Trash className="w-3 h-3" /></button>
                                    </div>
                                ))}
                            </div>
                            <button onClick={addSubGoal} className="w-full mt-2 py-1 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-[10px] font-bold rounded transition">+ ADICIONAR AULA</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- PLAN DETAIL EDITOR ---
interface PlanDetailEditorProps {
    plan: StudyPlan;
    onUpdate: (p: StudyPlan) => void;
    onBack: () => void;
}

const PlanDetailEditor: React.FC<PlanDetailEditorProps> = ({ plan, onUpdate, onBack }) => {
    const [tab, setTab] = useState<'struct' | 'cycles' | 'edital'>('struct');
    const [saving, setSaving] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
    const [newContestName, setNewContestName] = useState('');

    const toggleExpand = (id: string) => setExpandedMap(prev => ({ ...prev, [id]: !prev[id] }));
    const isExpanded = (id: string) => !!expandedMap[id];
    
    const handleSync = async () => {
        setSaving(true);
        try {
            await savePlanToDB(plan);
            await new Promise(r => setTimeout(r, 800)); 
            alert("Plano sincronizado com sucesso!");
        } catch (e) { alert("Erro ao salvar."); } 
        finally { setSaving(false); }
    };

    const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        setUploadingCover(true);
        try {
            const url = await uploadFileToStorage(e.target.files[0], 'covers');
            onUpdate({ ...plan, coverImage: url });
        } catch (err) { alert("Erro ao enviar imagem."); } 
        finally { setUploadingCover(false); }
    };

    const addContest = () => {
        if(!newContestName.trim()) return;
        const current = plan.linkedContests || [];
        if(current.includes(newContestName.toUpperCase())) return;
        onUpdate({ ...plan, linkedContests: [...current, newContestName.toUpperCase()] });
        setNewContestName('');
    }
    const removeContest = (name: string) => {
        onUpdate({ ...plan, linkedContests: (plan.linkedContests || []).filter(c => c !== name) });
    }

    // Structure Helpers
    const addFolder = () => {
        const newFolder: Folder = { id: uuid(), name: 'Nova Pasta', order: plan.folders.length };
        setExpandedMap(prev => ({ ...prev, [newFolder.id]: true }));
        onUpdate({ ...plan, folders: [...plan.folders, newFolder] });
    };
    const deleteFolder = (fid: string) => {
        const updatedDisciplines = plan.disciplines.map(d => d.folderId === fid ? { ...d, folderId: undefined } : d);
        onUpdate({ ...plan, folders: plan.folders.filter(f => f.id !== fid), disciplines: updatedDisciplines as Discipline[] });
    };
    const addDiscipline = (folderId?: string) => {
        const newDisc: Discipline = { id: uuid(), name: 'Nova Disciplina', folderId, subjects: [], order: 99 };
        setExpandedMap(prev => ({ ...prev, [newDisc.id]: true }));
        onUpdate({ ...plan, disciplines: [...plan.disciplines, newDisc] });
    };
    const deleteDiscipline = (did: string) => onUpdate({ ...plan, disciplines: plan.disciplines.filter(d => d.id !== did) });
    const moveDiscipline = (discId: string, newFolderId: string) => {
        const updatedDiscs = plan.disciplines.map(d => d.id === discId ? { ...d, folderId: newFolderId || undefined } : d);
        onUpdate({ ...plan, disciplines: updatedDiscs as Discipline[] });
    };
    const addSubject = (discId: string) => {
        const discIndex = plan.disciplines.findIndex(d => d.id === discId);
        if (discIndex === -1) return;
        const newSub: Subject = { id: uuid(), name: 'Novo Assunto', goals: [], order: 99 };
        setExpandedMap(prev => ({ ...prev, [newSub.id]: true }));
        const newDiscs = [...plan.disciplines];
        newDiscs[discIndex].subjects.push(newSub);
        onUpdate({ ...plan, disciplines: newDiscs });
    };
    const deleteSubject = (discId: string, subId: string) => {
        const discIndex = plan.disciplines.findIndex(d => d.id === discId);
        if (discIndex === -1) return;
        const newDiscs = [...plan.disciplines];
        newDiscs[discIndex].subjects = newDiscs[discIndex].subjects.filter(s => s.id !== subId);
        onUpdate({ ...plan, disciplines: newDiscs });
    };
    const addGoal = (discId: string, subId: string) => {
        const discIndex = plan.disciplines.findIndex(d => d.id === discId);
        if (discIndex === -1) return;
        const subIndex = plan.disciplines[discIndex].subjects.findIndex(s => s.id === subId);
        if (subIndex === -1) return;
        const newGoal: Goal = { id: uuid(), title: 'Nova Meta', type: 'AULA', order: 99, link: '', pdfUrl: '', subGoals: [], pages: 0, color: '#333333' };
        const newDiscs = [...plan.disciplines];
        newDiscs[discIndex].subjects[subIndex].goals.push(newGoal);
        onUpdate({ ...plan, disciplines: newDiscs });
    };
    const updateGoal = (discId: string, subId: string, goal: Goal) => {
        const discIndex = plan.disciplines.findIndex(d => d.id === discId);
        const subIndex = plan.disciplines[discIndex].subjects.findIndex(s => s.id === subId);
        const goalIndex = plan.disciplines[discIndex].subjects[subIndex].goals.findIndex(g => g.id === goal.id);
        const newDiscs = [...plan.disciplines];
        newDiscs[discIndex].subjects[subIndex].goals[goalIndex] = goal;
        onUpdate({ ...plan, disciplines: newDiscs });
    };
    const deleteGoal = (discId: string, subId: string, goalId: string) => {
        const discIndex = plan.disciplines.findIndex(d => d.id === discId);
        const subIndex = plan.disciplines[discIndex].subjects.findIndex(s => s.id === subId);
        const newDiscs = [...plan.disciplines];
        newDiscs[discIndex].subjects[subIndex].goals = newDiscs[discIndex].subjects[subIndex].goals.filter(g => g.id !== goalId);
        onUpdate({ ...plan, disciplines: newDiscs });
    };

    // Cycles & Edital
    const addCycle = () => onUpdate({ ...plan, cycles: [...plan.cycles, { id: uuid(), name: 'Novo Ciclo', items: [], order: plan.cycles.length }] });
    const updateCycle = (uc: Cycle) => onUpdate({ ...plan, cycles: plan.cycles.map(c => c.id === uc.id ? uc : c) });
    const deleteCycle = (cid: string) => onUpdate({ ...plan, cycles: plan.cycles.filter(c => c.id !== cid) });
    const addEditalDiscipline = () => onUpdate({ ...plan, editalVerticalizado: [...(plan.editalVerticalizado || []), { id: uuid(), name: 'Nova Disciplina', topics: [], order: 0 }] });
    const updateEditalDiscipline = (i: number, n: string) => { const ne = [...(plan.editalVerticalizado||[])]; ne[i].name = n; onUpdate({...plan, editalVerticalizado: ne}); };
    const deleteEditalDiscipline = (i: number) => onUpdate({ ...plan, editalVerticalizado: (plan.editalVerticalizado||[]).filter((_, idx) => idx !== i) });
    const addEditalTopic = (i: number) => { const ne = [...(plan.editalVerticalizado||[])]; ne[i].topics.push({id: uuid(), name: 'Novo Tópico', links: {}, order: 0}); onUpdate({...plan, editalVerticalizado: ne}); };
    const updateEditalTopic = (di: number, ti: number, t: EditalTopic) => { const ne = [...(plan.editalVerticalizado||[])]; ne[di].topics[ti] = t; onUpdate({...plan, editalVerticalizado: ne}); };
    const deleteEditalTopic = (di: number, ti: number) => { const ne = [...(plan.editalVerticalizado||[])]; ne[di].topics = ne[di].topics.filter((_, idx) => idx !== ti); onUpdate({...plan, editalVerticalizado: ne}); };

    const renderDiscipline = (disc: Discipline) => (
        <div key={disc.id} className="ml-4 border-l-2 border-white/10 pl-4 mb-6">
            <div className="flex justify-between items-center mb-4 bg-white/5 p-2 rounded-lg hover:bg-white/10 transition">
                <div className="flex items-center gap-3 flex-1">
                    <button onClick={() => toggleExpand(disc.id)} className={`text-gray-400 hover:text-white transition-transform ${isExpanded(disc.id) ? 'rotate-180' : ''}`}><Icon.ChevronDown className="w-5 h-5" /></button>
                    <div className="w-2 h-2 rounded-full bg-insanus-red shadow-neon"></div>
                    <input value={disc.name} onChange={e => { const nd = plan.disciplines.map(d => d.id === disc.id ? {...d, name: e.target.value} : d); onUpdate({...plan, disciplines: nd}); }} className="bg-transparent font-bold text-gray-200 focus:outline-none text-base w-full" />
                </div>
                <div className="flex items-center gap-2">
                    <select className="bg-black text-[10px] text-gray-400 border border-white/10 rounded p-1 outline-none max-w-[120px]" value={disc.folderId || ''} onChange={(e) => moveDiscipline(disc.id, e.target.value)}>
                        <option value="">(Sem Pasta)</option>
                        {plan.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <button onClick={() => addSubject(disc.id)} className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded font-bold uppercase transition">+ Assunto</button>
                    <SafeDeleteBtn onDelete={() => deleteDiscipline(disc.id)} />
                </div>
            </div>
            {isExpanded(disc.id) && (
                <div className="space-y-4 pl-2 animate-fade-in">
                    {disc.subjects.map(sub => (
                        <div key={sub.id} className="bg-black/40 rounded-xl border border-white/5 p-4 relative group">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/10 group-hover:bg-insanus-red/50 transition-colors"></div>
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2 flex-1">
                                    <button onClick={() => toggleExpand(sub.id)} className={`text-gray-500 hover:text-white transition-transform ${isExpanded(sub.id) ? 'rotate-180' : ''}`}><Icon.ChevronDown className="w-4 h-4" /></button>
                                    <input value={sub.name} onChange={e => { const idx = plan.disciplines.findIndex(d => d.id === disc.id); const nd = [...plan.disciplines]; const subIdx = nd[idx].subjects.findIndex(s => s.id === sub.id); nd[idx].subjects[subIdx].name = e.target.value; onUpdate({...plan, disciplines: nd}); }} className="bg-transparent font-bold text-insanus-red focus:text-white focus:outline-none text-sm w-full uppercase" />
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => addGoal(disc.id, sub.id)} className="text-[10px] bg-insanus-red hover:bg-red-600 px-3 py-1 rounded text-white font-bold shadow-neon">+ META</button>
                                    <SafeDeleteBtn onDelete={() => deleteSubject(disc.id, sub.id)} />
                                </div>
                            </div>
                            {isExpanded(sub.id) && (
                                <div className="space-y-2 animate-fade-in">
                                    {sub.goals.map(goal => (
                                        <GoalEditor key={goal.id} goal={goal} onUpdate={(g) => updateGoal(disc.id, sub.id, g)} onDelete={() => deleteGoal(disc.id, sub.id, goal.id)} />
                                    ))}
                                    {sub.goals.length === 0 && <div className="text-[10px] text-gray-600 italic text-center py-2">Nenhuma meta criada.</div>}
                                </div>
                            )}
                        </div>
                    ))}
                    {disc.subjects.length === 0 && <div className="text-gray-600 italic text-xs ml-4">Nenhum assunto cadastrado.</div>}
                </div>
            )}
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-black/90 text-white overflow-hidden">
             <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-black z-20">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-gray-500 hover:text-white"><Icon.ArrowUp className="-rotate-90 w-6 h-6" /></button>
                    <span className="text-gray-500 font-mono text-xs uppercase">Editando Plano</span>
                </div>
                <div className="flex gap-4">
                    <button onClick={handleSync} disabled={saving} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 shadow-neon">
                        {saving ? <Icon.RefreshCw className="w-4 h-4 animate-spin" /> : <Icon.Check className="w-4 h-4" />} {saving ? 'SALVANDO...' : 'SALVAR E SINCRONIZAR'}
                    </button>
                    <div className="h-8 w-px bg-white/10 mx-2"></div>
                    <button onClick={() => setTab('struct')} className={`px-4 py-2 text-xs font-bold rounded ${tab==='struct' ? 'bg-insanus-red text-white' : 'text-gray-500 hover:text-white'}`}>ESTRUTURA</button>
                    <button onClick={() => setTab('cycles')} className={`px-4 py-2 text-xs font-bold rounded ${tab==='cycles' ? 'bg-insanus-red text-white' : 'text-gray-500 hover:text-white'}`}>CICLOS</button>
                    <button onClick={() => setTab('edital')} className={`px-4 py-2 text-xs font-bold rounded flex items-center gap-2 ${tab==='edital' ? 'bg-insanus-red text-white' : 'text-gray-500 hover:text-white'}`}><Icon.List className="w-3 h-3"/> EDITAL</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="flex flex-col md:flex-row gap-8 mb-10 items-start border-b border-white/10 pb-8">
                     <div className="shrink-0 group relative w-40 h-40 rounded-2xl border-2 border-dashed border-white/20 bg-white/5 overflow-hidden hover:border-insanus-red transition-colors shadow-lg">
                        {plan.coverImage ? ( <img src={plan.coverImage} className="w-full h-full object-cover" /> ) : ( <div className="flex flex-col items-center justify-center h-full text-gray-500"><Icon.Image className="w-8 h-8 mb-2" /><span className="text-[10px] uppercase font-bold text-center px-2">Sem Capa</span></div> )}
                        <label className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white text-xs font-bold text-center p-2">
                            {uploadingCover ? <Icon.RefreshCw className="w-6 h-6 animate-spin mb-1"/> : <Icon.Edit className="w-6 h-6 mb-1 text-insanus-red" />} {uploadingCover ? 'ENVIANDO' : 'ALTERAR CAPA'}
                            <input type="file" className="hidden" accept="image/*" onChange={handleCoverUpload} disabled={uploadingCover} />
                        </label>
                    </div>
                    <div className="flex-1 pt-2">
                        <div className="flex justify-between items-start">
                            <div>
                                <label className="text-xs font-bold text-insanus-red uppercase tracking-widest mb-2 block">Nome do Plano</label>
                                <input value={plan.name} onChange={e => onUpdate({...plan, name: e.target.value})} className="bg-transparent text-4xl font-black text-white focus:outline-none border-b border-white/10 focus:border-insanus-red placeholder-gray-700 w-full mb-6 pb-2" placeholder="Digite o nome do plano..." />
                            </div>
                            <div className="ml-8">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Categoria</label>
                                <select value={plan.category || 'CARREIRAS_POLICIAIS'} onChange={e => onUpdate({...plan, category: e.target.value as PlanCategory})} className="bg-black border border-white/10 rounded-lg p-2 text-xs text-white uppercase font-bold outline-none focus:border-insanus-red">
                                    <option value="CARREIRAS_POLICIAIS">Carreiras Policiais</option>
                                    <option value="CARREIRAS_TRIBUNAIS">Carreiras de Tribunais</option>
                                    <option value="CARREIRAS_ADMINISTRATIVAS">Carreiras Administrativas</option>
                                    <option value="CARREIRAS_JURIDICAS">Carreiras Jurídicas</option>
                                    <option value="ENEM">ENEM</option>
                                    <option value="OUTROS">Outros</option>
                                </select>
                            </div>
                        </div>
                         <div className="flex gap-4">
                             <div className="bg-white/5 px-6 py-3 rounded-xl border border-white/10 flex flex-col"><span className="text-2xl font-black text-white leading-none">{plan.disciplines.length}</span><span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mt-1">Disciplinas</span></div>
                             <div className="bg-white/5 px-6 py-3 rounded-xl border border-white/10 flex flex-col"><span className="text-2xl font-black text-white leading-none">{plan.cycles.length}</span><span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mt-1">Ciclos</span></div>
                        </div>
                    </div>
                </div>

                {tab === 'struct' && (
                    <div className="max-w-6xl mx-auto space-y-12">
                         <div className="glass rounded-xl border border-white/10 overflow-hidden">
                            <div className="bg-gradient-to-r from-gray-900 to-black p-4 flex justify-between items-center border-b border-white/10">
                                <div className="flex items-center gap-3"><Icon.BookOpen className="w-5 h-5 text-gray-400" /><span className="font-black text-gray-200 uppercase tracking-widest text-sm">Disciplinas Gerais (Sem Pasta)</span></div>
                                <button onClick={() => addDiscipline()} className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded font-bold transition">+ NOVA DISCIPLINA</button>
                            </div>
                            <div className="p-6 bg-black/20">
                                {plan.disciplines.filter(d => !d.folderId).map(renderDiscipline)}
                                {plan.disciplines.filter(d => !d.folderId).length === 0 && (<div className="text-center py-8 text-gray-600 text-xs font-mono border border-dashed border-white/5 rounded">Nenhuma disciplina solta. Crie uma aqui ou mova de uma pasta.</div>)}
                            </div>
                        </div>
                        <div className="space-y-8">
                            <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                <h3 className="text-lg font-black text-white uppercase">Pastas de Organização</h3>
                                <button onClick={addFolder} className="text-xs bg-insanus-red hover:bg-red-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2"><Icon.FolderPlus className="w-4 h-4" /> NOVA PASTA</button>
                            </div>
                            {plan.folders.map(folder => (
                                <div key={folder.id} className="glass rounded-xl border border-white/5 overflow-hidden transition-all duration-300">
                                    <div className="bg-white/5 p-4 flex justify-between items-center border-b border-white/5">
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => toggleExpand(folder.id)} className={`text-gray-400 hover:text-white transition-transform ${isExpanded(folder.id) ? 'rotate-180' : ''}`}><Icon.ChevronDown className="w-5 h-5" /></button>
                                            <Icon.Folder className="w-5 h-5 text-insanus-red" />
                                            <input value={folder.name} onChange={e => { const nf = plan.folders.map(f => f.id === folder.id ? {...f, name: e.target.value} : f); onUpdate({...plan, folders: nf}); }} className="bg-transparent font-bold text-white focus:outline-none w-64 text-lg" />
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => addDiscipline(folder.id)} className="text-[10px] bg-insanus-red/20 text-insanus-red px-3 py-1 rounded hover:bg-insanus-red hover:text-white font-bold transition">+ DISCIPLINA</button>
                                            <SafeDeleteBtn onDelete={() => deleteFolder(folder.id)} />
                                        </div>
                                    </div>
                                    {isExpanded(folder.id) && (
                                        <div className="p-6 animate-fade-in">
                                            {plan.disciplines.filter(d => d.folderId === folder.id).map(renderDiscipline)}
                                            {plan.disciplines.filter(d => d.folderId === folder.id).length === 0 && <div className="text-xs text-gray-600 italic ml-4">Esta pasta está vazia.</div>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {tab === 'cycles' && (
                    <div className="max-w-4xl mx-auto">
                        <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                            <div><h3 className="text-2xl font-black text-white uppercase">Gestão de Ciclos</h3><p className="text-gray-500 text-xs">Crie sequências de estudo rotativas.</p></div>
                            <button onClick={addCycle} className="bg-insanus-red hover:bg-red-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2"><Icon.Plus className="w-4 h-4" /> NOVO CICLO</button>
                        </div>
                        {plan.cycles.length === 0 ? (
                             <div className="flex flex-col items-center justify-center h-64 text-gray-500 border border-dashed border-white/10 rounded-2xl"><Icon.RefreshCw className="w-12 h-12 mb-4 opacity-50"/><p>Nenhum ciclo criado.</p><button onClick={addCycle} className="mt-4 text-insanus-red hover:underline text-sm font-bold">Criar Primeiro Ciclo</button></div>
                        ) : ( <div>{plan.cycles.map(cycle => ( <CycleEditor key={cycle.id} cycle={cycle} allDisciplines={plan.disciplines} onUpdate={updateCycle} onDelete={() => deleteCycle(cycle.id)} /> ))}</div> )}
                    </div>
                )}

                {tab === 'edital' && (
                    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
                        <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                            <div><h3 className="text-2xl font-black text-white uppercase">Edital Verticalizado</h3><p className="text-gray-500 text-xs">Organize os tópicos e vincule as metas.</p></div>
                            <button onClick={addEditalDiscipline} className="bg-insanus-red hover:bg-red-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2"><Icon.Plus className="w-4 h-4" /> NOVA DISCIPLINA DO EDITAL</button>
                        </div>
                        {plan.category === 'CARREIRAS_POLICIAIS' && (
                            <div className="mb-8 p-6 bg-white/5 border border-white/10 rounded-xl">
                                <div className="flex items-center justify-between mb-4"><h4 className="text-lg font-bold text-white uppercase flex items-center gap-2"><Icon.User className="w-5 h-5 text-insanus-red" /> IDENTIFICAR CONCURSOS</h4></div>
                                <div className="flex gap-2 mb-4">
                                    <input value={newContestName} onChange={(e) => setNewContestName(e.target.value)} className="bg-black border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-insanus-red flex-1" placeholder="Ex: PF, PRF..." />
                                    <button onClick={addContest} className="bg-insanus-red text-white px-6 rounded-lg font-bold text-xs uppercase hover:bg-red-600 transition">Adicionar</button>
                                </div>
                                <div className="flex flex-wrap gap-2">{plan.linkedContests?.map(c => ( <div key={c} className="bg-insanus-red/20 border border-insanus-red text-insanus-red px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2">{c}<button onClick={() => removeContest(c)} className="hover:text-white"><Icon.Trash className="w-3 h-3" /></button></div> ))}</div>
                            </div>
                        )}
                        {(!plan.editalVerticalizado || plan.editalVerticalizado.length === 0) ? (
                             <div className="flex flex-col items-center justify-center h-64 text-gray-500 border border-dashed border-white/10 rounded-2xl"><Icon.List className="w-12 h-12 mb-4 opacity-50"/><p>Edital vazio.</p><button onClick={addEditalDiscipline} className="mt-4 text-insanus-red hover:underline text-sm font-bold">Criar Estrutura</button></div>
                        ) : (
                            <div className="grid gap-8">
                                {plan.editalVerticalizado.map((disc, dIdx) => (
                                    <div key={disc.id} className="glass rounded-xl border border-white/5 overflow-hidden">
                                        <div className="bg-white/5 p-4 flex justify-between items-center border-b border-white/5">
                                            <div className="flex items-center gap-3 flex-1"><div className="w-2 h-8 bg-insanus-red rounded"></div><input value={disc.name} onChange={e => updateEditalDiscipline(dIdx, e.target.value)} className="bg-transparent font-black text-white focus:outline-none w-full text-lg uppercase" placeholder="NOME DA DISCIPLINA" /></div>
                                            <div className="flex items-center gap-3"><button onClick={() => addEditalTopic(dIdx)} className="text-[10px] bg-insanus-red/20 text-insanus-red px-3 py-1 rounded hover:bg-insanus-red hover:text-white font-bold transition">+ TÓPICO</button><SafeDeleteBtn onDelete={() => deleteEditalDiscipline(dIdx)} /></div>
                                        </div>
                                        <div className="p-4 bg-black/40">
                                            {disc.topics.map((topic, tIdx) => ( <EditalTopicEditor key={topic.id} topic={topic} plan={plan} onUpdate={(updatedTopic) => updateEditalTopic(dIdx, tIdx, updatedTopic)} onDelete={() => deleteEditalTopic(dIdx, tIdx)} /> ))}
                                            {disc.topics.length === 0 && <div className="text-center text-gray-600 text-xs italic py-4">Nenhum tópico cadastrado.</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- SIMULADO EDITOR COMPONENT ---
interface SimuladoEditorProps {
    simClass: SimuladoClass;
    onUpdate: (sc: SimuladoClass) => void;
    onBack: () => void;
}

const SimuladoEditor: React.FC<SimuladoEditorProps> = ({ simClass, onUpdate, onBack }) => {
    const [selectedSimulado, setSelectedSimulado] = useState<Simulado | null>(null);
    const [uploading, setUploading] = useState(false);

    const addSimulado = () => {
        const newSim: Simulado = {
            id: uuid(), title: "Novo Simulado", type: "MULTIPLA_ESCOLHA", optionsCount: 5, totalQuestions: 10,
            hasPenalty: false, hasBlocks: false, blocks: [], correctAnswers: {}, questionValues: {}, hasDiagnosis: false, diagnosisMap: {}
        };
        onUpdate({ ...simClass, simulados: [...simClass.simulados, newSim] });
        setSelectedSimulado(newSim);
    };

    const updateSimulado = (sim: Simulado) => {
        const updatedList = simClass.simulados.map(s => s.id === sim.id ? sim : s);
        onUpdate({ ...simClass, simulados: updatedList });
        setSelectedSimulado(sim);
    };

    const deleteSimulado = (id: string) => {
        if (!confirm("Excluir simulado?")) return;
        const updatedList = simClass.simulados.filter(s => s.id !== id);
        onUpdate({ ...simClass, simulados: updatedList });
        setSelectedSimulado(null);
    };

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>, sim: Simulado, field: 'pdfUrl' | 'gabaritoPdfUrl') => {
        if (!e.target.files || !e.target.files[0]) return;
        setUploading(true);
        try {
            const url = await uploadFileToStorage(e.target.files[0], 'simulados');
            updateSimulado({ ...sim, [field]: url });
        } catch(err) { alert("Erro upload"); }
        finally { setUploading(false); }
    }

    if (selectedSimulado) {
        const s = selectedSimulado;
        return (
            <div className="flex flex-col h-full bg-black/40">
                <div className="flex items-center gap-4 border-b border-white/10 p-4">
                    <button onClick={() => setSelectedSimulado(null)} className="text-gray-400 hover:text-white"><Icon.ArrowUp className="-rotate-90 w-6 h-6"/></button>
                    <span className="font-bold text-white uppercase">{s.title}</span>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="text-[10px] text-gray-500 uppercase font-bold">Título</label>
                            <input value={s.title} onChange={e => updateSimulado({...s, title: e.target.value})} className="w-full bg-black border border-white/10 p-2 rounded text-white"/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold">Tipo</label>
                                <select value={s.type} onChange={e => updateSimulado({...s, type: e.target.value as any})} className="w-full bg-black border border-white/10 p-2 rounded text-white">
                                    <option value="MULTIPLA_ESCOLHA">Múltipla Escolha</option>
                                    <option value="CERTO_ERRADO">Certo / Errado</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold">Qtd. Questões</label>
                                <input type="number" value={s.totalQuestions} onChange={e => updateSimulado({...s, totalQuestions: Number(e.target.value)})} className="w-full bg-black border border-white/10 p-2 rounded text-white"/>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Caderno de Questões (PDF)</label>
                            <input type="file" onChange={e => handleFile(e, s, 'pdfUrl')} className="text-xs text-gray-400"/>
                            {s.pdfUrl && <span className="text-xs text-green-500 ml-2">Anexado</span>}
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Gabarito Comentado (PDF)</label>
                            <input type="file" onChange={e => handleFile(e, s, 'gabaritoPdfUrl')} className="text-xs text-gray-400"/>
                            {s.gabaritoPdfUrl && <span className="text-xs text-green-500 ml-2">Anexado</span>}
                        </div>
                        <div className="col-span-2 flex gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={s.hasPenalty} onChange={e => updateSimulado({...s, hasPenalty: e.target.checked})} className="accent-insanus-red"/>
                                <span className="text-xs font-bold text-white">Sistema de Penalidade (1 Errada anula 1 Certa)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={s.hasDiagnosis} onChange={e => updateSimulado({...s, hasDiagnosis: e.target.checked})} className="accent-insanus-red"/>
                                <span className="text-xs font-bold text-white">Ativar Autodiagnóstico</span>
                            </label>
                        </div>
                    </div>

                    <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-sm font-bold text-white">Divisão de Blocos</h4>
                            <button onClick={() => updateSimulado({...s, hasBlocks: !s.hasBlocks})} className={`text-[10px] px-2 py-1 rounded ${s.hasBlocks ? 'bg-insanus-red text-white' : 'bg-gray-700 text-gray-400'}`}>{s.hasBlocks ? 'ATIVADO' : 'DESATIVADO'}</button>
                        </div>
                        {s.hasBlocks && (
                            <div className="space-y-2">
                                {s.blocks.map((b, idx) => (
                                    <div key={idx} className="flex gap-2">
                                        <input value={b.name} onChange={e => { const nb = [...s.blocks]; nb[idx].name = e.target.value; updateSimulado({...s, blocks: nb}); }} placeholder="Nome Bloco" className="bg-black p-1 text-xs text-white border border-white/10 rounded"/>
                                        <input type="number" value={b.questionCount} onChange={e => { const nb = [...s.blocks]; nb[idx].questionCount = Number(e.target.value); updateSimulado({...s, blocks: nb}); }} placeholder="Qtd" className="w-16 bg-black p-1 text-xs text-white border border-white/10 rounded"/>
                                        <input type="number" value={b.minCorrect} onChange={e => { const nb = [...s.blocks]; nb[idx].minCorrect = Number(e.target.value); updateSimulado({...s, blocks: nb}); }} placeholder="Mín. Acertos" className="w-20 bg-black p-1 text-xs text-white border border-white/10 rounded"/>
                                        <button onClick={() => { const nb = s.blocks.filter((_, i) => i !== idx); updateSimulado({...s, blocks: nb}); }} className="text-red-500"><Icon.Trash className="w-4 h-4"/></button>
                                    </div>
                                ))}
                                <button onClick={() => updateSimulado({...s, blocks: [...s.blocks, {id: uuid(), name: `Bloco ${s.blocks.length+1}`, questionCount: 10}]})} className="text-xs text-insanus-red hover:underline">+ Adicionar Bloco</button>
                            </div>
                        )}
                        <div className="mt-4 pt-2 border-t border-white/10">
                            <label className="text-[10px] text-gray-500 font-bold uppercase">Mínimo % Geral para Aprovação</label>
                            <input type="number" value={s.minTotalPercent || 0} onChange={e => updateSimulado({...s, minTotalPercent: Number(e.target.value)})} className="ml-2 w-16 bg-black p-1 text-xs text-white border border-white/10 rounded"/> <span className="text-xs">%</span>
                        </div>
                    </div>

                    <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                        <h4 className="text-sm font-bold text-white mb-4">Gabarito e Configuração das Questões</h4>
                        <div className="grid grid-cols-1 gap-2">
                            {Array.from({length: s.totalQuestions}).map((_, i) => {
                                const qNum = i + 1;
                                const diag = s.diagnosisMap[qNum] || { discipline: '', topic: '' };
                                const ans = s.correctAnswers[qNum] || '';
                                const val = s.questionValues[qNum] || 1;
                                return (
                                    <div key={qNum} className="flex flex-wrap items-center gap-2 bg-black/40 p-2 rounded border border-white/5 hover:border-white/20">
                                        <div className="w-8 h-8 flex items-center justify-center bg-white/10 rounded font-bold text-xs">{qNum}</div>
                                        <div className="flex flex-col">
                                            <label className="text-[8px] uppercase text-gray-500">Resp.</label>
                                            <input value={ans} onChange={e => updateSimulado({ ...s, correctAnswers: {...s.correctAnswers, [qNum]: e.target.value.toUpperCase()} })} className="w-10 bg-black text-center text-xs font-bold text-insanus-red p-1 rounded border border-white/10" maxLength={1} />
                                        </div>
                                        <div className="flex flex-col">
                                            <label className="text-[8px] uppercase text-gray-500">Pontos</label>
                                            <input type="number" value={val} onChange={e => updateSimulado({ ...s, questionValues: {...s.questionValues, [qNum]: Number(e.target.value)} })} className="w-12 bg-black text-center text-xs p-1 rounded border border-white/10" />
                                        </div>
                                        {s.hasDiagnosis && (
                                            <>
                                                <div className="flex flex-col flex-1 min-w-[100px]">
                                                    <label className="text-[8px] uppercase text-gray-500">Disciplina</label>
                                                    <input value={diag.discipline} onChange={e => updateSimulado({ ...s, diagnosisMap: {...s.diagnosisMap, [qNum]: {...diag, discipline: e.target.value}} })} className="bg-black text-xs p-1 rounded border border-white/10 w-full" placeholder="Ex: Direito Const." />
                                                </div>
                                                <div className="flex flex-col flex-1 min-w-[100px]">
                                                    <label className="text-[8px] uppercase text-gray-500">Assunto/Tópico</label>
                                                    <input value={diag.topic} onChange={e => updateSimulado({ ...s, diagnosisMap: {...s.diagnosisMap, [qNum]: {...diag, topic: e.target.value}} })} className="bg-black text-xs p-1 rounded border border-white/10 w-full" placeholder="Ex: Direitos Fund." />
                                                </div>
                                                <div className="flex flex-col flex-1 min-w-[100px]">
                                                    <label className="text-[8px] uppercase text-gray-500">Obs (Opcional)</label>
                                                    <input value={diag.observation || ''} onChange={e => updateSimulado({ ...s, diagnosisMap: {...s.diagnosisMap, [qNum]: {...diag, observation: e.target.value}} })} className="bg-black text-xs p-1 rounded border border-white/10 w-full" placeholder="Comentário..." />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-black/80">
            <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-black">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-gray-500 hover:text-white"><Icon.ArrowUp className="-rotate-90 w-6 h-6" /></button>
                    <input value={simClass.name} onChange={e => onUpdate({...simClass, name: e.target.value})} className="bg-transparent font-black text-white text-xl focus:outline-none" />
                </div>
                <button onClick={addSimulado} className="bg-insanus-red px-4 py-2 rounded text-xs font-bold text-white">+ NOVO SIMULADO</button>
            </div>
            <div className="flex-1 p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
                {simClass.simulados.map(sim => (
                    <div key={sim.id} className="glass border border-white/5 rounded-xl p-4 flex flex-col justify-between hover:border-insanus-red transition group">
                        <div>
                            <h3 className="font-bold text-white text-lg mb-2">{sim.title}</h3>
                            <div className="text-xs text-gray-500 space-y-1">
                                <p>• {sim.totalQuestions} Questões ({sim.type === 'MULTIPLA_ESCOLHA' ? 'Múltipla' : 'C/E'})</p>
                                <p>• Penalidade: {sim.hasPenalty ? 'Sim' : 'Não'}</p>
                                <p>• Autodiagnóstico: {sim.hasDiagnosis ? 'Ativado' : 'Desativado'}</p>
                            </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                            <button onClick={() => setSelectedSimulado(sim)} className="flex-1 bg-white/10 hover:bg-white/20 text-white py-2 rounded text-xs font-bold">EDITAR</button>
                            <button onClick={() => deleteSimulado(sim.id)} className="bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white p-2 rounded"><Icon.Trash className="w-4 h-4"/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- MAIN ADMIN DASHBOARD ---
interface AdminDashboardProps {
    user: User;
    onSwitchToUser: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onSwitchToUser }) => {
    const [view, setView] = useState<'users' | 'plans' | 'simulados'>('plans');
    const [users, setUsers] = useState<User[]>([]);
    const [plans, setPlans] = useState<StudyPlan[]>([]);
    const [simuladoClasses, setSimuladoClasses] = useState<SimuladoClass[]>([]);
    
    const [editingPlan, setEditingPlan] = useState<StudyPlan | null>(null);
    const [editingSimClass, setEditingSimClass] = useState<SimuladoClass | null>(null);

    // Modals State
    const [showUserModal, setShowUserModal] = useState(false);
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [showSimClassModal, setShowSimClassModal] = useState(false);

    // Forms State
    const [newUserForm, setNewUserForm] = useState({ name: '', email: '', cpf: '', password: '' });
    const [newPlanName, setNewPlanName] = useState('');
    const [newSimClassName, setNewSimClassName] = useState('');

    // Loading States
    const [isSubmittingUser, setIsSubmittingUser] = useState(false);
    const [isCreatingPlan, setIsCreatingPlan] = useState(false);
    const [isCreatingSimClass, setIsCreatingSimClass] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        const u = await fetchUsersFromDB();
        const p = await fetchPlansFromDB();
        const s = await fetchSimuladoClassesFromDB();
        setUsers(u);
        setPlans(p);
        setSimuladoClasses(s);
    };

    const submitCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUserForm.name || !newUserForm.email || !newUserForm.password) return;
        setIsSubmittingUser(true);
        try {
            const newUser: User = {
                id: uuid(), name: newUserForm.name, email: newUserForm.email, cpf: newUserForm.cpf || '000.000.000-00', level: 'iniciante',
                isAdmin: false, allowedPlans: [], allowedSimuladoClasses: [], planExpirations: {}, planConfigs: {},
                routine: { days: {} }, progress: { completedGoalIds: [], completedRevisionIds: [], totalStudySeconds: 0, planStudySeconds: {} }, tempPassword: newUserForm.password
            };
            await saveUserToDB(newUser);
            await loadData();
            setShowUserModal(false);
            setNewUserForm({ name: '', email: '', cpf: '', password: '' });
        } catch (err) { alert("Erro ao criar usuário."); } 
        finally { setIsSubmittingUser(false); }
    };

    const submitCreatePlan = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!newPlanName.trim()) return;
        setIsCreatingPlan(true);
        try {
            const newPlan: StudyPlan = { 
                id: uuid(), 
                name: newPlanName, 
                category: 'CARREIRAS_POLICIAIS', 
                coverImage: '', 
                folders: [], 
                disciplines: [], 
                cycles: [], 
                cycleSystem: 'rotativo', 
                editalVerticalizado: [],
                linkedContests: []
            };
            await savePlanToDB(newPlan);
            
            // Optimistic Update
            setPlans(prev => [...prev, newPlan]);
            
            setShowPlanModal(false);
            setNewPlanName('');
        } catch (e: any) {
            alert("Erro ao criar plano: " + e.message);
        } finally {
            setIsCreatingPlan(false);
        }
    };

    const submitCreateSimClass = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!newSimClassName.trim()) return;
        setIsCreatingSimClass(true);
        try {
            const newClass: SimuladoClass = { id: uuid(), name: newSimClassName, simulados: [] };
            await saveSimuladoClassToDB(newClass);
            
            // Optimistic Update
            setSimuladoClasses(prev => [...prev, newClass]);
            
            setShowSimClassModal(false);
            setNewSimClassName('');
        } catch (e: any) {
            alert("Erro ao criar turma: " + e.message);
        } finally {
            setIsCreatingSimClass(false);
        }
    };

    const handleDeleteUser = async (uid: string) => {
        if (!confirm("Tem certeza que deseja remover este aluno?")) return;
        await deleteUserFromDB(uid);
        loadData();
    };

    const handleTogglePlanAccess = async (user: User, planId: string) => {
        const hasAccess = user.allowedPlans?.includes(planId);
        let newAllowed = [...(user.allowedPlans || [])];
        if (hasAccess) newAllowed = newAllowed.filter(id => id !== planId);
        else newAllowed.push(planId);
        const updatedUser = { ...user, allowedPlans: newAllowed };
        await saveUserToDB(updatedUser);
        setUsers(users.map(u => u.id === user.id ? updatedUser : u));
    };

    const handleToggleSimuladoAccess = async (user: User, classId: string) => {
        const hasAccess = user.allowedSimuladoClasses?.includes(classId);
        let newAllowed = [...(user.allowedSimuladoClasses || [])];
        if (hasAccess) newAllowed = newAllowed.filter(id => id !== classId);
        else newAllowed.push(classId);
        const updatedUser = { ...user, allowedSimuladoClasses: newAllowed };
        await saveUserToDB(updatedUser);
        setUsers(users.map(u => u.id === user.id ? updatedUser : u));
    };

    const handleDeletePlan = async (pid: string) => {
        if (!confirm("Tem certeza?")) return;
        await deletePlanFromDB(pid);
        const latestPlans = await fetchPlansFromDB();
        setPlans(latestPlans);
    };

    const handleUpdateSimClass = async (sc: SimuladoClass) => {
        await saveSimuladoClassToDB(sc);
        setEditingSimClass(sc);
    };

    const handleDeleteSimClass = async (id: string) => {
        if (!confirm("Deletar turma e todos os simulados?")) return;
        await deleteSimuladoClassFromDB(id);
        loadData();
    };

    return (
        <div className="flex w-full h-full bg-insanus-black text-gray-200">
            {/* USER MODAL */}
            {showUserModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="glass border border-white/10 rounded-2xl p-8 w-full max-w-md relative overflow-hidden animate-fade-in">
                        <h3 className="text-2xl font-black text-white mb-6 uppercase tracking-tight">Novo Aluno</h3>
                        <form onSubmit={submitCreateUser} className="space-y-4">
                            <div><label className="text-[10px] font-bold text-gray-500 uppercase">Nome Completo</label><input required value={newUserForm.name} onChange={(e) => setNewUserForm({...newUserForm, name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-insanus-red outline-none" placeholder="Ex: João da Silva" /></div>
                            <div><label className="text-[10px] font-bold text-gray-500 uppercase">E-mail de Acesso</label><input required type="email" value={newUserForm.email} onChange={(e) => setNewUserForm({...newUserForm, email: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-insanus-red outline-none" placeholder="aluno@email.com" /></div>
                            <div><label className="text-[10px] font-bold text-gray-500 uppercase">CPF (Opcional)</label><input value={newUserForm.cpf} onChange={(e) => setNewUserForm({...newUserForm, cpf: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-insanus-red outline-none" placeholder="000.000.000-00" /></div>
                            <div><label className="text-[10px] font-bold text-gray-500 uppercase">Senha Temporária</label><input required value={newUserForm.password} onChange={(e) => setNewUserForm({...newUserForm, password: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-insanus-red outline-none font-mono" placeholder="********" /></div>
                            <div className="flex gap-3 pt-4"><button type="button" onClick={() => setShowUserModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-lg font-bold text-xs uppercase">Cancelar</button><button type="submit" disabled={isSubmittingUser} className="flex-1 bg-insanus-red hover:bg-red-600 text-white py-3 rounded-lg font-bold text-xs uppercase shadow-neon disabled:opacity-50">{isSubmittingUser ? 'Criando...' : 'Criar Aluno'}</button></div>
                        </form>
                    </div>
                </div>
            )}

            {/* PLAN MODAL */}
            {showPlanModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="glass border border-white/10 rounded-2xl p-8 w-full max-w-md relative overflow-hidden animate-fade-in">
                        <h3 className="text-2xl font-black text-white mb-6 uppercase tracking-tight">Novo Plano de Estudo</h3>
                        <form onSubmit={submitCreatePlan} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Nome do Plano</label>
                                <input 
                                    autoFocus
                                    required 
                                    value={newPlanName} 
                                    onChange={(e) => setNewPlanName(e.target.value)} 
                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-insanus-red outline-none" 
                                    placeholder="Ex: Polícia Federal 2024" 
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setShowPlanModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-lg font-bold text-xs uppercase">Cancelar</button>
                                <button type="submit" disabled={isCreatingPlan} className="flex-1 bg-insanus-red hover:bg-red-600 text-white py-3 rounded-lg font-bold text-xs uppercase shadow-neon disabled:opacity-50">
                                    {isCreatingPlan ? 'Criando...' : 'Criar Plano'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* SIMULADO CLASS MODAL */}
            {showSimClassModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="glass border border-white/10 rounded-2xl p-8 w-full max-w-md relative overflow-hidden animate-fade-in">
                        <h3 className="text-2xl font-black text-white mb-6 uppercase tracking-tight">Nova Turma de Simulado</h3>
                        <form onSubmit={submitCreateSimClass} className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Nome da Turma</label>
                                <input 
                                    autoFocus
                                    required 
                                    value={newSimClassName} 
                                    onChange={(e) => setNewSimClassName(e.target.value)} 
                                    className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-insanus-red outline-none" 
                                    placeholder="Ex: Turma Elite 2024" 
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setShowSimClassModal(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-lg font-bold text-xs uppercase">Cancelar</button>
                                <button type="submit" disabled={isCreatingSimClass} className="flex-1 bg-insanus-red hover:bg-red-600 text-white py-3 rounded-lg font-bold text-xs uppercase shadow-neon disabled:opacity-50">
                                    {isCreatingSimClass ? 'Criando...' : 'Criar Turma'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="w-20 lg:w-72 bg-black/50 border-r border-white/10 flex flex-col shrink-0 backdrop-blur-md z-30">
                <div className="p-6 border-b border-white/5 flex items-center justify-center lg:justify-start gap-3"><div className="w-8 h-8 bg-insanus-red rounded shadow-neon shrink-0"></div><div className="hidden lg:block"><h1 className="text-white font-black text-lg">INSANUS<span className="text-insanus-red">.ADMIN</span></h1></div></div>
                <nav className="flex-1 p-4 space-y-2">
                    <button onClick={() => { setView('plans'); setEditingPlan(null); setEditingSimClass(null); }} className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${view === 'plans' ? 'bg-gradient-to-r from-insanus-red to-red-900 text-white shadow-neon' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><Icon.Book className="w-5 h-5" /><span className="hidden lg:block font-bold text-sm">Meus Planos</span></button>
                    <button onClick={() => { setView('simulados'); setEditingPlan(null); setEditingSimClass(null); }} className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${view === 'simulados' ? 'bg-gradient-to-r from-insanus-red to-red-900 text-white shadow-neon' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><Icon.List className="w-5 h-5" /><span className="hidden lg:block font-bold text-sm">Turmas de Simulados</span></button>
                    <button onClick={() => { setView('users'); setEditingPlan(null); setEditingSimClass(null); }} className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${view === 'users' ? 'bg-gradient-to-r from-insanus-red to-red-900 text-white shadow-neon' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><Icon.User className="w-5 h-5" /><span className="hidden lg:block font-bold text-sm">Gestão de Alunos</span></button>
                </nav>
                <div className="p-4 border-t border-white/5"><button onClick={onSwitchToUser} className="w-full bg-white/5 hover:bg-white/10 text-gray-300 p-3 rounded-xl flex items-center justify-center lg:justify-start gap-3 transition-all border border-transparent hover:border-white/10"><Icon.Eye className="w-5 h-5 text-insanus-red" /><span className="hidden lg:block font-bold text-sm">Visão do Aluno</span></button></div>
            </div>
            
            {/* Main Content Area - Editors handle their own layout */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
                {editingPlan ? (
                    <PlanDetailEditor plan={editingPlan} onUpdate={(p) => setEditingPlan(p)} onBack={() => { setEditingPlan(null); loadData(); }} />
                ) : editingSimClass ? (
                    <SimuladoEditor simClass={editingSimClass} onUpdate={handleUpdateSimClass} onBack={() => { setEditingSimClass(null); loadData(); }} />
                ) : (
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        {view === 'users' && (
                            <div className="max-w-6xl mx-auto w-full animate-fade-in">
                                <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4"><h2 className="text-3xl font-black text-white">ALUNOS</h2><button onClick={() => setShowUserModal(true)} className="bg-insanus-red px-4 py-2 rounded text-white font-bold">+ NOVO ALUNO</button></div>
                                <div className="grid gap-4">
                                    {users.filter(u => !u.isAdmin).map(u => (
                                        <div key={u.id} className="glass p-5 rounded-xl border border-white/5 flex flex-col gap-4">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-4"><div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center font-bold text-white">{u.name[0]}</div><div><div className="font-bold text-white">{u.name}</div><div className="text-xs text-gray-500">{u.email}</div></div></div>
                                                <SafeDeleteBtn onDelete={() => handleDeleteUser(u.id)} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                                <div><span className="text-[10px] text-gray-500 uppercase font-bold block mb-2">Planos Liberados</span><div className="flex flex-wrap gap-2">{plans.map(p => (<button key={p.id} onClick={() => handleTogglePlanAccess(u, p.id)} className={`text-[10px] px-2 py-1 rounded border ${u.allowedPlans?.includes(p.id) ? 'bg-insanus-red/20 border-insanus-red text-insanus-red' : 'border-gray-700 text-gray-500'}`}>{p.name}</button>))}</div></div>
                                                <div><span className="text-[10px] text-gray-500 uppercase font-bold block mb-2">Simulados Liberados</span><div className="flex flex-wrap gap-2">{simuladoClasses.map(sc => (<button key={sc.id} onClick={() => handleToggleSimuladoAccess(u, sc.id)} className={`text-[10px] px-2 py-1 rounded border ${u.allowedSimuladoClasses?.includes(sc.id) ? 'bg-blue-900/30 border-blue-500 text-blue-400' : 'border-gray-700 text-gray-500'}`}>{sc.name}</button>))}</div></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {view === 'simulados' && (
                            <div className="max-w-6xl mx-auto w-full animate-fade-in">
                                <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4"><div><h2 className="text-3xl font-black text-white">TURMAS DE <span className="text-insanus-red">SIMULADOS</span></h2><p className="text-gray-500 text-xs mt-1">Crie turmas e adicione simulados para avaliação.</p></div><button onClick={() => setShowSimClassModal(true)} className="bg-insanus-red hover:bg-red-600 text-white px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-2 shadow-neon"><Icon.Plus className="w-4 h-4" /> NOVA TURMA</button></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {simuladoClasses.map(sc => (
                                        <div key={sc.id} className="glass rounded-2xl p-6 border border-white/5 hover:border-insanus-red/50 transition relative group">
                                            <div className="flex justify-between items-start mb-4"><div className="w-12 h-12 rounded-full bg-blue-900/20 flex items-center justify-center text-blue-400"><Icon.List className="w-6 h-6"/></div><div className="flex gap-2"><button onClick={() => setEditingSimClass(sc)} className="text-gray-400 hover:text-white"><Icon.Edit className="w-4 h-4"/></button><button onClick={() => handleDeleteSimClass(sc.id)} className="text-gray-400 hover:text-red-500"><Icon.Trash className="w-4 h-4"/></button></div></div>
                                            <h3 className="text-xl font-black text-white mb-2">{sc.name}</h3><p className="text-sm text-gray-500">{sc.simulados.length} Simulados cadastrados</p>
                                            <button onClick={() => setEditingSimClass(sc)} className="w-full mt-6 bg-white/5 hover:bg-white/10 py-2 rounded text-xs font-bold text-white transition">GERENCIAR SIMULADOS</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {view === 'plans' && (
                            <div className="max-w-6xl mx-auto w-full animate-fade-in">
                                 <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4"><div><h2 className="text-3xl font-black text-white">PLANOS DE <span className="text-insanus-red">ESTUDO</span></h2><p className="text-gray-500 text-xs mt-1">Crie e edite os planejamentos disponíveis.</p></div><button onClick={() => setShowPlanModal(true)} className="bg-insanus-red hover:bg-red-600 text-white px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-2 shadow-neon transition-transform hover:scale-105"><Icon.Plus className="w-4 h-4" /> NOVO PLANO</button></div>
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {plans.map(p => (
                                        <div key={p.id} className="glass rounded-2xl overflow-hidden border border-white/5 hover:border-insanus-red/50 transition-all group relative h-72 flex flex-col">
                                            <div className="h-40 bg-black/50 relative overflow-hidden">
                                                {p.coverImage ? ( <img src={p.coverImage} className="w-full h-full object-cover opacity-50 group-hover:opacity-80 group-hover:scale-105 transition duration-700" /> ) : ( <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-700"><Icon.Image className="w-8 h-8" /></div> )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-insanus-black to-transparent" />
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 gap-3 backdrop-blur-sm">
                                                    <button onClick={() => setEditingPlan(p)} className="bg-white text-black px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-200 flex items-center gap-2 shadow-lg transform hover:scale-105 transition"><Icon.Edit className="w-4 h-4" /> EDITAR</button>
                                                    <SafeDeleteBtn onDelete={() => handleDeletePlan(p.id)} className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-red-700 hover:text-white shadow-lg flex items-center gap-2" label="EXCLUIR" />
                                                </div>
                                            </div>
                                            <div className="p-5 flex-1 flex flex-col justify-between">
                                                <div><h3 className="font-black text-white text-xl leading-tight mb-1 group-hover:text-insanus-red transition-colors line-clamp-2">{p.name}</h3><div className="h-1 w-12 bg-insanus-red rounded-full mb-3"></div></div>
                                                <div className="flex justify-between text-[10px] text-gray-500 font-mono border-t border-white/5 pt-3 uppercase tracking-widest"><div className="flex items-center gap-1"><Icon.Book className="w-3 h-3" /> {p.disciplines.length} Disciplinas</div><div className="flex items-center gap-1"><Icon.RefreshCw className="w-3 h-3" /> {p.cycles.length} Ciclos</div></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};