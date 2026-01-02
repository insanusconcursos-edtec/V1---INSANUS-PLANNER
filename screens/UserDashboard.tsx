import React, { useState, useEffect, useRef } from 'react';
import { User, StudyPlan, Routine, Goal, SubGoal, UserProgress, GoalType, PlanConfig, Discipline, Subject, UserLevel, SimuladoClass, Simulado, SimuladoAttempt, ScheduledItem, EditalTopic, Cycle, CycleItem } from '../types';
import { Icon } from '../components/Icons';
import { WEEKDAYS, calculateGoalDuration, uuid } from '../constants';
import { fetchPlansFromDB, saveUserToDB, fetchSimuladoClassesFromDB, fetchSimuladoAttemptsFromDB, saveSimuladoAttemptToDB } from '../services/db';

interface Props {
  user: User;
  onUpdateUser: (user: User) => void;
  onReturnToAdmin?: () => void;
}

// --- HELPER: DATE & TIME UTILS ---
const getTodayStr = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

const formatDate = (dateStr: string) => {
    if(!dateStr) return '--/--';
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}`; // DD/MM
};

const formatSecondsToTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
};

const formatStopwatch = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

const getDayName = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00'); 
    const dayMap = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    return dayMap[d.getDay()];
};

const getWeekDays = (baseDateStr: string) => {
    const date = new Date(baseDateStr + 'T12:00:00');
    const day = date.getDay(); 
    const diff = date.getDate() - day; 
    const sunday = new Date(date.setDate(diff));
    
    const week = [];
    for(let i=0; i<7; i++) {
        const next = new Date(sunday);
        next.setDate(sunday.getDate() + i);
        week.push(next.toISOString().split('T')[0]);
    }
    return week;
};

// --- SIMULADO RUNNER COMPONENT ---
interface SimuladoRunnerProps {
    user: User;
    classId: string;
    simulado: Simulado;
    attempt?: SimuladoAttempt;
    onFinish: (result: SimuladoAttempt) => void;
    onBack: () => void;
}

const SimuladoRunner: React.FC<SimuladoRunnerProps> = ({ user, classId, simulado, attempt, onFinish, onBack }) => {
    const [answers, setAnswers] = useState<Record<number, string | null>>(attempt?.answers || {});
    const [showResult, setShowResult] = useState(!!attempt);
    const [confirmFinish, setConfirmFinish] = useState(false);

    const handleAnswer = (q: number, val: string) => {
        if (showResult) return;
        setAnswers(prev => ({ ...prev, [q]: val }));
    };

    const finishSimulado = () => {
        let score = 0;
        let correctCount = 0;
        
        // Calculate Score
        for (let i = 1; i <= simulado.totalQuestions; i++) {
            const userAns = answers[i];
            const correctAns = simulado.correctAnswers[i];
            const val = simulado.questionValues[i] || 1;
            
            if (userAns && userAns === correctAns) {
                score += val;
                correctCount++;
            } else if (userAns && simulado.hasPenalty) {
                score -= val;
            }
        }
        if (score < 0) score = 0;

        const totalPoints = Object.values(simulado.questionValues).reduce((a: number, b: number) => a + b, 0) || simulado.totalQuestions;
        const percent = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
        const isApproved = simulado.minTotalPercent ? percent >= simulado.minTotalPercent : percent >= 50;

        const result: SimuladoAttempt = {
            id: attempt?.id || uuid(),
            userId: user.id,
            simuladoId: simulado.id,
            classId: classId,
            date: new Date().toISOString(),
            answers,
            diagnosisReasons: {}, 
            score,
            isApproved
        };

        onFinish(result);
    };

    return (
        <div className="fixed inset-0 z-50 bg-[#050505] text-white flex flex-col animate-fade-in">
             <div className="h-16 border-b border-[#333] bg-[#0F0F0F] flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-gray-500 hover:text-white flex items-center gap-2">
                        <Icon.ArrowUp className="-rotate-90 w-5 h-5" /> <span className="text-xs font-bold uppercase">Sair</span>
                    </button>
                    <div className="h-6 w-px bg-[#333]"></div>
                    <h2 className="font-bold uppercase text-lg">{simulado.title}</h2>
                </div>
                {!showResult && (
                    <button 
                        onClick={() => setConfirmFinish(true)}
                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-bold text-xs uppercase shadow-neon"
                    >
                        Finalizar Simulado
                    </button>
                )}
             </div>

             {confirmFinish && (
                 <div className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
                     <div className="bg-[#121212] border border-[#333] p-8 rounded-xl max-w-sm w-full text-center">
                         <h3 className="text-xl font-bold text-white mb-2">Tem certeza?</h3>
                         <p className="text-gray-400 text-sm mb-6">Ao finalizar, você não poderá alterar suas respostas.</p>
                         <div className="flex gap-4">
                             <button onClick={() => setConfirmFinish(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded font-bold text-xs">VOLTAR</button>
                             <button onClick={finishSimulado} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded font-bold text-xs">CONFIRMAR</button>
                         </div>
                     </div>
                 </div>
             )}

             <div className="flex-1 flex overflow-hidden">
                {simulado.pdfUrl && (
                    <div className="w-1/2 border-r border-[#333] bg-[#121212] flex flex-col">
                        <div className="flex-1 flex items-center justify-center text-gray-500">
                             <iframe src={simulado.pdfUrl} className="w-full h-full" title="PDF Viewer"></iframe>
                        </div>
                    </div>
                )}

                <div className={`${simulado.pdfUrl ? 'w-1/2' : 'w-full'} flex flex-col bg-[#050505]`}>
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                         {attempt && (
                             <div className={`p-4 rounded-xl border mb-8 flex justify-between items-center ${attempt.isApproved ? 'bg-green-900/20 border-green-600' : 'bg-red-900/20 border-red-600'}`}>
                                 <div>
                                     <h3 className={`text-xl font-black ${attempt.isApproved ? 'text-green-500' : 'text-red-500'}`}>{attempt.isApproved ? 'APROVADO' : 'REPROVADO'}</h3>
                                     <p className="text-xs text-gray-400">Pontuação Final: {attempt.score}</p>
                                 </div>
                                 <button onClick={onBack} className="text-white text-xs underline">Voltar ao Painel</button>
                             </div>
                         )}

                         <div className="space-y-6">
                            {Array.from({ length: simulado.totalQuestions }).map((_, i) => {
                                const qNum = i + 1;
                                const userAns = answers[qNum];
                                const correctAns = showResult ? simulado.correctAnswers[qNum] : null;
                                const isCorrect = showResult && userAns === correctAns;
                                
                                return (
                                    <div key={qNum} className="bg-[#121212] p-4 rounded-xl border border-[#333]">
                                        <div className="flex justify-between mb-4">
                                            <span className="font-bold text-insanus-red">QUESTÃO {qNum}</span>
                                            {showResult && (
                                                <span className={`text-xs font-bold ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                                                    {isCorrect ? 'ACERTOU' : userAns ? `ERROU (Gab: ${correctAns})` : `EM BRANCO (Gab: ${correctAns})`}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-2 flex-wrap">
                                            {simulado.type === 'MULTIPLA_ESCOLHA' ? (
                                                ['A','B','C','D','E'].slice(0, simulado.optionsCount).map(opt => (
                                                    <button 
                                                        key={opt}
                                                        onClick={() => handleAnswer(qNum, opt)}
                                                        disabled={showResult}
                                                        className={`w-10 h-10 rounded font-bold transition-all ${
                                                            userAns === opt 
                                                                ? 'bg-white text-black shadow-[0_0_10px_white]' 
                                                                : 'bg-black border border-[#333] text-gray-400 hover:border-white'
                                                        } ${showResult && correctAns === opt ? '!bg-green-600 !text-white !border-green-600' : ''}`}
                                                    >
                                                        {opt}
                                                    </button>
                                                ))
                                            ) : (
                                                ['C','E'].map(opt => (
                                                    <button 
                                                        key={opt}
                                                        onClick={() => handleAnswer(qNum, opt)}
                                                        disabled={showResult}
                                                        className={`flex-1 py-2 rounded font-bold transition-all ${
                                                            userAns === opt 
                                                                ? 'bg-white text-black' 
                                                                : 'bg-black border border-[#333] text-gray-400 hover:border-white'
                                                        } ${showResult && correctAns === opt ? '!bg-green-600 !text-white !border-green-600' : ''}`}
                                                    >
                                                        {opt === 'C' ? 'CERTO' : 'ERRADO'}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                         </div>
                    </div>
                </div>
             </div>
        </div>
    );
};

// ... [SetupWizard and Schedule Engine] ...
const SetupWizard = ({ user, currentPlan, onSave, onPlanAction, onUpdateUser }: { user: User, currentPlan: StudyPlan | null, onSave: (r: Routine, l: UserLevel) => void, onPlanAction: (action: 'pause' | 'reschedule') => void, onUpdateUser: (u: User) => void }) => {
    const [days, setDays] = useState(user.routine?.days || {});
    const [level, setLevel] = useState<UserLevel>(user.level || 'iniciante');
    
    // Password Change State
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changingPass, setChangingPass] = useState(false);

    const handleDayChange = (key: string, val: string) => {
        setDays(prev => ({ ...prev, [key]: parseInt(val) || 0 }));
    };

    const handleChangePassword = async () => {
        if (!newPassword.trim() || !confirmPassword.trim()) return alert("Preencha os campos de senha.");
        if (newPassword !== confirmPassword) return alert("As senhas não coincidem.");
        if (newPassword.length < 4) return alert("A senha deve ter pelo menos 4 caracteres.");

        setChangingPass(true);
        try {
            const updatedUser = { ...user, tempPassword: newPassword };
            onUpdateUser(updatedUser);
            await saveUserToDB(updatedUser);
            alert("Senha alterada com sucesso!");
            setNewPassword('');
            setConfirmPassword('');
        } catch (e) {
            alert("Erro ao alterar senha.");
        } finally {
            setChangingPass(false);
        }
    };

    const isPlanPaused = currentPlan ? user.planConfigs?.[currentPlan.id]?.isPaused : false;

    return (
        <div className="w-full space-y-8 animate-fade-in mt-4">
            {currentPlan && (
                <div className="bg-[#121212] p-6 rounded-2xl border border-[#333] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-insanus-red"></div>
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Icon.Edit className="w-5 h-5"/> GESTÃO DO PLANO ATUAL</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-[#1E1E1E] p-4 rounded-xl border border-[#333]">
                            <h4 className="font-bold text-gray-300 text-sm mb-2">STATUS DO PLANO</h4>
                            <p className="text-xs text-gray-500 mb-4">Pausar o plano interrompe a geração de novas metas diárias até que você retorne.</p>
                            <button 
                                onClick={() => onPlanAction('pause')}
                                className={`w-full py-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition ${isPlanPaused ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-yellow-600 hover:bg-yellow-500 text-white'}`}
                            >
                                {isPlanPaused ? <Icon.Play className="w-4 h-4"/> : <Icon.Pause className="w-4 h-4"/>}
                                {isPlanPaused ? 'RETOMAR PLANO' : 'PAUSAR PLANO'}
                            </button>
                        </div>

                        <div className="bg-[#1E1E1E] p-4 rounded-xl border border-[#333]">
                            <h4 className="font-bold text-gray-300 text-sm mb-2">ATRASOS E IMPREVISTOS</h4>
                            <p className="text-xs text-gray-500 mb-4">Replanejar define a data de início para HOJE, redistribuindo todas as metas pendentes.</p>
                            <button 
                                onClick={() => { 
                                    // eslint-disable-next-line no-restricted-globals
                                    if(confirm("Isso vai reorganizar todo o cronograma futuro a partir de hoje. Continuar?")) onPlanAction('reschedule'); 
                                }}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition"
                            >
                                <Icon.RefreshCw className="w-4 h-4"/>
                                REPLANEJAR ATRASOS
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-[#121212] p-8 rounded-2xl border border-[#333]">
                <div className="text-center mb-10">
                    <Icon.Clock className="w-16 h-16 text-insanus-red mx-auto mb-4" />
                    <h2 className="text-3xl font-black text-white uppercase tracking-tight">Configuração de Rotina</h2>
                    <p className="text-gray-400 mt-2 text-sm">Defina seu ritmo e disponibilidade.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-4 border-b border-[#333] pb-2 flex items-center gap-2">
                            <Icon.User className="w-4 h-4 text-insanus-red"/> SEU NÍVEL
                        </h3>
                        <div className="space-y-3">
                            {[
                                { id: 'iniciante', label: 'Iniciante', desc: 'Ritmo mais lento de leitura.' },
                                { id: 'intermediario', label: 'Intermediário', desc: 'Ritmo médio e constante.' },
                                { id: 'avancado', label: 'Avançado', desc: 'Leitura dinâmica e foco em revisão.' }
                            ].map((opt) => (
                                <div 
                                    key={opt.id}
                                    onClick={() => setLevel(opt.id as UserLevel)}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${level === opt.id ? 'bg-insanus-red/20 border-insanus-red shadow-neon' : 'bg-[#1A1A1A] border-[#333] hover:border-[#555]'}`}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`font-bold uppercase text-sm ${level === opt.id ? 'text-white' : 'text-gray-400'}`}>{opt.label}</span>
                                        {level === opt.id && <Icon.Check className="w-4 h-4 text-insanus-red"/>}
                                    </div>
                                    <p className="text-[10px] text-gray-500">{opt.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-white mb-4 border-b border-[#333] pb-2 flex items-center gap-2">
                            <Icon.Calendar className="w-4 h-4 text-insanus-red"/> DISPONIBILIDADE (MIN)
                        </h3>
                        <div className="space-y-2">
                            {WEEKDAYS.map(d => (
                                <div key={d.key} className="flex items-center justify-between bg-[#1A1A1A] p-2 px-3 rounded border border-[#333] hover:border-[#555] transition">
                                    <span className="text-xs font-bold text-gray-300 uppercase">{d.label}</span>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            value={days[d.key] || ''} 
                                            onChange={e => handleDayChange(d.key, e.target.value)}
                                            placeholder="0"
                                            className="w-16 bg-[#050505] border border-[#333] rounded p-1 text-right text-white font-mono text-sm focus:border-insanus-red outline-none"
                                        />
                                        <span className="text-[10px] text-gray-600">min</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <button onClick={() => onSave({ days }, level)} className="w-full mt-10 bg-insanus-red hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-neon transition transform hover:scale-[1.01] flex items-center justify-center gap-2">
                    <Icon.RefreshCw className="w-5 h-5"/> SALVAR ROTINA E NÍVEL
                </button>
            </div>

            {/* PASSWORD CHANGE SECTION */}
            <div className="bg-[#121212] p-8 rounded-2xl border border-[#333]">
                <h3 className="text-lg font-bold text-white mb-6 border-b border-[#333] pb-2 flex items-center gap-2">
                    <Icon.Eye className="w-4 h-4 text-insanus-red"/> SEGURANÇA E ACESSO
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Nova Senha</label>
                        <input 
                            type="password"
                            value={newPassword} 
                            onChange={e => setNewPassword(e.target.value)} 
                            className="w-full bg-black p-3 rounded-lg border border-white/10 text-white text-sm focus:border-insanus-red focus:outline-none placeholder-gray-700" 
                            placeholder="Mínimo 4 caracteres"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Confirmar Nova Senha</label>
                        <input 
                            type="password"
                            value={confirmPassword} 
                            onChange={e => setConfirmPassword(e.target.value)} 
                            className="w-full bg-black p-3 rounded-lg border border-white/10 text-white text-sm focus:border-insanus-red focus:outline-none placeholder-gray-700" 
                            placeholder="Repita a senha"
                        />
                    </div>
                </div>
                <button 
                    onClick={handleChangePassword} 
                    disabled={changingPass}
                    className="w-full mt-6 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl border border-gray-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {changingPass ? 'SALVANDO...' : 'ALTERAR SENHA'}
                </button>
            </div>
        </div>
    );
};

const expandCycleItems = (cycle: Cycle, plan: StudyPlan): CycleItem[] => {
    const expandedItems: CycleItem[] = [];
    cycle.items.forEach(item => {
        if (item.folderId) {
            const folderDisciplines = plan.disciplines
                .filter(d => d.folderId === item.folderId)
                .sort((a, b) => a.order - b.order);
            folderDisciplines.forEach(d => {
                expandedItems.push({
                    disciplineId: d.id,
                    subjectsCount: item.subjectsCount
                });
            });
        } else if (item.disciplineId) {
            expandedItems.push(item);
        } else if (item.simuladoId) {
            expandedItems.push(item);
        }
    });
    return expandedItems;
};

const isSimuladoCompleted = (simuladoId: string, attempts: SimuladoAttempt[]) => {
    return attempts.some(a => a.simuladoId === simuladoId);
};

const generateSchedule = (plan: StudyPlan, routine: Routine, startDateStr: string, completedGoals: string[], userLevel: UserLevel, isPaused: boolean, allSimulados: Simulado[], userAttempts: SimuladoAttempt[]): Record<string, ScheduledItem[]> => {
    const schedule: Record<string, ScheduledItem[]> = {};
    if (isPaused) return {}; 
    if (!plan || !plan.cycles || plan.cycles.length === 0) return {};
    
    const hasAvailability = Object.values(routine.days || {}).some(v => v > 0);
    if (!hasAvailability) return {};

    const startDate = new Date((startDateStr || getTodayStr()) + 'T00:00:00');
    const MAX_DAYS = 90; 
    
    const disciplineQueues: Record<string, Goal[]> = {};
    plan.disciplines.forEach(d => {
        const flatGoals: Goal[] = [];
        const sortedSubjects = [...d.subjects].sort((a,b) => a.order - b.order);
        sortedSubjects.forEach(s => {
             const sortedGoals = [...s.goals].sort((a,b) => a.order - b.order);
             sortedGoals.forEach(g => {
                 (g as any)._subjectName = s.name;
                 (g as any)._disciplineName = d.name;
                 flatGoals.push(g);
             });
        });
        disciplineQueues[d.id] = flatGoals;
    });

    const disciplinePointers: Record<string, number> = {};
    plan.disciplines.forEach(d => { disciplinePointers[d.id] = 0; });

    let currentCycleIndex = 0;
    let currentItemIndex = 0;

    for (let dayOffset = 0; dayOffset < MAX_DAYS; dayOffset++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + dayOffset);
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayName = getDayName(dateStr);
        
        let minutesAvailable = routine.days[dayName] || 0;
        const dayItems: ScheduledItem[] = [];

        if (minutesAvailable === 0) continue;

        let itemsProcessedToday = 0;
        let safetyLoop = 0;

        while (minutesAvailable > 0 && safetyLoop < 50) {
            safetyLoop++;
            const cycle = plan.cycles[currentCycleIndex];
            
            if (!cycle) {
                if (plan.cycleSystem === 'rotativo' && plan.cycles.length > 0) {
                    currentCycleIndex = 0;
                    currentItemIndex = 0;
                    continue;
                }
                break;
            }

            const activeItems = expandCycleItems(cycle, plan);
            const cycleItem = activeItems[currentItemIndex];
            if (!cycleItem) {
                currentCycleIndex++;
                currentItemIndex = 0;
                continue;
            }

            if (cycleItem.simuladoId) {
                const simulado = allSimulados.find(s => s.id === cycleItem.simuladoId);
                const isCompleted = isSimuladoCompleted(cycleItem.simuladoId, userAttempts);
                if (isCompleted) {
                    currentItemIndex++;
                    continue;
                }
                if (simulado) {
                    const estDuration = simulado.totalQuestions * 3; 
                    if (itemsProcessedToday === 0 || minutesAvailable > 60) {
                        const uniqueId = `${dateStr}_SIM_${simulado.id}`;
                        dayItems.push({
                            uniqueId, 
                            date: dateStr, 
                            goalId: simulado.id, 
                            goalType: 'SIMULADO',
                            title: `SIMULADO: ${simulado.title}`,
                            disciplineName: 'AVALIAÇÃO',
                            subjectName: `${simulado.totalQuestions} Questões`,
                            duration: estDuration,
                            isRevision: false,
                            completed: false,
                            simuladoData: simulado
                        });
                        minutesAvailable = 0; 
                        itemsProcessedToday++;
                        currentItemIndex++;
                    } else {
                        minutesAvailable = 0;
                        break;
                    }
                } else {
                    currentItemIndex++;
                }
                continue;
            }

            if (!cycleItem.disciplineId) {
                currentItemIndex++;
                continue;
            }

            const queue = disciplineQueues[cycleItem.disciplineId];
            let pointer = disciplinePointers[cycleItem.disciplineId];

            if (!queue || queue.length === 0) {
                currentItemIndex++;
                continue;
            }

            let scheduledForThisItem = 0;
            while (scheduledForThisItem < cycleItem.subjectsCount) {
                if (pointer >= queue.length) break; 
                const goal = queue[pointer];
                const duration = calculateGoalDuration(goal, userLevel) || 30;

                if (minutesAvailable >= duration || itemsProcessedToday === 0) {
                    const uniqueId = `${dateStr}_${cycle.id}_${cycleItem.disciplineId}_${goal.id}`;
                    dayItems.push({
                         uniqueId, date: dateStr, goalId: goal.id, goalType: goal.type,
                         title: goal.title, disciplineName: (goal as any)._disciplineName || "Disciplina",
                         subjectName: (goal as any)._subjectName || "Assunto", duration: duration,
                         isRevision: false, completed: completedGoals.includes(goal.id), originalGoal: goal
                    });
                    minutesAvailable -= duration;
                    itemsProcessedToday++;
                    pointer++;
                    disciplinePointers[cycleItem.disciplineId!] = pointer;
                    scheduledForThisItem++;
                } else {
                    minutesAvailable = 0;
                    break;
                }
            }
            currentItemIndex++;
        }
        if (dayItems.length > 0) schedule[dateStr] = dayItems;
    }
    return schedule;
};

export const UserDashboard: React.FC<Props> = ({ user, onUpdateUser, onReturnToAdmin }) => {
  const [view, setView] = useState<'setup' | 'daily' | 'calendar' | 'edital' | 'simulados'>('daily');
  const [calendarMode, setCalendarMode] = useState<'month' | 'week'>('week');
  
  // Data State
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<StudyPlan | null>(null);
  const [schedule, setSchedule] = useState<Record<string, ScheduledItem[]>>({});
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [editalExpanded, setEditalExpanded] = useState<string[]>([]); // New State for Accordion
  
  // Timer State
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<any>(null);

  // Simulados Data
  const [simuladoClasses, setSimuladoClasses] = useState<SimuladoClass[]>([]);
  const [attempts, setAttempts] = useState<SimuladoAttempt[]>([]);
  const [activeSimulado, setActiveSimulado] = useState<Simulado | null>(null);

  const [selectedDate, setSelectedDate] = useState(getTodayStr());

  useEffect(() => { loadData(); }, [user.id]); 

  // --- TIMER LOGIC ---
  useEffect(() => {
      if (isTimerRunning) {
          timerRef.current = setInterval(() => {
              setTimerSeconds(prev => prev + 1);
          }, 1000);
      } else {
          if (timerRef.current) clearInterval(timerRef.current);
      }
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTimerRunning]);

  // Regenerate Schedule
  useEffect(() => {
      const hasRoutine = user.routine && user.routine.days && Object.values(user.routine.days).some((v: number) => v > 0);
      if (currentPlan && hasRoutine && simuladoClasses.length > 0) { 
          const config = user.planConfigs?.[currentPlan.id];
          const startDate = config?.startDate || getTodayStr();
          const isPaused = config?.isPaused || false;
          const allSimulados = simuladoClasses.flatMap(sc => sc.simulados);
          const generated = generateSchedule(
              currentPlan, user.routine, startDate, user.progress.completedGoalIds, 
              user.level || 'iniciante', isPaused, allSimulados, attempts
          );
          setSchedule(generated);
      } else if (currentPlan && hasRoutine && simuladoClasses.length === 0) {
           const config = user.planConfigs?.[currentPlan.id];
           const startDate = config?.startDate || getTodayStr();
           const isPaused = config?.isPaused || false;
           const generated = generateSchedule(
              currentPlan, user.routine, startDate, user.progress.completedGoalIds, 
              user.level || 'iniciante', isPaused, [], attempts
          );
          setSchedule(generated);
      } else {
          setSchedule({});
      }
  }, [currentPlan, user.routine, user.progress.completedGoalIds, user.level, user.planConfigs, simuladoClasses, attempts]);

  const loadData = async () => {
      const allPlans = await fetchPlansFromDB();
      const userPlans = user.isAdmin ? allPlans : allPlans.filter(p => user.allowedPlans?.includes(p.id));
      setPlans(userPlans);

      let activePlan: StudyPlan | undefined;
      if (user.currentPlanId) activePlan = userPlans.find(p => p.id === user.currentPlanId);
      if (!activePlan && userPlans.length > 0) activePlan = userPlans[0];
      
      if (activePlan) {
          setCurrentPlan(activePlan);
          if (!user.planConfigs || !user.planConfigs[activePlan.id]) {
               const newConfigs = { ...user.planConfigs, [activePlan.id]: { startDate: getTodayStr(), isPaused: false }};
               const updatedUser = { ...user, planConfigs: newConfigs, currentPlanId: activePlan.id };
               onUpdateUser(updatedUser);
               saveUserToDB(updatedUser); 
          }
      }

      const allClasses = await fetchSimuladoClassesFromDB();
      const userClasses = user.isAdmin ? allClasses : allClasses.filter(c => {
          const isAllowedExplicitly = user.allowedSimuladoClasses?.includes(c.id);
          const isLinkedToPlan = activePlan?.linkedSimuladoClasses?.includes(c.id);
          return isAllowedExplicitly || isLinkedToPlan;
      });
      setSimuladoClasses(userClasses);
      const allAttempts = await fetchSimuladoAttemptsFromDB();
      setAttempts(allAttempts.filter(a => a.userId === user.id));
      
      const hasRoutine = user.routine && user.routine.days && Object.values(user.routine.days).some((v: number) => v > 0);
      if (!hasRoutine) setView('setup'); 
  };

  const handleSelectPlan = (planId: string) => {
      const p = plans.find(pl => pl.id === planId);
      if (p) {
          setCurrentPlan(p);
          const newConfigs = { ...user.planConfigs };
          if (!newConfigs[p.id]) newConfigs[p.id] = { startDate: getTodayStr(), isPaused: false };
          const updatedUser = { ...user, currentPlanId: planId, planConfigs: newConfigs };
          onUpdateUser(updatedUser);
          saveUserToDB(updatedUser);
          loadData(); 
      }
  };

  const handleSetupSave = async (routine: Routine, level: UserLevel) => {
      const updatedUser = { ...user, routine, level };
      if (currentPlan) {
           const newConfigs = { ...updatedUser.planConfigs };
           if (!newConfigs[currentPlan.id]) newConfigs[currentPlan.id] = { startDate: getTodayStr(), isPaused: false };
           updatedUser.planConfigs = newConfigs;
           updatedUser.currentPlanId = currentPlan.id;
      }
      onUpdateUser(updatedUser);
      await saveUserToDB(updatedUser);
      setView('daily');
  };

  const handlePlanAction = async (action: 'pause' | 'reschedule') => {
      if (!currentPlan) return;
      const config = user.planConfigs[currentPlan.id] || { startDate: getTodayStr(), isPaused: false };
      let newConfig = { ...config };
      if (action === 'pause') newConfig.isPaused = !newConfig.isPaused;
      else if (action === 'reschedule') {
          newConfig.startDate = getTodayStr(); 
          newConfig.isPaused = false; 
      }
      const updatedUser = { ...user, planConfigs: { ...user.planConfigs, [currentPlan.id]: newConfig } };
      onUpdateUser(updatedUser);
      await saveUserToDB(updatedUser);
  };

  const startTimer = (goalId: string) => {
      if (activeGoalId && activeGoalId !== goalId) saveStudyTime();
      setActiveGoalId(goalId);
      setIsTimerRunning(true);
  };

  const pauseTimer = () => setIsTimerRunning(false);

  const saveStudyTime = async (shouldCompleteGoal: boolean = false) => {
      if (!activeGoalId || timerSeconds === 0) {
          if (shouldCompleteGoal && activeGoalId) toggleGoalComplete(activeGoalId);
          setActiveGoalId(null);
          setTimerSeconds(0);
          setIsTimerRunning(false);
          return;
      }
      const secondsToAdd = timerSeconds;
      const newTotal = (user.progress.totalStudySeconds || 0) + secondsToAdd;
      const currentPlanTotal = (user.progress.planStudySeconds?.[currentPlan?.id || ''] || 0) + secondsToAdd;
      const updatedUser = { ...user, progress: { ...user.progress, totalStudySeconds: newTotal, planStudySeconds: { ...user.progress.planStudySeconds, [currentPlan?.id || 'unknown']: currentPlanTotal } } };
      setActiveGoalId(null);
      setTimerSeconds(0);
      setIsTimerRunning(false);
      if (shouldCompleteGoal && activeGoalId) {
          if (!updatedUser.progress.completedGoalIds.includes(activeGoalId)) updatedUser.progress.completedGoalIds.push(activeGoalId);
      }
      onUpdateUser(updatedUser);
      await saveUserToDB(updatedUser);
  };

  const toggleGoalComplete = async (goalId: string) => {
      if (activeGoalId === goalId) { await saveStudyTime(true); return; }
      const isCompleted = user.progress.completedGoalIds.includes(goalId);
      let newCompleted = [...user.progress.completedGoalIds];
      if (isCompleted) newCompleted = newCompleted.filter(id => id !== goalId);
      else newCompleted.push(goalId);
      const updatedUser = { ...user, progress: { ...user.progress, completedGoalIds: newCompleted } };
      onUpdateUser(updatedUser);
      await saveUserToDB(updatedUser);
  };
  
  const handleSimuladoFinished = async (result: SimuladoAttempt) => {
      await saveSimuladoAttemptToDB(result);
      setAttempts(prev => [...prev, result]);
      setActiveSimulado(null);
  };

  const toggleAccordion = (uniqueId: string) => {
      setExpandedItems(prev => prev.includes(uniqueId) ? prev.filter(id => id !== uniqueId) : [...prev, uniqueId]);
  }

  // --- VIEWS ---
  const renderDailyView = () => {
      // ... Daily View Content (No Changes needed here) ...
      const daySchedule = schedule[selectedDate] || [];
      const isToday = selectedDate === getTodayStr();
      const dayName = getDayName(selectedDate);
      const isPlanPaused = currentPlan ? user.planConfigs?.[currentPlan.id]?.isPaused : false;

      let lateItems: ScheduledItem[] = [];
      if (isToday) {
          const today = getTodayStr();
          Object.keys(schedule).forEach(date => {
              if (date < today) {
                  const uncompleted = schedule[date].filter(i => !i.completed && !isSimuladoCompleted(i.goalId, attempts));
                  lateItems = [...lateItems, ...uncompleted];
              }
          });
      }

      if (!currentPlan) return <div className="text-center p-10 text-gray-500">Selecione um plano no menu lateral para começar.</div>;
      if (isPlanPaused) return <div className="text-center p-20 text-yellow-500">PLANO PAUSADO</div>;

      return (
          <div className="w-full animate-fade-in space-y-6">
              {isToday && lateItems.length > 0 && (
                  <div className="bg-insanus-red/10 border border-insanus-red/50 rounded-xl p-4 animate-pulse-slow">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="text-xl font-black text-insanus-red uppercase flex items-center gap-2">
                              <Icon.Clock className="w-6 h-6"/> METAS EM ATRASO ({lateItems.length})
                          </h3>
                          <button 
                              onClick={() => {
                                  // eslint-disable-next-line no-restricted-globals
                                  if(confirm("Isso irá mover todas as metas atrasadas e futuras para começar a partir de hoje. Continuar?")) {
                                      handlePlanAction('reschedule');
                                  }
                              }} 
                              className="bg-insanus-red hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-neon flex items-center gap-2"
                          >
                              <Icon.RefreshCw className="w-4 h-4"/> REPLANEJAR TUDO
                          </button>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                          {lateItems.map((item, idx) => (
                              <div key={`${item.uniqueId}_late_${idx}`} className="flex items-center justify-between bg-black/40 p-2 rounded border border-insanus-red/20">
                                  <div className="flex flex-col">
                                      <span className="text-white font-bold text-sm">{item.title}</span>
                                      <span className="text-[10px] text-gray-400">{item.disciplineName} • {formatDate(item.date)}</span>
                                  </div>
                                  <span className="text-[10px] bg-insanus-red/20 text-insanus-red px-2 py-1 rounded font-bold">{item.goalType}</span>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              <div className="flex justify-between items-end border-b border-[#333] pb-4">
                  <div>
                      <h2 className="text-4xl font-black text-white uppercase tracking-tight">{isToday ? 'HOJE' : formatDate(selectedDate)}</h2>
                      <p className="text-insanus-red font-mono text-sm uppercase">{WEEKDAYS.find(w => w.key === dayName)?.label}</p>
                  </div>
                  <div className="text-right">
                      <div className="text-3xl font-black text-white">{daySchedule.length}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold">Metas</div>
                  </div>
              </div>

              {daySchedule.length === 0 ? (
                   <div className="text-center py-20 text-gray-600 italic">Nada agendado para hoje.</div>
              ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                      {daySchedule.map((item) => {
                          const goalColor = item.goalType === 'SIMULADO' ? '#3B82F6' : (item.originalGoal?.color || '#FF1F1F');
                          const isActive = activeGoalId === item.goalId;
                          const isExpanded = expandedItems.includes(item.uniqueId);
                          
                          if (item.goalType === 'SIMULADO') {
                              return (
                                <div key={item.uniqueId} className="bg-blue-900/10 border border-blue-500 rounded-xl p-6 relative overflow-hidden group hover:bg-blue-900/20 transition-all">
                                    <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="bg-blue-500 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">META DE SIMULADO</span>
                                                <span className="text-blue-400 text-xs font-mono">{item.duration} min est.</span>
                                            </div>
                                            <h3 className="text-2xl font-black text-white mb-1">{item.title}</h3>
                                            <p className="text-gray-400 text-sm">{item.subjectName}</p>
                                        </div>
                                        <Icon.List className="w-10 h-10 text-blue-500 opacity-20 group-hover:opacity-50 transition-opacity"/>
                                    </div>
                                    <div className="mt-6 flex gap-4">
                                        <button 
                                            onClick={() => setActiveSimulado(item.simuladoData || null)}
                                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-bold text-sm uppercase shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-all transform hover:scale-105 flex items-center gap-2"
                                        >
                                            <Icon.Play className="w-4 h-4"/> REALIZAR SIMULADO AGORA
                                        </button>
                                    </div>
                                </div>
                              );
                          }

                          return (
                            <div key={item.uniqueId} className={`bg-[#121212] rounded-xl border-l-4 transition-all ${item.completed ? 'border-green-500 opacity-60' : isActive ? 'border-yellow-500 bg-yellow-900/10' : ''}`} style={{ borderLeftColor: item.completed ? undefined : isActive ? '#EAB308' : goalColor }}>
                                <div className="p-4 flex items-start gap-4 border border-[#333] rounded-r-xl border-l-0 h-full">
                                    <div onClick={() => toggleGoalComplete(item.goalId)} className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer transition ${item.completed ? 'bg-green-500 border-green-500 text-black' : 'border-gray-500 hover:border-white'}`}>
                                        {item.completed && <Icon.Check className="w-4 h-4" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-[10px] font-bold bg-white/10 px-2 py-0.5 rounded text-gray-300 uppercase">{item.goalType}</span>
                                            {isActive ? <span className="text-sm font-mono font-bold text-yellow-500 animate-pulse">{formatStopwatch(timerSeconds)}</span> : <span className="text-[10px] font-mono text-gray-500">{item.duration} min</span>}
                                        </div>
                                        <h3 className={`font-bold text-lg ${item.completed ? 'line-through text-gray-500' : 'text-white'}`}>{item.title}</h3>
                                        <div className="text-xs text-gray-400 mt-1 flex gap-2">
                                            <span style={{ color: isActive ? '#EAB308' : goalColor }} className="font-bold">{item.disciplineName}</span>
                                            <span>•</span>
                                            <span>{item.subjectName}</span>
                                        </div>
                                        
                                        {!item.completed && (
                                            <div className="mt-4 flex gap-2">
                                                {!isActive ? (
                                                    <button onClick={() => startTimer(item.goalId)} className="flex items-center gap-2 bg-insanus-red hover:bg-red-600 px-4 py-2 rounded text-xs font-bold text-white transition shadow-neon"><Icon.Play className="w-3 h-3" /> INICIAR</button>
                                                ) : (
                                                    <>
                                                        {isTimerRunning ? <button onClick={pauseTimer} className="flex items-center gap-2 bg-yellow-600 px-4 py-2 rounded text-xs font-bold text-white"><Icon.Pause className="w-3 h-3" /> PAUSAR</button> : <button onClick={() => setIsTimerRunning(true)} className="flex items-center gap-2 bg-green-600 px-4 py-2 rounded text-xs font-bold text-white"><Icon.Play className="w-3 h-3" /> RETOMAR</button>}
                                                        <button onClick={() => saveStudyTime(false)} className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded text-xs font-bold text-white"><Icon.Check className="w-3 h-3" /> SALVAR TEMPO</button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        
                                        {item.goalType === 'AULA' && (
                                            <div className="mt-4">
                                                <button onClick={() => toggleAccordion(item.uniqueId)} className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition">
                                                    {isExpanded ? <Icon.ArrowUp className="w-4 h-4"/> : <Icon.ArrowDown className="w-4 h-4"/>}
                                                    {isExpanded ? 'OCULTAR AULAS' : `VER ${item.originalGoal?.subGoals?.length || 0} AULAS`}
                                                </button>
                                                {isExpanded && (
                                                    <div className="mt-3 space-y-2 border-t border-[#333] pt-3 animate-fade-in">
                                                        {item.originalGoal?.subGoals?.map((sub, sIdx) => (
                                                            <div key={sIdx} className="flex justify-between items-center bg-black/30 p-2 rounded border border-[#333]">
                                                                <span className="text-sm text-gray-300 font-medium">{sIdx + 1}. {sub.title}</span>
                                                                {sub.link && <a href={sub.link} target="_blank" rel="noreferrer" className="bg-insanus-red p-2 rounded-lg text-white"><Icon.Play className="w-3 h-3" /></a>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                          );
                      })}
                  </div>
              )}
          </div>
      );
  };

  const renderCalendarView = () => {
    // ... Calendar View Content (No Changes needed here) ...
    const weekDates = getWeekDays(selectedDate);
    const generateMonthGrid = () => {
        const date = new Date(selectedDate);
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const startDay = firstDay.getDay();
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - startDay);
        const grid = [];
        for(let i=0; i<42; i++) {
             const d = new Date(startDate);
             d.setDate(d.getDate() + i);
             grid.push(d.toISOString().split('T')[0]);
        }
        return grid;
    };

    const monthDates = generateMonthGrid();
    const currentMonthName = new Date(selectedDate).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    const todayStr = getTodayStr();

    return (
        <div className="w-full animate-fade-in h-[calc(100vh-100px)] flex flex-col">
             <div className="flex justify-between items-center border-b border-[#333] pb-6 shrink-0">
                <div>
                    <h2 className="text-3xl font-black text-white uppercase">CALENDÁRIO</h2>
                    <p className="text-xs text-insanus-red font-bold uppercase tracking-widest">{currentMonthName}</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex bg-[#121212] rounded-lg p-1 border border-[#333]">
                        <button onClick={() => setCalendarMode('week')} className={`px-4 py-2 text-xs font-bold rounded transition-all ${calendarMode === 'week' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:text-white'}`}>SEMANAL</button>
                        <button onClick={() => setCalendarMode('month')} className={`px-4 py-2 text-xs font-bold rounded transition-all ${calendarMode === 'month' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:text-white'}`}>MENSAL</button>
                    </div>
                    <div className="flex gap-1 bg-[#121212] rounded-lg border border-[#333] p-1">
                        <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - (calendarMode === 'week' ? 7 : 30)); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-white/10 rounded text-white transition"><Icon.ArrowUp className="-rotate-90 w-4 h-4" /></button>
                        <button onClick={() => setSelectedDate(getTodayStr())} className="px-3 py-2 hover:bg-white/10 rounded text-[10px] font-bold text-white uppercase transition border-x border-white/5">Hoje</button>
                        <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + (calendarMode === 'week' ? 7 : 30)); setSelectedDate(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-white/10 rounded text-white transition"><Icon.ArrowDown className="-rotate-90 w-4 h-4" /></button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-2 mt-4 text-center shrink-0">
                {WEEKDAYS.map(d => <div key={d.key} className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{d.label.split('-')[0]}</div>)}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                {calendarMode === 'week' ? (
                    <div className="grid grid-cols-7 gap-2 h-full min-h-[600px]">
                        {weekDates.map(dateStr => {
                            const items = schedule[dateStr] || [];
                            const isSelected = selectedDate === dateStr;
                            const isToday = dateStr === getTodayStr();
                            const hasLateGoals = dateStr < todayStr && items.some(i => !i.completed);

                            return (
                                <div key={dateStr} onClick={() => { setSelectedDate(dateStr); setView('daily'); }} className={`rounded-xl border flex flex-col transition-all cursor-pointer group h-full bg-[#121212] ${isSelected ? 'bg-[#1E1E1E] border-insanus-red shadow-[inset_0_0_20px_rgba(255,31,31,0.1)]' : 'border-[#333] hover:border-[#555] hover:bg-[#1A1A1A]'} ${isToday ? 'ring-1 ring-insanus-red ring-offset-2 ring-offset-black' : ''} ${hasLateGoals ? 'border-red-500/50 bg-red-900/10' : ''}`}>
                                    <div className={`text-center p-3 border-b border-[#333] ${isToday ? 'bg-insanus-red text-white' : 'bg-[#1A1A1A]'} relative`}>
                                        <div className="text-2xl font-black">{dateStr.split('-')[2]}</div>
                                        {hasLateGoals && <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_5px_red] animate-pulse"></div>}
                                    </div>
                                    <div className="flex-1 p-2 space-y-2 overflow-y-auto custom-scrollbar">
                                        {items.map((item, i) => {
                                            const goalColor = item.goalType === 'SIMULADO' ? '#3B82F6' : (item.originalGoal?.color || '#FF1F1F');
                                            return (
                                                <div key={i} className={`p-3 rounded-lg border-l-4 bg-black shadow-lg hover:translate-y-[-2px] transition-all ${item.completed ? 'opacity-50 grayscale' : ''}`} style={{ borderLeftColor: goalColor, borderTop: '1px solid #333', borderRight: '1px solid #333', borderBottom: '1px solid #333' }}>
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: goalColor }}>{item.disciplineName}</span>
                                                        {item.completed && <Icon.Check className="w-3 h-3 text-green-500" />}
                                                    </div>
                                                    <div className="text-xs font-bold text-white leading-snug line-clamp-3 mb-2">{item.title}</div>
                                                    <div className="flex items-center gap-2 mt-auto">
                                                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[8px] font-mono text-gray-400">{item.duration}m</span>
                                                        <span className="text-[8px] uppercase font-bold text-gray-500">{item.goalType}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="grid grid-cols-7 gap-2 h-full grid-rows-6">
                        {monthDates.map(dateStr => {
                            const items = schedule[dateStr] || [];
                            const isSelected = selectedDate === dateStr;
                            const isToday = dateStr === getTodayStr();
                            const isCurrentMonth = dateStr.slice(0, 7) === selectedDate.slice(0, 7);
                            const hasLateGoals = dateStr < todayStr && items.some(i => !i.completed);

                            return (
                                <div key={dateStr} onClick={() => { setSelectedDate(dateStr); setView('daily'); }} className={`rounded-lg border p-2 flex flex-col transition-all cursor-pointer hover:bg-[#1A1A1A] min-h-[80px] ${isSelected ? 'bg-[#1E1E1E] border-insanus-red' : 'border-[#333] bg-[#121212]'} ${!isCurrentMonth ? 'opacity-30' : ''} ${hasLateGoals ? 'border-red-500/50' : ''}`}>
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="flex items-center gap-1">
                                            <span className={`text-xs font-bold ${isToday ? 'text-insanus-red bg-insanus-red/10 px-1.5 rounded' : 'text-gray-400'}`}>{dateStr.split('-')[2]}</span>
                                            {hasLateGoals && <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>}
                                        </div>
                                        {items.length > 0 && <span className="text-[9px] text-gray-600 font-mono">{items.length}</span>}
                                    </div>
                                    <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                                        {items.slice(0, 3).map((item, i) => (
                                            <div key={i} className="flex items-center gap-1">
                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.completed ? 'bg-green-500' : ''}`} style={{ backgroundColor: item.completed ? undefined : item.goalType === 'SIMULADO' ? '#3B82F6' : (item.originalGoal?.color || '#333') }}></div>
                                                <div className="text-[9px] text-gray-500 truncate leading-none">{item.disciplineName}</div>
                                            </div>
                                        ))}
                                        {items.length > 3 && <div className="text-[8px] text-gray-600 text-center font-bold mt-auto">+{items.length - 3} mais</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
  };

  const renderEditalView = () => {
      if (!currentPlan?.editalVerticalizado) return <div className="p-10 text-center text-gray-500">Edital Verticalizado não configurado neste plano.</div>;
      let totalTopics = 0;
      let completedTopics = 0;
      const ORDERED_LINKS = ['aula', 'material', 'questoes', 'leiSeca', 'resumo', 'revisao'];
      const findGoal = (goalId: string) => {
          for (const d of currentPlan.disciplines) {
              for (const s of d.subjects) {
                  const g = s.goals.find(g => g.id === goalId);
                  if (g) return g;
              }
          }
          return null;
      };
      const isTopicDone = (t: EditalTopic) => {
          const linkedGoalIds = ORDERED_LINKS.map(type => t.links[type as keyof typeof t.links]).filter(id => !!id) as string[];
          if (linkedGoalIds.length === 0) return false;
          const allGoalsDone = linkedGoalIds.every(gid => user.progress.completedGoalIds.includes(gid));
          if (!allGoalsDone) return false;
          return linkedGoalIds.every(gid => {
              const goal = findGoal(gid);
              if (goal && goal.hasRevision) {
                  const rev1 = user.progress.completedRevisionIds.includes(`${gid}_0`);
                  const rev2 = user.progress.completedRevisionIds.includes(`${gid}_1`);
                  return rev1 && rev2;
              }
              return true; 
          });
      };
      currentPlan.editalVerticalizado.forEach(d => d.topics.forEach(t => { totalTopics++; if (isTopicDone(t)) completedTopics++; }));
      const percentage = totalTopics === 0 ? 0 : Math.round((completedTopics / totalTopics) * 100);

      const toggleEditalExpand = (id: string) => {
          setEditalExpanded(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
      };

      return (
          <div className="w-full animate-fade-in space-y-8">
              <div className="flex items-center justify-between border-b border-[#333] pb-6">
                  <h2 className="text-3xl font-black text-white">EDITAL <span className="text-insanus-red">VERTICALIZADO</span></h2>
                  <div className="text-right"><div className="text-4xl font-black text-white">{percentage}%</div><div className="text-xs text-gray-500 uppercase font-bold">Concluído</div></div>
              </div>
              <div className="space-y-6">
                  {currentPlan.editalVerticalizado.map(disc => {
                      const discTotal = disc.topics.length;
                      const discDone = disc.topics.filter(t => isTopicDone(t)).length;
                      const discPerc = discTotal === 0 ? 0 : (discDone / discTotal) * 100;
                      const isExpanded = editalExpanded.includes(disc.id);

                      return (
                          <div key={disc.id} className="bg-[#121212] rounded-xl border border-[#333] overflow-hidden">
                              <div 
                                onClick={() => toggleEditalExpand(disc.id)}
                                className="bg-[#1E1E1E] p-4 cursor-pointer hover:bg-white/5 transition-colors"
                              >
                                  <div className="flex justify-between items-center mb-3">
                                      <div className="flex items-center gap-3">
                                          <Icon.ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                          <h3 className="font-bold text-white uppercase text-sm">{disc.name}</h3>
                                      </div>
                                      <div className="flex flex-col items-end">
                                          <span className={`text-sm font-black ${discPerc === 100 ? 'text-green-500' : 'text-insanus-red'}`}>{Math.round(discPerc)}%</span>
                                          <span className="text-[10px] font-mono text-gray-500">{discDone}/{discTotal}</span>
                                      </div>
                                  </div>
                                  
                                  {/* The Progress Bar */}
                                  <div className="w-full bg-black rounded-full h-2 overflow-hidden border border-white/5">
                                      <div 
                                          className={`h-full transition-all duration-1000 ${discPerc === 100 ? 'bg-green-600 shadow-[0_0_10px_rgba(22,163,74,0.5)]' : 'bg-insanus-red shadow-neon'}`} 
                                          style={{ width: `${discPerc}%` }}
                                      ></div>
                                  </div>
                              </div>
                              
                              {isExpanded && (
                                <div className="p-4 space-y-2 animate-fade-in">
                                    {disc.topics.map(topic => {
                                        const done = isTopicDone(topic);
                                        return (
                                            <div key={topic.id} className="flex flex-col gap-2 py-1 border-b border-[#333] last:border-0">
                                                <div className="flex items-center gap-3 text-sm group">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${done ? 'bg-green-600 border-green-600' : 'border-gray-600'}`}>{done && <Icon.Check className="w-3 h-3 text-white" />}</div>
                                                    <span className={done ? 'text-gray-500 line-through' : 'text-gray-300 group-hover:text-white transition'}>{topic.name}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2 ml-7">
                                                    {ORDERED_LINKS.map(type => {
                                                        const goalId = topic.links[type as keyof typeof topic.links];
                                                        if(!goalId) return null;
                                                        const goal = findGoal(goalId as string);
                                                        if(!goal) return null;
                                                        
                                                        const isGoalDone = user.progress.completedGoalIds.includes(goal.id);

                                                        let IconComp = Icon.FileText;
                                                        if(type === 'aula') IconComp = Icon.Play;
                                                        if(type === 'questoes') IconComp = Icon.Code;
                                                        if(type === 'leiSeca') IconComp = Icon.Book;
                                                        if(type === 'resumo') IconComp = Icon.Edit;
                                                        if(type === 'revisao') IconComp = Icon.RefreshCw;
                                                        
                                                        return (
                                                            <a key={type} 
                                                                href={goal.link || goal.pdfUrl} 
                                                                target="_blank" 
                                                                rel="noreferrer" 
                                                                className={`flex items-center gap-2 px-2 py-1 rounded border text-[10px] font-bold uppercase transition hover:brightness-125 ${isGoalDone ? '!border-green-500 !bg-green-500/10 !text-green-500' : ''}`}
                                                                style={{ 
                                                                    borderColor: isGoalDone ? undefined : goal.color || '#333', 
                                                                    color: isGoalDone ? undefined : goal.color || '#999', 
                                                                    backgroundColor: isGoalDone ? undefined : (goal.color || '#000') + '15' 
                                                                }}
                                                            >
                                                                <IconComp className="w-3 h-3"/>
                                                                {goal.title}
                                                                {isGoalDone && <Icon.Check className="w-3 h-3 ml-1" />}
                                                            </a>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                              )}
                          </div>
                      )
                  })}
              </div>
          </div>
      )
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#050505] text-gray-200">
        {/* ... Rest of UserDashboard JSX ... */}
        {activeSimulado && (
            <div className="absolute inset-0 z-[60]">
                <SimuladoRunner 
                    user={user} 
                    classId={activeSimulado ? simuladoClasses.find(c => c.simulados.some(s => s.id === activeSimulado.id))?.id || '' : ''}
                    simulado={activeSimulado} 
                    attempt={attempts.find(a => a.simuladoId === activeSimulado.id)}
                    onFinish={handleSimuladoFinished}
                    onBack={() => setActiveSimulado(null)}
                />
            </div>
        )}

        <div className="h-14 border-b border-[#333] bg-[#0F0F0F] flex items-center px-8 gap-8 shrink-0 overflow-x-auto custom-scrollbar z-20 shadow-sm">
             <div className="flex gap-6 flex-1">
                 <button onClick={() => setView('daily')} className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider py-4 border-b-2 transition-all ${view === 'daily' ? 'text-white border-insanus-red' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
                     <Icon.Check className="w-4 h-4"/> Metas de Hoje
                 </button>
                 <button onClick={() => setView('calendar')} className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider py-4 border-b-2 transition-all ${view === 'calendar' ? 'text-white border-insanus-red' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
                     <Icon.Calendar className="w-4 h-4"/> Calendário
                 </button>
                 <button onClick={() => setView('edital')} className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider py-4 border-b-2 transition-all ${view === 'edital' ? 'text-white border-insanus-red' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
                     <Icon.List className="w-4 h-4"/> Edital
                 </button>
                 <button onClick={() => setView('simulados')} className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider py-4 border-b-2 transition-all ${view === 'simulados' ? 'text-white border-insanus-red' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
                     <Icon.FileText className="w-4 h-4"/> Simulados
                 </button>
                 <button onClick={() => setView('setup')} className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider py-4 border-b-2 transition-all ${view === 'setup' ? 'text-white border-insanus-red' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
                     <Icon.Clock className="w-4 h-4"/> Configuração
                 </button>
             </div>
             
             <div className="flex items-center gap-4">
                 {plans.length > 1 && (
                     <select value={currentPlan?.id || ''} onChange={(e) => handleSelectPlan(e.target.value)} className="bg-black/50 border border-[#333] rounded p-1 text-[10px] text-white outline-none w-32 truncate">
                         {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                 )}
                 <div className="text-right hidden md:block">
                     <div className="text-[9px] text-gray-500 font-bold uppercase">Tempo Total</div>
                     <div className="text-xs font-black text-insanus-red font-mono">{formatSecondsToTime(user.progress.totalStudySeconds)}</div>
                 </div>
                 {(onReturnToAdmin || user.isAdmin) && (
                     <button onClick={onReturnToAdmin} className="text-gray-500 hover:text-white p-2 rounded-full hover:bg-white/5 transition" title="Voltar para Admin">
                         <Icon.LogOut className="w-4 h-4"/>
                     </button>
                 )}
             </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar relative bg-[#050505]">
            {user.isAdmin && <div className="absolute top-4 right-4 bg-insanus-red/20 border border-insanus-red text-insanus-red px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest pointer-events-none z-10">Modo Admin</div>}
            {view === 'setup' && <SetupWizard user={user} currentPlan={currentPlan} onSave={handleSetupSave} onPlanAction={handlePlanAction} onUpdateUser={onUpdateUser} />}
            {view === 'daily' && renderDailyView()}
            {view === 'calendar' && renderCalendarView()}
            {view === 'edital' && renderEditalView()}
            {view === 'simulados' && (
                <div className="w-full animate-fade-in space-y-10">
                    <h2 className="text-3xl font-black text-white mb-8 border-b border-[#333] pb-4">SIMULADOS</h2>
                    {simuladoClasses.map(sc => (
                        <div key={sc.id} className="bg-[#121212] rounded-xl p-6 border border-[#333]">
                            <h3 className="text-xl font-black text-white mb-4">{sc.name}</h3>
                            <div className="grid gap-4">{sc.simulados.map(sim => {
                                const attempt = attempts.find(a => a.simuladoId === sim.id);
                                return (
                                <div key={sim.id} className="bg-black/40 p-4 rounded-lg flex justify-between items-center border border-[#333]">
                                    <div>
                                        <h4 className="font-bold text-white">{sim.title}</h4>
                                        {attempt && <span className={`text-[10px] font-bold ${attempt.isApproved ? 'text-green-500' : 'text-red-500'}`}>{attempt.isApproved ? 'APROVADO' : 'REPROVADO'} ({attempt.score} pts)</span>}
                                    </div>
                                    <button onClick={() => setActiveSimulado(sim)} className="bg-insanus-red px-4 py-2 rounded text-xs font-bold text-white">
                                        {attempt ? 'VER RESULTADO' : 'ACESSAR'}
                                    </button>
                                </div>
                            )})}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};
