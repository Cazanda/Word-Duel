# Word Duel

## Overview

Word Duel is a two-player word guessing game built as a single-page application. Players take turns creating secret words and attempting to guess their opponent's word using strategic hints and letter-based clues. The game features a scoring system where players earn points based on word complexity, with penalties for incorrect guesses. The application is built with React and TypeScript, utilizing Vite as the build tool and development server.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 19 with TypeScript
- Single-page application with component-based architecture
- Uses functional components with React hooks (useState, useEffect)
- Type-safe implementation with strict TypeScript configuration
- No routing library - game phases managed through state machine

**State Management**
- All game state managed locally using React useState
- Centralized GameState interface controls game flow through distinct phases:
  - START: Initial game setup
  - SETUP_P1/SETUP_P2: Players choose their secret words
  - PASS_TO_GUESS_P1/PASS_TO_GUESS_P2: Transition screens for player switching
  - GUESS_P1/GUESS_P2: Active guessing phases
  - ENDGAME: Game conclusion and scoring
- No external state management library required (Redux, Zustand, etc.)

**Styling Solution**: Tailwind CSS
- Utility-first CSS framework for rapid UI development
- PostCSS for CSS processing with autoprefixer
- All styles applied via className utilities
- No custom CSS files beyond Tailwind imports

**UI Components**
- Lucide React for iconography (Eye, Trophy, Zap, AlertCircle, etc.)
- Custom-built game components (no UI library like Material-UI or Chakra)
- Icon usage indicates visibility toggles, scoring indicators, and game status

### Game Logic Architecture

**Core Game Mechanics**
- Turn-based gameplay with alternating player phases
- Letter-based word construction system using Record<Letter, number> to track available letters
- Hint card system with varying costs and effects
- Scoring system where higher scores win (SCORING_MODE: 'HIGH_WINS')
- Wrong guess penalty system (2 points per incorrect guess)
- Minimum word length requirement (3 letters)

**Word Validation**
- Dictionary-based word validation using local wordlist
- Wordlist stored as plain text file in public/wordlists/words.txt
- Dictionary loading indicated by dictionaryReady flag in game state
- Supports asynchronous dictionary initialization

**Hint System Design**
- Modular hint card architecture with effect functions
- Cards can reveal various word properties:
  - Word length
  - First/last letters
  - Vowel count
  - Specific letter presence
  - Letter patterns at positions
- Cost-based system to balance gameplay
- Some cards require user input (requiresInput flag)
- All reveals tracked in RevealedInfo interface

**Player Information Model**
- Secret information (PlayerSecret): word choice and available letters
- Public information (PlayerPublic): score, revealed hints, solve status
- Clear separation prevents accidental information leakage in UI
- Letter swap mechanism tracked separately from player states

### Build and Development

**Build Tool**: Vite 7
- Fast HMR (Hot Module Replacement) for development
- Optimized production builds with tree-shaking
- React plugin for JSX/TSX support
- ES2020 target for modern JavaScript features

**Development Server Configuration**
- Host: 0.0.0.0 (accessible from network)
- Port: 5000
- AllowedHosts: true (for Replit deployment compatibility)

**TypeScript Configuration**
- Strict mode enabled for type safety
- Bundler module resolution
- React JSX transformation
- No emit mode (Vite handles compilation)
- Unused locals and parameters flagged as errors

## External Dependencies

### Core Framework Dependencies
- **react**: ^19.2.0 - UI framework
- **react-dom**: ^19.2.0 - DOM rendering
- **typescript**: ^5.9.3 - Type system

### Build Tools
- **vite**: ^7.1.12 - Build tool and dev server
- **@vitejs/plugin-react**: ^5.1.0 - React support for Vite

### Styling
- **tailwindcss**: ^3.4.18 - Utility-first CSS framework
- **postcss**: ^8.5.6 - CSS processing
- **autoprefixer**: ^10.4.21 - Browser compatibility for CSS

### UI Libraries
- **lucide-react**: ^0.548.0 - Icon components

### Type Definitions
- **@types/react**: ^19.2.2 - TypeScript definitions for React
- **@types/react-dom**: ^19.2.2 - TypeScript definitions for React DOM

### Data Sources
- **Local Dictionary**: Plain text wordlist stored in public/wordlists/words.txt
  - Loaded at runtime via fetch or similar mechanism
  - No external API calls for word validation
  - Self-contained for offline functionality

### No Backend Services
- Purely client-side application
- No database integration
- No authentication system
- No API endpoints
- Game state exists only in browser memory
- No persistence between sessions