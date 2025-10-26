import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Zap, Trophy, AlertCircle, Check, X, Loader2 } from 'lucide-react';

type Letter = 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K'|'L'|'M'|'N'|'O'|'P'|'Q'|'R'|'S'|'T'|'U'|'V'|'W'|'X'|'Y'|'Z';

interface PlayerSecret {
  letters: Record<Letter, number>;
  word: string;
}

interface RevealedInfo {
  length?: number;
  firstLetter?: Letter;
  lastLetter?: Letter;
  vowelCount?: number;
  contains?: Record<string, boolean>;
  knownLetters?: Letter[];
  pattern?: Record<number, Letter>;
}

interface PlayerPublic {
  score: number;
  guessSolved: boolean;
  revealed: RevealedInfo;
}

interface GameState {
  mode: 'HIGH_WINS';
  minWordLen: number;
  phase: 'START'|'SETUP_P1'|'SETUP_P2'|'PASS_TO_GUESS_P1'|'GUESS_P1'|'PASS_TO_GUESS_P2'|'GUESS_P2'|'ENDGAME';
  p1: { secret?: PlayerSecret; public: PlayerPublic };
  p2: { secret?: PlayerSecret; public: PlayerPublic };
  swap: { p1Gets: Record<Letter, number>; p2Gets: Record<Letter, number> } | null;
  dictionaryReady: boolean;
  hintLog: Array<{ player: string; card: string; cost: number }>;
  wrongGuesses: Array<{ player: string; word: string; penalty: number }>;
}

interface HintCard {
  id: string;
  name: string;
  description: string;
  cost: number;
  requiresInput?: boolean;
  effect: (word: string, revealed: RevealedInfo, input?: string) => RevealedInfo;
}

const SCORING_MODE: 'HIGH_WINS' = 'HIGH_WINS';
const WRONG_GUESS_PENALTY = 2;
const MIN_WORD_LENGTH = 3;

const SCRABBLE_COUNTS: Record<Letter, number> = {
  A:9, B:2, C:2, D:4, E:12, F:2, G:3, H:2, I:9, J:1, K:1,
  L:4, M:2, N:6, O:8, P:2, Q:1, R:6, S:4, T:6, U:4, V:2,
  W:2, X:1, Y:2, Z:1
};

const VOWELS: Set<Letter> = new Set(['A', 'E', 'I', 'O', 'U']);

const randomFloat = (): number => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] / (0xFFFFFFFF + 1);
  }
  return Math.random();
};

const countLetters = (word: string): Record<Letter, number> => {
  const counts: Record<Letter, number> = {} as Record<Letter, number>;
  for (const ch of word.toUpperCase()) {
    const letter = ch as Letter;
    counts[letter] = (counts[letter] || 0) + 1;
  }
  return counts;
};

const canBuild = (word: string, available: Record<Letter, number>): boolean => {
  const needed = countLetters(word);
  for (const letter in needed) {
    if ((available[letter as Letter] || 0) < needed[letter as Letter]) {
      return false;
    }
  }
  return true;
};

const flattenLetters = (record: Record<Letter, number>): string[] => {
  const result: string[] = [];
  for (const letter in record) {
    for (let i = 0; i < record[letter as Letter]; i++) {
      result.push(letter);
    }
  }
  return result;
};

const drawLetters = (poolCounts: Record<Letter, number>, n: number): Record<Letter, number> => {
  const pool = { ...poolCounts };
  const result: Record<Letter, number> = {} as Record<Letter, number>;
  
  for (let i = 0; i < n; i++) {
    const letters = Object.keys(pool) as Letter[];
    const weights = letters.map(l => pool[l]);
    const total = weights.reduce((a, b) => a + b, 0);
    
    if (total === 0) break;
    
    let rand = randomFloat() * total;
    for (let j = 0; j < letters.length; j++) {
      rand -= weights[j];
      if (rand <= 0) {
        const letter = letters[j];
        result[letter] = (result[letter] || 0) + 1;
        pool[letter]--;
        break;
      }
    }
  }
  
  return result;
};

const drawVowelsAndConsonants = () => {
  const vowelPool: Record<Letter, number> = {} as Record<Letter, number>;
  const consonantPool: Record<Letter, number> = {} as Record<Letter, number>;
  
  for (const letter in SCRABBLE_COUNTS) {
    const l = letter as Letter;
    if (VOWELS.has(l)) {
      vowelPool[l] = SCRABBLE_COUNTS[l];
    } else {
      consonantPool[l] = SCRABBLE_COUNTS[l];
    }
  }
  
  const vowels = drawLetters(vowelPool, 4);
  const consonants = drawLetters(consonantPool, 7);
  
  const combined: Record<Letter, number> = { ...vowels };
  for (const letter in consonants) {
    const l = letter as Letter;
    combined[l] = (combined[l] || 0) + consonants[l];
  }
  
  return { vowels, consonants, combined };
};

class DictionaryLoader {
  private words: Set<string> | null = null;
  private loading: Promise<void> | null = null;
  private dbName = 'WordDuelDB';
  private storeName = 'dictionary';
  private version = 1;

  async ensureLoaded(): Promise<void> {
    if (this.words) return;
    if (this.loading) return this.loading;

    this.loading = this.loadDictionary();
    await this.loading;
  }

  private async loadDictionary(): Promise<void> {
    try {
      const cached = await this.loadFromCache();
      if (cached) {
        this.words = cached;
        console.log('Dictionary loaded from cache:', this.words.size, 'words');
        return;
      }
    } catch (e) {
      console.warn('Cache load failed, will fetch:', e);
    }

    try {
      const response = await fetch('/wordlists/words.txt');
      if (!response.ok) throw new Error('Failed to fetch dictionary');
      
      const text = await response.text();
      const wordList = text.split(/\s+/).filter(w => w.length >= MIN_WORD_LENGTH);
      this.words = new Set(wordList.map(w => w.toLowerCase().trim()));
      
      console.log('Dictionary loaded from network:', this.words.size, 'words');
      
      this.saveToCache(this.words).catch(e => console.warn('Cache save failed:', e));
    } catch (error) {
      console.error('Failed to load dictionary:', error);
      throw error;
    }
  }

  private async loadFromCache(): Promise<Set<string> | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          resolve(null);
          return;
        }

        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const getReq = store.get('words');
        
        getReq.onsuccess = () => {
          if (getReq.result && getReq.result.data) {
            resolve(new Set(getReq.result.data));
          } else {
            resolve(null);
          }
        };
        getReq.onerror = () => reject(getReq.error);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  private async saveToCache(words: Set<string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.put({ data: Array.from(words) }, 'words');
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  isReady(): boolean {
    return this.words !== null;
  }

  isValidWord(word: string): boolean {
    if (!this.words) return false;
    return this.words.has(word.toLowerCase().trim());
  }
}

const dictionary = new DictionaryLoader();

const HINT_CARDS: HintCard[] = [
  {
    id: 'last-letter',
    name: 'Last Letter',
    description: 'Reveal the final letter',
    cost: 1,
    effect: (word, revealed) => ({
      ...revealed,
      lastLetter: word[word.length - 1].toUpperCase() as Letter
    })
  },
  {
    id: 'word-length',
    name: 'Word Length',
    description: 'Reveal the length of the word',
    cost: 3,
    effect: (word, revealed) => ({
      ...revealed,
      length: word.length
    })
  },
  {
    id: 'vowel-count',
    name: 'Vowel Count',
    description: 'Reveal how many vowels',
    cost: 2,
    effect: (word, revealed) => {
      const count = word.split('').filter(c => VOWELS.has(c.toUpperCase() as Letter)).length;
      return { ...revealed, vowelCount: count };
    }
  },
  {
    id: 'first-letter',
    name: 'First Letter',
    description: 'Reveal the first letter',
    cost: 3,
    effect: (word, revealed) => ({
      ...revealed,
      firstLetter: word[0].toUpperCase() as Letter
    })
  },
  {
    id: 'contains-letter',
    name: 'Contains Letter?',
    description: 'Check if word contains a specific letter',
    cost: 1,
    requiresInput: true,
    effect: (word, revealed, input) => {
      if (!input) return revealed;
      const letter = input.toUpperCase() as Letter;
      const contains = word.toUpperCase().includes(letter);
      return {
        ...revealed,
        contains: { ...revealed.contains, [letter]: contains }
      };
    }
  },
  {
    id: 'random-letter',
    name: 'Random Letter',
    description: 'Reveal one random letter (position hidden)',
    cost: 3,
    effect: (word, revealed) => {
      const letters = word.split('').map(c => c.toUpperCase() as Letter);
      const unique = Array.from(new Set(letters));
      const existing = revealed.knownLetters || [];
      const available = unique.filter(l => !existing.includes(l));
      
      if (available.length === 0) return revealed;
      
      const randomLetter = available[Math.floor(randomFloat() * available.length)];
      return {
        ...revealed,
        knownLetters: [...existing, randomLetter]
      };
    }
  },
  {
    id: 'pattern-peek',
    name: 'Pattern Peek',
    description: 'Reveal one letter at its position',
    cost: 4,
    effect: (word, revealed) => {
      const pattern = revealed.pattern || {};
      const available = word.split('')
        .map((_, i) => i)
        .filter(i => !pattern[i]);
      
      if (available.length === 0) return revealed;
      
      const idx = available[Math.floor(randomFloat() * available.length)];
      return {
        ...revealed,
        pattern: { ...pattern, [idx]: word[idx].toUpperCase() as Letter }
      };
    }
  },
  {
    id: 'double-trouble',
    name: 'Double Trouble',
    description: 'Are there any repeated letters?',
    cost: 2,
    effect: (word, revealed) => {
      const letters = word.toLowerCase().split('');
      const hasDuplicates = new Set(letters).size < letters.length;
      return {
        ...revealed,
        contains: { 
          ...revealed.contains, 
          '_DUPLICATES_': hasDuplicates 
        }
      };
    }
  }
];

export default function WordDuel() {
  const [gameState, setGameState] = useState<GameState>({
    mode: 'HIGH_WINS',
    minWordLen: MIN_WORD_LENGTH,
    phase: 'START',
    p1: { public: { score: 0, guessSolved: false, revealed: {} } },
    p2: { public: { score: 0, guessSolved: false, revealed: {} } },
    swap: null,
    dictionaryReady: false,
    hintLog: [],
    wrongGuesses: []
  });

  const [setupWord, setSetupWord] = useState('');
  const [guessWord, setGuessWord] = useState('');
  const [selectedCard, setSelectedCard] = useState<HintCard | null>(null);
  const [cardInput, setCardInput] = useState('');
  const [error, setError] = useState('');
  const [dictLoading, setDictLoading] = useState(true);
  const [hideLetters, setHideLetters] = useState(false);

  useEffect(() => {
    dictionary.ensureLoaded()
      .then(() => {
        setGameState(prev => ({ ...prev, dictionaryReady: true }));
        setDictLoading(false);
      })
      .catch(err => {
        setError('Failed to load dictionary: ' + err.message);
        setDictLoading(false);
      });
  }, []);

  const startGame = () => {
    if (!gameState.dictionaryReady) {
      setError('Dictionary still loading...');
      return;
    }
    const { combined } = drawVowelsAndConsonants();
    setGameState(prev => ({
      ...prev,
      phase: 'SETUP_P1',
      p1: { 
        secret: { letters: combined, word: '' }, 
        public: { score: 0, guessSolved: false, revealed: {} } 
      }
    }));
  };

  const validateWord = (word: string, letters: Record<Letter, number>): string | null => {
    if (word.length < MIN_WORD_LENGTH) {
      return `Word must be at least ${MIN_WORD_LENGTH} letters`;
    }
    if (!canBuild(word, letters)) {
      return 'Cannot build this word with available letters';
    }
    if (!dictionary.isValidWord(word)) {
      return 'Word not in dictionary';
    }
    return null;
  };

  const confirmSetupWord = () => {
    const player = gameState.phase === 'SETUP_P1' ? gameState.p1 : gameState.p2;
    if (!player.secret) return;

    const validationError = validateWord(setupWord, player.secret.letters);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (gameState.phase === 'SETUP_P1') {
      setGameState(prev => {
        const { combined } = drawVowelsAndConsonants();
        return {
          ...prev,
          phase: 'SETUP_P2',
          p1: { 
            ...prev.p1, 
            secret: { ...prev.p1.secret!, word: setupWord.toLowerCase() } 
          },
          p2: { 
            secret: { letters: combined, word: '' }, 
            public: { score: 0, guessSolved: false, revealed: {} } 
          }
        };
      });
    } else {
      setGameState(prev => ({
        ...prev,
        phase: 'PASS_TO_GUESS_P1',
        p2: { 
          ...prev.p2, 
          secret: { ...prev.p2.secret!, word: setupWord.toLowerCase() } 
        },
        swap: {
          p1Gets: prev.p2.secret!.letters,
          p2Gets: prev.p1.secret!.letters
        }
      }));
    }

    setSetupWord('');
    setError('');
  };

  const proceedToGuess = () => {
    if (gameState.phase === 'PASS_TO_GUESS_P1') {
      setGameState(prev => ({ ...prev, phase: 'GUESS_P1' }));
    } else if (gameState.phase === 'PASS_TO_GUESS_P2') {
      setGameState(prev => ({ ...prev, phase: 'GUESS_P2' }));
    }
  };

  const playHintCard = (card: HintCard) => {
    const isP1 = gameState.phase === 'GUESS_P1';
    const opponent = isP1 ? gameState.p2 : gameState.p1;
    const player = isP1 ? gameState.p1 : gameState.p2;

    if (!opponent.secret) return;

    if (card.requiresInput && !cardInput.trim()) {
      setError('Please enter a letter');
      return;
    }

    const newRevealed = card.effect(opponent.secret.word, player.public.revealed, cardInput);

    setGameState(prev => {
      const updatedOpponent = {
        ...opponent,
        public: { ...opponent.public, score: opponent.public.score + card.cost }
      };
      const updatedPlayer = {
        ...player,
        public: { ...player.public, revealed: newRevealed }
      };

      const newHintLog = [...prev.hintLog, {
        player: isP1 ? 'Player 1' : 'Player 2',
        card: card.name,
        cost: card.cost
      }];

      const bothSolved = updatedPlayer.public.guessSolved && updatedOpponent.public.guessSolved;

      return {
        ...prev,
        p1: isP1 ? updatedPlayer : updatedOpponent,
        p2: isP1 ? updatedOpponent : updatedPlayer,
        hintLog: newHintLog,
        phase: bothSolved ? 'ENDGAME' : 
               (isP1 ? 'PASS_TO_GUESS_P2' : 'PASS_TO_GUESS_P1')
      };
    });

    setSelectedCard(null);
    setCardInput('');
    setError('');
  };

  const submitGuess = () => {
    if (!guessWord.trim()) {
      setError('Enter a word to guess');
      return;
    }

    const isP1 = gameState.phase === 'GUESS_P1';
    const opponent = isP1 ? gameState.p2 : gameState.p1;
    const player = isP1 ? gameState.p1 : gameState.p2;

    if (!opponent.secret) return;

    const correct = guessWord.toLowerCase() === opponent.secret.word;

    if (correct) {
      setGameState(prev => {
        const updatedPlayer = {
          ...player,
          public: { ...player.public, guessSolved: true }
        };
        const bothSolved = updatedPlayer.public.guessSolved && opponent.public.guessSolved;

        return {
          ...prev,
          p1: isP1 ? updatedPlayer : opponent,
          p2: isP1 ? opponent : updatedPlayer,
          phase: bothSolved ? 'ENDGAME' : 
                 (isP1 ? 'PASS_TO_GUESS_P2' : 'PASS_TO_GUESS_P1')
        };
      });
      setGuessWord('');
      setError('');
    } else {
      setGameState(prev => {
        const updatedOpponent = {
          ...opponent,
          public: { ...opponent.public, score: opponent.public.score + WRONG_GUESS_PENALTY }
        };

        const newWrongGuesses = [...prev.wrongGuesses, {
          player: isP1 ? 'Player 1' : 'Player 2',
          word: guessWord,
          penalty: WRONG_GUESS_PENALTY
        }];

        return {
          ...prev,
          p1: isP1 ? player : updatedOpponent,
          p2: isP1 ? updatedOpponent : player,
          wrongGuesses: newWrongGuesses,
          phase: isP1 ? 'PASS_TO_GUESS_P2' : 'PASS_TO_GUESS_P1'
        };
      });
      setError(`Wrong! "${guessWord}" is incorrect. ${WRONG_GUESS_PENALTY} points to opponent.`);
      setGuessWord('');
    }
  };

  const resetGame = () => {
    setGameState({
      mode: 'HIGH_WINS',
      minWordLen: MIN_WORD_LENGTH,
      phase: 'START',
      p1: { public: { score: 0, guessSolved: false, revealed: {} } },
      p2: { public: { score: 0, guessSolved: false, revealed: {} } },
      swap: null,
      dictionaryReady: dictionary.isReady(),
      hintLog: [],
      wrongGuesses: []
    });
    setSetupWord('');
    setGuessWord('');
    setError('');
  };

  if (gameState.phase === 'START') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-5xl font-bold text-slate-800 mb-2">Word Duel</h1>
            <p className="text-slate-600">ALW-Style Pass & Play</p>
          </div>

          {dictLoading && (
            <div className="flex items-center justify-center gap-2 mb-6 text-blue-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading dictionary...</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-6 mb-8">
            <div className="p-6 bg-slate-50 rounded-xl">
              <h2 className="font-semibold text-slate-800 mb-3">How to Play</h2>
              <ol className="space-y-2 text-sm text-slate-600">
                <li>1. Each player builds a secret word from 11 random letters</li>
                <li>2. After setup, you swap letter sets with your opponent</li>
                <li>3. Take turns guessing or using hint cards to reveal clues</li>
                <li>4. <strong>High Score Wins:</strong> Hints and wrong guesses award points to your opponent</li>
                <li>5. First to guess both words correctly ends the game. Highest score wins!</li>
              </ol>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="font-semibold text-blue-900">Wrong Guess</div>
                <div className="text-blue-700">+{WRONG_GUESS_PENALTY} pts to opponent</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="font-semibold text-purple-900">Hint Cards</div>
                <div className="text-purple-700">Cost 1–4 pts each</div>
              </div>
            </div>
          </div>

          <button
            onClick={startGame}
            disabled={!gameState.dictionaryReady}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
          >
            {gameState.dictionaryReady ? 'Start Game' : 'Loading...'}
          </button>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'SETUP_P1' || gameState.phase === 'SETUP_P2') {
    const player = gameState.phase === 'SETUP_P1' ? gameState.p1 : gameState.p2;
    const playerNum = gameState.phase === 'SETUP_P1' ? 1 : 2;
    const letters = player.secret?.letters || ({} as Record<Letter, number>);

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-800 mb-2">Player {playerNum} Setup</h1>
            <p className="text-slate-600">Build your secret word</p>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="font-semibold text-slate-700">Available Letters</label>
              <button
                onClick={() => setHideLetters(!hideLetters)}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                {hideLetters ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {hideLetters ? 'Show' : 'Hide'}
              </button>
            </div>
            {!hideLetters && (
              <div className="flex flex-wrap gap-2 p-4 bg-slate-50 rounded-lg">
                {flattenLetters(letters).map((letter, i) => (
                  <div key={i} className="w-10 h-10 bg-blue-600 text-white font-bold rounded flex items-center justify-center">
                    {letter}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="block font-semibold text-slate-700 mb-2">Your Word</label>
            <input
              type="text"
              value={setupWord}
              onChange={(e) => setSetupWord(e.target.value.toLowerCase())}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg text-lg font-mono focus:border-blue-500 focus:outline-none"
              placeholder="Enter your word..."
            />
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={confirmSetupWord}
            disabled={!setupWord.trim()}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
          >
            Confirm Word
          </button>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'PASS_TO_GUESS_P1' || gameState.phase === 'PASS_TO_GUESS_P2') {
    const playerNum = gameState.phase === 'PASS_TO_GUESS_P1' ? 1 : 2;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Eye className="w-10 h-10 text-purple-600" />
            </div>
            <h2 className="text-3xl font-bold text-slate-800 mb-2">Pass the Device</h2>
            <p className="text-slate-600">Ready for Player {playerNum}'s turn?</p>
          </div>

          <button
            onClick={proceedToGuess}
            className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors"
          >
            I'm Ready
          </button>
        </div>
      </div>
    );
  }

  if (gameState.phase === 'GUESS_P1' || gameState.phase === 'GUESS_P2') {
    const isP1 = gameState.phase === 'GUESS_P1';
    const playerNum = isP1 ? 1 : 2;
    const player = isP1 ? gameState.p1 : gameState.p2;
    const opponent = isP1 ? gameState.p2 : gameState.p1;
    const letters = gameState.swap ? (isP1 ? gameState.swap.p1Gets : gameState.swap.p2Gets) : ({} as Record<Letter, number>);
    const revealed = player.public.revealed;

    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
              <div className="text-center mb-4">
                <h2 className="text-3xl font-bold text-slate-800">Player {playerNum}'s Turn</h2>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg text-center">
                  <div className="text-sm text-blue-700 mb-1">Your Score</div>
                  <div className="text-3xl font-bold text-blue-900">{player.public.score}</div>
                </div>
                <div className="p-4 bg-red-50 rounded-lg text-center">
                  <div className="text-sm text-red-700 mb-1">Opponent Score</div>
                  <div className="text-3xl font-bold text-red-900">{opponent.public.score}</div>
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="font-semibold text-slate-700">Opponent's Letters</label>
                  <button
                    onClick={() => setHideLetters(!hideLetters)}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    {hideLetters ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    {hideLetters ? 'Show' : 'Hide'}
                  </button>
                </div>
                {!hideLetters && (
                  <div className="flex flex-wrap gap-2 p-4 bg-slate-50 rounded-lg">
                    {flattenLetters(letters).map((letter, i) => (
                      <div key={i} className="w-10 h-10 bg-slate-600 text-white font-bold rounded flex items-center justify-center">
                        {letter}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-amber-50 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-amber-900 mb-3">Revealed Clues</h3>
                <div className="space-y-2 text-sm">
                  {revealed.length !== undefined && (
                    <div className="flex items-center gap-2 text-amber-800">
                      <Check className="w-4 h-4" />
                      <span>Length: {revealed.length} letters</span>
                    </div>
                  )}
                  {revealed.firstLetter && (
                    <div className="flex items-center gap-2 text-amber-800">
                      <Check className="w-4 h-4" />
                      <span>First letter: {revealed.firstLetter}</span>
                    </div>
                  )}
                  {revealed.lastLetter && (
                    <div className="flex items-center gap-2 text-amber-800">
                      <Check className="w-4 h-4" />
                      <span>Last letter: {revealed.lastLetter}</span>
                    </div>
                  )}
                  {revealed.vowelCount !== undefined && (
                    <div className="flex items-center gap-2 text-amber-800">
                      <Check className="w-4 h-4" />
                      <span>Vowels: {revealed.vowelCount}</span>
                    </div>
                  )}
                  {revealed.knownLetters && revealed.knownLetters.length > 0 && (
                    <div className="flex items-center gap-2 text-amber-800">
                      <Check className="w-4 h-4" />
                      <span>Contains: {revealed.knownLetters.join(', ')}</span>
                    </div>
                  )}
                  {revealed.pattern && Object.keys(revealed.pattern).length > 0 && (
                    <div className="flex items-center gap-2 text-amber-800">
                      <Check className="w-4 h-4" />
                      <span>Pattern: {Object.entries(revealed.pattern).map(([pos, letter]) => `${letter} at position ${parseInt(pos) + 1}`).join(', ')}</span>
                    </div>
                  )}
                  {revealed.contains && Object.entries(revealed.contains).map(([letter, has]) => {
                    if (letter === '_DUPLICATES_') {
                      return (
                        <div key={letter} className="flex items-center gap-2 text-amber-800">
                          {has ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                          <span>{has ? 'Has' : 'No'} repeated letters</span>
                        </div>
                      );
                    }
                    return (
                      <div key={letter} className="flex items-center gap-2 text-amber-800">
                        {has ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                        <span>{has ? 'Contains' : 'No'} {letter}</span>
                      </div>
                    );
                  })}
                  {Object.keys(revealed).length === 0 && (
                    <div className="text-amber-700 text-center italic">No clues revealed yet</div>
                  )}
                </div>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                Make Your Guess
              </h3>
              <input
                type="text"
                value={guessWord}
                onChange={(e) => setGuessWord(e.target.value.toLowerCase())}
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg text-lg font-mono mb-3 focus:border-green-500 focus:outline-none"
                placeholder="Enter your guess..."
                onKeyPress={(e) => e.key === 'Enter' && submitGuess()}
              />
              <button
                onClick={submitGuess}
                disabled={!guessWord.trim() || !gameState.dictionaryReady}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
              >
                Submit Guess
              </button>
              <div className="mt-3 text-xs text-slate-500 text-center">
                Wrong guess: +{WRONG_GUESS_PENALTY} pts to opponent
              </div>
            </div>

            {gameState.hintLog.length > 0 && (
              <div className="mt-6 bg-white rounded-2xl shadow-lg p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Hint History</h3>
                <div className="space-y-2">
                  {gameState.hintLog.slice(-5).reverse().map((log, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-lg text-sm">
                      <span className="font-semibold">{log.player}</span> used{' '}
                      <span className="text-blue-600 font-semibold">{log.card}</span> (+{log.cost} pts)
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Use Hint Card
              </h3>
              <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto">
                {HINT_CARDS.map(card => (
                  <button
                    key={card.id}
                    onClick={() => setSelectedCard(card)}
                    className="w-full p-3 text-left border-2 border-slate-200 hover:border-blue-400 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-slate-800 group-hover:text-blue-600">
                        {card.name}
                      </span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded">
                        {card.cost} pts
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">{card.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {selectedCard && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
              <h3 className="text-2xl font-bold text-slate-800 mb-2">{selectedCard.name}</h3>
              <p className="text-slate-600 mb-4">{selectedCard.description}</p>
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm text-blue-700">
                  Cost: <span className="font-bold text-lg">{selectedCard.cost}</span> points to opponent
                </div>
              </div>

              {selectedCard.requiresInput && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Enter a letter:
                  </label>
                  <input
                    type="text"
                    value={cardInput}
                    onChange={(e) => setCardInput(e.target.value.toUpperCase().slice(0, 1))}
                    maxLength={1}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg text-lg font-mono uppercase focus:border-blue-500 focus:outline-none text-center"
                    placeholder="A-Z"
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedCard(null);
                    setCardInput('');
                  }}
                  className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => playHintCard(selectedCard)}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Use Card
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (gameState.phase === 'ENDGAME') {
    const p1Score = gameState.p1.public.score;
    const p2Score = gameState.p2.public.score;
    const winner = p1Score > p2Score ? 'Player 1' : p1Score < p2Score ? 'Player 2' : 'Tie';

    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <Trophy className="w-20 h-20 text-amber-500 mx-auto mb-4" />
            <h1 className="text-4xl font-bold text-slate-800 mb-2">
              {winner === 'Tie' ? "It's a Tie!" : `${winner} Wins!`}
            </h1>
            <p className="text-slate-600">Game Over - High Score Wins</p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className={`p-6 rounded-xl ${winner === 'Player 1' ? 'bg-amber-100 border-2 border-amber-400' : 'bg-slate-100'}`}>
              <div className="text-center">
                <div className="text-lg font-semibold text-slate-700 mb-2">Player 1</div>
                <div className="text-4xl font-bold text-slate-900 mb-3">{p1Score}</div>
                <div className="text-sm text-slate-600">
                  Word: <span className="font-bold uppercase">{gameState.p1.secret?.word}</span>
                </div>
              </div>
            </div>
            <div className={`p-6 rounded-xl ${winner === 'Player 2' ? 'bg-amber-100 border-2 border-amber-400' : 'bg-slate-100'}`}>
              <div className="text-center">
                <div className="text-lg font-semibold text-slate-700 mb-2">Player 2</div>
                <div className="text-4xl font-bold text-slate-900 mb-3">{p2Score}</div>
                <div className="text-sm text-slate-600">
                  Word: <span className="font-bold uppercase">{gameState.p2.secret?.word}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            {gameState.hintLog.length > 0 && (
              <div className="p-4 bg-blue-50 rounded-xl">
                <h3 className="font-semibold text-blue-900 mb-2">Hints Used</h3>
                <div className="space-y-1 text-sm text-blue-700">
                  {gameState.hintLog.map((log, i) => (
                    <div key={i}>• {log.player} used {log.card} (+{log.cost})</div>
                  ))}
                </div>
              </div>
            )}

            {gameState.wrongGuesses.length > 0 && (
              <div className="p-4 bg-red-50 rounded-xl">
                <h3 className="font-semibold text-red-900 mb-2">Wrong Guesses</h3>
                <div className="space-y-1 text-sm text-red-700">
                  {gameState.wrongGuesses.map((log, i) => (
                    <div key={i}>• {log.player} guessed "{log.word}" (+{log.penalty})</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={resetGame}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}
