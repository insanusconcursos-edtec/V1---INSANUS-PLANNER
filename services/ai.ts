import { GoogleGenAI, Type } from "@google/genai";
import { Flashcard } from "../types";
import { uuid } from "../constants";

// Helper to convert File to Base64
export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const generateFlashcardsFromPDF = async (file: File): Promise<Flashcard[]> => {
  try {
    const apiKey = process.env.API_KEY || '';
    if (!apiKey) {
        console.warn("API Key not found in environment. Please ensure process.env.API_KEY is set.");
        // Fallback or Error handling for dev environment if key is missing from env
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const filePart = await fileToGenerativePart(file);

    const prompt = `Analise este documento educacional com profundidade.
    Crie uma lista de flashcards de revisão (Perguntas e Respostas) cobrindo os conceitos principais, detalhes importantes e "pegadinhas" comuns em provas.
    
    As perguntas devem ser diretas e instigantes.
    As respostas devem ser concisas, porém completas.
    
    Gere pelo menos 10 cards, ou mais se o documento for extenso.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
            parts: [
                filePart,
                { text: prompt }
            ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: {
                type: Type.STRING,
                description: 'A pergunta do flashcard.',
              },
              answer: {
                type: Type.STRING,
                description: 'A resposta do flashcard.',
              },
            },
            propertyOrdering: ["question", "answer"],
          },
        },
      },
    });

    const jsonStr = response.text || "[]";
    const rawCards = JSON.parse(jsonStr);

    // Map to Flashcard type with IDs
    return rawCards.map((c: any) => ({
        id: uuid(),
        question: c.question,
        answer: c.answer
    }));

  } catch (error) {
    console.error("Erro ao gerar flashcards com Gemini:", error);
    throw new Error("Falha na geração de cards via IA.");
  }
};
