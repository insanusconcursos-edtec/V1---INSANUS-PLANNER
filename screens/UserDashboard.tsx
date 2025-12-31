import React, { useState, useEffect, useMemo } from 'react';
import { User, StudyPlan, ScheduledItem, Routine, Goal, SubGoal, UserProgress, GoalType, PlanConfig, Discipline, Subject, UserLevel } from '../types';
import { Icon } from '../components/Icons';
import { WEEKDAYS, calculateGoalDuration, uuid } from '../constants';
import { fetchPlansFromDB, saveUserToDB } from '../services/db';
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';

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
                            // GROUPING LOGIC FIX:
                            // Instead of creating one item per subgoal, we calculate the TOTAL remaining duration
                            // of the goal based on uncompleted subgoals.
                            
                            let duration = 0;
                            let isFullyCompleted = false;

                            if (g.type === 'AULA' && g.subGoals && g.subGoals.length > 0) {
                                // Calculate duration of pending subgoals
                                const pendingSubGoals = g.subGoals.filter(sub => 
                                    !user.progress?.completedGoalIds?.includes(`${g.id}::${sub.id}`)
                                );
                                
                                if (pendingSubGoals.length === 0 && g.subGoals.length > 0) {
                                    isFullyCompleted = true; // All subgoals done
                                } else {
                                    // Sum duration of pending items
                                    duration = pendingSubGoals.reduce((acc, sub) => acc + (sub.duration || 30), 0);
                                }
                            } else {
                                // Standard Goal (PDF, Exercises, etc)
                                duration = calculateGoalDuration(g, user.level);
                                isFullyCompleted = user.progress?.completedGoalIds?.includes(g.id);
                            }

                            // Only schedule if not fully completed
                            if (!isFullyCompleted && duration > 0) {
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
  const [view, setView] = useState<'config' | 'calendar' | 'daily' | 'edital'>('daily');
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
  
  // PDF Processing State
  const [processingPdf, setProcessingPdf] = useState<string | null>(null);
  
  // Accordion State for Goal Cards (Subgoals visibility)
  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});

  const toggleGoalExpand = (id: string) => {
      setExpandedGoals(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
  }, [selectedPlan, user.routine, user.level, user.progress?.completedGoalIds, user.planConfigs]);

  useEffect(() => {
    let interval: any;
    if (activeTimer && !isPaused) {
        interval = setInterval(() => setElapsedTime(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [activeTimer, isPaused]);

  // --- SECURE PDF HANDLER (Embed Watermark & Native Open) ---
  const handleOpenSecurePdf = async (url: string) => {
      setProcessingPdf(url);
      
      try {
          // 1. Fetch original PDF
          const response = await fetch(url);
          const existingPdfBytes = await response.arrayBuffer();

          // 2. Load PDF into pdf-lib
          const pdfDoc = await PDFDocument.load(existingPdfBytes);
          const pages = pdfDoc.getPages();
          
          // 3. Embed font (Standard Helvetica is lightweight)
          const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
          const fontSize = 10;
          const text = `${user.name} - ${user.cpf}`;

          // 4. Draw Watermark on EVERY page
          pages.forEach((page) => {
              const { width, height } = page.getSize();
              const xStep = 200;
              const yStep = 200;

              for (let x = -100; x < width + 100; x += xStep) {
                  for (let y = -100; y < height + 100; y += yStep) {
                      page.drawText(text, {
                          x,
                          y,
                          size: fontSize,
                          font: font,
                          color: rgb(1, 0.2, 0.2), // Red
                          opacity: 0.15, // Very soft opacity
                          rotate: degrees(45), 
                      });
                  }
              }
          });

          // 5. Save the modified PDF
          const pdfBytes = await pdfDoc.save();
          
          // 6. Create Blob & Open in New Tab
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const blobUrl = URL.createObjectURL(blob);
          
          window.open(blobUrl, '_blank');

      } catch (error) {
          console.error("Erro ao processar PDF:", error);
          alert("Não foi possível carregar o documento seguro. Verifique sua conexão.");
      } finally {
          setProcessingPdf(null);
      }
  };


  const handleStart = (id: string) => {
      if (activeTimer === id) return;
      setActiveTimer(id);
      setElapsedTime(0);
      setIsPaused(false);
  };

  // General Finish (for standard goals or bulk finish)
  const handleFinish = async (item: ScheduledItem) => {
      setActiveTimer(null);
      const newProgress = user.progress 
        ? { ...user.progress } 
        : { completedGoalIds: [], completedRevisionIds: [], totalStudySeconds: 0, planStudySeconds: {} };
      
      if (!newProgress.completedGoalIds) newProgress.completedGoalIds = [];
      if (!newProgress.planStudySeconds) newProgress.planStudySeconds = {};
      
      // If it's a standard goal, mark the goal ID
      if (!newProgress.completedGoalIds.includes(item.goalId)) {
          newProgress.completedGoalIds.push(item.goalId);
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

  // Specific Subgoal Check (for AULA type)
  const handleCheckSubGoal = async (goalId: string, subGoalId: string) => {
      const newProgress = user.progress 
        ? { ...user.progress } 
        : { completedGoalIds: [], completedRevisionIds: [], totalStudySeconds: 0, planStudySeconds: {} };
      
      if (!newProgress.completedGoalIds) newProgress.completedGoalIds = [];
      
      const compositeId = `${goalId}::${subGoalId}`;
      
      if (newProgress.completedGoalIds.includes(compositeId)) {
          // Uncheck
          newProgress.completedGoalIds = newProgress.completedGoalIds.filter(id => id !== compositeId);
      } else {
          // Check
          newProgress.completedGoalIds.push(compositeId);
      }
      
      const updatedUser = { ...user, progress: newProgress };
      onUpdateUser(updatedUser);
      try { await saveUserToDB(updatedUser); } catch (e) { console.warn(e); }
  }

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

  const renderEditalVerticalizado = () => {
    if (!selectedPlan || !selectedPlan.editalVerticalizado || selectedPlan.editalVerticalizado.length === 0) {
         return (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center glass m-8 rounded-2xl">
                  <Icon.List className="w-16 h-16 text-gray-600 mb-6" />
                  <h2 className="text-2xl font-black text-white mb-2">EDITAL NÃO DISPONÍVEL</h2>
                  <p className="text-gray-500 max-w-md">
                      Este plano ainda não possui um Edital Verticalizado configurado.
                  </p>
              </div>
         );
    }

    // --- Helper to find actual Goal object ---
    const getGoal = (goalId: string | undefined): Goal | undefined => {
        if (!goalId) return undefined;
        for (const disc of selectedPlan.disciplines) {
            for (const sub of disc.subjects) {
                const found = sub.goals.find(g => g.id === goalId);
                if (found) return found;
            }
        }
        return undefined;
    };

    // --- Helper to check completion ---
    const isCompleted = (goalId: string | undefined): boolean => {
        if (!goalId) return false;
        // Check standard completion
        if (user.progress?.completedGoalIds.includes(goalId)) return true;
        // Check subgoals completion (if AULA)
        const goal = getGoal(goalId);
        if (goal && goal.type === 'AULA' && goal.subGoals) {
             const allSubDone = goal.subGoals.every(sub => user.progress?.completedGoalIds.includes(`${goalId}::${sub.id}`));
             return allSubDone;
        }
        return false;
    };

    // --- Helper to render Cell ---
    const renderCell = (goalId: string | undefined, typeLabel: string) => {
        const goal = getGoal(goalId);
        const done = isCompleted(goalId);
        
        if (!goalId) return <div className="w-full h-full flex items-center justify-center text-gray-800 text-lg select-none">•</div>;

        return (
            <div className="flex items-center justify-center w-full h-full">
                <button 
                    onClick={() => {
                        // Open Link or PDF even if done
                        if (goal?.pdfUrl) handleOpenSecurePdf(goal.pdfUrl);
                        else if (goal?.link) window.open(goal.link, '_blank');
                    }}
                    className={`w-8 h-8 rounded flex items-center justify-center transition-all ${done ? 'bg-green-500 text-black shadow-neon' : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-white'}`}
                    title={goal ? `${goal.title} (${done ? 'Concluído' : 'Pendente'})` : 'Pendente'}
                >
                    {done ? <Icon.Check className="w-5 h-5" /> : (
                        typeLabel === 'AULA' ? <Icon.Play className="w-4 h-4" /> :
                        typeLabel === 'PDF' ? <Icon.FileText className="w-4 h-4" /> :
                        typeLabel === 'QST' ? <Icon.Code className="w-4 h-4" /> :
                        <Icon.Book className="w-4 h-4" />
                    )}
                </button>
            </div>
        );
    };

    // --- Helper for Revisions Cell ---
    const renderRevisionsCell = (topicLinks: any) => {
        // Collect relevant parent goals for auto-revision checking
        const parents = [topicLinks.questoes, topicLinks.resumo, topicLinks.revisao].filter(Boolean);
        
        // We will simulate 4 Revision slots
        const slots = [0, 1, 2, 3]; // Indices

        return (
            <div className="flex items-center justify-center gap-1">
                {slots.map(idx => {
                    // Check if ANY of the linked parent goals has this revision index completed
                    let isRevDone = false;
                    
                    parents.forEach(pid => {
                        // 1. Explicit Revision Goal Linked?
                        if (topicLinks.revisao === pid && isCompleted(pid)) {
                            // If explicit revision linked, maybe we treat it as Rev 1? 
                            // Simplification: Explicit linked revision counts as Rev 1.
                            if (idx === 0) isRevDone = true;
                        }

                        // 2. Auto-Revision Check
                        // Check if completedRevisionIds contains "pid_rev_idx"
                        const revId = `${pid}_rev_${idx}`;
                        if (user.progress?.completedRevisionIds?.includes(revId)) isRevDone = true;
                    });

                    return (
                        <div key={idx} className={`w-3 h-3 rounded-full border border-white/10 ${isRevDone ? 'bg-insanus-red shadow-neon' : 'bg-black/40'}`} title={`Revisão ${idx+1}`}></div>
                    )
                })}
            </div>
        )
    };

    // --- Calculate Overall Progress ---
    let totalSlots = 0;
    let completedSlots = 0;
    
    selectedPlan.editalVerticalizado.forEach(disc => {
        disc.topics.forEach(topic => {
            // Check main slots
            const slots = [topic.links.aula, topic.links.material, topic.links.questoes, topic.links.leiSeca, topic.links.resumo];
            slots.forEach(s => {
                if (s) {
                    totalSlots++;
                    if (isCompleted(s)) completedSlots++;
                }
            });
            // Revisions (count as 4 slots if parent has revisions)
            const parents = [topic.links.questoes, topic.links.resumo, topic.links.revisao].filter(Boolean);
            if (parents.length > 0) {
                 totalSlots += 4;
                 for(let i=0; i<4; i++) {
                     let done = false;
                     parents.forEach(pid => {
                         if (user.progress?.completedRevisionIds?.includes(`${pid}_rev_${i}`)) done = true;
                         // Hack for explicit revision counting as Rev 1
                         if (i === 0 && topic.links.revisao && isCompleted(topic.links.revisao)) done = true;
                     });
                     if(done) completedSlots++;
                 }
            }
        });
    });

    const percent = totalSlots > 0 ? Math.round((completedSlots / totalSlots) * 100) : 0;

    return (
        <div className="flex flex-col h-full bg-black/90 text-white overflow-hidden p-8">
            {/* Header */}
            <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-6 border-b border-white/10 pb-6">
                <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                         <Icon.List className="w-8 h-8 text-insanus-red" />
                         EDITAL <span className="text-gray-500">VERTICALIZADO</span>
                    </h2>
                    <p className="text-gray-500 font-mono text-sm mt-1">Visão estratégica de cobertura do edital.</p>
                </div>
                
                <div className="w-full md:w-1/3">
                    <div className="flex justify-between text-xs font-bold uppercase mb-2">
                        <span>Progresso Global</span>
                        <span className="text-insanus-red">{percent}%</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-insanus-red to-red-600 transition-all duration-1000 ease-out shadow-neon" style={{width: `${percent}%`}}></div>
                    </div>
                </div>
            </div>

            {/* Content Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pb-20">
                <div className="space-y-8">
                    {selectedPlan.editalVerticalizado.map(disc => (
                        <div key={disc.id} className="glass border border-white/5 rounded-xl overflow-hidden">
                            <div className="bg-white/5 p-4 font-black uppercase tracking-wider text-sm flex items-center gap-2">
                                <div className="w-1.5 h-6 bg-insanus-red rounded"></div>
                                {disc.name}
                            </div>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-white/5 bg-black/40 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">
                                            <th className="p-3 text-left w-1/3">Tópico</th>
                                            <th className="p-3 w-12">AULA</th>
                                            <th className="p-3 w-12">PDF</th>
                                            <th className="p-3 w-12">QUEST</th>
                                            <th className="p-3 w-12">LEI</th>
                                            <th className="p-3 w-12">RES</th>
                                            <th className="p-3 w-24">REVISÕES</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {disc.topics.map(topic => {
                                            // Check Row Completion
                                            // A topic is done if all linked slots are done + 2 revision cycles (indices 0 and 1)
                                            // This is a simplified logic for "Check Row" visual
                                            let isRowDone = true;
                                            if (topic.links.aula && !isCompleted(topic.links.aula)) isRowDone = false;
                                            if (topic.links.material && !isCompleted(topic.links.material)) isRowDone = false;
                                            if (topic.links.questoes && !isCompleted(topic.links.questoes)) isRowDone = false;
                                            
                                            // Revisions Check (Rev 1 & 2 mandatory for row completion based on prompt)
                                            const parents = [topic.links.questoes, topic.links.resumo].filter(Boolean);
                                            if (parents.length > 0) {
                                                let r1 = false, r2 = false;
                                                parents.forEach(pid => {
                                                    if(user.progress?.completedRevisionIds?.includes(`${pid}_rev_0`)) r1 = true;
                                                    if(user.progress?.completedRevisionIds?.includes(`${pid}_rev_1`)) r2 = true;
                                                });
                                                if(!r1 || !r2) isRowDone = false;
                                            }

                                            return (
                                                <tr key={topic.id} className="hover:bg-white/5 transition-colors group">
                                                    <td className="p-4 text-sm font-bold text-gray-300 group-hover:text-white flex flex-col justify-center">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isRowDone ? 'bg-green-500 border-green-500 text-black' : 'border-gray-600'}`}>
                                                                {isRowDone && <Icon.Check className="w-3 h-3" />}
                                                            </div>
                                                            {topic.name}
                                                        </div>
                                                        {/* CONTEST BADGES */}
                                                        {topic.relatedContests && topic.relatedContests.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-1 pl-7">
                                                                {topic.relatedContests.map(c => (
                                                                    <span key={c} className="text-[9px] bg-insanus-red/10 text-insanus-red px-1.5 py-0.5 rounded border border-insanus-red/30 font-bold uppercase tracking-wider">
                                                                        {c}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-2">{renderCell(topic.links.aula, 'AULA')}</td>
                                                    <td className="p-2">{renderCell(topic.links.material, 'PDF')}</td>
                                                    <td className="p-2">{renderCell(topic.links.questoes, 'QST')}</td>
                                                    <td className="p-2">{renderCell(topic.links.leiSeca, 'LEI')}</td>
                                                    <td className="p-2">{renderCell(topic.links.resumo, 'RES')}</td>
                                                    <td className="p-2 text-center">{renderRevisionsCell(topic.links)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
  }
