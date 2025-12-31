import React, { useState, useEffect } from 'react';
import { User, StudyPlan, Folder, Discipline, Subject, Goal, SubGoal, Cycle, CycleItem, EditalDiscipline, EditalTopic, PlanCategory } from '../types';
import { Icon } from '../components/Icons';
import { uuid } from '../constants';
import { fetchUsersFromDB, saveUserToDB, deleteUserFromDB, fetchPlansFromDB, savePlanToDB, deletePlanFromDB, resetFullDatabase } from '../services/db';
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

    // Helper to toggle a contest in the relatedContests array
    const toggleContest = (contest: string) => {
        const current = topic.relatedContests || [];
        const updated = current.includes(contest)
            ? current.filter(c => c !== contest)
            : [...current, contest];
        onUpdate({ ...topic, relatedContests: updated });
    };

    // Helper to render Goal Selector
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
                
                {/* Contest Badges Preview */}
                <div className="flex gap-1">
                    {topic.relatedContests?.map(c => (
                        <span key={c} className="text-[9px] bg-insanus-red/20 text-insanus-red px-1 rounded font-bold">{c}</span>
                    ))}
                </div>

                <SafeDeleteBtn onDelete={onDelete} />
            </div>

            {expanded && (
                <div className="p-3 bg-black/20 border-t border-white/5 animate-fade-in grid gap-4">
                    {/* CONTEST SELECTOR (Only if Police & Contests Defined) */}
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
                    <div className="text-[10px] text-gray-500 italic bg-insanus-red/5 p-2 rounded">
                        * Ao vincular metas de Questões ou Resumo que possuam "Revisão Automática" ativada, o Edital Verticalizado identificará automaticamente as Revisões (1, 2, 3...) deste tópico.
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

    // Filter out disciplines already in this cycle to avoid duplicates (optional, but good UX)
    const availableDisciplines = allDisciplines; 

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
                        placeholder="Nome do Ciclo (Ex: Ciclo Básico)"
                    />
                </div>
                <SafeDeleteBtn onDelete={onDelete} />
            </div>

            <div className="p-4">
                {/* List of Cycle Items */}
                <div className="space-y-2 mb-4">
                    {cycle.items.length === 0 && (
                        <div className="text-center text-gray-600 text-xs py-4 border border-dashed border-gray-700 rounded">
                            Nenhuma disciplina neste ciclo. Adicione abaixo.
                        </div>
                    )}
                    {cycle.items.map((item, idx) => {
                        const discName = allDisciplines.find(d => d.id === item.disciplineId)?.name || 'Disciplina Removida';
                        return (
                            <div key={idx} className="flex items-center gap-4 bg-black/30 p-2 rounded border border-white/5 hover:border-white/10 transition-colors">
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
                                
                                <button onClick={() => removeItem(idx)} className="text-gray-600 hover:text-red-500 p-1">
                                    <Icon.Trash className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Add Item Controls */}
                <div className="flex gap-2 pt-2 border-t border-white/5">
                    <select 
                        value={selectedDiscId}
                        onChange={(e) => setSelectedDiscId(e.target.value)}
                        className="flex-1 bg-white/5 text-gray-300 text-xs rounded p-2 outline-none border border-transparent focus:border-white/20"
                    >
                        <option value="">Selecione uma disciplina...</option>
                        {availableDisciplines.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                    <button 
                        onClick={addItem}
                        disabled={!selectedDiscId}
                        className="bg-insanus-red/20 text-insanus-red hover:bg-insanus-red hover:text-white px-4 py-2 rounded text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        ADICIONAR
                    </button>
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
        } catch (err) {
            alert("Erro no upload");
        } finally {
            setUploading(false);
        }
    };

    // Subgoal Logic
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
            {/* Header Line */}
            <div className="flex items-center gap-2 mb-2">
                <div 
                    className="w-3 h-8 rounded shrink-0 cursor-pointer border border-white/10"
                    style={{ backgroundColor: goal.color || '#333' }}
                    title="Escolher cor da meta"
                >
                    <input 
                        type="color" 
                        className="opacity-0 w-full h-full cursor-pointer"
                        value={goal.color || '#333333'}
                        onChange={(e) => onUpdate({...goal, color: e.target.value})}
                    />
                </div>
                
                <select 
                    value={goal.type} 
                    onChange={e => onUpdate({...goal, type: e.target.value as any})}
                    className="bg-white/5 text-[10px] font-bold rounded p-2 text-gray-300 border-none outline-none uppercase"
                >
                    <option value="AULA">AULA (VIDEO)</option>
                    <option value="MATERIAL">MATERIAL (PDF)</option>
                    <option value="QUESTOES">QUESTÕES</option>
                    <option value="LEI_SECA">LEI SECA</option>
                    <option value="RESUMO">RESUMO</option>
                    <option value="REVISAO">REVISÃO</option>
                </select>
                
                <input 
                    value={goal.title} 
                    onChange={e => onUpdate({...goal, title: e.target.value})}
                    className="bg-transparent flex-1 text-sm font-bold text-white focus:outline-none border-b border-transparent focus:border-insanus-red placeholder-gray-600"
                    placeholder="Título da Meta"
                />
                
                <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-white">
                    {expanded ? <Icon.ArrowUp className="w-4 h-4" /> : <Icon.Edit className="w-4 h-4" />}
                </button>
                <SafeDeleteBtn onDelete={onDelete} />
            </div>
            
            {/* Details Area */}
            {expanded && (
                <div className="mt-4 pt-4 border-t border-white/5 space-y-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-4">
                        <input 
                            value={goal.description || ''} 
                            onChange={e => onUpdate({...goal, description: e.target.value})}
                            placeholder="Observações / Detalhes..."
                            className="col-span-2 bg-white/5 p-2 rounded text-xs text-gray-300 focus:outline-none focus:bg-white/10"
                        />
                        
                        {/* Type Specific Inputs */}
                        {(goal.type === 'MATERIAL' || goal.type === 'LEI_SECA' || goal.type === 'QUESTOES') && (
                            <div className="flex items-center gap-2 bg-white/5 p-2 rounded">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">Páginas/Qtd:</span>
                                <input 
                                    type="number"
                                    value={goal.pages || 0}
                                    onChange={e => onUpdate({...goal, pages: Number(e.target.value)})}
                                    className="bg-transparent w-full text-white font-mono text-sm focus:outline-none text-right"
                                />
                            </div>
                        )}

                        {goal.type === 'RESUMO' && (
                             <div className="flex items-center gap-2 bg-white/5 p-2 rounded">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">Tempo Manual (min):</span>
                                <input 
                                    type="number"
                                    value={goal.manualTime || 0}
                                    onChange={e => onUpdate({...goal, manualTime: Number(e.target.value)})}
                                    className="bg-transparent w-full text-white font-mono text-sm focus:outline-none text-right"
                                />
                            </div>
                        )}
                        
                        {/* Common Link/File */}
                        <input 
                            value={goal.link || ''} 
                            onChange={e => onUpdate({...goal, link: e.target.value})}
                            placeholder="Link Geral (Opcional)"
                            className="bg-white/5 p-2 rounded text-xs text-gray-400 focus:text-white focus:outline-none"
                        />
                        <div className="relative">
                            <input type="file" id={`file-${goal.id}`} className="hidden" onChange={handleFileUpload} accept="application/pdf" />
                            <label htmlFor={`file-${goal.id}`} className={`block w-full text-center p-2 rounded cursor-pointer text-xs font-bold transition-colors ${goal.pdfUrl ? 'bg-green-900/30 text-green-500 border border-green-900' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}>
                                {uploading ? 'ENVIANDO...' : goal.pdfUrl ? 'PDF ANEXADO' : 'ANEXAR PDF'}
                            </label>
                        </div>

                        {/* REVISION SYSTEM CONTROL */}
                        <div className="col-span-2 border-t border-white/5 pt-4 mt-2">
                             <div className="flex items-center gap-2 mb-2">
                                <input 
                                    type="checkbox" 
                                    id={`rev-${goal.id}`}
                                    checked={goal.hasRevision || false}
                                    onChange={e => onUpdate({...goal, hasRevision: e.target.checked})}
                                    className="cursor-pointer accent-insanus-red w-4 h-4"
                                />
                                <label htmlFor={`rev-${goal.id}`} className="text-xs font-bold text-gray-300 cursor-pointer select-none hover:text-white flex items-center gap-2">
                                    <Icon.RefreshCw className="w-3 h-3 text-insanus-red" />
                                    ATIVAR REVISÕES AUTOMÁTICAS
                                </label>
                             </div>
                             
                             {goal.hasRevision && (
                                 <div className="pl-6 space-y-2 bg-white/5 p-3 rounded-lg border border-white/5">
                                     <div className="flex flex-col gap-1">
                                         <label className="text-[10px] text-gray-500 uppercase font-bold">Intervalos (Dias após conclusão):</label>
                                         <input 
                                             value={goal.revisionIntervals || '1,7,15,30'} 
                                             onChange={e => onUpdate({...goal, revisionIntervals: e.target.value})}
                                             placeholder="Ex: 1, 7, 15, 30"
                                             className="bg-black/30 p-2 rounded text-xs text-white focus:outline-none border border-white/10 w-full font-mono tracking-widest"
                                         />
                                         <p className="text-[9px] text-gray-600 mt-1">
                                            Exemplo: "1,7,30" cria 3 metas de revisão. A primeira 1 dia após completar esta meta, a segunda 7 dias depois, etc.
                                         </p>
                                     </div>
                                 </div>
                             )}
                        </div>
                    </div>

                    {/* SUBGOALS EDITOR (Only for AULA) */}
                    {goal.type === 'AULA' && (
                        <div className="bg-black/20 p-3 rounded border border-white/5">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Aulas / Vídeos ({goal.subGoals?.length || 0})</span>
                                <span className="text-[10px] font-mono text-insanus-red">{totalDuration} min total</span>
                            </div>
                            
                            <div className="space-y-2">
                                {goal.subGoals?.map((sub, idx) => (
                                    <div key={sub.id} className="flex gap-2 items-center">
                                        <span className="text-gray-600 font-mono text-xs">{idx + 1}.</span>
                                        <input 
                                            value={sub.title}
                                            onChange={(e) => updateSubGoal(idx, 'title', e.target.value)}
                                            className="flex-1 bg-white/5 p-1 px-2 rounded text-xs text-white focus:outline-none"
                                            placeholder="Título da Aula"
                                        />
                                        <input 
                                            value={sub.link}
                                            onChange={(e) => updateSubGoal(idx, 'link', e.target.value)}
                                            className="w-1/4 bg-white/5 p-1 px-2 rounded text-xs text-gray-400 focus:text-white focus:outline-none"
                                            placeholder="Link URL"
                                        />
                                        <input 
                                            type="number"
                                            value={sub.duration}
                                            onChange={(e) => updateSubGoal(idx, 'duration', Number(e.target.value))}
                                            className="w-16 bg-white/5 p-1 px-2 rounded text-xs text-white text-center focus:outline-none"
                                            placeholder="Min"
                                        />
                                        <button onClick={() => removeSubGoal(idx)} className="text-gray-600 hover:text-red-500"><Icon.Trash className="w-3 h-3" /></button>
                                    </div>
                                ))}
                            </div>
                            <button onClick={addSubGoal} className="w-full mt-2 py-1 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-[10px] font-bold rounded transition">
                                + ADICIONAR AULA
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// --- PLAN DETAIL EDITOR COMPONENT ---
interface PlanDetailEditorProps {
    plan: StudyPlan;
    onUpdate: (p: StudyPlan) => void;
    onBack: () => void;
}

const PlanDetailEditor: React.FC<PlanDetailEditorProps> = ({ plan, onUpdate, onBack }) => {
    const [tab, setTab] = useState<'struct' | 'cycles' | 'edital'>('struct');
    const [saving, setSaving] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    
    // ACCORDION STATE: Tracks expanded IDs for Folders, Disciplines, and Subjects
    const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

    // Contest Input state
    const [newContestName, setNewContestName] = useState('');

    const toggleExpand = (id: string) => {
        setExpandedMap(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const isExpanded = (id: string) => !!expandedMap[id];
    
    // -- Save / Sync --
    const handleSync = async () => {
        setSaving(true);
        try {
            await savePlanToDB(plan);
            // Simulate delay for feedback
            await new Promise(r => setTimeout(r, 800)); 
            alert("Plano sincronizado com sucesso!");
        } catch (e) {
            alert("Erro ao salvar.");
        } finally {
            setSaving(false);
        }
    };

    const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        setUploadingCover(true);
        try {
            const url = await uploadFileToStorage(e.target.files[0], 'covers');
            onUpdate({ ...plan, coverImage: url });
        } catch (err) {
            alert("Erro ao enviar imagem de capa.");
        } finally {
            setUploadingCover(false);
        }
    };

    // -- Contest Management (Police) --
    const addContest = () => {
        if(!newContestName.trim()) return;
        const current = plan.linkedContests || [];
        if(current.includes(newContestName.toUpperCase())) return;
        
        onUpdate({ ...plan, linkedContests: [...current, newContestName.toUpperCase()] });
        setNewContestName('');
    }

    const removeContest = (name: string) => {
        const current = plan.linkedContests || [];
        onUpdate({ ...plan, linkedContests: current.filter(c => c !== name) });
    }

    // -- Folders --
    const addFolder = () => {
        const newFolder: Folder = { id: uuid(), name: 'Nova Pasta', order: plan.folders.length };
        setExpandedMap(prev => ({ ...prev, [newFolder.id]: true })); // Auto-expand
        onUpdate({ ...plan, folders: [...plan.folders, newFolder] });
    };
    const deleteFolder = (fid: string) => {
        // When deleting a folder, we must decide what to do with disciplines inside.
        // For safety, let's move them to "Unorganized" (folderId = undefined)
        const updatedDisciplines = plan.disciplines.map(d => d.folderId === fid ? { ...d, folderId: undefined } : d);
        onUpdate({ 
            ...plan, 
            folders: plan.folders.filter(f => f.id !== fid),
            disciplines: updatedDisciplines as Discipline[]
        });
    };

    // -- Disciplines --
    const addDiscipline = (folderId?: string) => {
        const newDisc: Discipline = { id: uuid(), name: 'Nova Disciplina', folderId, subjects: [], order: 99 };
        setExpandedMap(prev => ({ ...prev, [newDisc.id]: true })); // Auto-expand
        onUpdate({ ...plan, disciplines: [...plan.disciplines, newDisc] });
    };
    const deleteDiscipline = (did: string) => {
        onUpdate({ ...plan, disciplines: plan.disciplines.filter(d => d.id !== did) });
    };
    const moveDiscipline = (discId: string, newFolderId: string) => {
        const updatedDiscs = plan.disciplines.map(d => d.id === discId ? { ...d, folderId: newFolderId || undefined } : d);
        onUpdate({ ...plan, disciplines: updatedDiscs as Discipline[] });
    };

    // -- Subjects --
    const addSubject = (discId: string) => {
        const discIndex = plan.disciplines.findIndex(d => d.id === discId);
        if (discIndex === -1) return;
        const newSub: Subject = { id: uuid(), name: 'Novo Assunto', goals: [], order: 99 };
        setExpandedMap(prev => ({ ...prev, [newSub.id]: true })); // Auto-expand
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

    // -- Goals --
    const addGoal = (discId: string, subId: string) => {
        const discIndex = plan.disciplines.findIndex(d => d.id === discId);
        if (discIndex === -1) return;
        const subIndex = plan.disciplines[discIndex].subjects.findIndex(s => s.id === subId);
        if (subIndex === -1) return;

        const newGoal: Goal = { 
            id: uuid(), title: 'Nova Meta', type: 'AULA', order: 99,
            link: '', pdfUrl: '', subGoals: [], pages: 0, color: '#333333'
        };
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

    // -- Cycles --
    const addCycle = () => {
        const newCycle: Cycle = { id: uuid(), name: 'Novo Ciclo', items: [], order: plan.cycles.length };
        onUpdate({ ...plan, cycles: [...plan.cycles, newCycle] });
    };
    
    const updateCycle = (updatedCycle: Cycle) => {
        const newCycles = plan.cycles.map(c => c.id === updatedCycle.id ? updatedCycle : c);
        onUpdate({ ...plan, cycles: newCycles });
    };

    const deleteCycle = (cycleId: string) => {
        onUpdate({ ...plan, cycles: plan.cycles.filter(c => c.id !== cycleId) });
    };

    // -- EDITAL VERTICALIZADO LOGIC --
    const addEditalDiscipline = () => {
        const newDisc: EditalDiscipline = { id: uuid(), name: 'Nova Disciplina do Edital', topics: [], order: (plan.editalVerticalizado?.length || 0) };
        onUpdate({ ...plan, editalVerticalizado: [...(plan.editalVerticalizado || []), newDisc] });
    };

    const updateEditalDiscipline = (index: number, name: string) => {
        const newEdital = [...(plan.editalVerticalizado || [])];
        newEdital[index] = { ...newEdital[index], name };
        onUpdate({ ...plan, editalVerticalizado: newEdital });
    };

    const deleteEditalDiscipline = (index: number) => {
        const newEdital = (plan.editalVerticalizado || []).filter((_, i) => i !== index);
        onUpdate({ ...plan, editalVerticalizado: newEdital });
    };

    const addEditalTopic = (discIndex: number) => {
        const newTopic: EditalTopic = { id: uuid(), name: 'Novo Tópico', links: {}, order: (plan.editalVerticalizado?.[discIndex].topics.length || 0) };
        const newEdital = [...(plan.editalVerticalizado || [])];
        newEdital[discIndex].topics.push(newTopic);
        onUpdate({ ...plan, editalVerticalizado: newEdital });
    };

    const updateEditalTopic = (discIndex: number, topicIndex: number, updatedTopic: EditalTopic) => {
        const newEdital = [...(plan.editalVerticalizado || [])];
        newEdital[discIndex].topics[topicIndex] = updatedTopic;
        onUpdate({ ...plan, editalVerticalizado: newEdital });
    };

    const deleteEditalTopic = (discIndex: number, topicIndex: number) => {
        const newEdital = [...(plan.editalVerticalizado || [])];
        newEdital[discIndex].topics = newEdital[discIndex].topics.filter((_, i) => i !== topicIndex);
        onUpdate({ ...plan, editalVerticalizado: newEdital });
    };

    // --- RENDER HELPERS ---
    const renderDiscipline = (disc: Discipline) => (
        <div key={disc.id} className="ml-4 border-l-2 border-white/10 pl-4 mb-6">
            <div className="flex justify-between items-center mb-4 bg-white/5 p-2 rounded-lg hover:bg-white/10 transition">
                <div className="flex items-center gap-3 flex-1">
                    <button 
                        onClick={() => toggleExpand(disc.id)}
                        className={`text-gray-400 hover:text-white transition-transform duration-200 ${isExpanded(disc.id) ? 'rotate-180' : ''}`}
                    >
                        <Icon.ChevronDown className="w-5 h-5" />
                    </button>
                    <div className="w-2 h-2 rounded-full bg-insanus-red shadow-neon"></div>
                    <input 
                        value={disc.name} 
                        onChange={e => {
                            const newDiscs = plan.disciplines.map(d => d.id === disc.id ? {...d, name: e.target.value} : d);
                            onUpdate({...plan, disciplines: newDiscs});
                        }}
                        className="bg-transparent font-bold text-gray-200 focus:outline-none text-base w-full"
                        placeholder="Nome da Disciplina"
                    />
                </div>
                
                <div className="flex items-center gap-2">
                    {/* FOLDER MOVER */}
                    <select 
                        className="bg-black text-[10px] text-gray-400 border border-white/10 rounded p-1 outline-none focus:border-white/30 max-w-[120px]"
                        value={disc.folderId || ''}
                        onChange={(e) => moveDiscipline(disc.id, e.target.value)}
                    >
                        <option value="">(Sem Pasta)</option>
                        {plan.folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>

                    <button onClick={() => addSubject(disc.id)} className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded font-bold uppercase transition">+ Assunto</button>
                    <SafeDeleteBtn onDelete={() => deleteDiscipline(disc.id)} />
                </div>
            </div>

            {/* Subjects Accordion Body */}
            {isExpanded(disc.id) && (
                <div className="space-y-4 pl-2 animate-fade-in">
                    {disc.subjects.map(sub => (
                        <div key={sub.id} className="bg-black/40 rounded-xl border border-white/5 p-4 relative group">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/10 group-hover:bg-insanus-red/50 transition-colors"></div>
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2 flex-1">
                                    <button 
                                        onClick={() => toggleExpand(sub.id)}
                                        className={`text-gray-500 hover:text-white transition-transform duration-200 ${isExpanded(sub.id) ? 'rotate-180' : ''}`}
                                    >
                                        <Icon.ChevronDown className="w-4 h-4" />
                                    </button>
                                    <input 
                                        value={sub.name} 
                                        onChange={e => {
                                            const idx = plan.disciplines.findIndex(d => d.id === disc.id);
                                            const newDiscs = [...plan.disciplines];
                                            const subIdx = newDiscs[idx].subjects.findIndex(s => s.id === sub.id);
                                            newDiscs[idx].subjects[subIdx].name = e.target.value;
                                            onUpdate({...plan, disciplines: newDiscs});
                                        }}
                                        className="bg-transparent font-bold text-insanus-red focus:text-white focus:outline-none text-sm w-full uppercase tracking-wider"
                                        placeholder="NOME DO ASSUNTO"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => addGoal(disc.id, sub.id)} className="text-[10px] bg-insanus-red hover:bg-red-600 px-3 py-1 rounded text-white font-bold shadow-neon">+ META</button>
                                    <SafeDeleteBtn onDelete={() => deleteSubject(disc.id, sub.id)} />
                                </div>
                            </div>
                            
                            {/* Goals Accordion Body */}
                            {isExpanded(sub.id) && (
                                <div className="space-y-2 animate-fade-in">
                                    {sub.goals.map(goal => (
                                        <GoalEditor 
                                            key={goal.id} 
                                            goal={goal} 
                                            onUpdate={(g) => updateGoal(disc.id, sub.id, g)}
                                            onDelete={() => deleteGoal(disc.id, sub.id, goal.id)}
                                        />
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
            {/* Header */}
            <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-black z-20">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-gray-500 hover:text-white"><Icon.ArrowUp className="-rotate-90 w-6 h-6" /></button>
                    <span className="text-gray-500 font-mono text-xs uppercase">Editando Plano</span>
                </div>
                <div className="flex gap-4">
                    <button 
                        onClick={handleSync}
                        disabled={saving}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 shadow-neon"
                    >
                        {saving ? <Icon.RefreshCw className="w-4 h-4 animate-spin" /> : <Icon.Check className="w-4 h-4" />}
                        {saving ? 'SALVANDO...' : 'SALVAR E SINCRONIZAR'}
                    </button>
                    
                    <div className="h-8 w-px bg-white/10 mx-2"></div>

                    <button onClick={() => setTab('struct')} className={`px-4 py-2 text-xs font-bold rounded ${tab==='struct' ? 'bg-insanus-red text-white' : 'text-gray-500 hover:text-white'}`}>ESTRUTURA</button>
                    <button onClick={() => setTab('cycles')} className={`px-4 py-2 text-xs font-bold rounded ${tab==='cycles' ? 'bg-insanus-red text-white' : 'text-gray-500 hover:text-white'}`}>CICLOS</button>
                    <button onClick={() => setTab('edital')} className={`px-4 py-2 text-xs font-bold rounded flex items-center gap-2 ${tab==='edital' ? 'bg-insanus-red text-white' : 'text-gray-500 hover:text-white'}`}>
                        <Icon.List className="w-3 h-3"/> EDITAL
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                
                {/* HEADER INFO & COVER (SQUARE 1080x1080) */}
                <div className="flex flex-col md:flex-row gap-8 mb-10 items-start border-b border-white/10 pb-8">
                    {/* Cover Image Input (Square 1080x1080) */}
                    <div className="shrink-0 group relative w-40 h-40 rounded-2xl border-2 border-dashed border-white/20 bg-white/5 overflow-hidden hover:border-insanus-red transition-colors shadow-lg">
                        {plan.coverImage ? (
                            <img src={plan.coverImage} className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <Icon.Image className="w-8 h-8 mb-2" />
                                <span className="text-[10px] uppercase font-bold text-center px-2">Sem Capa</span>
                            </div>
                        )}
                        
                        {/* Overlay Upload Button */}
                        <label className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white text-xs font-bold text-center p-2">
                            {uploadingCover ? <Icon.RefreshCw className="w-6 h-6 animate-spin mb-1"/> : <Icon.Edit className="w-6 h-6 mb-1 text-insanus-red" />}
                            {uploadingCover ? 'ENVIANDO' : 'ALTERAR CAPA (1080x1080)'}
                            <input type="file" className="hidden" accept="image/*" onChange={handleCoverUpload} disabled={uploadingCover} />
                        </label>
                    </div>

                    {/* Plan Info */}
                    <div className="flex-1 pt-2">
                        <div className="flex justify-between items-start">
                            <div>
                                <label className="text-xs font-bold text-insanus-red uppercase tracking-widest mb-2 block">Nome do Plano</label>
                                <input 
                                    value={plan.name} 
                                    onChange={e => onUpdate({...plan, name: e.target.value})}
                                    className="bg-transparent text-4xl font-black text-white focus:outline-none border-b border-white/10 focus:border-insanus-red placeholder-gray-700 w-full mb-6 pb-2"
                                    placeholder="Digite o nome do plano..."
                                />
                            </div>
                            
                            {/* Category Selector */}
                            <div className="ml-8">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Categoria</label>
                                <select 
                                    value={plan.category || 'CARREIRAS_POLICIAIS'} 
                                    onChange={e => onUpdate({...plan, category: e.target.value as PlanCategory})}
                                    className="bg-black border border-white/10 rounded-lg p-2 text-xs text-white uppercase font-bold outline-none focus:border-insanus-red"
                                >
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
                             <div className="bg-white/5 px-6 py-3 rounded-xl border border-white/10 flex flex-col">
                                <span className="text-2xl font-black text-white leading-none">{plan.disciplines.length}</span>
                                <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mt-1">Disciplinas</span>
                             </div>
                             <div className="bg-white/5 px-6 py-3 rounded-xl border border-white/10 flex flex-col">
                                <span className="text-2xl font-black text-white leading-none">{plan.cycles.length}</span>
                                <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider mt-1">Ciclos</span>
                             </div>
                        </div>
                    </div>
                </div>

                {tab === 'struct' && (
                    <div className="max-w-6xl mx-auto space-y-12">
                        
                        {/* UNORGANIZED DISCIPLINES SECTION */}
                        <div className="glass rounded-xl border border-white/10 overflow-hidden">
                            <div className="bg-gradient-to-r from-gray-900 to-black p-4 flex justify-between items-center border-b border-white/10">
                                <div className="flex items-center gap-3">
                                    <Icon.BookOpen className="w-5 h-5 text-gray-400" />
                                    <span className="font-black text-gray-200 uppercase tracking-widest text-sm">Disciplinas Gerais (Sem Pasta)</span>
                                </div>
                                <button onClick={() => addDiscipline()} className="text-[10px] bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded font-bold transition">+ NOVA DISCIPLINA</button>
                            </div>
                            <div className="p-6 bg-black/20">
                                {plan.disciplines.filter(d => !d.folderId).map(renderDiscipline)}
                                {plan.disciplines.filter(d => !d.folderId).length === 0 && (
                                    <div className="text-center py-8 text-gray-600 text-xs font-mono border border-dashed border-white/5 rounded">
                                        Nenhuma disciplina solta. Crie uma aqui ou mova de uma pasta.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* FOLDERS SECTION */}
                        <div className="space-y-8">
                            <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                <h3 className="text-lg font-black text-white uppercase">Pastas de Organização</h3>
                                <button onClick={addFolder} className="text-xs bg-insanus-red hover:bg-red-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2">
                                    <Icon.FolderPlus className="w-4 h-4" /> NOVA PASTA
                                </button>
                            </div>

                            {plan.folders.map(folder => (
                                <div key={folder.id} className="glass rounded-xl border border-white/5 overflow-hidden transition-all duration-300">
                                    <div className="bg-white/5 p-4 flex justify-between items-center border-b border-white/5">
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => toggleExpand(folder.id)}
                                                className={`text-gray-400 hover:text-white transition-transform duration-200 ${isExpanded(folder.id) ? 'rotate-180' : ''}`}
                                            >
                                                <Icon.ChevronDown className="w-5 h-5" />
                                            </button>
                                            <Icon.Folder className="w-5 h-5 text-insanus-red" />
                                            <input 
                                                value={folder.name} 
                                                onChange={e => {
                                                    const newFolders = plan.folders.map(f => f.id === folder.id ? {...f, name: e.target.value} : f);
                                                    onUpdate({...plan, folders: newFolders});
                                                }}
                                                className="bg-transparent font-bold text-white focus:outline-none w-64 text-lg"
                                            />
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => addDiscipline(folder.id)} className="text-[10px] bg-insanus-red/20 text-insanus-red px-3 py-1 rounded hover:bg-insanus-red hover:text-white font-bold transition">+ DISCIPLINA</button>
                                            <SafeDeleteBtn onDelete={() => deleteFolder(folder.id)} />
                                        </div>
                                    </div>
                                    
                                    {/* Folder Accordion Body */}
                                    {isExpanded(folder.id) && (
                                        <div className="p-6 animate-fade-in">
                                            {plan.disciplines.filter(d => d.folderId === folder.id).map(renderDiscipline)}
                                            {plan.disciplines.filter(d => d.folderId === folder.id).length === 0 && (
                                                <div className="text-xs text-gray-600 italic ml-4">Esta pasta está vazia. Adicione disciplinas ou mova disciplinas existentes para cá.</div>
                                            )}
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
                            <div>
                                <h3 className="text-2xl font-black text-white uppercase">Gestão de Ciclos</h3>
                                <p className="text-gray-500 text-xs">Crie sequências de estudo rotativas.</p>
                            </div>
                            <button onClick={addCycle} className="bg-insanus-red hover:bg-red-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2">
                                <Icon.Plus className="w-4 h-4" /> NOVO CICLO
                            </button>
                        </div>
                        
                        {plan.cycles.length === 0 ? (
                             <div className="flex flex-col items-center justify-center h-64 text-gray-500 border border-dashed border-white/10 rounded-2xl">
                                <Icon.RefreshCw className="w-12 h-12 mb-4 opacity-50"/>
                                <p>Nenhum ciclo criado.</p>
                                <button onClick={addCycle} className="mt-4 text-insanus-red hover:underline text-sm font-bold">Criar Primeiro Ciclo</button>
                            </div>
                        ) : (
                            <div>
                                {plan.cycles.map(cycle => (
                                    <CycleEditor 
                                        key={cycle.id}
                                        cycle={cycle}
                                        allDisciplines={plan.disciplines}
                                        onUpdate={updateCycle}
                                        onDelete={() => deleteCycle(cycle.id)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* EDITAL VERTICALIZADO TAB */}
                {tab === 'edital' && (
                    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
                         <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                            <div>
                                <h3 className="text-2xl font-black text-white uppercase">Edital Verticalizado</h3>
                                <p className="text-gray-500 text-xs">Organize os tópicos do edital e vincule as metas para controle do aluno.</p>
                            </div>
                            <button onClick={addEditalDiscipline} className="bg-insanus-red hover:bg-red-600 text-white px-4 py-2 rounded font-bold flex items-center gap-2">
                                <Icon.Plus className="w-4 h-4" /> NOVA DISCIPLINA DO EDITAL
                            </button>
                        </div>

                        {/* POLICE CONTEST IDENTIFIER (Optional Feature) */}
                        {plan.category === 'CARREIRAS_POLICIAIS' && (
                            <div className="mb-8 p-6 bg-white/5 border border-white/10 rounded-xl">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-lg font-bold text-white uppercase flex items-center gap-2">
                                        <Icon.User className="w-5 h-5 text-insanus-red" />
                                        IDENTIFICAR CONCURSOS (FACULTATIVO)
                                    </h4>
                                </div>
                                <div className="flex gap-2 mb-4">
                                    <input 
                                        value={newContestName}
                                        onChange={(e) => setNewContestName(e.target.value)}
                                        className="bg-black border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-insanus-red flex-1"
                                        placeholder="Digite a sigla do concurso (Ex: PF, PRF, PC-SP)..."
                                    />
                                    <button onClick={addContest} className="bg-insanus-red text-white px-6 rounded-lg font-bold text-xs uppercase hover:bg-red-600 transition">Adicionar</button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {plan.linkedContests?.map(c => (
                                        <div key={c} className="bg-insanus-red/20 border border-insanus-red text-insanus-red px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2">
                                            {c}
                                            <button onClick={() => removeContest(c)} className="hover:text-white"><Icon.Trash className="w-3 h-3" /></button>
                                        </div>
                                    ))}
                                    {(!plan.linkedContests || plan.linkedContests.length === 0) && (
                                        <p className="text-gray-600 text-xs italic">Nenhum concurso identificado.</p>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-500 mt-2 italic">
                                    * Adicione os concursos para habilitar a marcação específica em cada tópico do edital abaixo.
                                </p>
                            </div>
                        )}

                        {(!plan.editalVerticalizado || plan.editalVerticalizado.length === 0) ? (
                             <div className="flex flex-col items-center justify-center h-64 text-gray-500 border border-dashed border-white/10 rounded-2xl">
                                <Icon.List className="w-12 h-12 mb-4 opacity-50"/>
                                <p>O Edital Verticalizado ainda não foi configurado.</p>
                                <button onClick={addEditalDiscipline} className="mt-4 text-insanus-red hover:underline text-sm font-bold">Criar Estrutura do Edital</button>
                            </div>
                        ) : (
                            <div className="grid gap-8">
                                {plan.editalVerticalizado.map((disc, dIdx) => (
                                    <div key={disc.id} className="glass rounded-xl border border-white/5 overflow-hidden">
                                        <div className="bg-white/5 p-4 flex justify-between items-center border-b border-white/5">
                                            <div className="flex items-center gap-3 flex-1">
                                                <div className="w-2 h-8 bg-insanus-red rounded"></div>
                                                <input 
                                                    value={disc.name} 
                                                    onChange={e => updateEditalDiscipline(dIdx, e.target.value)}
                                                    className="bg-transparent font-black text-white focus:outline-none w-full text-lg uppercase"
                                                    placeholder="NOME DA DISCIPLINA DO EDITAL"
                                                />
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => addEditalTopic(dIdx)} className="text-[10px] bg-insanus-red/20 text-insanus-red px-3 py-1 rounded hover:bg-insanus-red hover:text-white font-bold transition">+ TÓPICO</button>
                                                <SafeDeleteBtn onDelete={() => deleteEditalDiscipline(dIdx)} />
                                            </div>
                                        </div>

                                        <div className="p-4 bg-black/40">
                                            {disc.topics.map((topic, tIdx) => (
                                                <EditalTopicEditor 
                                                    key={topic.id}
                                                    topic={topic}
                                                    plan={plan}
                                                    onUpdate={(updatedTopic) => updateEditalTopic(dIdx, tIdx, updatedTopic)}
                                                    onDelete={() => deleteEditalTopic(dIdx, tIdx)}
                                                />
                                            ))}
                                            {disc.topics.length === 0 && (
                                                <div className="text-center text-gray-600 text-xs italic py-4">
                                                    Nenhum tópico cadastrado nesta disciplina.
                                                </div>
                                            )}
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

interface AdminDashboardProps {
    user: User;
    onSwitchToUser: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ user, onSwitchToUser }) => {
    const [view, setView] = useState<'users' | 'plans'>('plans');
    const [users, setUsers] = useState<User[]>([]);
    const [plans, setPlans] = useState<StudyPlan[]>([]);
    const [editingPlan, setEditingPlan] = useState<StudyPlan | null>(null);

    // Initial Fetch
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const u = await fetchUsersFromDB();
        const p = await fetchPlansFromDB();
        setUsers(u);
        setPlans(p);
    };

    // USER ACTIONS
    const handleCreateUser = async () => {
        const name = prompt("Nome do Aluno:");
        if (!name) return;
        const email = prompt("E-mail do Aluno:");
        if (!email) return;
        const password = prompt("Senha Temporária:");
        if (!password) return;

        const newUser: User = {
            id: uuid(),
            name,
            email,
            cpf: '000.000.000-00',
            level: 'iniciante',
            isAdmin: false,
            allowedPlans: [],
            planExpirations: {},
            planConfigs: {},
            routine: { days: {} },
            progress: { completedGoalIds: [], completedRevisionIds: [], totalStudySeconds: 0, planStudySeconds: {} },
            tempPassword: password
        };
        await saveUserToDB(newUser);
        loadData();
    };

    const handleDeleteUser = async (uid: string) => {
        if (!confirm("Tem certeza que deseja remover este aluno?")) return;
        await deleteUserFromDB(uid);
        loadData();
    };

    const handleTogglePlanAccess = async (user: User, planId: string) => {
        const hasAccess = user.allowedPlans?.includes(planId);
        let newAllowed = [...(user.allowedPlans || [])];
        if (hasAccess) {
            newAllowed = newAllowed.filter(id => id !== planId);
        } else {
            newAllowed.push(planId);
        }
        const updatedUser = { ...user, allowedPlans: newAllowed };
        await saveUserToDB(updatedUser);
        setUsers(users.map(u => u.id === user.id ? updatedUser : u));
    };

    // PLAN ACTIONS
    const handleCreatePlan = async () => {
        const name = prompt("Nome do Novo Plano:");
        if (!name) return;
        const newPlan: StudyPlan = {
            id: uuid(),
            name,
            category: 'CARREIRAS_POLICIAIS', // Default category
            coverImage: '',
            folders: [],
            disciplines: [],
            cycles: [],
            cycleSystem: 'rotativo',
            editalVerticalizado: []
        };
        await savePlanToDB(newPlan);
        loadData();
    };

    const handleDeletePlan = async (pid: string) => {
        if (!confirm("Tem certeza? Isso apagará todo o conteúdo do plano.")) return;
        await deletePlanFromDB(pid);
        loadData();
    };

    const handleUpdatePlan = async (updatedPlan: StudyPlan) => {
        setEditingPlan(updatedPlan); // Update local state immediately for UI responsiveness
    };

    if (editingPlan) {
        // Render Editor with sidebar hidden or visible? 
        // Typically editor needs space. I'll hide sidebar for editing mode to focus.
        // Wait, prompt said restore sidebar design. If I hide it here, it's not restoring it fully if the previous one had it.
        // But the previous one (Turn 1) had logic: `{tab === 'users' ? <UsersManager /> : <PlanEditor />}` inside the content area.
        // `PlanEditor` listed plans. When clicking "EDIT", it set `selectedPlan`.
        // `PlanDetailEditor` was rendered.
        // So the Sidebar WAS visible.
        
        // I will implement Sidebar layout and render PlanDetailEditor inside the content area.
    }

    return (
        <div className="flex w-full h-full bg-insanus-black text-gray-200">
            {/* SIDEBAR NAVIGATION */}
            <div className="w-20 lg:w-72 bg-black/50 border-r border-white/10 flex flex-col shrink-0 backdrop-blur-md z-30">
                <div className="p-6 border-b border-white/5 flex items-center justify-center lg:justify-start gap-3">
                    <div className="w-8 h-8 bg-insanus-red rounded shadow-neon shrink-0"></div>
                    <div className="hidden lg:block"><h1 className="text-white font-black text-lg">INSANUS<span className="text-insanus-red">.ADMIN</span></h1></div>
                </div>
                
                <nav className="flex-1 p-4 space-y-2">
                    <button 
                        onClick={() => { setView('plans'); setEditingPlan(null); }} 
                        className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${view === 'plans' ? 'bg-gradient-to-r from-insanus-red to-red-900 text-white shadow-neon' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Icon.Book className="w-5 h-5" />
                        <span className="hidden lg:block font-bold text-sm">Meus Planos</span>
                    </button>
                    
                    <button 
                        onClick={() => { setView('users'); setEditingPlan(null); }} 
                        className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${view === 'users' ? 'bg-gradient-to-r from-insanus-red to-red-900 text-white shadow-neon' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Icon.User className="w-5 h-5" />
                        <span className="hidden lg:block font-bold text-sm">Gestão de Alunos</span>
                    </button>
                </nav>

                <div className="p-4 border-t border-white/5">
                    <button onClick={onSwitchToUser} className="w-full bg-white/5 hover:bg-white/10 text-gray-300 p-3 rounded-xl flex items-center justify-center lg:justify-start gap-3 transition-all border border-transparent hover:border-white/10">
                        <Icon.Eye className="w-5 h-5 text-insanus-red" />
                        <span className="hidden lg:block font-bold text-sm">Visão do Aluno</span>
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 overflow-hidden relative flex flex-col">
                <div className="absolute inset-0 bg-tech-grid opacity-10 pointer-events-none" />
                
                {/* Scrollable Area */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-10">
                    
                    {/* Render Plan Detail Editor if editing */}
                    {editingPlan ? (
                        <PlanDetailEditor 
                            plan={editingPlan} 
                            onUpdate={handleUpdatePlan}
                            onBack={() => { setEditingPlan(null); loadData(); }} 
                        />
                    ) : (
                        <>
                            {view === 'users' && (
                                <div className="max-w-6xl mx-auto animate-fade-in">
                                    <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                                        <div>
                                            <h2 className="text-3xl font-black text-white">ALUNOS <span className="text-insanus-red">CADASTRADOS</span></h2>
                                            <p className="text-gray-500 text-xs mt-1">Gerencie o acesso aos planos de estudo.</p>
                                        </div>
                                        <button onClick={handleCreateUser} className="bg-insanus-red hover:bg-red-600 text-white px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-2 shadow-neon transition-transform hover:scale-105">
                                            <Icon.Plus className="w-4 h-4" /> NOVO ALUNO
                                        </button>
                                    </div>
                                    
                                    <div className="grid gap-4">
                                        {users.filter(u => !u.isAdmin).map(u => (
                                            <div key={u.id} className="glass p-5 rounded-xl border border-white/5 flex flex-col md:flex-row items-center justify-between hover:border-white/20 transition gap-4">
                                                <div className="flex items-center gap-4 w-full md:w-auto">
                                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-800 to-black border border-white/10 flex items-center justify-center font-bold text-white text-lg">
                                                        {u.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-white text-lg">{u.name}</div>
                                                        <div className="text-xs text-gray-500 font-mono">{u.email}</div>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                                                    <div className="flex flex-col gap-1 items-end">
                                                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Acesso Liberado:</span>
                                                        <div className="flex flex-wrap justify-end gap-2">
                                                            {plans.map(p => (
                                                                <button 
                                                                    key={p.id}
                                                                    onClick={() => handleTogglePlanAccess(u, p.id)}
                                                                    className={`text-[10px] px-2 py-1 rounded border font-bold uppercase transition-all ${u.allowedPlans?.includes(p.id) ? 'bg-insanus-red/20 border-insanus-red text-insanus-red hover:bg-insanus-red/30' : 'bg-black border-gray-800 text-gray-600 hover:border-gray-600 hover:text-gray-400'}`}
                                                                >
                                                                    {p.name}
                                                                </button>
                                                            ))}
                                                            {plans.length === 0 && <span className="text-[10px] text-gray-700 italic">Sem planos disponíveis</span>}
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="h-8 w-px bg-white/10 mx-2 hidden md:block"></div>

                                                    <SafeDeleteBtn onDelete={() => handleDeleteUser(u.id)} className="bg-black/40 p-3 rounded-lg hover:bg-red-900/50 hover:text-white border border-white/5 hover:border-red-500/30 transition-all" />
                                                </div>
                                            </div>
                                        ))}
                                        {users.filter(u => !u.isAdmin).length === 0 && (
                                            <div className="text-center py-20 text-gray-600 border border-dashed border-white/10 rounded-xl bg-white/5 flex flex-col items-center">
                                                <Icon.User className="w-12 h-12 mb-4 opacity-20" />
                                                <p>Nenhum aluno encontrado.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {view === 'plans' && (
                                <div className="max-w-6xl mx-auto animate-fade-in">
                                    <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                                        <div>
                                            <h2 className="text-3xl font-black text-white">PLANOS DE <span className="text-insanus-red">ESTUDO</span></h2>
                                            <p className="text-gray-500 text-xs mt-1">Crie e edite os planejamentos disponíveis.</p>
                                        </div>
                                        <button onClick={handleCreatePlan} className="bg-insanus-red hover:bg-red-600 text-white px-4 py-3 rounded-xl font-bold text-xs flex items-center gap-2 shadow-neon transition-transform hover:scale-105">
                                            <Icon.Plus className="w-4 h-4" /> NOVO PLANO
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {plans.map(p => (
                                            <div key={p.id} className="glass rounded-2xl overflow-hidden border border-white/5 hover:border-insanus-red/50 transition-all group relative h-72 flex flex-col">
                                                <div className="h-40 bg-black/50 relative overflow-hidden">
                                                    {p.coverImage ? (
                                                        <img src={p.coverImage} className="w-full h-full object-cover opacity-50 group-hover:opacity-80 group-hover:scale-105 transition duration-700" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-700">
                                                            <Icon.Image className="w-8 h-8" />
                                                        </div>
                                                    )}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-insanus-black to-transparent" />
                                                    
                                                    {/* Actions Overlay */}
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 gap-3 backdrop-blur-sm">
                                                        <button onClick={() => setEditingPlan(p)} className="bg-white text-black px-4 py-2 rounded-lg font-bold text-xs hover:bg-gray-200 flex items-center gap-2 shadow-lg transform hover:scale-105 transition">
                                                            <Icon.Edit className="w-4 h-4" /> EDITAR
                                                        </button>
                                                        <SafeDeleteBtn onDelete={() => handleDeletePlan(p.id)} className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-red-700 hover:text-white shadow-lg flex items-center gap-2" label="EXCLUIR" />
                                                    </div>
                                                </div>
                                                
                                                <div className="p-5 flex-1 flex flex-col justify-between">
                                                    <div>
                                                        <h3 className="font-black text-white text-xl leading-tight mb-1 group-hover:text-insanus-red transition-colors line-clamp-2">{p.name}</h3>
                                                        <div className="h-1 w-12 bg-insanus-red rounded-full mb-3"></div>
                                                    </div>
                                                    
                                                    <div className="flex justify-between text-[10px] text-gray-500 font-mono border-t border-white/5 pt-3 uppercase tracking-widest">
                                                        <div className="flex items-center gap-1"><Icon.Book className="w-3 h-3" /> {p.disciplines.length} Disciplinas</div>
                                                        <div className="flex items-center gap-1"><Icon.RefreshCw className="w-3 h-3" /> {p.cycles.length} Ciclos</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {plans.length === 0 && (
                                        <div className="text-center py-20 text-gray-600 border border-dashed border-white/10 rounded-xl bg-white/5 flex flex-col items-center">
                                            <Icon.Book className="w-12 h-12 mb-4 opacity-20" />
                                            <p>Nenhum plano criado.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};