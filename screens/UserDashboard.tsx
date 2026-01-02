import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, StudyPlan, Routine, Goal, SubGoal, UserProgress, GoalType, PlanConfig, Discipline, Subject, UserLevel, SimuladoClass, Simulado, SimuladoAttempt, ScheduledItem, EditalTopic, Cycle, CycleItem, Flashcard } from '../types';
import { Icon } from '../components/Icons';
import { WEEKDAYS, calculateGoalDuration, uuid } from '../constants';
import { fetchPlansFromDB, saveUserToDB, fetchSimuladoClassesFromDB, fetchSimuladoAttemptsFromDB, saveSimuladoAttemptToDB, fetchUsersFromDB } from '../services/db';

interface Props {
  user: User;
  onUpdateUser: (user: User) => void;
  onReturnToAdmin?: () => void;
}

// --- INTERFACES ---
interface SimuladoRunnerProps {
    user: User;
    classId: string;
    simulado: Simulado;
    attempt?: SimuladoAttempt;
    allAttempts: SimuladoAttempt[];
    allUsersMap: Record<string, User>;
    onFinish: (attempt: SimuladoAttempt) => void;
    onBack: () => void;
}

// --- HELPER: DATE & TIME UTILS ---
const getTodayStr = () => {
    const d = new Date();
    // Adjust for timezone to ensure we get "local today" string YYYY-MM-DD
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

// --- FLASHCARD PLAYER COMPONENT ---
interface FlashcardPlayerProps {
    cards: Flashcard[];
    onClose: () => void;
}

const FlashcardPlayer: React.FC<FlashcardPlayerProps> = ({ cards, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    const handleNext = () => {
        setIsFlipped(false);
        setTimeout(() => {
            setCurrentIndex(prev => (prev + 1) % cards.length);
        }, 150);
    };

    const handlePrev = () => {
        setIsFlipped(false);
        setTimeout(() => {
            setCurrentIndex(prev => (prev - 1 + cards.length) % cards.length);
        }, 150);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
            <div className="w-full max-w-3xl flex flex-col h-[85vh]">
                <div className="flex justify-between items-center mb-8 px-2">
                    <h3 className="text-2xl font-black text-white uppercase flex items-center gap-3 tracking-tight"><Icon.RefreshCw className="w-6 h-6 text-blue-500"/> Modo Revisão</h3>
                    <button onClick={onClose} className="bg-white/5 hover:bg-white/10 border border-white/10 p-2 rounded-full text-white transition hover:scale-110"><Icon.LogOut className="w-5 h-5"/></button>
                </div>

                <div className="flex-1 relative" style={{ perspective: '2000px' }}>
                    <div 
                        className="w-full h-full relative transition-all duration-500 cursor-pointer"
                        style={{ 
                            transformStyle: 'preserve-3d',
                            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                        }}
                        onClick={() => setIsFlipped(!isFlipped)}
                    >
                        {/* Front Face (Question) */}
                        <div 
                            className="absolute inset-0 bg-[#151515] border border-blue-500/20 rounded-3xl p-8 md:p-12 flex flex-col items-center justify-center text-center shadow-[0_0_50px_rgba(0,0,0,0.5)]"
                            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                        >
                            <div className="bg-blue-500/10 text-blue-400 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-8 border border-blue-500/20">
                                FLASHCARD {currentIndex + 1} / {cards.length}
                            </div>
                            
                            <div className="flex-1 flex items-center justify-center w-full overflow-y-auto custom-scrollbar">
                                <p className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-100 leading-snug">
                                    {cards[currentIndex].question}
                                </p>
                            </div>

                            <div className="mt-8 flex flex-col items-center gap-2 animate-pulse">
                                <Icon.ArrowUp className="w-6 h-6 text-gray-600"/>
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Toque para ver a resposta</span>
                            </div>
                        </div>

                        {/* Back Face (Answer) */}
                        <div 
                            className="absolute inset-0 bg-[#0A0A0A] border-2 border-blue-600 rounded-3xl p-8 md:p-12 flex flex-col items-center justify-center text-center shadow-[0_0_50px_rgba(37,99,235,0.15)]"
                            style={{ 
                                backfaceVisibility: 'hidden', 
                                WebkitBackfaceVisibility: 'hidden', 
                                transform: 'rotateY(180deg)' 
                            }}
                        >
                            <span className="text-xs font-black text-blue-500 uppercase tracking-widest mb-6">RESPOSTA CORRETA</span>
                            
                            <div className="flex-1 flex items-center justify-center w-full overflow-y-auto custom-scrollbar">
                                <p className="text-xl md:text-2xl font-medium text-gray-200 leading-relaxed">
                                    {cards[currentIndex].answer}
                                </p>
                            </div>

                            <button 
                                className="mt-8 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold text-sm uppercase shadow-lg transition-transform hover:scale-105"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleNext();
                                }}
                            >
                                Próximo Card
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center mt-8 gap-4 px-2">
                    <button onClick={handlePrev} className="bg-[#151515] border border-white/10 hover:bg-white/5 text-gray-400 hover:text-white px-6 py-4 rounded-xl font-bold transition flex items-center gap-3 w-1/3 justify-center">
                        <Icon.ArrowUp className="-rotate-90 w-4 h-4"/> <span className="hidden md:inline">ANTERIOR</span>
                    </button>
                    
                    <div className="flex gap-1.5 flex-1 justify-center">
                        {cards.map((_, idx) => (
                            <div 
                                key={idx} 
                                className={`h-1.5 rounded-full transition-all duration-300 ${idx === currentIndex ? 'bg-blue-500 w-8' : 'bg-gray-800 w-1.5'}`}
                            />
                        ))}
                    </div>

                    <button onClick={handleNext} className="bg-[#151515] border border-white/10 hover:bg-white/5 text-gray-400 hover:text-white px-6 py-4 rounded-xl font-bold transition flex items-center gap-3 w-1/3 justify-center">
                        <span className="hidden md:inline">PRÓXIMO</span> <Icon.ArrowDown className="-rotate-90 w-4 h-4"/>
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- SIMULADO RUNNER ---
const SimuladoRunner: React.FC<SimuladoRunnerProps> = ({ user, classId, simulado, attempt, allAttempts, allUsersMap, onFinish, onBack }) => {
    const [answers, setAnswers] = useState<Record<number, string | null>>(attempt?.answers || {});
    const [showResult, setShowResult] = useState(!!attempt);
    const [confirmFinish, setConfirmFinish] = useState(false);

    const handleAnswer = (q: number, val: string) => { if (showResult) return; setAnswers(prev => ({ ...prev, [q]: val })); };

    const finishSimulado = () => {
        let score = 0;
        // Calculate Score
        for (let i = 1; i <= simulado.totalQuestions; i++) {
            const userAns = answers[i];
            const correctAns = simulado.correctAnswers[i];
            const val = simulado.questionValues[i] || 1;
            if (userAns && userAns === correctAns) { score += val; } else if (userAns && simulado.hasPenalty) { score -= val; }
        }
        if (score < 0) score = 0;
        const totalPoints = Object.values(simulado.questionValues).reduce((a: number, b: number) => a + b, 0) || simulado.totalQuestions;
        const percent = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
        const isApproved = simulado.minTotalPercent ? percent >= simulado.minTotalPercent : percent >= 50;
        const result: SimuladoAttempt = { id: attempt?.id || uuid(), userId: user.id, simuladoId: simulado.id, classId: classId, date: new Date().toISOString(), answers, diagnosisReasons: {}, score, isApproved };
        onFinish(result); setShowResult(true); setConfirmFinish(false);
    };

    const ranking = React.useMemo(() => {
        if (!showResult) return [];
        const relevantAttempts = allAttempts.filter(a => a.simuladoId === simulado.id);
        let finalAttempts = [...relevantAttempts];
        if (attempt && !finalAttempts.some(a => a.id === attempt.id)) { finalAttempts.push(attempt); }
        const best: Record<string, SimuladoAttempt> = {};
        finalAttempts.forEach(a => { const existing = best[a.userId]; if (!existing || a.score > existing.score) { best[a.userId] = a; } });
        return Object.values(best).sort((a, b) => b.score - a.score).map((a, index) => {
                const u = allUsersMap[a.userId];
                let displayName = 'Usuário Desconhecido';
                if (u) { if (u.nickname && u.nickname.trim() !== '') { displayName = u.nickname; } else { const parts = u.name.split(' '); displayName = parts[0] + (parts.length > 1 ? ' ' + parts[1].charAt(0) + '.' : ''); } }
                return { rank: index + 1, userId: a.userId, name: displayName, score: a.score, isCurrentUser: a.userId === user.id };
            });
    }, [showResult, allAttempts, simulado.id, attempt, user.id, allUsersMap]);

    return (
        <div className="w-full flex flex-col animate-fade-in pb-10">
             <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#333]">
                <div className="flex items-center gap-4"><button onClick={onBack} className="text-gray-500 hover:text-white flex items-center gap-2 transition"><Icon.ArrowUp className="-rotate-90 w-5 h-5" /> <span className="text-xs font-bold uppercase">Sair do Simulado</span></button><div className="h-6 w-px bg-[#333]"></div><h2 className="font-bold uppercase text-xl text-white">{simulado.title}</h2></div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-[#121212] p-6 rounded-xl border border-[#333] flex flex-col items-center justify-center text-center gap-4 hover:border-white/20 transition group">
                    <div className="w-12 h-12 bg-insanus-red/10 rounded-full flex items-center justify-center group-hover:scale-110 transition"><Icon.Book className="w-6 h-6 text-insanus-red" /></div>
                    <div><h3 className="text-white font-bold uppercase text-sm">Material do Simulado</h3><p className="text-gray-500 text-xs mt-1">Baixe o PDF para resolver as questões.</p></div>
                    {simulado.pdfUrl ? ( <a href={simulado.pdfUrl} target="_blank" rel="noreferrer" className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-6 py-2 rounded-lg text-xs font-bold uppercase transition flex items-center gap-2 shadow-lg"><Icon.Maximize className="w-4 h-4"/> BAIXAR CADERNO DE QUESTÕES</a> ) : ( <span className="text-red-500 text-xs font-bold bg-red-900/10 px-3 py-1 rounded">PDF Indisponível</span> )}
                </div>
                <div className={`bg-[#121212] p-6 rounded-xl border border-[#333] flex flex-col items-center justify-center text-center gap-4 transition group ${!showResult ? 'opacity-50 grayscale' : 'hover:border-white/20'}`}>
                    <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center group-hover:scale-110 transition"><Icon.Check className="w-6 h-6 text-green-500" /></div>
                    <div><h3 className="text-white font-bold uppercase text-sm">Gabarito Comentado</h3><p className="text-gray-500 text-xs mt-1">{showResult ? 'Visualize as respostas e comentários.' : 'Disponível após finalizar o simulado.'}</p></div>
                    {simulado.gabaritoPdfUrl && showResult ? ( <a href={simulado.gabaritoPdfUrl} target="_blank" rel="noreferrer" className="bg-green-600/20 hover:bg-green-600/30 text-green-500 border border-green-600/50 px-6 py-2 rounded-lg text-xs font-bold uppercase transition flex items-center gap-2 shadow-lg"><Icon.Maximize className="w-4 h-4"/> ABRIR GABARITO</a> ) : ( <button disabled className="bg-black/20 text-gray-600 border border-white/5 px-6 py-2 rounded-lg text-xs font-bold uppercase cursor-not-allowed flex items-center gap-2"><Icon.EyeOff className="w-4 h-4"/> {showResult ? 'GABARITO INDISPONÍVEL' : 'BLOQUEADO'}</button> )}
                </div>
             </div>
             {confirmFinish && (<div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"><div className="bg-[#121212] border border-[#333] p-8 rounded-xl max-w-sm w-full text-center shadow-neon"><h3 className="text-xl font-bold text-white mb-2">Finalizar Simulado?</h3><p className="text-gray-400 text-sm mb-6">Confira se marcou todas as respostas no gabarito digital abaixo.</p><div className="flex gap-4"><button onClick={() => setConfirmFinish(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-bold text-xs">VOLTAR</button><button onClick={finishSimulado} className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-bold text-xs shadow-lg">CONFIRMAR</button></div></div></div>)}
             <div className="flex-1 flex flex-col bg-[#050505]">
                {showResult && attempt && (<div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8"><div className={`p-6 rounded-xl border flex flex-col justify-between ${attempt.isApproved ? 'bg-green-900/10 border-green-600/50' : 'bg-red-900/10 border-red-600/50'}`}><div><h3 className={`text-2xl font-black ${attempt.isApproved ? 'text-green-500' : 'text-red-500'}`}>{attempt.isApproved ? 'APROVADO' : 'REPROVADO'}</h3><p className="text-sm text-gray-300 mt-2">Sua pontuação líquida: <span className="font-bold text-white text-xl ml-1">{attempt.score} pontos</span></p></div><div className="mt-4"><p className="text-xs text-gray-500">Data da realização: {formatDate(attempt.date)}</p></div></div><div className="bg-[#121212] border border-[#333] rounded-xl overflow-hidden flex flex-col"><div className="bg-[#1E1E1E] p-3 border-b border-[#333] flex justify-between items-center"><h4 className="text-sm font-bold text-white uppercase flex items-center gap-2"><Icon.List className="w-4 h-4 text-yellow-500"/> Ranking Geral</h4><span className="text-[10px] text-gray-500">{ranking.length} Alunos</span></div><div className="flex-1 overflow-y-auto custom-scrollbar max-h-[200px]"><table className="w-full text-left border-collapse"><thead className="bg-black text-[10px] text-gray-500 font-bold uppercase sticky top-0"><tr><th className="p-2 pl-4">Pos</th><th className="p-2">Aluno</th><th className="p-2 text-right pr-4">Nota</th></tr></thead><tbody>{ranking.map((r) => (<tr key={r.userId} className={`border-b border-[#222] text-xs ${r.isCurrentUser ? 'bg-insanus-red/10' : ''}`}><td className="p-2 pl-4 font-bold text-gray-400">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `${r.rank}º`}</td><td className={`p-2 font-bold ${r.isCurrentUser ? 'text-insanus-red' : 'text-white'}`}>{r.name}{r.isCurrentUser && ' (Você)'}</td><td className="p-2 text-right pr-4 font-mono font-bold text-white">{r.score}</td></tr>))}</tbody></table></div></div></div>)}
                 <div className="bg-[#121212] rounded-xl border border-[#333] p-6"><h3 className="text-white font-bold uppercase mb-6 flex items-center gap-2"><Icon.List className="w-5 h-5 text-insanus-red"/> Gabarito Digital</h3><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{Array.from({ length: simulado.totalQuestions }).map((_, i) => { const qNum = i + 1; const userAns = answers[qNum]; const correctAns = showResult ? simulado.correctAnswers[qNum] : null; const isCorrect = showResult && userAns === correctAns; return (<div key={qNum} className="flex flex-col gap-2 p-3 rounded bg-[#1A1A1A] border border-[#333]"><div className="flex justify-between items-center"><span className="text-xs font-bold text-gray-400">Q{qNum}</span>{showResult && (<span className={`text-[10px] font-bold ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>{isCorrect ? 'ACERTOU' : userAns ? `GAB: ${correctAns}` : `GAB: ${correctAns}`}</span>)}</div><div className="flex gap-1 justify-center">{simulado.type === 'MULTIPLA_ESCOLHA' ? (['A','B','C','D','E'].slice(0, simulado.optionsCount).map(opt => (<button key={opt} onClick={() => handleAnswer(qNum, opt)} disabled={showResult} className={`w-8 h-8 rounded text-[10px] font-bold transition-all ${userAns === opt ? 'bg-white text-black shadow-neon' : 'bg-black border border-[#333] text-gray-500 hover:border-white/50'} ${showResult && correctAns === opt ? '!bg-green-600 !text-white !border-green-600' : ''}`}>{opt}</button>))) : (['C','E'].map(opt => (<button key={opt} onClick={() => handleAnswer(qNum, opt)} disabled={showResult} className={`flex-1 h-8 rounded text-[10px] font-bold transition-all ${userAns === opt ? 'bg-white text-black' : 'bg-black border border-[#333] text-gray-500 hover:border-white/50'} ${showResult && correctAns === opt ? '!bg-green-600 !text-white !border-green-600' : ''}`}>{opt}</button>)))}</div></div>)})}</div></div>
                 {!showResult && (<div className="mt-8"><button onClick={() => setConfirmFinish(true)} className="w-full bg-insanus-red hover:bg-red-700 text-white py-4 rounded-xl font-black text-sm uppercase shadow-neon transition-all transform hover:scale-[1.01] flex items-center justify-center gap-2"><Icon.Check className="w-5 h-5"/> FINALIZAR E ENVIAR RESPOSTAS</button></div>)}
             </div>
        </div>
    );
};

// --- SETUP WIZARD ---
const SetupWizard = ({ user, allPlans, currentPlan, onSave, onPlanAction, onUpdateUser, onSelectPlan }: { user: User, allPlans: StudyPlan[], currentPlan: StudyPlan | null, onSave: (r: Routine, l: UserLevel) => void, onPlanAction: (action: 'pause' | 'reschedule' | 'restart') => void, onUpdateUser: (u: User) => void, onSelectPlan: (id: string) => void }) => {
    const [days, setDays] = useState(user.routine?.days || {});
    const [level, setLevel] = useState<UserLevel>(user.level || 'iniciante');
    const [nickname, setNickname] = useState(user.nickname || '');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changingPass, setChangingPass] = useState(false);
    const [showRestartConfirm, setShowRestartConfirm] = useState(false);
    
    // Feedback state for buttons
    const [processingAction, setProcessingAction] = useState<string | null>(null);

    const handleDayChange = (key: string, val: string) => { setDays(prev => ({ ...prev, [key]: parseInt(val) || 0 })); };
    const handleSaveProfile = async () => { if (nickname.length > 20) return alert("Apelido muito longo (máx 20 caracteres)"); const updatedUser = { ...user, nickname: nickname.trim() }; onUpdateUser(updatedUser); await saveUserToDB(updatedUser); alert("Apelido atualizado!"); };
    const handleChangePassword = async () => { if (!newPassword.trim() || !confirmPassword.trim()) return alert("Preencha os campos de senha."); if (newPassword !== confirmPassword) return alert("As senhas não coincidem."); if (newPassword.length < 4) return alert("A senha deve ter pelo menos 4 caracteres."); setChangingPass(true); try { const updatedUser = { ...user, tempPassword: newPassword }; onUpdateUser(updatedUser); await saveUserToDB(updatedUser); alert("Senha alterada com sucesso!"); setNewPassword(''); setConfirmPassword(''); } catch (e) { alert("Erro ao alterar senha."); } finally { setChangingPass(false); } };
    const isPlanPaused = currentPlan ? user.planConfigs?.[currentPlan.id]?.isPaused : false;
    
    const handleActionClick = async (action: 'pause' | 'reschedule' | 'restart') => {
        if (action === 'reschedule') {
             // eslint-disable-next-line no-restricted-globals
             if(confirm("Isso vai reorganizar todo o cronograma futuro a partir de hoje. Continuar?")) {
                 setProcessingAction(action);
                 await new Promise(r => setTimeout(r, 500)); // Visual feedback
                 await onPlanAction(action);
                 setProcessingAction(null);
             }
        } else {
             await onPlanAction(action);
        }
    };

    return (<div className="w-full space-y-8 animate-fade-in mt-4"><div className="bg-[#121212] p-8 rounded-2xl border border-[#333]"><h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2 border-b border-[#333] pb-4"><Icon.Book className="w-5 h-5 text-insanus-red"/> MEUS PLANOS DISPONÍVEIS</h3>{allPlans.length === 0 ? (<div className="text-gray-500 italic text-sm">Nenhum plano liberado para sua conta. Contate o suporte.</div>) : (<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">{allPlans.map(plan => { const isActive = currentPlan?.id === plan.id; const isPaused = user.planConfigs?.[plan.id]?.isPaused; return (<div key={plan.id} className={`relative rounded-xl border-2 overflow-hidden transition-all group flex flex-col h-full bg-[#0F0F0F] ${isActive ? 'border-insanus-red shadow-neon transform scale-[1.02]' : 'border-[#333] hover:border-gray-500'}`}><div className="aspect-square w-full bg-gray-800 relative overflow-hidden border-b border-[#333]">{plan.coverImage ? ( <img src={plan.coverImage} alt={plan.name} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" /> ) : ( <div className="flex items-center justify-center h-full w-full bg-gradient-to-br from-gray-800 to-black"><Icon.Image className="w-12 h-12 text-gray-600"/></div> )}<div className="absolute top-2 right-2 flex gap-1">{isActive && ( <span className="bg-insanus-red text-white text-[8px] font-black px-2 py-1 rounded uppercase tracking-wider shadow-sm">{isPaused ? 'PAUSADO' : 'ATIVO'}</span> )}{!isActive && ( <span className="bg-black/60 backdrop-blur-sm text-gray-300 border border-white/10 text-[8px] font-bold px-2 py-1 rounded uppercase tracking-wider">DISPONÍVEL</span> )}</div></div><div className="p-3 flex-1 flex flex-col"><div className="mb-2"><span className="text-[9px] text-gray-500 font-bold uppercase block mb-1 truncate">{(plan.category || 'GERAL').replace(/_/g, ' ')}</span><h4 className={`font-black text-sm leading-tight line-clamp-2 ${isActive ? 'text-white' : 'text-gray-300'}`}>{plan.name}</h4></div><div className="flex items-center gap-2 mt-auto pt-2">{isActive ? ( <div className="w-full text-center py-2 bg-insanus-red/10 border border-insanus-red rounded text-insanus-red text-[10px] font-bold uppercase">SELECIONADO</div> ) : ( <button onClick={() => onSelectPlan(plan.id)} className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded text-gray-300 hover:text-white text-[10px] font-bold uppercase transition flex items-center justify-center gap-2">ESCOLHER</button> )}</div></div></div>) })}</div>)}</div>{currentPlan && (<div className="bg-[#121212] p-6 rounded-2xl border border-[#333] relative overflow-hidden"><div className="absolute top-0 left-0 w-1 h-full bg-insanus-red"></div><h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Icon.Edit className="w-5 h-5"/> GESTÃO DO PLANO ATUAL ({currentPlan.name})</h3><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"><div className="bg-[#1E1E1E] p-4 rounded-xl border border-[#333]"><h4 className="font-bold text-gray-300 text-sm mb-2">STATUS DO PLANO</h4><p className="text-xs text-gray-500 mb-4">Pausar o plano interrompe a geração de novas metas diárias até que você retorne.</p><button onClick={() => onPlanAction('pause')} className={`w-full py-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition ${isPlanPaused ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-yellow-600 hover:bg-yellow-500 text-white'}`}>{isPlanPaused ? <Icon.Play className="w-4 h-4"/> : <Icon.Pause className="w-4 h-4"/>}{isPlanPaused ? 'RETOMAR PLANO' : 'PAUSAR PLANO'}</button></div><div className="bg-[#1E1E1E] p-4 rounded-xl border border-[#333]"><h4 className="font-bold text-gray-300 text-sm mb-2">ATRASOS E IMPREVISTOS</h4><p className="text-xs text-gray-500 mb-4">Replanejar define a data de início para HOJE, redistribuindo todas as metas pendentes.</p><button onClick={() => handleActionClick('reschedule')} disabled={!!processingAction} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition">{processingAction === 'reschedule' ? <Icon.RefreshCw className="w-4 h-4 animate-spin"/> : <Icon.RefreshCw className="w-4 h-4"/>}{processingAction === 'reschedule' ? 'PROCESSANDO...' : 'REPLANEJAR ATRASOS'}</button></div><div className="bg-red-900/10 p-4 rounded-xl border border-red-900/30 flex flex-col justify-between"><div><h4 className="font-bold text-red-500 text-sm mb-2 flex items-center gap-2"><Icon.Trash className="w-4 h-4"/> ZONA DE PERIGO</h4><p className="text-xs text-red-400 mb-4">Deseja recomeçar do zero? Isso apagará o progresso deste plano.</p></div><button onClick={() => setShowRestartConfirm(true)} className="w-full py-3 bg-transparent border border-red-600 text-red-500 hover:bg-red-600 hover:text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition">REINICIAR PLANO</button></div></div></div>)}<div className="bg-[#121212] p-8 rounded-2xl border border-[#333]"><div className="text-center mb-10"><Icon.Clock className="w-16 h-16 text-insanus-red mx-auto mb-4" /><h2 className="text-3xl font-black text-white uppercase tracking-tight">Configuração de Rotina</h2><p className="text-gray-400 mt-2 text-sm">Defina seu ritmo e disponibilidade.</p></div><div className="grid grid-cols-1 md:grid-cols-2 gap-12"><div><h3 className="text-lg font-bold text-white mb-4 border-b border-[#333] pb-2 flex items-center gap-2"><Icon.User className="w-4 h-4 text-insanus-red"/> SEU NÍVEL</h3><div className="space-y-3">{[{ id: 'iniciante', label: 'Iniciante', desc: 'Ritmo mais lento de leitura.' }, { id: 'intermediario', label: 'Intermediário', desc: 'Ritmo médio e constante.' }, { id: 'avancado', label: 'Avançado', desc: 'Leitura dinâmica e foco em revisão.' }].map((opt) => (<div key={opt.id} onClick={() => setLevel(opt.id as UserLevel)} className={`p-3 rounded-xl border cursor-pointer transition-all ${level === opt.id ? 'bg-insanus-red/20 border-insanus-red shadow-neon' : 'bg-[#1A1A1A] border-[#333] hover:border-[#555]'}`}><div className="flex justify-between items-center mb-1"><span className={`font-bold uppercase text-sm ${level === opt.id ? 'text-white' : 'text-gray-400'}`}>{opt.label}</span>{level === opt.id && <Icon.Check className="w-4 h-4 text-insanus-red"/>}</div><p className="text-[10px] text-gray-500">{opt.desc}</p></div>))}</div></div><div><h3 className="text-lg font-bold text-white mb-4 border-b border-[#333] pb-2 flex items-center gap-2"><Icon.Calendar className="w-4 h-4 text-insanus-red"/> DISPONIBILIDADE (MIN)</h3><div className="space-y-2">{WEEKDAYS.map(d => (<div key={d.key} className="flex items-center justify-between bg-[#1A1A1A] p-2 px-3 rounded border border-[#333] hover:border-[#555] transition"><span className="text-xs font-bold text-gray-300 uppercase">{d.label}</span><div className="flex items-center gap-2"><input type="number" value={days[d.key] || ''} onChange={e => handleDayChange(d.key, e.target.value)} placeholder="0" className="w-16 bg-[#050505] border border-[#333] rounded p-1 text-right text-white font-mono text-sm focus:border-insanus-red outline-none"/><span className="text-[10px] text-gray-600">min</span></div></div>))}</div></div></div><button onClick={() => onSave({ days }, level)} className="w-full mt-10 bg-insanus-red hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-neon transition transform hover:scale-[1.01] flex items-center justify-center gap-2"><Icon.RefreshCw className="w-5 h-5"/> SALVAR ROTINA E NÍVEL</button></div><div className="bg-[#121212] p-8 rounded-2xl border border-[#333]"><h3 className="text-lg font-bold text-white mb-6 border-b border-[#333] pb-2 flex items-center gap-2"><Icon.User className="w-4 h-4 text-insanus-red"/> PERFIL E RANKING</h3><div className="flex flex-col md:flex-row gap-4 items-end"><div className="flex-1 w-full"><label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Apelido (Exibido no Ranking)</label><input type="text" value={nickname} onChange={e => setNickname(e.target.value)} className="w-full bg-black p-3 rounded-lg border border-white/10 text-white text-sm focus:border-insanus-red focus:outline-none placeholder-gray-700" placeholder="Como você quer ser visto" maxLength={20}/></div><button onClick={handleSaveProfile} className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg border border-gray-700 transition flex items-center justify-center gap-2 shrink-0 h-[46px]">SALVAR PERFIL</button></div></div><div className="bg-[#121212] p-8 rounded-2xl border border-[#333]"><h3 className="text-lg font-bold text-white mb-6 border-b border-[#333] pb-2 flex items-center gap-2"><Icon.Eye className="w-4 h-4 text-insanus-red"/> SEGURANÇA E ACESSO</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Nova Senha</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-black p-3 rounded-lg border border-white/10 text-white text-sm focus:border-insanus-red focus:outline-none placeholder-gray-700" placeholder="Mínimo 4 caracteres"/></div><div><label className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Confirmar Nova Senha</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-black p-3 rounded-lg border border-white/10 text-white text-sm focus:border-insanus-red focus:outline-none placeholder-gray-700" placeholder="Repita a senha"/></div></div><button onClick={handleChangePassword} disabled={changingPass} className="w-full mt-6 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl border border-gray-700 transition flex items-center justify-center gap-2 disabled:opacity-50">{changingPass ? 'SALVANDO...' : 'ALTERAR SENHA'}</button></div></div>);
};

// --- SCHEDULE GENERATOR & HELPERS ---
const expandCycleItems = (cycle: Cycle, plan: StudyPlan): CycleItem[] => { const expandedItems: CycleItem[] = []; cycle.items.forEach(item => { if (item.folderId) { const folderDisciplines = plan.disciplines.filter(d => d.folderId === item.folderId).sort((a, b) => a.order - b.order); folderDisciplines.forEach(d => { expandedItems.push({ disciplineId: d.id, subjectsCount: item.subjectsCount }); }); } else if (item.disciplineId) { expandedItems.push(item); } else if (item.simuladoId) { expandedItems.push(item); } }); return expandedItems; };
const isSimuladoCompleted = (simuladoId: string, attempts: SimuladoAttempt[]) => { return attempts.some(a => a.simuladoId === simuladoId); };
const generateSchedule = (plan: StudyPlan, routine: Routine, startDateStr: string, completedGoalsArr: string[], userLevel: UserLevel, isPaused: boolean, allSimulados: Simulado[], userAttempts: SimuladoAttempt[]): Record<string, ScheduledItem[]> => { 
    const schedule: Record<string, ScheduledItem[]> = {}; 
    if (isPaused) return {}; 
    if (!plan || !plan.cycles || plan.cycles.length === 0) return {}; 
    const hasAvailability = Object.values(routine.days || {}).some(v => v > 0); 
    if (!hasAvailability) return {}; 
    
    // Optimize Lookups
    const completedGoals = new Set(completedGoalsArr);

    const startDate = new Date((startDateStr || getTodayStr()) + 'T00:00:00'); 
    const MAX_DAYS = 365; // Extended for longer plans/backlogs
    
    const disciplineQueues: Record<string, Goal[]> = {}; 
    plan.disciplines.forEach(d => { 
        const flatGoals: Goal[] = []; 
        const sortedSubjects = [...d.subjects].sort((a,b) => a.order - b.order); 
        sortedSubjects.forEach(s => { 
            const sortedGoals = [...s.goals].sort((a,b) => a.order - b.order); 
            sortedGoals.forEach(g => { (g as any)._subjectName = s.name; (g as any)._disciplineName = d.name; flatGoals.push(g); }); 
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
        
        // Increased safety loop for large plans with many completed items
        while (minutesAvailable > 0 && safetyLoop < 100000) { 
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
                        dayItems.push({ uniqueId, date: dateStr, goalId: simulado.id, goalType: 'SIMULADO', title: `SIMULADO: ${simulado.title}`, disciplineName: 'AVALIAÇÃO', subjectName: `${simulado.totalQuestions} Questões`, duration: estDuration, isRevision: false, completed: false, simuladoData: simulado }); 
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
                
                // --- FIX: Optimized Skip Logic ---
                if (completedGoals.has(goal.id)) { 
                    pointer++; 
                    disciplinePointers[cycleItem.disciplineId!] = pointer; 
                    continue; // Skip without consuming time
                }
                
                const duration = calculateGoalDuration(goal, userLevel) || 30; 
                if (minutesAvailable >= duration || itemsProcessedToday === 0) { 
                    const uniqueId = `${dateStr}_${cycle.id}_${cycleItem.disciplineId}_${goal.id}`; 
                    dayItems.push({ uniqueId, date: dateStr, goalId: goal.id, goalType: goal.type, title: goal.title, disciplineName: (goal as any)._disciplineName || "Disciplina", subjectName: (goal as any)._subjectName || "Assunto", duration: duration, isRevision: false, completed: false, originalGoal: goal }); 
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
  const [calendarMode, setCalendarMode] = useState<'month' | 'week'>('month');
  
  // Data State
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<StudyPlan | null>(null);
  const [schedule, setSchedule] = useState<Record<string, ScheduledItem[]>>({});
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [editalExpanded, setEditalExpanded] = useState<string[]>([]);
  
  // Plan Switching State
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  
  // Timer State
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<any>(null);

  // Modal State for Edital
  const [detailsGoal, setDetailsGoal] = useState<Goal | null>(null);

  // Simulados Data
  const [simuladoClasses, setSimuladoClasses] = useState<SimuladoClass[]>([]);
  const [attempts, setAttempts] = useState<SimuladoAttempt[]>([]);
  const [activeSimulado, setActiveSimulado] = useState<Simulado | null>(null);
  const [allAttempts, setAllAttempts] = useState<SimuladoAttempt[]>([]); // For ranking
  const [allUsersMap, setAllUsersMap] = useState<Record<string, User>>({}); // For names in ranking

  // Flashcards
  const [activeFlashcards, setActiveFlashcards] = useState<Flashcard[] | null>(null);

  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
  
  // Action Processing State
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  // Goal Lookup Map for Edital
  const goalMap = useMemo(() => {
      const map: Record<string, Goal> = {};
      if (currentPlan) {
          currentPlan.disciplines.forEach(d => {
              d.subjects.forEach(s => {
                  s.goals.forEach(g => {
                      map[g.id] = g;
                  });
              });
          });
      }
      return map;
  }, [currentPlan]);

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
      
      // Fetch ALL attempts for Ranking
      const fetchedAttempts = await fetchSimuladoAttemptsFromDB();
      setAllAttempts(fetchedAttempts);
      setAttempts(fetchedAttempts.filter(a => a.userId === user.id)); // Filter for current user view

      // Fetch ALL users for Ranking Names
      const fetchedUsers = await fetchUsersFromDB();
      const userMap: Record<string, User> = {};
      fetchedUsers.forEach(u => userMap[u.id] = u);
      setAllUsersMap(userMap);
      
      const hasRoutine = user.routine && user.routine.days && Object.values(user.routine.days).some((v: number) => v > 0);
      if (!hasRoutine) setView('setup'); 
  };

  const initiatePlanSwitch = (newPlanId: string) => {
      if (newPlanId === currentPlan?.id) return;
      setPendingPlanId(newPlanId);
  };

  const confirmPlanSwitch = async () => {
      if (!pendingPlanId) return;
      
      const targetPlan = plans.find(p => p.id === pendingPlanId);
      if (!targetPlan) return;

      const oldPlanId = currentPlan?.id;
      const newConfigs = { ...user.planConfigs };

      // 1. Pause Old Plan
      if (oldPlanId) {
          newConfigs[oldPlanId] = {
              ...(newConfigs[oldPlanId] || { startDate: getTodayStr() }),
              isPaused: true
          };
      }

      // 2. Initialize or Unpause New Plan
      if (!newConfigs[pendingPlanId]) {
          newConfigs[pendingPlanId] = { startDate: getTodayStr(), isPaused: false };
      } else {
          newConfigs[pendingPlanId] = {
              ...newConfigs[pendingPlanId],
              isPaused: false
          };
      }

      // 3. Update User
      const updatedUser = {
          ...user,
          currentPlanId: pendingPlanId,
          planConfigs: newConfigs
      };

      setCurrentPlan(targetPlan);
      onUpdateUser(updatedUser);
      await saveUserToDB(updatedUser);
      
      // 4. Reload Data Context
      setPendingPlanId(null);
      loadData(); // Re-fetches appropriate simulado classes etc
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

  const handlePlanAction = async (action: 'pause' | 'reschedule' | 'restart') => {
      if (!currentPlan) return;
      const config = user.planConfigs[currentPlan.id] || { startDate: getTodayStr(), isPaused: false };
      
      // LOGIC FOR RESTART
      if (action === 'restart') {
          // 1. Get all IDs of goals in this plan
          const planGoalIds = new Set<string>();
          currentPlan.disciplines.forEach(d => {
              d.subjects.forEach(s => {
                  s.goals.forEach(g => planGoalIds.add(g.id));
              });
          });

          // 2. Filter out completed goals that belong to this plan
          const newCompletedGoals = user.progress.completedGoalIds.filter(id => !planGoalIds.has(id));
          
          // 3. Filter revisions (id format: goalId_revIdx)
          const newCompletedRevisions = user.progress.completedRevisionIds.filter(revId => {
              const originalGoalId = revId.split('_')[0];
              return !planGoalIds.has(originalGoalId);
          });

          // 4. Reset Plan Specific Study Time
          const newPlanStudySeconds = { ...user.progress.planStudySeconds };
          newPlanStudySeconds[currentPlan.id] = 0;

          const updatedUser = {
              ...user,
              planConfigs: { 
                  ...user.planConfigs, 
                  [currentPlan.id]: { startDate: getTodayStr(), isPaused: false } 
              },
              progress: {
                  ...user.progress,
                  completedGoalIds: newCompletedGoals,
                  completedRevisionIds: newCompletedRevisions,
                  planStudySeconds: newPlanStudySeconds
              }
          };

          onUpdateUser(updatedUser);
          await saveUserToDB(updatedUser);
          alert("Plano reiniciado com sucesso! Boa sorte no recomeço.");
          return;
      }

      // LOGIC FOR PAUSE / RESCHEDULE
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

  const handleActionClick = async (action: 'pause' | 'reschedule' | 'restart') => {
    if (action === 'reschedule') {
         // eslint-disable-next-line no-restricted-globals
         if(confirm("Isso vai reorganizar todo o cronograma futuro a partir de hoje. Continuar?")) {
             setProcessingAction(action);
             await new Promise(r => setTimeout(r, 500)); // Visual feedback
             await handlePlanAction(action);
             setProcessingAction(null);
         }
    } else {
         await handlePlanAction(action);
    }
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
      setAllAttempts(prev => [...prev, result]); // Also update global ranking data locally
      // setActiveSimulado(null); // Keep open to show result
  };

  const toggleAccordion = (uniqueId: string) => {
      setExpandedItems(prev => prev.includes(uniqueId) ? prev.filter(id => id !== uniqueId) : [...prev, uniqueId]);
  }

  // --- VIEWS ---
  const renderCalendarView = () => {
    // Determine the days to show
    const daysToShow: { dateStr: string, isCurrentMonth: boolean }[] = [];
    const year = calendarBaseDate.getFullYear();
    const month = calendarBaseDate.getMonth();

    if (calendarMode === 'month') {
        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday

        // Padding previous month
        for (let i = 0; i < startDayOfWeek; i++) {
            const d = new Date(year, month, 1);
            d.setDate(d.getDate() - (startDayOfWeek - i));
            daysToShow.push({ dateStr: d.toISOString().split('T')[0], isCurrentMonth: false });
        }

        // Current Month
        for (let i = 1; i <= daysInMonth; i++) {
            const d = new Date(year, month, i);
            daysToShow.push({ dateStr: d.toISOString().split('T')[0], isCurrentMonth: true });
        }

        // Padding next month (to fill 35 or 42 grid)
        const remaining = 42 - daysToShow.length;
        for (let i = 1; i <= remaining; i++) {
            const d = new Date(year, month + 1, i);
            daysToShow.push({ dateStr: d.toISOString().split('T')[0], isCurrentMonth: false });
        }
    } else {
        // Weekly Mode
        const currentDay = calendarBaseDate.getDay(); // 0-6
        const startOfWeek = new Date(calendarBaseDate);
        startOfWeek.setDate(calendarBaseDate.getDate() - currentDay);

        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            daysToShow.push({ dateStr: d.toISOString().split('T')[0], isCurrentMonth: true });
        }
    }

    const handlePrevPeriod = () => {
        const newDate = new Date(calendarBaseDate);
        if (calendarMode === 'month') newDate.setMonth(newDate.getMonth() - 1);
        else newDate.setDate(newDate.getDate() - 7);
        setCalendarBaseDate(newDate);
    };

    const handleNextPeriod = () => {
        const newDate = new Date(calendarBaseDate);
        if (calendarMode === 'month') newDate.setMonth(newDate.getMonth() + 1);
        else newDate.setDate(newDate.getDate() + 7);
        setCalendarBaseDate(newDate);
    };

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

    return (
        <div className="w-full animate-fade-in space-y-6 h-full flex flex-col">
             <div className="flex justify-between items-center border-b border-[#333] pb-4 shrink-0">
                 <div>
                    <h2 className="text-3xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                        <Icon.Calendar className="w-6 h-6 text-insanus-red"/>
                        CALENDÁRIO
                    </h2>
                    <p className="text-gray-500 text-xs font-mono uppercase mt-1">
                        {monthNames[calendarBaseDate.getMonth()]} {calendarBaseDate.getFullYear()}
                    </p>
                 </div>
                 <div className="flex items-center gap-4">
                     <div className="flex bg-[#121212] rounded-lg border border-[#333] p-1">
                         <button onClick={() => setCalendarMode('month')} className={`px-3 py-1 rounded text-xs font-bold uppercase transition ${calendarMode === 'month' ? 'bg-insanus-red text-white' : 'text-gray-500 hover:text-white'}`}>Mês</button>
                         <button onClick={() => setCalendarMode('week')} className={`px-3 py-1 rounded text-xs font-bold uppercase transition ${calendarMode === 'week' ? 'bg-insanus-red text-white' : 'text-gray-500 hover:text-white'}`}>Semana</button>
                     </div>
                     <div className="flex gap-1">
                         <button onClick={handlePrevPeriod} className="p-2 bg-[#121212] border border-[#333] rounded-lg text-gray-400 hover:text-white hover:border-white/20 transition"><Icon.ArrowUp className="-rotate-90 w-4 h-4"/></button>
                         <button onClick={() => setCalendarBaseDate(new Date())} className="px-3 py-2 bg-[#121212] border border-[#333] rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:border-white/20 transition uppercase">Hoje</button>
                         <button onClick={handleNextPeriod} className="p-2 bg-[#121212] border border-[#333] rounded-lg text-gray-400 hover:text-white hover:border-white/20 transition"><Icon.ArrowDown className="-rotate-90 w-4 h-4"/></button>
                     </div>
                 </div>
             </div>

             <div className="flex-1 flex flex-col min-h-0 bg-[#121212] rounded-xl border border-[#333] overflow-hidden">
                 {/* Header Days */}
                 <div className="grid grid-cols-7 border-b border-[#333] bg-[#1E1E1E]">
                     {WEEKDAYS.map(d => (
                         <div key={d.key} className="text-center text-[10px] font-bold text-gray-500 uppercase py-3 border-r border-[#333] last:border-r-0">
                             {d.label.slice(0,3)}
                         </div>
                     ))}
                 </div>
                 
                 {/* Calendar Grid */}
                 <div className={`grid grid-cols-7 flex-1 ${calendarMode === 'week' ? 'auto-rows-fr' : 'grid-rows-6'}`}>
                     {daysToShow.map((day, idx) => {
                         const items = schedule[day.dateStr] || [];
                         const isSelected = day.dateStr === selectedDate;
                         const isToday = day.dateStr === getTodayStr();
                         const todayStr = getTodayStr();
                         const isPast = day.dateStr < todayStr;
                         const isWeek = calendarMode === 'week';
                         
                         return (
                             <div 
                                key={`${day.dateStr}-${idx}`} 
                                onClick={() => { setSelectedDate(day.dateStr); setView('daily'); }}
                                className={`border-r border-b border-[#333] relative flex flex-col p-2 cursor-pointer transition hover:bg-white/5 
                                    ${!day.isCurrentMonth ? 'bg-black/40 opacity-50' : ''}
                                    ${isSelected ? 'bg-insanus-red/10 inset-shadow-red' : ''}
                                `}
                             >
                                 <div className="flex justify-between items-start mb-2">
                                     <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-insanus-red text-white' : day.isCurrentMonth ? 'text-white' : 'text-gray-600'}`}>
                                         {day.dateStr.split('-')[2]}
                                     </span>
                                 </div>
                                 
                                 <div className="flex-1 w-full flex flex-col gap-1 overflow-hidden">
                                     {items.slice(0, calendarMode === 'week' ? 10 : 3).map((item, i) => {
                                         const isLate = isPast && !item.completed;
                                         const color = item.goalType === 'SIMULADO' ? '#3B82F6' : (item.originalGoal?.color || '#333');
                                         
                                         if (isWeek) {
                                             // Block/Square Style for Week View (CORRECTED)
                                             return (
                                                 <div 
                                                    key={i} 
                                                    className={`
                                                        relative flex flex-col justify-between p-3 rounded-lg border border-[#333] mb-2 transition-all hover:scale-[1.02]
                                                        ${item.completed ? 'opacity-50 grayscale' : 'shadow-lg'}
                                                        ${isLate ? 'border-red-500 shadow-[0_0_10px_rgba(255,31,31,0.3)]' : ''}
                                                    `}
                                                    style={{ 
                                                        backgroundColor: '#1A1A1A', // Base dark card
                                                        borderLeft: `4px solid ${isLate ? '#EF4444' : color}`
                                                    }}
                                                    title={item.title}
                                                 >
                                                     <div className="flex justify-between items-center mb-2">
                                                        <span className="text-[9px] font-black bg-white/10 px-2 py-0.5 rounded text-white uppercase tracking-wider border border-white/5">
                                                            {item.goalType.replace(/_/g, ' ')}
                                                        </span>
                                                        <div className="flex gap-1">
                                                            {item.completed && <Icon.Check className="w-4 h-4 text-green-500 shrink-0"/>}
                                                            {isLate && !item.completed && <Icon.Clock className="w-4 h-4 text-red-500 shrink-0"/>}
                                                        </div>
                                                     </div>

                                                     <span className="text-xs font-bold text-white leading-tight line-clamp-3 mb-2">{item.title}</span>

                                                     <div className="mt-auto pt-2 border-t border-white/10 w-full">
                                                        <p className="text-[10px] text-white font-bold uppercase truncate">{item.disciplineName}</p>
                                                        <p className="text-[9px] text-gray-300 truncate">{item.subjectName}</p>
                                                        <div className="mt-1 flex items-center gap-1 text-[9px] text-gray-200 font-mono bg-white/5 rounded px-2 py-0.5 w-fit border border-white/5">
                                                            <Icon.Clock className="w-3 h-3 text-gray-400"/> {item.duration} min
                                                        </div>
                                                     </div>
                                                 </div>
                                             )
                                         }

                                         // Month View Style (Slim Bar)
                                         return (
                                             <div 
                                                key={i} 
                                                className={`
                                                    text-[9px] font-bold px-2 py-1 rounded truncate border flex items-center gap-1
                                                    ${item.completed ? 'opacity-50 line-through' : ''}
                                                    ${isLate ? 'border-red-500 shadow-[0_0_5px_rgba(255,31,31,0.5)] text-white' : 'border-transparent text-white'}
                                                `}
                                                style={{ backgroundColor: isLate ? 'rgba(255,31,31,0.1)' : color }}
                                                title={item.title}
                                             >
                                                 {isLate && <Icon.Clock className="w-3 h-3 text-red-500"/>}
                                                 {item.title}
                                             </div>
                                         )
                                     })}
                                     {items.length > (calendarMode === 'week' ? 10 : 3) && (
                                         <span className="text-[9px] font-bold text-gray-500 pl-1">
                                             +{items.length - (calendarMode === 'week' ? 10 : 3)} metas
                                         </span>
                                     )}
                                 </div>
                             </div>
                         );
                     })}
                 </div>
             </div>
        </div>
    );
  };

  const renderGoalDetailsModal = () => {
      if (!detailsGoal) return null;

      const g = detailsGoal;
      const isActive = activeGoalId === g.id;
      const isCompleted = user.progress.completedGoalIds.includes(g.id);

      return (
          <div className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-[#121212] w-full max-w-2xl rounded-2xl border border-[#333] shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
                  {/* Header */}
                  <div className="p-6 border-b border-[#333] bg-[#1E1E1E]">
                      <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-black uppercase tracking-wider bg-black/40 border border-white/10 px-2 py-1 rounded text-white">{g.type}</span>
                          <button onClick={() => setDetailsGoal(null)} className="text-gray-500 hover:text-white transition"><Icon.LogOut className="w-6 h-6"/></button>
                      </div>
                      <h2 className="text-2xl font-black text-white leading-tight mb-2">{g.title}</h2>
                      {g.hasRevision && (
                          <div className="flex items-center gap-2 text-xs text-yellow-500 font-bold bg-yellow-900/10 px-2 py-1 rounded w-fit border border-yellow-500/20">
                              <Icon.RefreshCw className="w-3 h-3"/> 🔁 Revisão Ativa (Intervalos: {g.revisionIntervals})
                          </div>
                      )}
                  </div>

                  {/* Body Content */}
                  <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                      {/* Description if any */}
                      {g.description && (
                          <div className="text-sm text-gray-400 bg-black/30 p-4 rounded-xl border border-white/5">
                              {g.description}
                          </div>
                      )}

                      {/* Content Logic based on Type */}
                      {g.type === 'AULA' && (
                          <div className="space-y-3">
                              <h4 className="text-sm font-bold text-gray-300 uppercase border-b border-[#333] pb-2">Aulas Disponíveis</h4>
                              {g.subGoals && g.subGoals.length > 0 ? (
                                  g.subGoals.map((sub, idx) => (
                                      <div key={idx} className="flex items-center justify-between bg-[#1A1A1A] p-3 rounded-lg border border-[#333]">
                                          <div className="flex flex-col">
                                              <span className="text-white font-bold text-sm">{idx + 1}. {sub.title}</span>
                                              <span className="text-[10px] text-gray-500">{sub.duration} min</span>
                                          </div>
                                          {sub.link ? (
                                              <a href={sub.link} target="_blank" rel="noreferrer" className="bg-insanus-red hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-bold uppercase flex items-center gap-2 transition">
                                                  <Icon.Play className="w-3 h-3"/> Assistir
                                              </a>
                                          ) : <span className="text-[10px] text-gray-600 italic">Sem Link</span>}
                                      </div>
                                  ))
                              ) : <div className="text-gray-500 italic text-sm">Nenhuma aula cadastrada.</div>}
                          </div>
                      )}

                      {(g.type === 'MATERIAL' || g.type === 'QUESTOES' || g.type === 'RESUMO' || g.type === 'LEI_SECA') && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {g.pdfUrl ? (
                                  <a href={g.pdfUrl} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center gap-2 bg-[#1A1A1A] hover:bg-[#222] border border-[#333] hover:border-white/20 p-6 rounded-xl transition group">
                                      <Icon.FileText className="w-8 h-8 text-blue-500 group-hover:scale-110 transition-transform"/>
                                      <span className="text-xs font-bold text-white uppercase">Abrir Arquivo PDF</span>
                                  </a>
                              ) : (
                                  <div className="flex flex-col items-center justify-center gap-2 bg-[#1A1A1A] opacity-50 p-6 rounded-xl border border-[#333]">
                                      <Icon.FileText className="w-8 h-8 text-gray-600"/>
                                      <span className="text-xs font-bold text-gray-500 uppercase">PDF Indisponível</span>
                                  </div>
                              )}

                              {g.link ? (
                                  <a href={g.link} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center gap-2 bg-[#1A1A1A] hover:bg-[#222] border border-[#333] hover:border-white/20 p-6 rounded-xl transition group">
                                      <Icon.Link className="w-8 h-8 text-purple-500 group-hover:scale-110 transition-transform"/>
                                      <span className="text-xs font-bold text-white uppercase">Acessar Link Externo</span>
                                  </a>
                              ) : (
                                  <div className="flex flex-col items-center justify-center gap-2 bg-[#1A1A1A] opacity-50 p-6 rounded-xl border border-[#333]">
                                      <Icon.Link className="w-8 h-8 text-gray-600"/>
                                      <span className="text-xs font-bold text-gray-500 uppercase">Link Indisponível</span>
                                  </div>
                              )}
                          </div>
                      )}

                      {g.type === 'REVISAO' && (
                          <div className="space-y-4">
                              <button 
                                  onClick={() => { setDetailsGoal(null); setActiveFlashcards(g.flashcards || []); }}
                                  disabled={!g.flashcards || g.flashcards.length === 0}
                                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold uppercase shadow-[0_0_20px_rgba(37,99,235,0.3)] transition flex items-center justify-center gap-3"
                              >
                                  <Icon.RefreshCw className="w-6 h-6"/>
                                  {(!g.flashcards || g.flashcards.length === 0) ? 'Sem Flashcards' : 'Iniciar Sessão de Flashcards'}
                              </button>
                              
                              {g.link && (
                                  <a href={g.link} target="_blank" rel="noreferrer" className="block text-center text-xs font-bold text-blue-400 hover:text-white hover:underline mt-2">
                                      Acessar Material de Apoio Externo
                                  </a>
                              )}
                          </div>
                      )}
                  </div>

                  {/* Footer Actions */}
                  <div className="p-4 border-t border-[#333] bg-[#151515] flex gap-3">
                      <button 
                          onClick={() => { setDetailsGoal(null); startTimer(g.id); }}
                          className={`flex-1 py-3 rounded-xl font-bold uppercase text-xs transition flex items-center justify-center gap-2 ${isActive ? 'bg-yellow-600 text-white' : 'bg-insanus-red text-white hover:bg-red-600'}`}
                      >
                          {isActive ? <><Icon.Pause className="w-4 h-4"/> Em Andamento</> : <><Icon.Play className="w-4 h-4"/> Iniciar Cronômetro</>}
                      </button>
                      <button 
                          onClick={() => { toggleGoalComplete(g.id); if(!isCompleted) setDetailsGoal(null); }}
                          className={`px-6 py-3 rounded-xl font-bold uppercase text-xs transition border flex items-center gap-2 ${isCompleted ? 'bg-green-600 text-white border-green-600' : 'bg-transparent text-gray-400 border-white/10 hover:text-white hover:border-white'}`}
                      >
                          <Icon.Check className="w-4 h-4"/> {isCompleted ? 'Concluída' : 'Concluir'}
                      </button>
                  </div>
              </div>
          </div>
      );
  };

  const renderEditalView = () => {
      if (!currentPlan?.editalVerticalizado || currentPlan.editalVerticalizado.length === 0) {
          return <div className="text-center py-20 text-gray-500 italic">Edital Verticalizado não configurado para este plano.</div>;
      }

      // Order definition as requested
      const typeOrder = ['aula', 'material', 'leiSeca', 'questoes', 'resumo', 'revisao'];
      const typeLabels: Record<string, string> = {
          aula: 'AULA',
          material: 'MATERIAL',
          leiSeca: 'LEI SECA',
          questoes: 'QUESTÕES',
          resumo: 'RESUMO',
          revisao: 'REVISÃO'
      };

      // --- STATISTICS CALCULATION ---
      let globalTotal = 0;
      let globalCompleted = 0;
      const disciplineStats: Record<string, { total: number, completed: number, percent: number }> = {};

      currentPlan.editalVerticalizado.forEach(disc => {
          let dTotal = 0;
          let dCompleted = 0;

          disc.topics.forEach(topic => {
              typeOrder.forEach(key => {
                  // @ts-ignore
                  const goalId = topic.links[key];
                  if (goalId && goalMap[goalId]) {
                      dTotal++;
                      globalTotal++;
                      if (user.progress.completedGoalIds.includes(goalId)) {
                          dCompleted++;
                          globalCompleted++;
                      }
                  }
              });
          });

          disciplineStats[disc.id] = {
              total: dTotal,
              completed: dCompleted,
              percent: dTotal > 0 ? Math.round((dCompleted / dTotal) * 100) : 0
          };
      });

      const globalPercent = globalTotal > 0 ? Math.round((globalCompleted / globalTotal) * 100) : 0;

      return (
          <div className="w-full animate-fade-in space-y-6 pb-12">
              <h2 className="text-3xl font-black text-white mb-6 border-b border-[#333] pb-4">EDITAL VERTICALIZADO</h2>
              
              {/* GLOBAL PROGRESS BAR */}
              <div className="bg-[#121212] p-6 rounded-xl border border-[#333] relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-insanus-red"></div>
                  <div className="flex justify-between items-end mb-2 relative z-10">
                      <div>
                          <h3 className="text-lg font-black text-white uppercase tracking-tighter">Progresso Geral</h3>
                          <p className="text-xs text-gray-500 font-mono mt-1">
                              {globalCompleted} de {globalTotal} metas concluídas
                          </p>
                      </div>
                      <div className="text-right">
                          <span className="text-3xl font-black text-insanus-red">{globalPercent}%</span>
                      </div>
                  </div>
                  <div className="w-full h-3 bg-black rounded-full overflow-hidden border border-white/5 relative z-10">
                      <div 
                          className="h-full bg-insanus-red shadow-[0_0_15px_rgba(255,31,31,0.5)] transition-all duration-1000 ease-out"
                          style={{ width: `${globalPercent}%` }}
                      ></div>
                  </div>
                  {/* Background Decoration */}
                  <div className="absolute right-0 top-0 w-32 h-32 bg-insanus-red/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
              </div>

              <div className="space-y-4">
                  {currentPlan.editalVerticalizado.map((disc) => {
                      const stats = disciplineStats[disc.id] || { total: 0, completed: 0, percent: 0 };
                      const isFullyComplete = stats.percent === 100 && stats.total > 0;

                      return (
                      <div key={disc.id} className="bg-[#121212] rounded-xl border border-[#333] overflow-hidden transition-all hover:border-gray-600">
                          <button 
                            onClick={() => setEditalExpanded(prev => prev.includes(disc.id) ? prev.filter(id => id !== disc.id) : [...prev, disc.id])}
                            className="w-full bg-[#1E1E1E] p-4 flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-white/5 transition group"
                          >
                              <div className="flex items-center gap-4 w-full md:w-auto">
                                  <div className={`w-1 h-8 rounded ${isFullyComplete ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-insanus-red'}`}></div>
                                  <div className="text-left">
                                      <h3 className={`font-bold uppercase text-sm md:text-base ${isFullyComplete ? 'text-green-500' : 'text-white'}`}>{disc.name}</h3>
                                      <span className="text-[10px] text-gray-500 font-bold">{stats.completed}/{stats.total} Metas</span>
                                  </div>
                              </div>

                              <div className="flex items-center gap-4 w-full md:w-1/3">
                                  <div className="flex-1 flex flex-col gap-1">
                                      <div className="flex justify-between items-center">
                                          <span className="text-[9px] font-bold text-gray-500 uppercase">Progresso</span>
                                          <span className={`text-[10px] font-black ${isFullyComplete ? 'text-green-500' : 'text-white'}`}>{stats.percent}%</span>
                                      </div>
                                      <div className="w-full h-1.5 bg-black rounded-full overflow-hidden border border-white/5">
                                          <div 
                                              className={`h-full transition-all duration-700 ${isFullyComplete ? 'bg-green-500' : 'bg-gray-500 group-hover:bg-white'}`}
                                              style={{ width: `${stats.percent}%` }}
                                          ></div>
                                      </div>
                                  </div>
                                  <Icon.ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${editalExpanded.includes(disc.id) ? 'rotate-180' : ''}`}/>
                              </div>
                          </button>
                          
                          {editalExpanded.includes(disc.id) && (
                              <div className="p-4 space-y-4 animate-fade-in bg-[#0A0A0A]">
                                  {disc.topics.map((topic) => {
                                      // 1. Resolve Linked Goals with SPECIFIC ORDER
                                      const linkedGoals = typeOrder.map((key) => {
                                          const goalId = topic.links[key as keyof typeof topic.links];
                                          if (!goalId) return null;
                                          const goal = goalMap[goalId];
                                          if (!goal) return null;
                                          const isCompleted = user.progress.completedGoalIds.includes(goalId);
                                          return { 
                                              typeKey: key, 
                                              label: typeLabels[key], 
                                              goal, 
                                              isCompleted 
                                          };
                                      }).filter(Boolean) as { typeKey: string, label: string, goal: Goal, isCompleted: boolean }[];

                                      // 2. Check Topic Completion (if it has links and all are done)
                                      const isTopicComplete = linkedGoals.length > 0 && linkedGoals.every(l => l.isCompleted);

                                      return (
                                          <div key={topic.id} className="bg-[#151515] border border-[#333] rounded-xl p-4 shadow-sm">
                                              <div className="flex items-center gap-3 mb-4 pb-2 border-b border-[#222]">
                                                  <div className={`w-5 h-5 rounded border flex items-center justify-center ${isTopicComplete ? 'bg-green-500 border-green-500' : 'border-gray-600 bg-black'}`}>
                                                      {isTopicComplete && <Icon.Check className="w-3 h-3 text-black font-bold"/>}
                                                  </div>
                                                  <span className={`text-sm font-bold uppercase ${isTopicComplete ? 'text-green-500' : 'text-gray-300'}`}>{topic.name}</span>
                                              </div>
                                              
                                              {/* 3. Render Linked Goals Details - HORIZONTAL CARDS */}
                                              {linkedGoals.length > 0 ? (
                                                  <div className="flex flex-wrap gap-3">
                                                      {linkedGoals.map((link, idx) => {
                                                          const goal = link.goal;
                                                          const isActive = activeGoalId === goal.id;
                                                          // Use Goal Color or fallback
                                                          const goalColor = goal.color || '#333'; 

                                                          return (
                                                              <div 
                                                                key={idx} 
                                                                onClick={() => setDetailsGoal(goal)}
                                                                className={`
                                                                    relative flex flex-col justify-between bg-[#1E1E1E] rounded-lg border min-w-[220px] flex-1 max-w-[320px] shadow-lg transition-all hover:-translate-y-1 cursor-pointer group
                                                                    ${link.isCompleted ? 'opacity-60 grayscale border-green-900' : 'border-[#333] hover:border-gray-500'}
                                                                    ${isActive ? 'ring-1 ring-insanus-red shadow-[0_0_15px_rgba(255,31,31,0.1)]' : ''}
                                                                `}
                                                                style={{ borderTop: `4px solid ${goalColor}` }}
                                                              >
                                                                  <div className="p-3 pb-2">
                                                                      <div className="flex justify-between items-start mb-2">
                                                                          <span 
                                                                            className="text-[9px] font-black px-2 py-0.5 rounded text-white uppercase tracking-wider shadow-sm"
                                                                            style={{ backgroundColor: goalColor }}
                                                                          >
                                                                              {link.label}
                                                                          </span>
                                                                          <div className="flex gap-1">
                                                                              {goal.hasRevision && <Icon.RefreshCw className="w-3 h-3 text-yellow-500" title="Revisão Ativa"/>}
                                                                              {link.isCompleted && <Icon.Check className="w-4 h-4 text-green-500"/>}
                                                                          </div>
                                                                      </div>
                                                                      <h4 className="text-xs font-bold text-white leading-snug line-clamp-2 h-8" title={goal.title}>
                                                                          {goal.title}
                                                                      </h4>
                                                                  </div>

                                                                  {/* Control Bar */}
                                                                  <div className="bg-black/20 p-2 border-t border-white/5 flex items-center justify-between gap-2">
                                                                      <button 
                                                                        onClick={(e) => { e.stopPropagation(); startTimer(goal.id); }}
                                                                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-[10px] font-bold uppercase transition ${isActive ? 'bg-insanus-red text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'}`}
                                                                      >
                                                                          {isActive ? <Icon.Pause className="w-3 h-3"/> : <Icon.Play className="w-3 h-3"/>}
                                                                          {isActive ? 'PAUSAR' : 'ESTUDAR'}
                                                                      </button>

                                                                      <div className="flex gap-1 border-l border-white/10 pl-2">
                                                                          <div className="p-1.5 text-gray-500 group-hover:text-white transition" title="Ver Detalhes">
                                                                              <Icon.Eye className="w-3 h-3"/>
                                                                          </div>
                                                                      </div>
                                                                  </div>
                                                              </div>
                                                          );
                                                      })}
                                                  </div>
                                              ) : (
                                                  <div className="ml-1 text-[10px] text-gray-600 italic border border-dashed border-[#333] rounded p-2 text-center">
                                                      Nenhuma meta vinculada neste tópico.
                                                  </div>
                                              )}
                                          </div>
                                      );
                                  })}
                              </div>
                          )}
                      </div>
                  )})}
              </div>
          </div>
      );
  };

  const renderDailyView = () => {
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
                              onClick={() => handleActionClick('reschedule')} 
                              disabled={!!processingAction}
                              className="bg-insanus-red hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-neon flex items-center gap-2 disabled:opacity-50"
                          >
                              {processingAction === 'reschedule' ? <Icon.RefreshCw className="w-4 h-4 animate-spin"/> : <Icon.RefreshCw className="w-4 h-4"/>}
                              {processingAction === 'reschedule' ? 'PROCESSANDO...' : 'REPLANEJAR TUDO'}
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
                      {isTimerRunning && (
                       <div className="bg-[#1A1A1A] border border-insanus-red px-4 py-2 rounded-lg flex items-center gap-3 animate-pulse shadow-[0_0_15px_rgba(255,31,31,0.2)] mb-2">
                           <div className="w-2 h-2 bg-insanus-red rounded-full animate-ping"></div>
                           <span className="text-insanus-red font-black font-mono text-xl">{formatStopwatch(timerSeconds)}</span>
                           <button onClick={pauseTimer} className="bg-white/10 hover:bg-white/20 p-1 rounded-full text-white"><Icon.Pause className="w-4 h-4"/></button>
                       </div>
                      )}
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
                                            <div className="mt-4 flex gap-2 flex-wrap">
                                                {!isActive ? (
                                                    <button onClick={() => startTimer(item.goalId)} className="flex items-center gap-2 bg-insanus-red hover:bg-red-600 px-4 py-2 rounded text-xs font-bold text-white transition shadow-neon"><Icon.Play className="w-3 h-3" /> INICIAR</button>
                                                ) : (
                                                    <>
                                                        {isTimerRunning ? <button onClick={pauseTimer} className="flex items-center gap-2 bg-yellow-600 px-4 py-2 rounded text-xs font-bold text-white"><Icon.Pause className="w-3 h-3" /> PAUSAR</button> : <button onClick={() => setIsTimerRunning(true)} className="flex items-center gap-2 bg-green-600 px-4 py-2 rounded text-xs font-bold text-white"><Icon.Play className="w-3 h-3" /> RETOMAR</button>}
                                                        <button onClick={() => saveStudyTime(false)} className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded text-xs font-bold text-white"><Icon.Check className="w-3 h-3" /> SALVAR TEMPO</button>
                                                    </>
                                                )}
                                                
                                                {/* Flashcard Button */}
                                                {item.goalType === 'REVISAO' && item.originalGoal?.flashcards && item.originalGoal.flashcards.length > 0 && (
                                                    <button 
                                                        onClick={() => setActiveFlashcards(item.originalGoal!.flashcards!)}
                                                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-xs font-bold text-white transition shadow-[0_0_10px_rgba(37,99,235,0.4)]"
                                                    >
                                                        <Icon.RefreshCw className="w-3 h-3"/> PRATICAR FLASHCARDS
                                                    </button>
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

  return (
    <div className="flex h-full w-full bg-[#050505] text-gray-200 overflow-hidden relative">
        {/* MODAL LAYER */}
        {detailsGoal && renderGoalDetailsModal()}

        {/* PLAN SWITCH CONFIRMATION MODAL */}
        {pendingPlanId && (
            <div className="absolute inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
                <div className="bg-[#121212] border border-[#333] rounded-2xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-insanus-red"></div>
                    <div className="flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-insanus-red/10 rounded-full flex items-center justify-center mb-6 border border-insanus-red/50">
                            <Icon.RefreshCw className="w-8 h-8 text-insanus-red animate-spin-slow"/>
                        </div>
                        <h3 className="text-2xl font-black text-white uppercase mb-2">Trocar de Plano?</h3>
                        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
                            Ao confirmar, o plano atual <strong>{currentPlan?.name}</strong> será <span className="text-yellow-500 font-bold">PAUSADO</span>.
                            <br/><br/>
                            Seus dados de progresso (metas cumpridas e tempo de estudo) serão salvos automaticamente e você poderá retomar de onde parou quando voltar.
                        </p>
                        <div className="flex gap-4 w-full">
                            <button 
                                onClick={() => setPendingPlanId(null)} 
                                className="flex-1 bg-transparent border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 font-bold py-3 rounded-xl text-xs transition uppercase"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={confirmPlanSwitch} 
                                className="flex-1 bg-insanus-red hover:bg-red-600 text-white font-bold py-3 rounded-xl text-xs transition shadow-neon uppercase flex items-center justify-center gap-2"
                            >
                                Confirmar Troca <Icon.Check className="w-4 h-4"/>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* SIDEBAR FOR USER (Replacing Top Bar for consistency) */}
        <aside className="w-64 bg-[#0F0F0F] border-r border-[#333] flex flex-col shrink-0 z-20">
            <div className="p-6 border-b border-[#333]">
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-6 bg-insanus-red shadow-neon rounded-full"></div>
                    <h1 className="text-lg font-black text-white tracking-tighter">ÁREA DO <span className="text-insanus-red">ALUNO</span></h1>
                </div>
                <p className="text-[10px] font-mono text-gray-500">Logado como {user.nickname || user.name.split(' ')[0]}</p>
            </div>
            
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
                <button onClick={() => setView('daily')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase transition-all ${view === 'daily' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                    <Icon.Check className="w-4 h-4"/> Metas de Hoje
                </button>
                <button onClick={() => setView('calendar')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase transition-all ${view === 'calendar' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                    <Icon.Calendar className="w-4 h-4"/> Calendário
                </button>
                <button onClick={() => setView('edital')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase transition-all ${view === 'edital' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                    <Icon.List className="w-4 h-4"/> Edital Verticalizado
                </button>
                <button onClick={() => setView('simulados')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase transition-all ${view === 'simulados' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                    <Icon.FileText className="w-4 h-4"/> Simulados
                </button>
                
                <div className="my-4 border-t border-[#333]"></div>
                
                <button onClick={() => setView('setup')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase transition-all ${view === 'setup' ? 'bg-insanus-red text-white shadow-neon' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                    <Icon.Clock className="w-4 h-4"/> Configuração
                </button>

                <div className="mt-6 mb-2 px-2">
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-2">Meus Planos</p>
                    <div className="space-y-1">
                        {plans.map(p => (
                            <button 
                                key={p.id} 
                                onClick={() => initiatePlanSwitch(p.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition border ${currentPlan?.id === p.id ? 'bg-white/5 border-insanus-red text-white' : 'border-transparent text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
                            >
                                {p.name}
                            </button>
                        ))}
                    </div>
                </div>
            </nav>

            <div className="p-4 border-t border-[#333]">
                <div className="mb-4">
                     <div className="text-[9px] text-gray-500 font-bold uppercase mb-1">Tempo Total de Estudo</div>
                     <div className="text-xl font-black text-insanus-red font-mono">{formatSecondsToTime(user.progress.totalStudySeconds)}</div>
                </div>
                {(onReturnToAdmin || user.isAdmin) && (
                    <button onClick={onReturnToAdmin} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[#333] text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                        <Icon.LogOut className="w-4 h-4"/> Voltar Admin
                    </button>
                )}
            </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar relative bg-[#050505]">
            {user.isAdmin && <div className="absolute top-4 right-4 bg-insanus-red/20 border border-insanus-red text-insanus-red px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest pointer-events-none z-10">Modo Admin</div>}
            
            {activeFlashcards && (
                <FlashcardPlayer 
                    cards={activeFlashcards}
                    onClose={() => setActiveFlashcards(null)}
                />
            )}

            {activeSimulado ? (
                <SimuladoRunner 
                    user={user} 
                    classId={activeSimulado ? simuladoClasses.find(c => c.simulados.some(s => s.id === activeSimulado.id))?.id || '' : ''}
                    simulado={activeSimulado}
                    attempt={attempts.find(a => a.simuladoId === activeSimulado.id)}
                    allAttempts={allAttempts}
                    allUsersMap={allUsersMap}
                    onFinish={handleSimuladoFinished}
                    onBack={() => setActiveSimulado(null)}
                />
            ) : (
                <>
                    {view === 'setup' && (
                        <SetupWizard 
                            user={user} 
                            allPlans={plans} 
                            currentPlan={currentPlan}
                            onSave={handleSetupSave} 
                            onPlanAction={handleActionClick}
                            onUpdateUser={onUpdateUser}
                            onSelectPlan={initiatePlanSwitch}
                        />
                    )}
                    {view === 'daily' && renderDailyView()}
                    {view === 'calendar' && renderCalendarView()}
                    {view === 'edital' && renderEditalView()}
                    {view === 'simulados' && (
                        <div className="w-full animate-fade-in space-y-6 pb-12">
                            <h2 className="text-3xl font-black text-white mb-6 border-b border-[#333] pb-4 uppercase">Simulados Disponíveis</h2>
                            {simuladoClasses.length === 0 ? (
                                <div className="text-center py-20 text-gray-500 italic">Nenhum simulado disponível no momento.</div>
                            ) : (
                                <div className="grid grid-cols-1 gap-8">
                                    {simuladoClasses.map(cls => (
                                        <div key={cls.id} className="bg-[#121212] rounded-xl border border-[#333] overflow-hidden">
                                            <div className="bg-[#1E1E1E] p-4 border-b border-[#333] flex justify-between items-center">
                                                <h3 className="font-bold text-white uppercase flex items-center gap-2">
                                                    <Icon.List className="w-5 h-5 text-blue-500"/> {cls.name}
                                                </h3>
                                                <span className="text-[10px] bg-white/5 px-2 py-1 rounded text-gray-400 font-bold uppercase">{cls.simulados.length} Provas</span>
                                            </div>
                                            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                                {cls.simulados.map(sim => {
                                                    const attempt = attempts.find(a => a.simuladoId === sim.id);
                                                    return (
                                                        <div key={sim.id} className="bg-[#151515] p-4 rounded-lg border border-[#333] hover:border-blue-500/50 transition group flex flex-col justify-between h-full">
                                                            <div>
                                                                <h4 className="font-bold text-white text-sm mb-1 line-clamp-2">{sim.title}</h4>
                                                                <p className="text-xs text-gray-500 mb-4">{sim.totalQuestions} Questões • {sim.type.replace('_', ' ')}</p>
                                                            </div>
                                                            
                                                            {attempt ? (
                                                                <div className={`mt-auto p-2 rounded text-center border ${attempt.isApproved ? 'bg-green-900/20 border-green-600/30 text-green-500' : 'bg-red-900/20 border-red-600/30 text-red-500'}`}>
                                                                    <div className="text-[10px] font-bold uppercase mb-1">{attempt.isApproved ? 'APROVADO' : 'REPROVADO'}</div>
                                                                    <div className="text-lg font-black">{attempt.score} pts</div>
                                                                    <button onClick={() => setActiveSimulado(sim)} className="text-[10px] underline mt-1 hover:text-white transition">Ver Resultado</button>
                                                                </div>
                                                            ) : (
                                                                <button 
                                                                    onClick={() => setActiveSimulado(sim)}
                                                                    className="mt-auto w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-xs font-bold uppercase shadow-lg transition flex items-center justify-center gap-2 transform group-hover:scale-105"
                                                                >
                                                                    <Icon.Play className="w-3 h-3"/> INICIAR
                                                                </button>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                                {cls.simulados.length === 0 && <div className="text-gray-500 text-xs italic p-2 col-span-full text-center">Nenhum simulado cadastrado nesta turma.</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    </div>
  );
};