import React, { useState, useEffect } from 'react';
import { 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from './firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Play, Trophy, ArrowRight, LogIn, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from './lib/utils';
import { Quiz, Session, Question, Player } from './types';

const DEFAULT_QUIZ: Quiz = {
  id: '1',
  title: '기본 상식 퀴즈',
  questions: [
    {
      id: 'q1',
      text: '대한민국의 수도는 어디인가요?',
      options: ['부산', '서울', '인천', '대구'],
      correctAnswer: 1,
      timeLimit: 20,
    },
    {
      id: 'q2',
      text: '세계에서 가장 높은 산은?',
      options: ['백두산', '한라산', '에베레스트', '후지산'],
      correctAnswer: 2,
      timeLimit: 20,
    },
    {
      id: 'q3',
      text: '물(H2O)의 원소 기호 중 O는 무엇을 의미하나요?',
      options: ['수소', '질소', '산소', '탄소'],
      correctAnswer: 2,
      timeLimit: 20,
    }
  ]
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'select' | 'teacher' | 'student'>('select');
  const [session, setSession] = useState<Session | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (role !== 'select' && !user) {
      signInAnonymously(auth).catch(err => {
        console.error("Auth error:", err);
        setError("인증에 실패했습니다.");
      });
    }
  }, [role, user]);

  // Listen to session updates
  useEffect(() => {
    if (session?.pin) {
      const unsubscribe = onSnapshot(doc(db, 'sessions', session.pin), (snapshot) => {
        if (snapshot.exists()) {
          setSession(snapshot.data() as Session);
        } else {
          // Session deleted or not found
          if (role === 'student') {
            setError("방이 사라졌습니다.");
            setSession(null);
          }
        }
      }, (err) => {
        console.error("Firestore error:", err);
        setError("데이터를 불러오는 중 오류가 발생했습니다.");
      });
      return () => unsubscribe();
    }
  }, [session?.pin, role]);

  const createSession = async () => {
    if (!user) return;
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const newSession: Session = {
      pin,
      status: 'waiting',
      currentQuestionIndex: 0,
      quiz: DEFAULT_QUIZ,
      players: {},
      // @ts-ignore
      hostId: user.uid,
      createdAt: new Date().toISOString()
    };
    
    try {
      await setDoc(doc(db, 'sessions', pin), newSession);
      setSession(newSession);
    } catch (err) {
      console.error("Create session error:", err);
      setError("방 생성에 실패했습니다.");
    }
  };

  const joinSession = async () => {
    if (!pinInput || !playerName || !user) return;
    
    try {
      const sessionDoc = await getDoc(doc(db, 'sessions', pinInput));
      if (!sessionDoc.exists()) {
        setError("방을 찾을 수 없습니다.");
        return;
      }
      
      const sessionData = sessionDoc.data() as Session;
      if (sessionData.status !== 'waiting') {
        setError("이미 게임이 시작되었습니다.");
        return;
      }

      const updatedPlayers = {
        ...sessionData.players,
        [user.uid]: { name: playerName, score: 0, lastAnswer: null }
      };

      await updateDoc(doc(db, 'sessions', pinInput), {
        players: updatedPlayers
      });
      
      setSession(sessionData);
    } catch (err) {
      console.error("Join session error:", err);
      setError("입장에 실패했습니다.");
    }
  };

  const startGame = async () => {
    if (session) {
      await updateDoc(doc(db, 'sessions', session.pin), {
        status: 'playing'
      });
    }
  };

  const nextQuestion = async () => {
    if (!session) return;
    
    const isLast = session.currentQuestionIndex >= session.quiz.questions.length - 1;
    const updatedPlayers = { ...session.players };
    Object.keys(updatedPlayers).forEach(uid => {
      updatedPlayers[uid].lastAnswer = null;
    });

    if (isLast) {
      await updateDoc(doc(db, 'sessions', session.pin), {
        status: 'finished',
        players: updatedPlayers
      });
    } else {
      await updateDoc(doc(db, 'sessions', session.pin), {
        currentQuestionIndex: session.currentQuestionIndex + 1,
        players: updatedPlayers
      });
    }
  };

  const submitAnswer = async (index: number) => {
    if (!session || !user) return;
    
    const player = session.players[user.uid];
    if (!player || player.lastAnswer !== null) return;

    const question = session.quiz.questions[session.currentQuestionIndex];
    const isCorrect = index === question.correctAnswer;
    
    const updatedPlayers = { ...session.players };
    updatedPlayers[user.uid] = {
      ...player,
      lastAnswer: index,
      score: isCorrect ? player.score + 1000 : player.score
    };

    await updateDoc(doc(db, 'sessions', session.pin), {
      players: updatedPlayers
    });
  };

  if (loading) {
    return <div className="min-h-screen bg-[#46178f] flex items-center justify-center text-white">로딩 중...</div>;
  }

  if (role === 'select') {
    return (
      <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-4 text-white">
        <motion.h1 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-6xl font-black mb-12 tracking-tighter italic"
        >
          QUIZ LIVE
        </motion.h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          <button 
            onClick={() => setRole('teacher')}
            className="group bg-white text-[#46178f] p-8 rounded-2xl shadow-2xl hover:scale-105 transition-transform flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 bg-[#46178f]/10 rounded-full flex items-center justify-center group-hover:bg-[#46178f] group-hover:text-white transition-colors">
              <Users size={32} />
            </div>
            <span className="text-2xl font-bold">교사 모드</span>
            <p className="text-center text-sm opacity-70">퀴즈를 만들고 학생들과 함께 시작하세요.</p>
          </button>
          <button 
            onClick={() => setRole('student')}
            className="group bg-white text-[#46178f] p-8 rounded-2xl shadow-2xl hover:scale-105 transition-transform flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 bg-[#46178f]/10 rounded-full flex items-center justify-center group-hover:bg-[#46178f] group-hover:text-white transition-colors">
              <LogIn size={32} />
            </div>
            <span className="text-2xl font-bold">학생 모드</span>
            <p className="text-center text-sm opacity-70">PIN 번호를 입력하고 퀴즈에 참여하세요.</p>
          </button>
        </div>
      </div>
    );
  }

  if (role === 'teacher') {
    if (!session) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center">
            <h2 className="text-3xl font-bold mb-6">퀴즈 준비</h2>
            <div className="bg-gray-100 p-6 rounded-2xl mb-8 text-left">
              <h3 className="font-bold mb-2">{DEFAULT_QUIZ.title}</h3>
              <p className="text-sm text-gray-500">{DEFAULT_QUIZ.questions.length}개의 질문</p>
            </div>
            <button 
              onClick={createSession}
              className="w-full bg-[#46178f] text-white py-4 rounded-xl font-bold text-xl hover:bg-[#36126d] transition-colors flex items-center justify-center gap-2"
            >
              <Play size={24} />
              게임 시작하기
            </button>
            <button onClick={() => setRole('select')} className="mt-4 text-gray-400 hover:text-gray-600">뒤로 가기</button>
          </div>
        </div>
      );
    }

    if (session.status === 'waiting') {
      return (
        <div className="min-h-screen bg-[#46178f] flex flex-col items-center p-8 text-white">
          <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl text-center mb-12 w-full max-w-xl">
            <p className="text-xl mb-2 opacity-80">게임 PIN:</p>
            <h1 className="text-8xl font-black tracking-widest mb-4">{session.pin}</h1>
          </div>
          
          <div className="w-full max-w-4xl flex flex-col items-center">
            <div className="flex items-center gap-2 mb-8">
              <Users />
              <span className="text-2xl font-bold">{Object.keys(session.players).length}명 참여 중</span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-12">
              <AnimatePresence>
                {(Object.values(session.players) as Player[]).map((player, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="bg-white text-[#46178f] p-4 rounded-xl font-bold text-center shadow-lg"
                  >
                    {player.name}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {Object.keys(session.players).length > 0 && (
              <button 
                onClick={startGame}
                className="bg-white text-[#46178f] px-12 py-4 rounded-full font-black text-2xl hover:scale-105 transition-transform shadow-2xl"
              >
                시작!
              </button>
            )}
          </div>
        </div>
      );
    }

    if (session.status === 'playing') {
      const question = session.quiz.questions[session.currentQuestionIndex];
      const answeredCount = (Object.values(session.players) as Player[]).filter(p => p.lastAnswer !== null).length;
      const totalPlayers = Object.keys(session.players).length;

      return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
          <div className="bg-white p-6 shadow-md flex justify-between items-center">
            <h2 className="text-2xl font-bold">{session.quiz.title}</h2>
            <div className="flex items-center gap-4">
              <div className="bg-[#46178f] text-white px-4 py-2 rounded-full font-bold">
                질문 {session.currentQuestionIndex + 1} / {session.quiz.questions.length}
              </div>
              <div className="text-gray-500 font-bold">
                {answeredCount} / {totalPlayers} 응답 완료
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <motion.h1 
              key={question.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-4xl font-bold text-center mb-12 max-w-4xl"
            >
              {question.text}
            </motion.h1>

            <div className="grid grid-cols-2 gap-4 w-full max-w-5xl">
              {question.options.map((opt, idx) => {
                const colors = ['bg-red-500', 'bg-blue-500', 'bg-yellow-500', 'bg-green-500'];
                return (
                  <div key={idx} className={cn("p-8 rounded-xl text-white text-2xl font-bold shadow-lg flex items-center gap-4", colors[idx])}>
                    <div className="w-10 h-10 border-4 border-white/30 rounded-lg flex items-center justify-center text-xl">
                      {idx + 1}
                    </div>
                    {opt}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-8 flex justify-center">
            <button 
              onClick={nextQuestion}
              className="bg-[#46178f] text-white px-12 py-4 rounded-xl font-bold text-xl flex items-center gap-2 hover:bg-[#36126d]"
            >
              다음 질문 <ArrowRight />
            </button>
          </div>
        </div>
      );
    }

    if (session.status === 'finished') {
      const sortedPlayers = (Object.values(session.players) as Player[]).sort((a, b) => b.score - a.score);
      return (
        <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-8 text-white">
          <Trophy size={80} className="text-yellow-400 mb-6" />
          <h1 className="text-5xl font-black mb-12">최종 순위</h1>
          
          <div className="w-full max-w-2xl space-y-4">
            {sortedPlayers.map((player, idx) => (
              <motion.div 
                key={idx}
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: idx * 0.1 }}
                className={cn(
                  "bg-white p-6 rounded-2xl flex justify-between items-center shadow-xl",
                  idx === 0 ? "border-4 border-yellow-400" : ""
                )}
              >
                <div className="flex items-center gap-4">
                  <span className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-bold text-white",
                    idx === 0 ? "bg-yellow-400" : idx === 1 ? "bg-gray-400" : idx === 2 ? "bg-orange-400" : "bg-gray-200 text-gray-600"
                  )}>
                    {idx + 1}
                  </span>
                  <span className="text-[#46178f] text-2xl font-bold">{player.name}</span>
                </div>
                <span className="text-[#46178f] text-2xl font-black">{player.score}</span>
              </motion.div>
            ))}
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="mt-12 bg-white text-[#46178f] px-8 py-3 rounded-full font-bold hover:scale-105 transition-transform"
          >
            새 게임 시작하기
          </button>
        </div>
      );
    }
  }

  if (role === 'student') {
    if (!playerName || !session) {
      return (
        <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md">
            <h2 className="text-3xl font-black text-center mb-8 text-[#46178f]">참여하기</h2>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="게임 PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full p-4 border-2 border-gray-200 rounded-xl text-center text-2xl font-bold focus:border-[#46178f] outline-none"
              />
              <input 
                type="text" 
                placeholder="닉네임"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full p-4 border-2 border-gray-200 rounded-xl text-center text-xl font-bold focus:border-[#46178f] outline-none"
              />
              <button 
                onClick={joinSession}
                className="w-full bg-[#333] text-white py-4 rounded-xl font-bold text-xl hover:bg-black transition-colors"
              >
                입장하기
              </button>
              {error && <p className="text-red-500 text-center font-bold">{error}</p>}
            </div>
            <button onClick={() => setRole('select')} className="w-full mt-4 text-gray-400 hover:text-gray-600">뒤로 가기</button>
          </div>
        </div>
      );
    }

    if (session.status === 'waiting') {
      return (
        <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center text-white p-8">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="mb-8"
          >
            <CheckCircle2 size={100} />
          </motion.div>
          <h1 className="text-4xl font-black mb-4">참여 완료!</h1>
          <p className="text-xl opacity-80 mb-8">화면을 보며 기다려주세요...</p>
          <div className="bg-white/10 p-6 rounded-2xl">
            <p className="font-bold text-2xl">{playerName}</p>
          </div>
        </div>
      );
    }

    if (session.status === 'playing') {
      const player = user ? session.players[user.uid] : null;
      const question = session.quiz.questions[session.currentQuestionIndex];
      const hasAnswered = player?.lastAnswer !== null;

      if (hasAnswered) {
        return (
          <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center text-white p-8">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <h2 className="text-4xl font-black mb-4">답변 제출 완료!</h2>
              <p className="text-xl opacity-80">다른 친구들을 기다리고 있습니다...</p>
            </motion.div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-gray-100 p-4 grid grid-cols-2 gap-4">
          {question.options.map((_, idx) => {
            const colors = ['bg-red-500', 'bg-blue-500', 'bg-yellow-500', 'bg-green-500'];
            const shapes = ['▲', '◆', '●', '■'];
            return (
              <button
                key={idx}
                onClick={() => submitAnswer(idx)}
                className={cn(
                  "rounded-2xl shadow-xl flex items-center justify-center text-white text-6xl transition-transform active:scale-95",
                  colors[idx]
                )}
              >
                {shapes[idx]}
              </button>
            );
          })}
        </div>
      );
    }

    if (session.status === 'finished') {
      const player = user ? session.players[user.uid] : null;
      return (
        <div className="min-h-screen bg-[#46178f] flex flex-col items-center justify-center text-white p-8">
          <Trophy size={80} className="text-yellow-400 mb-6" />
          <h1 className="text-4xl font-black mb-4">퀴즈 종료!</h1>
          <div className="bg-white text-[#46178f] p-8 rounded-3xl text-center shadow-2xl">
            <p className="text-xl mb-2">당신의 점수</p>
            <h2 className="text-6xl font-black">{player?.score || 0}</h2>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-12 bg-white/20 text-white px-8 py-3 rounded-full font-bold hover:bg-white/30"
          >
            처음으로
          </button>
        </div>
      );
    }
  }

  return null;
}
