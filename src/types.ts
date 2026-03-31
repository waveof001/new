export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  timeLimit: number;
}

export interface Quiz {
  id: string;
  title: string;
  questions: Question[];
}

export interface Player {
  name: string;
  score: number;
  lastAnswer: number | null;
}

export interface Session {
  pin: string;
  status: 'waiting' | 'playing' | 'finished';
  currentQuestionIndex: number;
  quiz: Quiz;
  players: Record<string, Player>;
}
