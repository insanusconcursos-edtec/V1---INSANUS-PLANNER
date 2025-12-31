import React, { useState, useEffect, useRef } from 'react';
import { User, StudyPlan, Routine, Goal, SubGoal, UserProgress, GoalType, PlanConfig, Discipline, Subject, UserLevel, SimuladoClass, Simulado, SimuladoAttempt, ScheduledItem } from '../types';
import { Icon } from '../components/Icons';
import { WEEKDAYS, calculateGoalDuration, uuid } from '../constants';
import { fetchPlansFromDB, saveUserToDB, fetchSimuladoClassesFromDB, fetchSimuladoAttemptsFromDB, saveSimuladoAttemptToDB } from '../services/db';

interface Props {
  user: User;
  onUpdateUser: (user: User) => void;
  onReturnToAdmin?: () => void;
}

// --- HELPER: DATE & TIME UTILS ---
const getTodayStr = () => new Date().toISOString().split('T')[0];

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
                // Penalidade simplificada: anula o valor da questão
                score -= val;
            }
        }
        if (score < 0) score = 0;

        const totalPoints = Object.values(simulado.questionValues).reduce((a,b)=>a+b, 0) || simulado.totalQuestions;
        const percent = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
        const isApproved = simulado.minTotalPercent ? percent >= simulado.minTotalPercent : percent >= 50;

        const result: SimuladoAttempt = {
            id: attempt?.id || uuid(),
            userId: user.id,
            simuladoId: simulado.id,
            classId: classId,
            date: new Date().toISOString(),
            answers,
            diagnosisReasons: {}, // Implementar se necessário UI de diagnóstico
            score,
            isApproved
        };

        onFinish(result);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black text-white flex flex-col animate-fade-in">
             {/* Header */}
             <div className="h-16 border-b border-white/10 bg-insanus-black flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="text-gray-500 hover:text-white flex items-center gap-2">
                        <Icon.ArrowUp className="-rotate-90 w-5 h-5" /> <span className="text-xs font-bold uppercase">Sair</span>
                    </button>
                    <div className="h-6 w-px bg-white/10"></div>
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

             {/* Confirmation Modal */}
             {confirmFinish && (
                 <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center p-4">
                     <div className="bg-black border border-white/10 p-8 rounded-xl max-w-sm w-full text-center">
                         <h3 className="text-xl font-bold text-white mb-2">Tem certeza?</h3>
                         <p className="text-gray-400 text-sm mb-6">Ao finalizar, você não poderá alterar suas respostas.</p>
                         <div className="flex gap-4">
                             <button onClick={() => setConfirmFinish(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded font-bold text-xs">VOLTAR</button>
                             <button onClick={finishSimulado} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded font-bold text-xs">CONFIRMAR</button>
                         </div>
                     </div>
                 </div>
             )}

             {/* Content */}
             <div className="flex-1 flex overflow-hidden">
                {/* PDF Area (if exists) */}
                {simulado.pdfUrl && (
                    <div className="w-1/2 border-r border-white/10 bg-gray-900 flex flex-col">
                        <div className="flex-1 flex items-center justify-center text-gray-500">
                             {/* In a real app, render PDF here. For now, a placeholder or iframe if link is direct */}
                             <iframe src={simulado.pdfUrl} className="w-full h-full" title="PDF Viewer"></iframe>
                        </div>
                    </div>
                )}

                {/* Question Grid */}
                <div className={`${simulado.pdfUrl ? 'w-1/2' : 'w-full max-w-4xl mx-auto'} flex flex-col bg-black/50`}>
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
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
                                    <div key={qNum} className="glass p-4 rounded-xl border border-white/5">
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
                                                                : 'bg-black border border-white/20 text-gray-400 hover:border-white'
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
                                                                : 'bg-black border border-white/20 text-gray-400 hover:border-white'
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

// --- COMPONENT: SETUP & MANAGEMENT ---
const SetupWizard = ({ user, currentPlan, onSave, onPlanAction }: { user: User, currentPlan: StudyPlan | null, onSave: (r: Routine, l: UserLevel) => void, onPlanAction: (action: 'pause' | 'reschedule') => void }) => {
    const [days, setDays] = useState(user.routine?.days || {});
    const [level, setLevel] = useState<UserLevel>(user.level || 'iniciante');

    const handleDayChange = (key: string, val: string) => {
        setDays(prev => ({ ...prev, [key]: parseInt(val) || 0 }));
    };

    const isPlanPaused = currentPlan ? user.planConfigs?.[currentPlan.id]?.isPaused : false;

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in mt-4">
            
            {/* PLAN MANAGEMENT CARD */}
            {currentPlan && (
                <div className="glass p-6 rounded-2xl border border-white/10 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-insanus-red"></div>
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Icon.Edit className="w-5 h-5"/> GESTÃO DO PLANO ATUAL</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
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

                        <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                            <h4 className="font-bold text-gray-300 text-sm mb-2">ATRASOS E IMPREVISTOS</h4>
                            <p className="text-xs text-gray-500 mb-4">Replanejar define a data de início para HOJE, redistribuindo todas as metas pendentes.</p>
                            <button 
                                onClick={() => { if(confirm("Isso vai reorganizar todo o cronograma futuro a partir de hoje. Continuar?")) onPlanAction('reschedule'); }}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition"
                            >
                                <Icon.RefreshCw className="w-4 h-4"/>
                                REPLANEJAR ATRASOS
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ROUTINE SETUP */}
            <div className="glass p-8 rounded-2xl border border-white/10">
                <div className="text-center mb-10">
                    <Icon.Clock className="w-16 h-16 text-insanus-red mx-auto mb-4" />
                    <h2 className="text-3xl font-black text-white uppercase tracking-tight">Configuração de Rotina</h2>
                    <p className="text-gray-400 mt-2 text-sm">Defina seu ritmo e disponibilidade.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div>
                        <h3 className="text-lg font-bold text-white mb-4 border-b border-white/10 pb-2 flex items-center gap-2">
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
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${level === opt.id ? 'bg-insanus-red/20 border-insanus-red shadow-neon' : 'bg-black/40 border-white/5 hover:border-white/20'}`}
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
                        <h3 className="text-lg font-bold text-white mb-4 border-b border-white/10 pb-2 flex items-center gap-2">
                            <Icon.Calendar className="w-4 h-4 text-insanus-red"/> DISPONIBILIDADE (MIN)
                        </h3>
                        <div className="space-y-2">
                            {WEEKDAYS.map(d => (
                                <div key={d.key} className="flex items-center justify-between bg-black/40 p-2 px-3 rounded border border-white/5 hover:border-white/20 transition">
                                    <span className="text-xs font-bold text-gray-300 uppercase">{d.label}</span>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            value={days[d.key] || ''} 
                                            onChange={e => handleDayChange(d.key, e.target.value)}
                                            placeholder="0"
                                            className="w-16 bg-white/5 border border-white/10 rounded p-1 text-right text-white font-mono text-sm focus:border-insanus-red outline-none focus:bg-black"
                                        />
                                        <span className="text-[10px] text-gray-600">min</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <button onClick={() => onSave({ days }, level)} className="w-full mt-10 bg-insanus-red hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-neon transition transform hover:scale-[1.01] flex items-center justify-center gap-2">
                    <Icon.RefreshCw className="w-5 h-5"/> SALVAR ALTERAÇÕES
                </button>
            </div>
        </div>
    );
};

// --- SCHEDULE ENGINE ---
const generateSchedule = (plan: StudyPlan, routine: Routine, startDateStr: string, completedGoals: string[], userLevel: UserLevel, isPaused: boolean): Record<string, ScheduledItem[]> => {
    const schedule: Record<string, ScheduledItem[]> = {};
    
    // If paused, we basically return empty or handle it in UI. 
    // Returning empty here ensures the calendar/daily view is clear.
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

            const cycleItem = cycle.items[currentItemIndex];
            if (!cycleItem) {
                currentCycleIndex++;
                currentItemIndex = 0;
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
                if (pointer >= queue.length) {
                    break; 
                }

                const goal = queue[pointer];
                const duration = calculateGoalDuration(goal, userLevel) || 30;

                if (minutesAvailable >= duration || itemsProcessedToday === 0) {
                    const uniqueId = `${dateStr}_${cycle.id}_${cycleItem.disciplineId}_${goal.id}`;
                    
                    dayItems.push({
                         uniqueId,
                         date: dateStr,
                         goalId: goal.id,
                         goalType: goal.type,
                         title: goal.title,
                         disciplineName: (goal as any)._disciplineName || "Disciplina",
                         subjectName: (goal as any)._subjectName || "Assunto",
                         duration: duration,
                         isRevision: false,
                         completed: completedGoals.includes(goal.id),
                         originalGoal: goal
                    });

                    minutesAvailable -= duration;
                    itemsProcessedToday++;
                    
                    pointer++;
                    disciplinePointers[cycleItem.disciplineId] = pointer;
                    
                    scheduledForThisItem++;
                } else {
                    minutesAvailable = 0;
                    break;
                }
            }
            currentItemIndex++;
        }

        if (dayItems.length > 0) {
            schedule[dateStr] = dayItems;
        }
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
  
  // Timer State
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<any>(null);

  // Simulados Data
  const [simuladoClasses, setSimuladoClasses] = useState<SimuladoClass[]>([]);
  const [attempts, setAttempts] = useState<SimuladoAttempt[]>([]);
  const [activeSimulado, setActiveSimulado] = useState<Simulado | null>(null);

  // Calendar State
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
      
      if (currentPlan && hasRoutine) {
          const config = user.planConfigs?.[currentPlan.id];
          const startDate = config?.startDate || getTodayStr();
          const isPaused = config?.isPaused || false;

          const generated = generateSchedule(
              currentPlan, 
              user.routine, 
              startDate, 
              user.progress.completedGoalIds, 
              user.level || 'iniciante',
              isPaused
          );
          setSchedule(generated);
      } else {
          setSchedule({});
      }
  }, [currentPlan, user.routine, user.progress.completedGoalIds, user.level, user.planConfigs]);

  const loadData = async () => {
      // 1. Plans
      const allPlans = await fetchPlansFromDB();
      const userPlans = user.isAdmin ? allPlans : allPlans.filter(p => user.allowedPlans?.includes(p.id));
      setPlans(userPlans);

      // Select Plan
      let activePlan: StudyPlan | undefined;
      if (user.currentPlanId) {
          activePlan = userPlans.find(p => p.id === user.currentPlanId);
      }
      if (!activePlan && userPlans.length > 0) {
          activePlan = userPlans[0];
      }
      
      if (activePlan) {
          setCurrentPlan(activePlan);
          
          if (!user.planConfigs || !user.planConfigs[activePlan.id]) {
               const newConfigs = { ...user.planConfigs, [activePlan.id]: { startDate: getTodayStr(), isPaused: false }};
               const updatedUser = { ...user, planConfigs: newConfigs, currentPlanId: activePlan.id };
               onUpdateUser(updatedUser);
               saveUserToDB(updatedUser); 
          }
      }

      // 2. Simulados
      const allClasses = await fetchSimuladoClassesFromDB();
      const userClasses = user.isAdmin ? allClasses : allClasses.filter(c => user.allowedSimuladoClasses?.includes(c.id));
      setSimuladoClasses(userClasses);
      const allAttempts = await fetchSimuladoAttemptsFromDB();
      setAttempts(allAttempts);
      
      // 3. Check Routine
      const hasRoutine = user.routine && user.routine.days && Object.values(user.routine.days).some((v: number) => v > 0);
      if (!hasRoutine) {
          setView('setup'); 
      }
  };

  const handleSelectPlan = (planId: string) => {
      const p = plans.find(pl => pl.id === planId);
      if (p) {
          setCurrentPlan(p);
          const newConfigs = { ...user.planConfigs };
          if (!newConfigs[p.id]) {
              newConfigs[p.id] = { startDate: getTodayStr(), isPaused: false };
          }
          const updatedUser = { ...user, currentPlanId: planId, planConfigs: newConfigs };
          onUpdateUser(updatedUser);
          saveUserToDB(updatedUser);
      }
  };

  const handleSetupSave = async (routine: Routine, level: UserLevel) => {
      const updatedUser = { ...user, routine, level };
      
      if (currentPlan) {
           const newConfigs = { ...updatedUser.planConfigs };
           if (!newConfigs[currentPlan.id]) {
               newConfigs[currentPlan.id] = { startDate: getTodayStr(), isPaused: false };
           }
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
      
      if (action === 'pause') {
          newConfig.isPaused = !newConfig.isPaused;
      } else if (action === 'reschedule') {
          newConfig.startDate = getTodayStr(); // Reset start date to NOW
          newConfig.isPaused = false; // Unpause if rescheduling
      }

      const updatedUser = {
          ...user,
          planConfigs: { ...user.planConfigs, [currentPlan.id]: newConfig }
      };

      onUpdateUser(updatedUser);
      await saveUserToDB(updatedUser);
  };

  // --- TIMER ACTIONS ---
  const startTimer = (goalId: string) => {
      if (activeGoalId && activeGoalId !== goalId) {
          // Stop previous timer automatically
          saveStudyTime();
      }
      setActiveGoalId(goalId);
      setIsTimerRunning(true);
  };

  const pauseTimer = () => {
      setIsTimerRunning(false);
  };

  const saveStudyTime = async (shouldCompleteGoal: boolean = false) => {
      if (!activeGoalId || timerSeconds === 0) {
          if (shouldCompleteGoal && activeGoalId) toggleGoalComplete(activeGoalId);
          setActiveGoalId(null);
          setTimerSeconds(0);
          setIsTimerRunning(false);
          return;
      }

      // Persist Time
      const secondsToAdd = timerSeconds;
      const newTotal = (user.progress.totalStudySeconds || 0) + secondsToAdd;
      const currentPlanTotal = (user.progress.planStudySeconds?.[currentPlan?.id || ''] || 0) + secondsToAdd;
      
      const updatedUser = {
          ...user,
          progress: {
              ...user.progress,
              totalStudySeconds: newTotal,
              planStudySeconds: {
                  ...user.progress.planStudySeconds,
                  [currentPlan?.id || 'unknown']: currentPlanTotal
              }
          }
      };

      // Reset Timer State locally first
      setActiveGoalId(null);
      setTimerSeconds(0);
      setIsTimerRunning(false);

      // If we need to mark as complete
      if (shouldCompleteGoal && activeGoalId) {
          // Add to completed list
          if (!updatedUser.progress.completedGoalIds.includes(activeGoalId)) {
              updatedUser.progress.completedGoalIds.push(activeGoalId);
          }
      }

      onUpdateUser(updatedUser);
      await saveUserToDB(updatedUser);
  };

  const toggleGoalComplete = async (goalId: string) => {
      // If timer is running for THIS goal, save time and finish
      if (activeGoalId === goalId) {
          await saveStudyTime(true);
          return;
      }

      const isCompleted = user.progress.completedGoalIds.includes(goalId);
      let newCompleted = [...user.progress.completedGoalIds];
      
      if (isCompleted) {
          newCompleted = newCompleted.filter(id => id !== goalId);
      } else {
          newCompleted.push(goalId);
      }
      
      const updatedUser = {
          ...user,
          progress: { ...user.progress, completedGoalIds: newCompleted }
      };
      
      onUpdateUser(updatedUser);
      await saveUserToDB(updatedUser);
  };

  const toggleAccordion = (uniqueId: string) => {
      setExpandedItems(prev => prev.includes(uniqueId) ? prev.filter(id => id !== uniqueId) : [...prev, uniqueId]);
  }

  // --- RENDERERS ---

  const renderDailyView = () => {
      const daySchedule = schedule[selectedDate] || [];
      const isToday = selectedDate === getTodayStr();
      const dayName = getDayName(selectedDate);
      const minsAvailable = user.routine?.days?.[dayName] || 0;
      const isPlanPaused = currentPlan ? user.planConfigs?.[currentPlan.id]?.isPaused : false;

      if (!currentPlan) return <div className="text-center p-10 text-gray-500">Selecione um plano no menu lateral para começar.</div>;

      if (isPlanPaused) {
          return (
              <div className="flex flex-col items-center justify-center h-[50vh] animate-fade-in text-center">
                  <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mb-6">
                      <Icon.Pause className="w-10 h-10 text-yellow-500" />
                  </div>
                  <h2 className="text-3xl font-black text-white uppercase mb-2">PLANO PAUSADO</h2>
                  <p className="text-gray-500 max-w-md">Seu cronograma está congelado. Retome o plano nas configurações para voltar a ver suas metas diárias.</p>
                  <button onClick={() => setView('setup')} className="mt-6 bg-white/10 hover:bg-white/20 px-6 py-3 rounded-xl font-bold text-white transition">IR PARA CONFIGURAÇÕES</button>
              </div>
          )
      }

      if (currentPlan.cycles.length === 0) {
           return (
              <div className="p-8 border border-red-500/30 bg-red-900/10 rounded-xl text-center">
                  <h3 className="text-red-500 font-bold mb-2">PLANO SEM CICLOS DEFINIDOS</h3>
                  <p className="text-gray-400 text-sm">Este plano de estudo não possui ciclos de estudo configurados.</p>
              </div>
           );
      }

      if (minsAvailable === 0 && daySchedule.length === 0) {
          return (
              <div className="flex flex-col items-center justify-center p-10 border border-dashed border-white/10 rounded-xl animate-fade-in">
                  <Icon.Clock className="w-10 h-10 text-insanus-red mb-4" />
                  <h3 className="font-bold text-white text-lg">Dia sem estudos agendados</h3>
                  <p className="text-gray-500 mb-4 max-w-md text-center">Você definiu 0 minutos para {WEEKDAYS.find(w=>w.key===dayName)?.label}.</p>
                  <button onClick={() => setView('setup')} className="text-xs bg-white/10 hover:bg-white/20 px-4 py-2 rounded text-white font-bold uppercase transition">Ajustar Rotina</button>
              </div>
          );
      }

      return (
          <div className="max-w-4xl mx-auto animate-fade-in space-y-6">
              <div className="flex justify-between items-end border-b border-white/10 pb-4">
                  <div>
                      <h2 className="text-4xl font-black text-white uppercase tracking-tight">
                          {isToday ? 'HOJE' : formatDate(selectedDate)}
                      </h2>
                      <p className="text-insanus-red font-mono text-sm uppercase">{WEEKDAYS.find(w => w.key === dayName)?.label}</p>
                  </div>
                  <div className="text-right">
                      <div className="text-3xl font-black text-white">{daySchedule.length}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold">Metas</div>
                  </div>
              </div>

              {daySchedule.length === 0 ? (
                   <div className="text-center py-20 text-gray-600 italic border border-dashed border-white/5 rounded-xl">
                       <p className="mb-2">Nada agendado para hoje.</p>
                       <p className="text-xs">Verifique se as disciplinas do Ciclo possuem metas cadastradas.</p>
                   </div>
              ) : (
                  <div className="grid gap-4">
                      {daySchedule.map((item, idx) => {
                          const goalColor = item.originalGoal?.color || '#FF1F1F';
                          const isExpanded = expandedItems.includes(item.uniqueId);
                          const isActive = activeGoalId === item.goalId;

                          return (
                            <div key={item.uniqueId} className={`glass rounded-xl border-l-4 transition-all ${item.completed ? 'border-green-500 opacity-60' : isActive ? 'border-yellow-500 bg-yellow-500/5 shadow-neon' : 'hover:translate-x-1'}`} style={{ borderLeftColor: item.completed ? undefined : isActive ? '#EAB308' : goalColor }}>
                                <div className="p-4 flex items-start gap-4">
                                    <div onClick={() => toggleGoalComplete(item.goalId)} className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center cursor-pointer transition ${item.completed ? 'bg-green-500 border-green-500 text-black' : 'border-gray-500 hover:border-white'}`}>
                                        {item.completed && <Icon.Check className="w-4 h-4" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-[10px] font-bold bg-white/10 px-2 py-0.5 rounded text-gray-300 uppercase">{item.goalType}</span>
                                            {isActive ? (
                                                <span className="text-sm font-mono font-bold text-yellow-500 animate-pulse">{formatStopwatch(timerSeconds)}</span>
                                            ) : (
                                                <span className="text-[10px] font-mono text-gray-500">{item.duration} min</span>
                                            )}
                                        </div>
                                        <h3 className={`font-bold text-lg ${item.completed ? 'line-through text-gray-500' : 'text-white'}`}>{item.title}</h3>
                                        <div className="text-xs text-gray-400 mt-1 flex gap-2">
                                            <span style={{ color: isActive ? '#EAB308' : goalColor }} className="font-bold">{item.disciplineName}</span>
                                            <span>•</span>
                                            <span>{item.subjectName}</span>
                                        </div>
                                        
                                        {/* TIMER CONTROLS */}
                                        {!item.completed && (
                                            <div className="mt-4 flex gap-2">
                                                {!isActive ? (
                                                    <button onClick={() => startTimer(item.goalId)} className="flex items-center gap-2 bg-insanus-red hover:bg-red-600 px-4 py-2 rounded text-xs font-bold text-white transition shadow-neon">
                                                        <Icon.Play className="w-3 h-3" /> INICIAR
                                                    </button>
                                                ) : (
                                                    <>
                                                        {isTimerRunning ? (
                                                            <button onClick={pauseTimer} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded text-xs font-bold text-white transition">
                                                                <Icon.Pause className="w-3 h-3" /> PAUSAR
                                                            </button>
                                                        ) : (
                                                            <button onClick={() => setIsTimerRunning(true)} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 px-4 py-2 rounded text-xs font-bold text-white transition">
                                                                <Icon.Play className="w-3 h-3" /> RETOMAR
                                                            </button>
                                                        )}
                                                        <button onClick={() => saveStudyTime(false)} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-xs font-bold text-white transition">
                                                            <Icon.Check className="w-3 h-3" /> SALVAR TEMPO
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        
                                        {/* ACTION BUTTONS (NON-AULA) */}
                                        {item.goalType !== 'AULA' && (
                                            <div className="flex flex-wrap gap-2 mt-4 border-t border-white/5 pt-3">
                                                {item.originalGoal?.pdfUrl && (
                                                    <a href={item.originalGoal.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded text-xs font-bold text-white transition">
                                                        <Icon.FileText className="w-4 h-4 text-insanus-red" /> ABRIR MATERIAL
                                                    </a>
                                                )}
                                                {item.originalGoal?.link && (
                                                    <a href={item.originalGoal.link} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded text-xs font-bold text-white transition">
                                                        <Icon.Link className="w-4 h-4 text-blue-400" /> ACESSAR LINK
                                                    </a>
                                                )}
                                            </div>
                                        )}

                                        {/* ACCORDION (AULA) */}
                                        {item.goalType === 'AULA' && (
                                            <div className="mt-4">
                                                <button onClick={() => toggleAccordion(item.uniqueId)} className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition">
                                                    {isExpanded ? <Icon.ArrowUp className="w-4 h-4"/> : <Icon.ArrowDown className="w-4 h-4"/>}
                                                    {isExpanded ? 'OCULTAR AULAS' : `VER ${item.originalGoal?.subGoals?.length || 0} AULAS`}
                                                </button>
                                                
                                                {isExpanded && (
                                                    <div className="mt-3 space-y-2 border-t border-white/10 pt-3 animate-fade-in">
                                                        {item.originalGoal?.subGoals?.map((sub, sIdx) => (
                                                            <div key={sIdx} className="flex justify-between items-center bg-black/30 p-2 rounded border border-white/5">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] text-gray-500 font-mono">{sIdx + 1}</div>
                                                                    <span className="text-sm text-gray-300 font-medium">{sub.title}</span>
                                                                </div>
                                                                {sub.link && (
                                                                    <a href={sub.link} target="_blank" rel="noreferrer" className="bg-insanus-red hover:bg-red-600 text-white p-2 rounded-lg transition">
                                                                        <Icon.Play className="w-3 h-3" />
                                                                    </a>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {(!item.originalGoal?.subGoals || item.originalGoal.subGoals.length === 0) && (
                                                            <div className="text-xs text-gray-600 italic">Nenhuma submeta cadastrada.</div>
                                                        )}
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
      const weekDates = getWeekDays(selectedDate);
      const isPlanPaused = currentPlan ? user.planConfigs?.[currentPlan.id]?.isPaused : false;

      if(isPlanPaused) return <div className="text-center p-20 text-yellow-500 font-bold">PLANO PAUSADO</div>;

      const generateMonthGrid = () => {
          const start = new Date(selectedDate);
          start.setDate(1); 
          const day = start.getDay();
          start.setDate(start.getDate() - day);
          const grid = [];
          for(let i=0; i<35; i++) {
               const d = new Date(start);
               d.setDate(d.getDate() + i);
               grid.push(d.toISOString().split('T')[0]);
          }
          return grid;
      };
      const monthDates = generateMonthGrid();

      return (
          <div className="max-w-7xl mx-auto animate-fade-in h-[calc(100vh-100px)] flex flex-col">
              <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4 shrink-0">
                  <h2 className="text-3xl font-black text-white">CALENDÁRIO</h2>
                  <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                      <button onClick={() => setCalendarMode('week')} className={`px-4 py-1 text-xs font-bold rounded ${calendarMode === 'week' ? 'bg-insanus-red text-white' : 'text-gray-400 hover:text-white'}`}>SEMANAL</button>
                      <button onClick={() => setCalendarMode('month')} className={`px-4 py-1 text-xs font-bold rounded ${calendarMode === 'month' ? 'bg-insanus-red text-white' : 'text-gray-400 hover:text-white'}`}>MENSAL</button>
                  </div>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {calendarMode === 'week' ? (
                      <div className="grid grid-cols-7 gap-2 h-full min-h-[500px]">
                          {weekDates.map((date, i) => {
                              const items = schedule[date] || [];
                              const isToday = date === getTodayStr();
                              const isSelected = date === selectedDate;
                              
                              return (
                                  <div key={date} className={`flex flex-col rounded-xl overflow-hidden border transition-all ${isToday ? 'border-insanus-red bg-insanus-red/5' : isSelected ? 'border-white/30 bg-white/5' : 'border-white/5 bg-black/20'}`}>
                                      <div className={`p-2 text-center border-b border-white/5 ${isToday ? 'bg-insanus-red text-white' : 'bg-white/5'}`}>
                                          <div className="text-[10px] font-bold uppercase">{['DOM','SEG','TER','QUA','QUI','SEX','SAB'][new Date(date+'T12:00:00').getDay()]}</div>
                                          <div className="text-lg font-black">{date.split('-')[2]}</div>
                                      </div>
                                      <div 
                                        className="flex-1 p-2 space-y-2 overflow-y-auto cursor-pointer"
                                        onClick={() => { setSelectedDate(date); setView('daily'); }}
                                      >
                                          {items.map((item, idx) => {
                                              const goalColor = item.originalGoal?.color || '#FF1F1F';
                                              return (
                                                  <div 
                                                    key={idx} 
                                                    className={`p-2 rounded text-[10px] border flex flex-col gap-1 transition ${item.completed ? 'bg-green-900/30 border-green-800 text-green-400 line-through' : 'bg-black border-white/10 text-gray-300 hover:border-white'}`}
                                                    style={{ borderColor: item.completed ? undefined : goalColor }}
                                                  >
                                                      <div className="font-bold truncate" style={{ color: item.completed ? undefined : goalColor }}>{item.disciplineName}</div>
                                                      <div className="truncate opacity-70 leading-tight">{item.title}</div>
                                                  </div>
                                              );
                                          })}
                                          {items.length === 0 && <div className="text-[9px] text-center text-gray-600 mt-4">-</div>}
                                      </div>
                                  </div>
                              )
                          })}
                      </div>
                  ) : (
                      <div className="grid grid-cols-7 gap-2">
                          {monthDates.map((date) => {
                              const items = schedule[date] || [];
                              const isSelected = date === selectedDate;
                              const isToday = date === getTodayStr();
                              return (
                                  <div 
                                    key={date} 
                                    onClick={() => { setSelectedDate(date); setView('daily'); }}
                                    className={`h-24 p-2 rounded-lg border cursor-pointer hover:bg-white/5 flex flex-col justify-between ${isSelected ? 'border-insanus-red bg-insanus-red/10' : isToday ? 'border-white bg-white/10' : 'border-white/5 bg-black/20'}`}
                                  >
                                      <div className={`text-right text-xs font-bold ${isToday ? 'text-insanus-red' : 'text-gray-500'}`}>{date.split('-')[2]}</div>
                                      <div className="flex flex-wrap gap-1 content-end">
                                          {items.slice(0, 6).map((item, i) => {
                                               const goalColor = item.originalGoal?.color || '#FF1F1F';
                                               return (
                                                  <div 
                                                    key={i} 
                                                    className={`w-2 h-2 rounded-full ${item.completed ? 'bg-green-500' : ''}`} 
                                                    style={{ backgroundColor: item.completed ? undefined : goalColor }}
                                                    title={item.title}
                                                  ></div>
                                               );
                                          })}
                                          {items.length > 6 && <div className="w-2 h-2 rounded-full bg-gray-500 text-[6px] flex items-center justify-center text-white">+</div>}
                                      </div>
                                  </div>
                              )
                          })}
                      </div>
                  )}
              </div>
          </div>
      )
  };

  const renderEditalView = () => {
      if (!currentPlan?.editalVerticalizado) return <div className="p-10 text-center text-gray-500">Edital Verticalizado não configurado neste plano.</div>;
      
      let totalTopics = 0;
      let completedTopics = 0;

      const isTopicDone = (t: any) => {
          const linkedGoals = Object.values(t.links || {}).filter(Boolean) as string[];
          if (linkedGoals.length === 0) return false;
          return linkedGoals.some(gid => user.progress.completedGoalIds.includes(gid));
      };

      currentPlan.editalVerticalizado.forEach(d => {
          d.topics.forEach(t => {
              totalTopics++;
              if (isTopicDone(t)) completedTopics++;
          });
      });
      
      const percentage = totalTopics === 0 ? 0 : Math.round((completedTopics / totalTopics) * 100);

      return (
          <div className="max-w-4xl mx-auto animate-fade-in space-y-8">
              <div className="flex items-center justify-between border-b border-white/10 pb-6">
                  <h2 className="text-3xl font-black text-white">EDITAL <span className="text-insanus-red">VERTICALIZADO</span></h2>
                  <div className="text-right">
                      <div className="text-4xl font-black text-white">{percentage}%</div>
                      <div className="text-xs text-gray-500 uppercase font-bold">Concluído</div>
                  </div>
              </div>

              <div className="space-y-6">
                  {currentPlan.editalVerticalizado.map(disc => {
                      const discTotal = disc.topics.length;
                      const discDone = disc.topics.filter(t => isTopicDone(t)).length;
                      const discPerc = discTotal === 0 ? 0 : (discDone / discTotal) * 100;

                      return (
                          <div key={disc.id} className="glass rounded-xl border border-white/5 overflow-hidden">
                              <div className="bg-white/5 p-4 flex justify-between items-center cursor-pointer hover:bg-white/10">
                                  <h3 className="font-bold text-white uppercase">{disc.name}</h3>
                                  <div className="text-xs font-mono text-gray-400">{discDone}/{discTotal}</div>
                              </div>
                              <div className="h-1 w-full bg-black">
                                  <div className="h-full bg-insanus-red transition-all duration-1000" style={{ width: `${discPerc}%` }}></div>
                              </div>
                              <div className="p-4 space-y-2">
                                  {disc.topics.map(topic => {
                                      const done = isTopicDone(topic);
                                      return (
                                          <div key={topic.id} className="flex items-center gap-3 text-sm group">
                                              <div className={`w-4 h-4 rounded border flex items-center justify-center ${done ? 'bg-green-600 border-green-600' : 'border-gray-600'}`}>
                                                  {done && <Icon.Check className="w-3 h-3 text-white" />}
                                              </div>
                                              <span className={done ? 'text-gray-500 line-through' : 'text-gray-300 group-hover:text-white transition'}>{topic.name}</span>
                                          </div>
                                      )
                                  })}
                              </div>
                          </div>
                      )
                  })}
              </div>
          </div>
      )
  };

  if (activeSimulado) {
       const attempt = attempts.find(a => a.userId === user.id && a.simuladoId === activeSimulado.id);
       const parentClass = simuladoClasses.find(c => c.simulados.some(s => s.id === activeSimulado.id));
       return <SimuladoRunner 
          user={user}
          classId={parentClass?.id || ''}
          simulado={activeSimulado} 
          attempt={attempt} 
          onFinish={async (ans) => { 
               const newAttempts = [...attempts.filter(a => a.id !== ans.id), ans];
               setAttempts(newAttempts);
               await saveSimuladoAttemptToDB(ans);
               setActiveSimulado(null);
          }} 
          onBack={() => setActiveSimulado(null)} 
       />;
  }

  return (
    <div className="flex h-full w-full bg-insanus-black text-gray-200">
        <div className="w-20 lg:w-64 bg-black/50 border-r border-white/10 flex flex-col shrink-0 z-30 backdrop-blur-md">
             <div className="p-6 border-b border-white/5"><h1 className="font-black text-white text-lg">INSANUS</h1></div>
             <nav className="p-4 space-y-2 flex-1">
                 {plans.length > 1 && (
                     <div className="mb-6 px-2">
                         <label className="text-[10px] uppercase font-bold text-gray-500 mb-2 block">Plano Ativo</label>
                         <select 
                            value={currentPlan?.id || ''} 
                            onChange={(e) => handleSelectPlan(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-white outline-none"
                         >
                             {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                         </select>
                     </div>
                 )}

                 <button onClick={() => setView('daily')} className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${view === 'daily' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                     <Icon.Check className="w-5 h-5" />
                     <span className="hidden lg:block font-bold text-sm">Metas de Hoje</span>
                 </button>
                 <button onClick={() => setView('calendar')} className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${view === 'calendar' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                     <Icon.Calendar className="w-5 h-5" />
                     <span className="hidden lg:block font-bold text-sm">Calendário</span>
                 </button>
                 <button onClick={() => setView('edital')} className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${view === 'edital' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                     <Icon.List className="w-5 h-5" />
                     <span className="hidden lg:block font-bold text-sm">Edital Verticalizado</span>
                 </button>
                 <button onClick={() => setView('simulados')} className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${view === 'simulados' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                     <Icon.FileText className="w-5 h-5" />
                     <span className="hidden lg:block font-bold text-sm">Simulados</span>
                 </button>
                 <button onClick={() => setView('setup')} className={`w-full text-left p-4 rounded-xl flex items-center gap-4 transition-all ${view === 'setup' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
                     <Icon.Clock className="w-5 h-5" />
                     <span className="hidden lg:block font-bold text-sm">Configuração</span>
                 </button>
             </nav>
             
             {/* STATS AREA */}
             <div className="p-4 border-t border-white/5 bg-black/20">
                 <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Tempo Total Estudado</div>
                 <div className="text-xl font-black text-white">{formatSecondsToTime(user.progress.totalStudySeconds)}</div>
                 {currentPlan && user.progress.planStudySeconds?.[currentPlan.id] && (
                     <div className="text-[9px] text-insanus-red mt-1 font-mono">
                         Neste Plano: {formatSecondsToTime(user.progress.planStudySeconds[currentPlan.id])}
                     </div>
                 )}
             </div>

             {(onReturnToAdmin || user.isAdmin) && (
                 <div className="p-4 border-t border-white/5">
                     <button onClick={onReturnToAdmin} className="w-full bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-xl flex items-center justify-center lg:justify-start gap-3 transition-all border border-transparent hover:border-gray-600 shadow-lg group">
                        <Icon.LogOut className="w-5 h-5 text-insanus-red group-hover:scale-110 transition-transform" />
                        <span className="hidden lg:block font-bold text-sm uppercase">Voltar p/ Admin</span>
                     </button>
                 </div>
             )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
            {user.isAdmin && (
                <div className="absolute top-4 right-4 bg-insanus-red/20 border border-insanus-red text-insanus-red px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest pointer-events-none z-10">
                    Modo Admin
                </div>
            )}

            {view === 'setup' && <SetupWizard user={user} currentPlan={currentPlan} onSave={handleSetupSave} onPlanAction={handlePlanAction} />}
            {view === 'daily' && renderDailyView()}
            {view === 'calendar' && renderCalendarView()}
            {view === 'edital' && renderEditalView()}
            {view === 'simulados' && (
                <div className="max-w-6xl mx-auto space-y-10 animate-fade-in">
                    <h2 className="text-3xl font-black text-white mb-8 border-b border-white/10 pb-4">SIMULADOS</h2>
                    {simuladoClasses.map(sc => (
                        <div key={sc.id} className="glass rounded-xl p-6 border border-white/5">
                            <h3 className="text-xl font-black text-white mb-4">{sc.name}</h3>
                            <div className="grid gap-4">
                                {sc.simulados.map(sim => (
                                    <div key={sim.id} className="bg-black/40 p-4 rounded-lg flex justify-between items-center border border-white/5">
                                        <h4 className="font-bold text-white">{sim.title}</h4>
                                        <button onClick={() => setActiveSimulado(sim)} className="bg-insanus-red px-4 py-2 rounded text-xs font-bold text-white">ACESSAR</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};