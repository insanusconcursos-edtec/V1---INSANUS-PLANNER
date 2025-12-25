import React, { useState, useEffect, useMemo } from 'react';
import { User, StudyPlan, ScheduledItem, Routine, Goal, SubGoal, UserProgress, GoalType, PlanConfig, Discipline, Subject, UserLevel } from '../types';
import { Icon } from '../components/Icons';
import { WEEKDAYS, calculateGoalDuration, uuid } from '../constants';
import { PDFViewer } from '../components/PDFViewer';
import { fetchPlansFromDB, saveUserToDB } from '../services/db';

interface Props {
  user: User;
  onUpdateUser: (user: User) => void;
  onReturnToAdmin?: () => void;
}

// --- NEW Logic for Granular Scheduling ---
const generateSchedule = (plan: StudyPlan, routine: Routine, user: User): Record<string, ScheduledItem[]> => {
    const schedule: Record<string, ScheduledItem[]> = {};
    
    // Safety checks
    if (!plan || !routine || !routine.days) return {};

    // Get Plan Config (Start Date & Pause)
    const planConfig = user.planConfigs?.[plan.id] || { startDate: new Date().toISOString(), isPaused: false };
    
    // If Paused, return empty schedule (nothing scheduled in future)
    if (planConfig.isPaused) return {};

    // 1. Create a Flattened Queue of "Schedulable Units"
    interface SchedulableUnit {
        id: string; // unique ID for queue
        goal: Goal;
        subGoal?: SubGoal;
        discipline: string;
        subject: string;
        duration: number;
        originalDuration: number; // To track splits
        title: string;
        completed: boolean;
    }

    const queue: SchedulableUnit[] = [];

    if (plan.disciplines) {
        plan.disciplines.forEach(d => {
            if (d.subjects) {
                d.subjects.forEach(s => {
                    if (s.goals) {
                        s.goals.forEach(g => {
                            if (g.type === 'AULA' && g.subGoals && g.subGoals.length > 0) {
                                // Break down into SubGoals
                                g.subGoals.forEach(sub => {
                                    const compositeId = `${g.id}::${sub.id}`;
                                    const isDone = user.progress?.completedGoalIds?.includes(compositeId);
                                    
                                    // FILTER: Only add if NOT completed. 
                                    // This allows "Replan" (Start Date = Today) to effectively verify what is left to do.
                                    // Completed items effectively become "History" and are not re-scheduled.
                                    if (!isDone) {
                                        queue.push({
                                            id: compositeId,
                                            goal: g,
                                            subGoal: sub,
                                            discipline: d.name,
                                            subject: s.name,
                                            duration: sub.duration || 30,
                                            originalDuration: sub.duration || 30,
                                            title: sub.title,
                                            completed: false
                                        });
                                    }
                                });
                            } else {
                                // Standard Goal
                                const duration = calculateGoalDuration(g, user.level);
                                const isDone = user.progress?.completedGoalIds?.includes(g.id);
                                
                                if (!isDone) {
                                    queue.push({
                                        id: g.id,
                                        goal: g,
                                        discipline: d.name,
                                        subject: s.name,
                                        duration: duration,
                                        originalDuration: duration,
                                        title: g.title,
                                        completed: false
                                    });
                                }
                            }
                        });
                    }
                });
            }
        });
    }

    if (queue.length === 0) return {};

    // 2. Schedule the Queue
    // START DATE: Based on user's plan config (Replan sets this to Today)
    let currentDate = new Date(planConfig.startDate); 
    const todayStr = new Date().toISOString().split('T')[0];
    
    let queueIndex = 0;
    let safetyDays = 0;
    const MAX_DAYS = 365 * 2; 

    while (queueIndex < queue.length && safetyDays < MAX_DAYS) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayName = ['domingo','segunda','terca','quarta','quinta','sexta','sabado'][currentDate.getDay()];
        
        // Check if Late
        const isLate = dateStr < todayStr;

        let minutesCapacity = Number(routine.days[dayName]) || 0;
        let minutesUsed = 0;

        if (!schedule[dateStr]) schedule[dateStr] = [];

        if (minutesCapacity > 0) {
            while (queueIndex < queue.length) {
                const item = queue[queueIndex];
                const minutesRemaining = minutesCapacity - minutesUsed;

                if (minutesRemaining <= 0) break;

                // Case 1: Fits perfectly
                if (item.duration <= minutesRemaining) {
                    schedule[dateStr].push({
                        uniqueId: `${dateStr}_${item.id}_${uuid()}`,
                        date: dateStr,
                        goalId: item.goal.id,
                        subGoalId: item.subGoal?.id,
                        goalType: item.goal.type,
                        title: item.title,
                        disciplineName: item.discipline,
                        subjectName: item.subject,
                        duration: item.duration,
                        isRevision: false,
                        completed: item.completed,
                        originalGoal: item.goal,
                        isSplit: false,
                        isLate: isLate
                    });
                    minutesUsed += item.duration;
                    queueIndex++;
                }
                // Case 2: Fits in a FULL day, but not today (move to tomorrow)
                else if (item.duration <= minutesCapacity) {
                    break; 
                }
                // Case 3: Too big for any day (Split)
                else {
                    const partDuration = minutesRemaining;
                    
                    schedule[dateStr].push({
                        uniqueId: `${dateStr}_${item.id}_part1_${uuid()}`,
                        date: dateStr,
                        goalId: item.goal.id,
                        subGoalId: item.subGoal?.id,
                        goalType: item.goal.type,
                        title: `${item.title} (Parte 1)`,
                        disciplineName: item.discipline,
                        subjectName: item.subject,
                        duration: partDuration,
                        isRevision: false,
                        completed: item.completed,
                        originalGoal: item.goal,
                        isSplit: true,
                        isLate: isLate
                    });
                    
                    item.duration -= partDuration;
                    item.title = item.title.includes("(Parte") ? item.title : `${item.title} (Parte 2)`;
                    if(item.title.includes("Parte 2") && partDuration > 0) item.title = item.title.replace("Parte 2", "Parte Final");

                    minutesUsed += partDuration;
                }
            }
        }

        currentDate.setDate(currentDate.getDate() + 1);
        safetyDays++;
    }

    return schedule;
};


// --- Helper Components ---

const CalendarHeader = ({ currentDate, mode, onPrev, onNext, onModeChange }: any) => (
    <div className="flex items-center justify-between mb-6">
        <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
                {currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="text-xs text-gray-500 font-mono">VISÃO GERAL DO PLANEJAMENTO</div>
        </div>
        <div className="flex gap-4">
            <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                <button onClick={() => onModeChange('month')} className={`px-4 py-2 rounded text-xs font-bold uppercase transition-all ${mode === 'month' ? 'bg-insanus-red text-white' : 'text-gray-400 hover:text-white'}`}>Mês</button>
                <button onClick={() => onModeChange('week')} className={`px-4 py-2 rounded text-xs font-bold uppercase transition-all ${mode === 'week' ? 'bg-insanus-red text-white' : 'text-gray-400 hover:text-white'}`}>Semana</button>
            </div>
            <div className="flex gap-1">
                <button onClick={onPrev} className="p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-white"><Icon.ChevronDown className="w-5 h-5 rotate-90" /></button>
                <button onClick={onNext} className="p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-white"><Icon.ChevronRight className="w-5 h-5" /></button>
            </div>
        </div>
    </div>
);

// --- Main Component ---

export const UserDashboard: React.FC<Props> = ({ user, onUpdateUser, onReturnToAdmin }) => {
  const [view, setView] = useState<'config' | 'calendar' | 'daily'>('daily');
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<StudyPlan | null>(null);
  
  const [tempRoutine, setTempRoutine] = useState<Routine>(() => {
      const initial = user.routine ? JSON.parse(JSON.stringify(user.routine)) : { days: {} };
      if (!initial.days) initial.days = {};
      return initial;
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');

  const [calendarMode, setCalendarMode] = useState<'month' | 'week'>('month');
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [activeTimer, setActiveTimer] = useState<string | null>(null); 
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [activePDF, setActivePDF] = useState<string | null>(null);
  
  // Accordion State
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
      if (user.routine) {
          const fresh = JSON.parse(JSON.stringify(user.routine));
          if (!fresh.days) fresh.days = {};
          setTempRoutine(fresh);
      }
  }, [user.routine]);

  useEffect(() => {
    const loadPlans = async () => {
        const dbPlans = await fetchPlansFromDB();
        const allowedPlans = user.isAdmin 
            ? dbPlans 
            : dbPlans.filter(p => user.allowedPlans?.includes(p.id));
        setPlans(allowedPlans.length > 0 ? allowedPlans : []); 
        if (user.currentPlanId) {
            const current = dbPlans.find(p => p.id === user.currentPlanId);
            if(current) setSelectedPlan(current);
        }
    };
    loadPlans();
  }, [user.allowedPlans, user.currentPlanId, user.isAdmin]);

  // Derived State for Current Plan Configuration
  const currentPlanConfig = selectedPlan ? (user.planConfigs?.[selectedPlan.id] || { startDate: new Date().toISOString(), isPaused: false }) : null;

  const schedule = useMemo<Record<string, ScheduledItem[]>>(() => {
      if (!selectedPlan) return {};
      const safeRoutine = user.routine && user.routine.days ? user.routine : { days: {} };
      if (Object.keys(safeRoutine.days).length === 0) return {};
      
      // Pass the config derived from User state
      return generateSchedule(selectedPlan, safeRoutine, user);
  }, [selectedPlan, user.routine, user.level, user.progress?.completedGoalIds?.length, user.planConfigs]);

  useEffect(() => {
    let interval: any;
    if (activeTimer && !isPaused) {
        interval = setInterval(() => setElapsedTime(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [activeTimer, isPaused]);

  const handleStart = (id: string) => {
      if (activeTimer === id) return;
      setActiveTimer(id);
      setElapsedTime(0);
      setIsPaused(false);
  };

  const handleFinish = async (item: ScheduledItem) => {
      setActiveTimer(null);
      const newProgress = user.progress 
        ? { ...user.progress } 
        : { completedGoalIds: [], completedRevisionIds: [], totalStudySeconds: 0, planStudySeconds: {} };
      
      if (!newProgress.completedGoalIds) newProgress.completedGoalIds = [];
      if (!newProgress.planStudySeconds) newProgress.planStudySeconds = {};
      
      const idToMark = item.subGoalId ? `${item.goalId}::${item.subGoalId}` : item.goalId;
      
      if (!newProgress.completedGoalIds.includes(idToMark)) {
          newProgress.completedGoalIds.push(idToMark);
      }
      
      // Update Timers
      newProgress.totalStudySeconds = (newProgress.totalStudySeconds || 0) + elapsedTime;
      
      if (selectedPlan) {
          newProgress.planStudySeconds[selectedPlan.id] = (newProgress.planStudySeconds[selectedPlan.id] || 0) + elapsedTime;
      }
      
      const updatedUser = { ...user, progress: newProgress };
      onUpdateUser(updatedUser); 
      try { await saveUserToDB(updatedUser); } catch (e) { console.warn(e); }
  };

  const handleSaveRoutine = async () => {
      setSaveStatus('saving');
      const routineToSave = JSON.parse(JSON.stringify(tempRoutine));
      const updatedUser = { ...user, routine: routineToSave };
      try {
          await saveUserToDB(updatedUser);
          onUpdateUser(updatedUser);
          setSaveStatus('success');
          setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (error) {
          console.error("Erro ao salvar rotina:", error);
          setSaveStatus('error');
          setTimeout(() => setSaveStatus('idle'), 3000);
      }
  };

  const handleSelectPlan = async (planId: string) => {
      const updatedUser = { ...user, currentPlanId: planId };
      const found = plans.find(p => p.id === planId);
      if(found) setSelectedPlan(found);
      onUpdateUser(updatedUser);
      try { await saveUserToDB(updatedUser); } catch (e) { console.warn(e); }
  };

  const handleReplan = async () => {
      if (!selectedPlan) return;
      if (!confirm("Isso reorganizará todo o seu calendário futuro a partir de HOJE, jogando as metas atrasadas para frente. Deseja continuar?")) return;

      const newConfig: PlanConfig = {
          startDate: new Date().toISOString(), // Start fresh from Today
          isPaused: false
      };
      
      const updatedUser = { 
          ...user, 
          planConfigs: {
              ...(user.planConfigs || {}),
              [selectedPlan.id]: newConfig
          }
      };

      onUpdateUser(updatedUser);
      try { await saveUserToDB(updatedUser); } catch (e) { console.warn(e); }
  };

  const handleTogglePause = async () => {
      if (!selectedPlan || !currentPlanConfig) return;
      const isPaused = !currentPlanConfig.isPaused;
      
      const updatedUser = { 
          ...user, 
          planConfigs: {
              ...(user.planConfigs || {}),
              [selectedPlan.id]: {
                  ...currentPlanConfig,
                  isPaused
              }
          }
      };

      onUpdateUser(updatedUser);
      try { await saveUserToDB(updatedUser); } catch (e) { console.warn(e); }
  };

  const handleResetPlan = async () => {
      if (!selectedPlan) return;
      if (!confirm("ATENÇÃO: Isso irá reiniciar todo o seu progresso neste plano. Todas as metas concluídas serão desmarcadas e o calendário voltará para o dia 1. Deseja continuar?")) return;

      // 1. Collect all Goal IDs from the current plan to remove them from progress
      const planGoalIds: string[] = [];
      selectedPlan.disciplines?.forEach((d: Discipline) => {
          d.subjects?.forEach((s: Subject) => {
              s.goals?.forEach((g: Goal) => {
                  planGoalIds.push(g.id);
                  if (g.subGoals) {
                      g.subGoals.forEach((sub: SubGoal) => planGoalIds.push(`${g.id}::${sub.id}`));
                  }
              });
          });
      });

      // 2. Filter User Progress
      const newCompleted = (user.progress?.completedGoalIds || []).filter(id => !planGoalIds.includes(id));
      const newPlanSeconds = { ...user.progress?.planStudySeconds };
      delete newPlanSeconds[selectedPlan.id];

      // 3. Reset Start Date
      const newConfig: PlanConfig = {
          startDate: new Date().toISOString(),
          isPaused: false
      };

      const updatedUser = {
          ...user,
          progress: {
              ...user.progress,
              completedGoalIds: newCompleted,
              planStudySeconds: newPlanSeconds
          },
          planConfigs: {
              ...(user.planConfigs || {}),
              [selectedPlan.id]: newConfig
          }
      };

      onUpdateUser(updatedUser);
      try { await saveUserToDB(updatedUser); } catch (e) { console.warn(e); }
  };

  const handleLevelChange = async (level: UserLevel) => {
      const updatedUser = { ...user, level };
      onUpdateUser(updatedUser);
      try { await saveUserToDB(updatedUser); } catch (e) { console.warn(e); }
  };

  // --- Renderers ---

  const renderConfig = () => {
      return (
      <div className="p-10 max-w-7xl mx-auto h-full overflow-y-auto">
          <div className="mb-12 flex justify-between items-end">
            <div>
                <h2 className="text-4xl font-black text-white tracking-tighter mb-2">SETUP DE <span className="text-insanus-red">ROTINA</span></h2>
                <p className="text-gray-500 font-mono text-sm max-w-xl">Configure seu perfil e disponibilidade.</p>
            </div>
            {selectedPlan && currentPlanConfig && (
                <div className="flex gap-3">
                    <button onClick={handleResetPlan} className="px-6 py-3 rounded-xl border border-red-900/50 text-red-700 hover:bg-red-900/20 hover:text-red-500 hover:border-red-500 font-bold flex items-center gap-2 transition-all">
                        <Icon.Trash className="w-5 h-5" /> REINICIAR PLANO
                    </button>
                    <button onClick={handleTogglePause} className={`px-6 py-3 rounded-xl border font-bold flex items-center gap-2 transition-all ${currentPlanConfig.isPaused ? 'bg-green-600 border-green-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                        {currentPlanConfig.isPaused ? <Icon.Play className="w-5 h-5" /> : <Icon.Pause className="w-5 h-5" />}
                        {currentPlanConfig.isPaused ? 'RETOMAR PLANO' : 'PAUSAR PLANO'}
                    </button>
                </div>
            )}
          </div>

          {/* LEVEL SELECTOR */}
          <div className="mb-10">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                    <span className="w-2 h-8 bg-white"></span>
                    SEU PERFIL DE ESTUDANTE
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        { id: 'iniciante', label: 'INICIANTE', desc: 'Leitura Detalhada (5 min/pág)' },
                        { id: 'intermediario', label: 'INTERMEDIÁRIO', desc: 'Leitura Dinâmica (3 min/pág)' },
                        { id: 'avancado', label: 'AVANÇADO', desc: 'Alta Performance (1 min/pág)' }
                    ].map((lvl) => (
                        <button
                            key={lvl.id}
                            onClick={() => handleLevelChange(lvl.id as UserLevel)}
                            className={`p-6 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all group relative overflow-hidden ${user.level === lvl.id ? 'bg-insanus-red text-white border-insanus-red shadow-neon' : 'bg-black/40 border-white/10 hover:border-white/30 text-gray-500 hover:text-white'}`}
                        >
                            {user.level === lvl.id && <div className="absolute top-2 right-2"><Icon.Check className="w-5 h-5" /></div>}
                            <span className="text-lg font-black uppercase tracking-widest">{lvl.label}</span>
                            <span className={`text-[10px] font-mono ${user.level === lvl.id ? 'text-white/80' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                {lvl.desc}
                            </span>
                        </button>
                    ))}
                </div>
          </div>
          
          <div className="glass border border-white/5 rounded-2xl p-8 mb-10 relative overflow-hidden">
              <h3 className="text-xl font-bold text-white mb-6">DISPONIBILIDADE SEMANAL</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {WEEKDAYS.map(day => {
                      const isEnabled = tempRoutine.days && tempRoutine.days[day.key] !== undefined;
                      const totalMinutes = (tempRoutine.days && tempRoutine.days[day.key]) || 0;
                      const hours = Math.floor(totalMinutes / 60);
                      const minutes = totalMinutes % 60;

                      return (
                      <div key={day.key} className={`p-5 rounded-xl border transition-all duration-300 group hover:scale-[1.02] ${isEnabled ? 'bg-gradient-to-br from-insanus-red/10 to-transparent border-insanus-red/50 shadow-neon' : 'bg-black/40 border-white/5 hover:border-white/20'}`}>
                          <div className="flex justify-between items-center mb-4">
                              <span className={`font-black text-sm uppercase tracking-wider ${isEnabled ? 'text-white' : 'text-gray-500'}`}>{day.label}</span>
                              <div className="relative inline-block w-10 h-6 transition duration-200 ease-in-out">
                                  <input type="checkbox" id={`toggle-${day.key}`} className="absolute opacity-0 w-full h-full cursor-pointer z-10" 
                                    checked={isEnabled}
                                    onChange={(e) => {
                                      const newDays = { ...tempRoutine.days };
                                      if(e.target.checked) newDays[day.key] = 60; 
                                      else delete newDays[day.key];
                                      setTempRoutine({ ...tempRoutine, days: newDays });
                                  }} />
                                  <div className={`block w-full h-full rounded-full transition-colors ${isEnabled ? 'bg-insanus-red' : 'bg-gray-700'}`}></div>
                                  <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${isEnabled ? 'translate-x-4' : ''}`}></div>
                              </div>
                          </div>
                          
                          <div className={`transition-all duration-300 ${isEnabled ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}>
                              <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-black/30 rounded-lg p-2 border border-white/10 flex items-center">
                                      <input type="number" min="0" max="23" className="bg-transparent border-none outline-none w-full text-center text-white font-mono text-lg font-bold"
                                          value={hours}
                                          onChange={(e) => {
                                              const h = Math.max(0, parseInt(e.target.value) || 0);
                                              const newTotal = (h * 60) + minutes;
                                              const newDays = { ...tempRoutine.days, [day.key]: newTotal };
                                              setTempRoutine({ ...tempRoutine, days: newDays });
                                          }}
                                      />
                                      <span className="text-[9px] text-gray-500 font-bold uppercase mr-1">H</span>
                                  </div>
                                  <div className="text-gray-600 font-bold">:</div>
                                  <div className="flex-1 bg-black/30 rounded-lg p-2 border border-white/10 flex items-center">
                                      <input type="number" min="0" max="59" className="bg-transparent border-none outline-none w-full text-center text-white font-mono text-lg font-bold"
                                          value={minutes}
                                          onChange={(e) => {
                                              let m = Math.max(0, parseInt(e.target.value) || 0);
                                              if (m > 59) m = 59;
                                              const newTotal = (hours * 60) + m;
                                              const newDays = { ...tempRoutine.days, [day.key]: newTotal };
                                              setTempRoutine({ ...tempRoutine, days: newDays });
                                          }}
                                      />
                                      <span className="text-[9px] text-gray-500 font-bold uppercase mr-1">MIN</span>
                                  </div>
                              </div>
                          </div>
                      </div>
                  )})}
              </div>
              
              <div className="mt-8 flex justify-end">
                  <button 
                    type="button" 
                    onClick={handleSaveRoutine} 
                    disabled={saveStatus === 'saving'}
                    className={`bg-insanus-red hover:bg-red-600 text-white font-bold py-3 px-8 rounded-lg shadow-neon transition-all flex items-center gap-2 ${saveStatus === 'saving' ? 'opacity-50 cursor-not-allowed' : ''} ${saveStatus === 'success' ? 'bg-green-600 hover:bg-green-600 border-green-500' : ''}`}
                  >
                      {saveStatus === 'saving' && <Icon.RefreshCw className="w-5 h-5 animate-spin" />}
                      {saveStatus === 'success' && <Icon.Check className="w-5 h-5" />}
                      {saveStatus === 'error' && <span className="text-xl">!</span>}
                      
                      {saveStatus === 'idle' && 'SALVAR CONFIGURAÇÕES'}
                      {saveStatus === 'saving' && 'SALVANDO...'}
                      {saveStatus === 'success' && 'ROTINA SALVA!'}
                      {saveStatus === 'error' && 'ERRO AO SALVAR'}
                  </button>
              </div>
          </div>

          <div>
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <span className="w-2 h-8 bg-white"></span>
                  SEUS PLANOS HABILITADOS
              </h3>
              {plans.length === 0 ? (
                  <div className="text-gray-500 font-mono text-sm border border-dashed border-gray-700 p-8 rounded-xl text-center">
                      Nenhum plano habilitado pelo administrador ainda.
                  </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {plans.map(p => (
                        <div key={p.id} onClick={() => handleSelectPlan(p.id)}
                            className={`cursor-pointer rounded-2xl overflow-hidden border transition-all relative group h-64 ${selectedPlan?.id === p.id ? 'border-insanus-red shadow-neon scale-[1.01]' : 'border-white/10 hover:border-white/30 hover:scale-[1.01]'}`}>
                            <div className="absolute inset-0 z-0">
                                <img src={p.coverImage} className="w-full h-full object-cover opacity-40 group-hover:opacity-60 transition duration-700" />
                                <div className="absolute inset-0 bg-gradient-to-t from-insanus-black via-insanus-black/80 to-transparent"></div>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
                                <div className="text-[10px] font-mono text-insanus-red uppercase tracking-widest mb-1">
                                    {selectedPlan?.id === p.id ? '● PLANO ATIVO' : '○ DISPONÍVEL'}
                                </div>
                                <div className="font-black text-2xl text-white leading-tight mb-2 group-hover:text-insanus-red transition-colors">{p.name}</div>
                            </div>
                        </div>
                    ))}
                </div>
              )}
          </div>
      </div>
      );
  };

  const renderDaily = () => {
      const today = new Date().toISOString().split('T')[0];
      const todaysItems = (schedule[today] || []) as ScheduledItem[];
      const hasRoutine = user.routine && user.routine.days && Object.keys(user.routine.days).length > 0;
      
      // Calculate Stats
      const planTime = selectedPlan ? (user.progress?.planStudySeconds?.[selectedPlan.id] || 0) : 0;
      const totalTime = user.progress?.totalStudySeconds || 0;
      
      if (!selectedPlan || !hasRoutine) {
          return (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-20 h-20 rounded-full bg-insanus-red/10 flex items-center justify-center mb-6 animate-pulse">
                      <Icon.Book className="w-10 h-10 text-insanus-red" />
                  </div>
                  <h2 className="text-3xl font-black text-white mb-2">SETUP NECESSÁRIO</h2>
                  <p className="text-gray-500 max-w-md mb-8">
                      {!selectedPlan ? "Selecione um plano de estudos." : "Configure seus dias e horários de estudo."}
                  </p>
                  <button onClick={() => setView('config')} className="bg-white text-black hover:bg-insanus-red hover:text-white px-8 py-3 rounded-lg font-bold transition-all shadow-neon">
                      IR PARA SETUP
                  </button>
              </div>
          );
      }
      
      if (currentPlanConfig?.isPaused) {
          return (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                   <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-6">
                      <Icon.Pause className="w-10 h-10 text-gray-500" />
                  </div>
                  <h2 className="text-3xl font-black text-white mb-2">PLANO PAUSADO</h2>
                  <p className="text-gray-500 max-w-md mb-8">
                      Você pausou este plano. O calendário não gerará novas metas até você retomar.
                  </p>
                  <button onClick={handleTogglePause} className="bg-gray-700 text-white hover:bg-gray-600 px-8 py-3 rounded-lg font-bold transition-all shadow-lg">
                      RETOMAR ESTUDOS
                  </button>
              </div>
          )
      }

      // Collect Late Items
      // Scan the entire schedule object
      const lateItems: ScheduledItem[] = [];
      Object.entries(schedule).forEach(([date, items]) => {
          if (date < today) {
              (items as ScheduledItem[]).forEach(i => {
                  if (!i.completed) lateItems.push({ ...i, isLate: true });
              });
          }
      });
      
      // Group Today's Items
      const groupedItems: Record<string, ScheduledItem[]> = {};
      todaysItems.forEach(item => {
          if (!groupedItems[item.goalId]) groupedItems[item.goalId] = [];
          groupedItems[item.goalId].push(item);
      });
      
      // Group Late Items
      const groupedLateItems: Record<string, ScheduledItem[]> = {};
      lateItems.forEach(item => {
          if (!groupedLateItems[item.goalId]) groupedLateItems[item.goalId] = [];
          groupedLateItems[item.goalId].push(item);
      });

      const totalItems = todaysItems.length;
      const completedCount = todaysItems.filter(i => i.completed).length;
      const progress = totalItems ? (completedCount / totalItems) * 100 : 0;

      return (
          <div className="h-full flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-insanus-red/5 rounded-full blur-[100px] pointer-events-none"></div>

              <div className="p-8 md:px-12 pb-0 shrink-0 z-10">
                  <div className="flex flex-col lg:flex-row justify-between items-end mb-8 gap-6">
                    <div>
                        <div className="text-insanus-red font-mono text-sm uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                            <span className="w-2 h-2 bg-insanus-red rounded-full animate-pulse"></span>
                            Target do Dia
                        </div>
                        <h1 className="text-5xl md:text-6xl font-black text-white tracking-tighter leading-none">
                            METAS <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">DIÁRIAS</span>
                        </h1>
                        <p className="text-gray-500 mt-2 font-mono text-xs">{new Date().toLocaleDateString('pt-BR', {weekday:'long', day:'numeric', month:'long'}).toUpperCase()}</p>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2">
                         <div className="flex gap-4 mb-2">
                             <div className="bg-black/40 border border-white/10 px-4 py-2 rounded-lg text-right">
                                 <div className="text-[9px] text-gray-500 uppercase tracking-widest">Tempo Total</div>
                                 <div className="font-mono font-bold text-white text-lg">{(totalTime / 3600).toFixed(1)}h</div>
                             </div>
                             <div className="bg-black/40 border border-white/10 px-4 py-2 rounded-lg text-right">
                                 <div className="text-[9px] text-insanus-red uppercase tracking-widest">Neste Plano</div>
                                 <div className="font-mono font-bold text-white text-lg">{(planTime / 3600).toFixed(1)}h</div>
                             </div>
                         </div>
                    
                        <div className="flex items-center gap-6">
                            {activeTimer && (
                                <div className="bg-black/50 border border-insanus-red/50 shadow-neon px-6 py-4 rounded-xl flex flex-col items-center backdrop-blur-md">
                                    <span className="text-[10px] text-insanus-red font-bold uppercase mb-1 tracking-widest animate-pulse">Running Time</span>
                                    <span className="text-4xl font-mono font-bold text-white tabular-nums">
                                        {Math.floor(elapsedTime/60).toString().padStart(2,'0')}:{(elapsedTime%60).toString().padStart(2,'0')}
                                    </span>
                                </div>
                            )}
                            
                            <div className="hidden md:block text-right">
                                <div className="text-4xl font-black text-white">{Math.round(progress)}%</div>
                                <div className="text-[10px] text-gray-500 uppercase tracking-widest">Execução Diária</div>
                            </div>
                        </div>
                    </div>
                  </div>
                  <div className="bg-gray-800/50 h-1 w-full overflow-hidden">
                      <div className="bg-insanus-red h-full shadow-[0_0_20px_rgba(255,31,31,0.8)] transition-all duration-1000 ease-out" style={{width: `${progress}%`}} />
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 md:px-12 space-y-4 relative z-10 pb-20 custom-scrollbar">
                  
                  {/* LATE ITEMS SECTION - ALWAYS VISIBLE */}
                  <div className="mb-8 animate-fade-in">
                      <div className="flex justify-between items-center mb-4 border-b border-red-500/20 pb-2">
                          <h3 className="text-red-500 font-bold uppercase tracking-widest flex items-center gap-2">
                              <Icon.Clock className="w-5 h-5" /> METAS EM ATRASO
                          </h3>
                          <button 
                                onClick={Object.keys(groupedLateItems).length > 0 ? handleReplan : () => alert("Você não possui metas atrasadas para replanejar no momento.")}
                                className={`text-xs font-bold px-4 py-2 rounded shadow-neon transition-all flex items-center gap-2 ${Object.keys(groupedLateItems).length > 0 ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-800 text-gray-500 opacity-50'}`}
                           >
                              <Icon.RefreshCw className="w-3 h-3" /> REPLANEJAR PLANO
                          </button>
                      </div>
                      
                      {Object.keys(groupedLateItems).length > 0 ? (
                          <div className="space-y-4">
                              {Object.values(groupedLateItems).map(group => (
                                  // Render Late items same as normal cards but with Red Border
                                  <div key={group[0].goalId} className="group relative border border-red-500/50 bg-red-900/10 rounded-2xl overflow-hidden">
                                       <div className="p-4 flex items-center gap-4">
                                            <div className="w-10 h-10 bg-red-500 text-white rounded flex items-center justify-center font-bold">!</div>
                                            <div className="flex-1">
                                                <div className="text-xs text-red-300 font-bold uppercase">{group[0].goalType}</div>
                                                <div className="text-white font-bold">{group[0].originalGoal?.title || group[0].title}</div>
                                                <div className="text-[10px] text-gray-400 mt-1">{group.length} submetas pendentes</div>
                                            </div>
                                       </div>
                                  </div>
                              ))}
                          </div>
                      ) : (
                           <div className="p-6 rounded-xl border border-dashed border-gray-700 bg-black/20 text-gray-500 text-sm font-mono flex flex-col items-center justify-center gap-2">
                               <Icon.Check className="w-6 h-6 text-green-500 mb-1" />
                               <span>Você está rigorosamente em dia! Sem pendências anteriores.</span>
                           </div>
                      )}
                  </div>
                  
                  {/* TODAY ITEMS */}
                  {Object.keys(groupedItems).length === 0 ? (
                      <div className="h-40 flex flex-col items-center justify-center text-gray-600 opacity-50 border border-dashed border-gray-700 rounded-xl">
                          <Icon.Check className="w-12 h-12 mb-2 stroke-1" />
                          <h3 className="text-xl font-bold uppercase tracking-widest">Tudo em dia!</h3>
                      </div>
                  ) : (
                      Object.values(groupedItems).map((group) => {
                          const parentItem = group[0]; 
                          const isAccordionOpen = expandedItems[parentItem.goalId] || group.length === 1; 
                          
                          const totalDuration = group.reduce((acc, i) => acc + i.duration, 0);
                          const allCompleted = group.every(i => i.completed);
                          const countCompleted = group.filter(i => i.completed).length;

                          return (
                          <div key={parentItem.goalId} className={`group relative border rounded-2xl overflow-hidden transition-all duration-300 ${allCompleted ? 'bg-black/40 border-gray-800 opacity-60 grayscale' : 'glass border-white/5 hover:border-white/20 hover:bg-white/5'}`} style={{ borderColor: allCompleted ? 'transparent' : (parentItem.originalGoal?.color || 'rgba(255,255,255,0.1)') }}>
                              
                              <div className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: parentItem.originalGoal?.color ? `linear-gradient(to bottom, ${parentItem.originalGoal.color}, transparent)` : 'linear-gradient(to bottom, #FF1F1F, transparent)' }}></div>
                              
                              <div className="p-6 flex flex-col md:flex-row items-start md:items-center gap-6 cursor-pointer" onClick={() => setExpandedItems(prev => ({...prev, [parentItem.goalId]: !prev[parentItem.goalId]}))}>
                                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-2xl shrink-0 shadow-lg text-white`}
                                       style={{ backgroundColor: parentItem.originalGoal?.color || (parentItem.goalType === 'AULA' ? '#2563EB' : parentItem.goalType === 'QUESTOES' ? '#F97316' : parentItem.goalType === 'LEI_SECA' ? '#9333EA' : '#16A34A') }}>
                                      {parentItem.goalType === 'LEI_SECA' ? 'LS' : parentItem.goalType[0]}
                                  </div>

                                  <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 text-[10px] text-gray-400 uppercase tracking-widest mb-1 font-mono">
                                          <span className="text-white bg-white/10 px-2 py-0.5 rounded">{parentItem.disciplineName}</span>
                                          <span>// {parentItem.subjectName}</span>
                                      </div>
                                      <h3 className="font-bold text-xl text-white truncate group-hover:text-opacity-80 transition-colors" style={{ color: allCompleted ? '#666' : 'white' }}>
                                          {parentItem.goalType === 'AULA' ? (parentItem.originalGoal?.title || parentItem.title) : parentItem.title}
                                      </h3>
                                      <div className="flex gap-4 text-xs mt-2 text-gray-400 font-mono">
                                          <span className="flex items-center gap-1"><Icon.Clock className="w-3 h-3"/> {totalDuration} MIN TOTAL</span>
                                          {group.length > 1 && <span className="text-insanus-red flex items-center gap-1 font-bold">{countCompleted}/{group.length} METAS</span>}
                                          {parentItem.isRevision && <span className="text-insanus-red flex items-center gap-1">⚠ REVISÃO</span>}
                                          {parentItem.isSplit && <span className="text-red-400 flex items-center gap-1 font-bold">⚠ META DIVIDIDA</span>}
                                      </div>
                                      {parentItem.originalGoal?.description && <div className="mt-2 text-sm text-gray-400 bg-white/5 p-2 rounded truncate">{parentItem.originalGoal.description}</div>}
                                  </div>

                                  <div className="flex items-center gap-3">
                                      <div className={`transition-transform duration-300 ${isAccordionOpen ? 'rotate-180' : ''}`}>
                                        <Icon.ChevronDown className="w-5 h-5 text-gray-400" />
                                      </div>
                                  </div>
                              </div>
                              
                              {isAccordionOpen && (
                                  <div className="bg-black/40 border-t border-white/5 animate-fade-in divide-y divide-white/5">
                                      {group.map((item, index) => {
                                          const executionId = item.subGoalId ? `${item.goalId}::${item.subGoalId}` : item.goalId;
                                          const isItemActive = activeTimer === executionId;

                                          return (
                                              <div key={item.uniqueId} className={`p-4 pl-24 pr-8 flex flex-col md:flex-row gap-4 items-center justify-between transition-colors ${item.completed ? 'bg-green-900/5' : 'hover:bg-white/5'}`}>
                                                  <div className="flex-1">
                                                      <h4 className={`text-sm font-bold ${item.completed ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
                                                          {item.subGoalId ? (item.originalGoal?.subGoals?.find(s=>s.id===item.subGoalId)?.title || item.title) : item.title}
                                                      </h4>
                                                      <div className="text-[10px] text-gray-500 font-mono mt-1">{item.duration} min</div>
                                                  </div>

                                                  <div className="flex items-center gap-2">
                                                      {(item.originalGoal?.link || (item.subGoalId && item.originalGoal?.subGoals?.find(s=>s.id===item.subGoalId)?.link)) && (
                                                          <button 
                                                            onClick={() => {
                                                                const url = item.subGoalId ? item.originalGoal?.subGoals?.find(s=>s.id===item.subGoalId)?.link : item.originalGoal?.link;
                                                                if(url) window.open(url, '_blank');
                                                            }} 
                                                            className="p-2 bg-white/5 hover:bg-white/10 rounded text-gray-300 hover:text-white border border-white/5 transition-colors" title="Link"
                                                          >
                                                              <span className="font-bold text-[10px]">LINK ↗</span>
                                                          </button>
                                                      )}
                                                      
                                                      {item.originalGoal?.pdfUrl && (
                                                          <button onClick={() => setActivePDF(item.originalGoal!.pdfUrl!)} className="p-2 bg-white/5 hover:bg-white/10 rounded text-gray-300 hover:text-white border border-white/5 transition-colors" title="PDF">
                                                              <Icon.FileText className="w-4 h-4" />
                                                          </button>
                                                      )}

                                                      {!item.completed ? (
                                                          isItemActive ? (
                                                              <>
                                                                  <button onClick={() => setIsPaused(!isPaused)} className="w-10 h-10 rounded bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-white border border-white/10">
                                                                      {isPaused ? <Icon.Play className="w-4 h-4"/> : <Icon.Pause className="w-4 h-4"/>}
                                                                  </button>
                                                                  <button onClick={() => handleFinish(item)} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold text-xs shadow-lg shadow-green-900/50">
                                                                      CONCLUIR
                                                                  </button>
                                                              </>
                                                          ) : (
                                                              <button onClick={() => handleStart(executionId)} className="bg-white text-black hover:bg-gray-200 px-6 py-2 rounded font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg hover:shadow-neon transition-all">
                                                                  <Icon.Play className="w-3 h-3 fill-current" /> INICIAR
                                                              </button>
                                                          )
                                                      ) : (
                                                          <div className="flex items-center gap-1 text-green-500 text-xs font-bold uppercase tracking-wider">
                                                              <Icon.Check className="w-4 h-4" /> FEITO
                                                          </div>
                                                      )}
                                                  </div>
                                              </div>
                                          );
                                      })}
                                  </div>
                              )}
                          </div>
                      )})
                  )}
              </div>
          </div>
      );
  };

  const renderCalendar = () => {
      const hasRoutine = user.routine && user.routine.days && Object.keys(user.routine.days).length > 0;

      if (!selectedPlan || !hasRoutine) {
          return (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center glass m-8 rounded-2xl">
                  <div className="w-20 h-20 rounded-full bg-insanus-red/10 flex items-center justify-center mb-6 animate-pulse">
                      <Icon.Calendar className="w-10 h-10 text-insanus-red" />
                  </div>
                  <h2 className="text-3xl font-black text-white mb-2">CALENDÁRIO VAZIO</h2>
                  <p className="text-gray-500 max-w-md mb-8">
                      {!selectedPlan ? "Selecione um plano de estudos." : "Configure seus dias e horários de estudo."}
                  </p>
                  <button onClick={() => setView('config')} className="bg-white text-black hover:bg-insanus-red hover:text-white px-8 py-3 rounded-lg font-bold transition-all shadow-neon">
                      CONFIGURAR AGORA
                  </button>
              </div>
          );
      }

      if (currentPlanConfig?.isPaused) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center glass m-8 rounded-2xl">
                <Icon.Pause className="w-16 h-16 text-yellow-600 mb-6" />
                <h2 className="text-3xl font-black text-white mb-2">PLANO PAUSADO</h2>
                <button onClick={handleTogglePause} className="bg-yellow-600 text-white px-8 py-3 rounded-lg font-bold transition-all shadow-lg mt-4">
                    RETOMAR
                </button>
            </div>
        )
      }

      const daysInMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate();
      const startDay = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay(); // 0 = Sunday
      
      const gridCells: (Date | null)[] = [];
      
      if (calendarMode === 'month') {
          for(let i=0; i<startDay; i++) gridCells.push(null);
          for(let i=1; i<=daysInMonth; i++) {
              const d = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), i);
              gridCells.push(d);
          }
      } else {
          const day = calendarDate.getDay();
          const startOfWeek = new Date(calendarDate);
          startOfWeek.setDate(calendarDate.getDate() - day);
          for(let i=0; i<7; i++) {
              const d = new Date(startOfWeek);
              d.setDate(startOfWeek.getDate() + i);
              gridCells.push(d);
          }
      }

      const prev = () => {
          const newDate = new Date(calendarDate);
          if (calendarMode === 'month') newDate.setMonth(newDate.getMonth() - 1);
          else newDate.setDate(newDate.getDate() - 7);
          setCalendarDate(newDate);
      };

      const next = () => {
          const newDate = new Date(calendarDate);
          if (calendarMode === 'month') newDate.setMonth(newDate.getMonth() + 1);
          else newDate.setDate(newDate.getDate() + 7);
          setCalendarDate(newDate);
      };

      return (
          <div className="h-full flex flex-col p-8">
              <CalendarHeader 
                  currentDate={calendarDate} 
                  mode={calendarMode} 
                  onModeChange={setCalendarMode}
                  onPrev={prev}
                  onNext={next}
              />
              
              <div className="flex-1 glass rounded-2xl p-6 overflow-hidden flex flex-col">
                  {/* Days Header */}
                  <div className={`grid grid-cols-7 gap-4 mb-4 text-center`}>
                      {WEEKDAYS.map(w => (
                          <div key={w.key} className="text-xs font-bold text-gray-500 uppercase tracking-widest">{w.label.slice(0,3)}</div>
                      ))}
                  </div>
                  
                  {/* Grid */}
                  <div className={`grid grid-cols-7 gap-4 flex-1 ${calendarMode === 'month' ? 'grid-rows-5' : 'grid-rows-1'}`}>
                      {gridCells.map((date, idx) => {
                          if (!date) return <div key={idx} className="bg-transparent"></div>;
                          
                          const dateStr = date.toISOString().split('T')[0];
                          const items: ScheduledItem[] = schedule[dateStr] || [];
                          const isToday = dateStr === new Date().toISOString().split('T')[0];
                          const isPast = dateStr < new Date().toISOString().split('T')[0];
                          
                          // GROUP ITEMS FOR CALENDAR DISPLAY
                          const uniqueGoalItems: ScheduledItem[] = [];
                          const processedGoals = new Set<string>();

                          // Explicit typing to fix potential 'forEach on unknown' if schedule type inference is weak
                          (items as ScheduledItem[]).forEach(item => {
                              if (processedGoals.has(item.goalId)) return;
                              processedGoals.add(item.goalId);
                              uniqueGoalItems.push(item);
                          });

                          return (
                              <div key={idx} className={`rounded-xl border p-2 flex flex-col gap-1 transition-all ${isToday ? 'bg-insanus-red/10 border-insanus-red' : 'bg-white/5 border-white/5 hover:border-white/20'}`}>
                                  <div className={`text-xs font-mono font-bold flex justify-between ${isToday ? 'text-insanus-red' : 'text-gray-400'}`}>
                                      {date.getDate()}
                                      {isPast && items.some(i => !i.completed) && <span className="text-red-500 text-[10px] animate-pulse">!</span>}
                                  </div>
                                  <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                                      {uniqueGoalItems.map(i => {
                                          const count = items.filter(x => x.goalId === i.goalId).length;
                                          const allDone = items.filter(x => x.goalId === i.goalId).every(x => x.completed);

                                          return (
                                          <div key={i.uniqueId} className={`text-[9px] p-1 rounded truncate flex items-center gap-1 ${allDone ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-300'}`} style={{ borderLeft: `2px solid ${i.originalGoal?.color || '#555'}` }}>
                                              {allDone && <Icon.Check className="w-2 h-2" />}
                                              {/* Show Parent Title always in Calendar */}
                                              {i.originalGoal?.title || i.title}
                                              {count > 1 && <span className="text-[8px] bg-white/10 px-1 rounded ml-auto">{count}</span>}
                                          </div>
                                      )})}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="flex w-full h-full bg-insanus-black text-gray-200 relative">
        {/* ADMIN PREVIEW MODE BANNER */}
        {onReturnToAdmin && (
            <div className="absolute top-0 left-0 right-0 h-10 bg-yellow-600 text-black font-bold uppercase tracking-widest text-xs flex items-center justify-center z-50 shadow-xl">
                <span>Modo de Visualização de Aluno</span>
                <button onClick={onReturnToAdmin} className="ml-4 bg-black text-white px-3 py-1 rounded hover:bg-gray-800 transition">
                    Voltar para Admin
                </button>
            </div>
        )}

        {/* Sidebar Navigation */}
        <div className={`hidden lg:flex w-24 border-r border-white/5 flex-col items-center py-8 shrink-0 bg-black/50 backdrop-blur-sm z-20 ${onReturnToAdmin ? 'mt-10' : ''}`}>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-insanus-red to-red-900 flex items-center justify-center font-bold text-white text-xl shadow-neon mb-12">
                {user.name.charAt(0)}
            </div>
            
            <nav className="flex-1 space-y-6 w-full px-4">
                {[
                    {id: 'daily', icon: Icon.Check, label: 'HOJE'},
                    {id: 'calendar', icon: Icon.Calendar, label: 'AGENDA'},
                    {id: 'config', icon: Icon.Menu, label: 'SETUP'},
                ].map(item => (
                    <button key={item.id} onClick={() => setView(item.id as any)}
                        className={`w-full aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-300 group relative ${view === item.id ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}>
                        <item.icon className={`w-6 h-6 ${view === item.id ? 'text-insanus-red' : ''}`} />
                        <span className="text-[9px] font-bold tracking-widest">{item.label}</span>
                        {view === item.id && <div className="absolute left-0 h-8 w-1 bg-insanus-red rounded-r-full"></div>}
                    </button>
                ))}
            </nav>
            
            <div className="text-[10px] font-mono text-gray-600 rotate-180 writing-mode-vertical">V2.1.0</div>
        </div>

        {/* Content */}
        <div className={`flex-1 overflow-hidden relative ${onReturnToAdmin ? 'mt-10' : ''}`}>
            {/* Mobile Header (Visible only on small screens) */}
            <div className="lg:hidden h-16 border-b border-white/10 flex items-center justify-between px-6 bg-insanus-black z-20">
                <div className="font-bold text-white">INSANUS</div>
                <div className="flex gap-4">
                     <button onClick={() => setView('daily')} className={view==='daily'?'text-insanus-red':''}>HOJE</button>
                     <button onClick={() => setView('config')} className={view==='config'?'text-insanus-red':''}>SETUP</button>
                     <button onClick={() => setView('calendar')} className={view==='calendar'?'text-insanus-red':''}>CAL</button>
                </div>
            </div>

            {view === 'daily' && renderDaily()}
            {view === 'config' && renderConfig()}
            {view === 'calendar' && renderCalendar()}
            
            {activePDF && <PDFViewer url={activePDF} user={user} onClose={() => setActivePDF(null)} />}
        </div>
    </div>
  );
};