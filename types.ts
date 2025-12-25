
export type UserLevel = 'iniciante' | 'intermediario' | 'avancado';

export interface PlanConfig {
    startDate: string; // ISO Date string indicating when the schedule starts/re-starts
    isPaused: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  cpf: string;
  level: UserLevel;
  isAdmin: boolean;
  allowedPlans: string[]; // Plan IDs
  planExpirations: Record<string, string>; // PlanID -> Date ISO string
  
  // Per-plan configuration (Start Date, Pause Status)
  planConfigs: Record<string, PlanConfig>; 
  
  routine: Routine;
  currentPlanId?: string;
  progress: UserProgress; 
  // Store computed schedule to avoid re-calc every render
  schedule?: Record<string, ScheduledItem[]>; // DateStr -> Items
}

export interface UserProgress {
  completedGoalIds: string[];
  completedRevisionIds: string[]; // "goalId_revisionIndex"
  totalStudySeconds: number;
  planStudySeconds: Record<string, number>; // Time spent per plan
  lastCycleIndex?: number;
}

export interface Routine {
  days: {
    [key: string]: number; // "monday": 60 (minutes available)
  };
}

export type GoalType = 'AULA' | 'MATERIAL' | 'QUESTOES' | 'LEI_SECA' | 'RESUMO' | 'REVISAO';

export interface SubGoal {
  id: string;
  title: string;
  link: string;
  duration: number; // minutes
}

export interface Goal {
  id: string;
  title: string;
  type: GoalType;
  description?: string; // Observações do admin
  color?: string; // Cor personalizada da meta (Hex)
  
  // Common Links/Files
  link?: string;
  pdfUrl?: string; // For uploaded PDF
  
  // Type: AULA
  subGoals?: SubGoal[]; 
  
  // Type: MATERIAL / QUESTOES / LEI_SECA
  pages?: number;
  
  // Type: LEI_SECA
  articles?: string; // "Arts. 1 to 5"
  multiplier?: number; // 2x, 3x...

  // Type: RESUMO
  manualTime?: number; // Admin defined minutes
  
  // Revisions
  hasRevision?: boolean;
  revisionIntervals?: string; // "1,7,15,30"
  repeatLastInterval?: boolean;
  
  // Sorting
  order: number;
}

export interface Subject {
  id: string;
  name: string;
  goals: Goal[];
  order: number;
}

export interface Discipline {
  id: string;
  name: string;
  folderId?: string; // If null, root level
  subjects: Subject[];
  order: number;
}

export interface Folder {
  id: string;
  name: string;
  order: number;
}

export interface CycleItem {
  disciplineId: string;
  subjectsCount: number; // How many subjects to advance
}

export interface Cycle {
  id: string;
  name: string;
  items: CycleItem[];
  order: number;
}

export interface StudyPlan {
  id: string;
  name: string;
  coverImage: string;
  folders: Folder[];
  disciplines: Discipline[];
  cycles: Cycle[];
  cycleSystem: 'continuo' | 'rotativo';
  brandingLogo?: string;
}

export interface ScheduledItem {
  uniqueId: string; // Generated for the schedule
  date: string; // YYYY-MM-DD
  goalId: string;
  subGoalId?: string; // If it's a specific class/subgoal
  goalType: GoalType;
  title: string;
  disciplineName: string;
  subjectName: string;
  duration: number; // minutes scheduled for this slot
  isRevision: boolean;
  revisionIndex?: number;
  completed: boolean;
  originalGoal?: Goal; // helper
  
  // Splitting Logic
  isSplit?: boolean;
  partIndex?: number; // 1, 2...
  totalParts?: number; // 2...
  
  // Status
  isLate?: boolean;
}