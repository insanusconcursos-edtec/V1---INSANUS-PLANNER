import { UserLevel, Goal } from "./types";

export const ADMIN_EMAIL = "insanusconcursos@gmail.com";
export const ADMIN_PASS = "Ins@nus110921";

export const WEEKDAYS = [
  { key: 'domingo', label: 'Domingo' },
  { key: 'segunda', label: 'Segunda-feira' },
  { key: 'terca', label: 'Terça-feira' },
  { key: 'quarta', label: 'Quarta-feira' },
  { key: 'quinta', label: 'Quinta-feira' },
  { key: 'sexta', label: 'Sexta-feira' },
  { key: 'sabado', label: 'Sábado' },
];

export const calculateGoalDuration = (goal: Goal, level: UserLevel): number => {
  if (!goal) return 0;

  if (goal.type === 'AULA') {
    // Sum of subgoals
    return goal.subGoals ? goal.subGoals.reduce((acc, sub) => acc + (sub.duration || 0), 0) : 0;
  }
  
  if (goal.type === 'RESUMO') {
    return goal.manualTime || 0;
  }

  // Page based calculation
  const pages = goal.pages || 0;
  let minutesPerPage = 0;

  if (goal.type === 'MATERIAL') {
    if (level === 'iniciante') minutesPerPage = 5;
    else if (level === 'intermediario') minutesPerPage = 3;
    else minutesPerPage = 1; // avancado
  } else if (goal.type === 'QUESTOES') {
    if (level === 'iniciante') minutesPerPage = 10;
    else if (level === 'intermediario') minutesPerPage = 6;
    else minutesPerPage = 2;
  } else if (goal.type === 'LEI_SECA') {
    if (level === 'iniciante') minutesPerPage = 5;
    else if (level === 'intermediario') minutesPerPage = 3;
    else minutesPerPage = 1;
    
    // Multiplier for Lei Seca
    if (goal.multiplier && goal.multiplier > 1) {
        minutesPerPage = minutesPerPage * goal.multiplier;
    }
  }

  const total = pages * minutesPerPage;
  return isNaN(total) ? 0 : total;
};

// Helper for unique IDs
export const uuid = () => Date.now().toString(36) + Math.random().toString(36).substr(2);