import { db } from '../firebase';
import { collection, doc, setDoc, getDocs, getDoc, query, where, deleteDoc } from 'firebase/firestore';
import { User, StudyPlan } from '../types';

// Helper to remove undefined fields because Firestore doesn't support them.
const cleanData = (obj: any): any => {
    return JSON.parse(JSON.stringify(obj));
};

// --- Users Collection ---

export const saveUserToDB = async (user: User) => {
  if (!user || !user.id) {
      console.error("Tentativa de salvar usuário inválido ou sem ID:", user);
      return;
  }
  try {
    const userData = cleanData(user);
    // Ensure critical arrays exist to prevent 'includes/indexOf' errors later
    if (!userData.allowedPlans) userData.allowedPlans = [];
    if (!userData.progress) {
        userData.progress = { 
            completedGoalIds: [], 
            completedRevisionIds: [], 
            totalStudySeconds: 0, 
            planStudySeconds: {} 
        };
    }
    
    await setDoc(doc(db, "users", String(user.id)), userData);
    console.log("Usuário salvo/atualizado com sucesso:", user.id);
  } catch (e) {
    console.error("Erro ao salvar usuário: ", e);
    // We log but don't re-throw to avoid crashing the UI loop if auto-save fails
  }
};

export const fetchUsersFromDB = async (): Promise<User[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    const users: User[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as User;
      // Ensure ID is present from doc.id if missing in data
      if (!data.id) data.id = doc.id;
      users.push(data);
    });
    return users;
  } catch (e) {
    console.error("Erro ao buscar usuários: ", e);
    return [];
  }
};

export const deleteUserFromDB = async (userId: string) => {
    try {
        await deleteDoc(doc(db, "users", userId));
    } catch (e) {
        console.error("Erro ao deletar usuário:", e);
        throw e;
    }
}

// --- Plans Collection ---

export const savePlanToDB = async (plan: StudyPlan) => {
  if (!plan || !plan.id) return;
  try {
    // Convert complex objects if necessary, but StudyPlan JSON structure is generally Firestore compatible
    // We must clean undefined values to prevent Firestore errors
    await setDoc(doc(db, "plans", plan.id), cleanData(plan));
    console.log("Plano sincronizado com sucesso:", plan.name);
  } catch (e) {
    console.error("Erro ao salvar plano: ", e);
    throw e;
  }
};

export const fetchPlansFromDB = async (): Promise<StudyPlan[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, "plans"));
    const plans: StudyPlan[] = [];
    querySnapshot.forEach((doc) => {
      plans.push(doc.data() as StudyPlan);
    });
    return plans;
  } catch (e) {
    console.error("Erro ao buscar planos: ", e);
    return [];
  }
};

// --- Auth Helper (Simulated for Admin-created users) ---

export const authenticateUserDB = async (email: string, password: string): Promise<User | null> => {
    try {
        // Query users where email matches
        const q = query(collection(db, "users"), where("email", "==", email));
        const querySnapshot = await getDocs(q);
        
        let foundUser: User | null = null;
        
        querySnapshot.forEach((doc) => {
            const userData = doc.data() as any;
            if (!userData.id) userData.id = doc.id;
            
            // Check password (plain text as per requirement "Admin creates users with standard password")
            if (userData.tempPassword === password) {
                foundUser = userData as User;
            }
        });

        return foundUser;
    } catch (e) {
        console.error("Erro na autenticação:", e);
        return null;
    }
}