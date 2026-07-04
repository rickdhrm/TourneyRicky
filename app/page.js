"use client";

import React, { useState, useEffect, useRef } from "react";

// Pre-defined premium list of Padel names for randomization
const PREMIUM_PADEL_NAMES = [
  "Juan Lebron", "Ale Galan", "Agustin Tapia", "Arturo Coello", "Paquito Navarro",
  "Sanyo Gutierrez", "Fernando Belasteguin", "Franco Stupaczuk", "Martin Di Nenno",
  "Fede Chingotto", "Delfi Brea", "Bea Gonzalez", "Paula Josemaria", "Ari Sanchez",
  "Gemma Triay", "Marta Ortega", "Lucia Sainz", "Sofia Araujo", "Aranzazu Osoro",
  "Virginia Riera", "Jessica Castello", "Claudia Jensen", "Tamara Icardo", "Paquito N."
];

export default function Home() {
  // --- STATE DECLARATIONS ---
  const [isMounted, setIsMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Setup View States
  const [numCourts, setNumCourts] = useState(2);
  const [numPlayers, setNumPlayers] = useState(8);
  const [rankingMethod, setRankingMethod] = useState("wins");
  const [playerNames, setPlayerNames] = useState(
    Array(8).fill(null).map((_, i) => `Player ${i + 1}`)
  );
  const [setupError, setSetupError] = useState("");
  
  // Active Tournament States
  const [isStarted, setIsStarted] = useState(false);
  const [players, setPlayers] = useState([]); // Array of { id, name }
  const [rounds, setRounds] = useState([]);   // Array of rounds, containing matches
  const [activeSort, setActiveSort] = useState("wins"); // "wins" or "points"
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("matches"); // "matches" or "leaderboard"
  
  // Toast notifications state
  const [toasts, setToasts] = useState([]);
  
  // Reset Confirmation Modal state
  const [showResetModal, setShowResetModal] = useState(false);

  // --- MOUNT EFFECT (LOAD STORAGE) ---
  useEffect(() => {
    setIsMounted(true);
    
    // Load Dark Mode
    const savedState = localStorage.getItem("padel_americano_state");
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        setIsDarkMode(!!parsed.isDarkMode);
        
        if (parsed.isStarted) {
          setPlayers(parsed.players || []);
          setRounds(parsed.rounds || []);
          setActiveSort(parsed.activeSort || "wins");
          setActiveTab(parsed.activeTab || "matches");
          setIsStarted(true);
          
          // Prefill setup fields just in case
          setNumCourts(parsed.setup?.numCourts ?? 2);
          setNumPlayers(parsed.setup?.numPlayers ?? 8);
          setRankingMethod(parsed.setup?.rankingMethod ?? "wins");
        }
      } catch (e) {
        console.error("Failed to parse saved tournament state:", e);
      }
    }
  }, []);

  // --- DARK MODE EFFECT ---
  useEffect(() => {
    if (!isMounted) return;
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    saveCurrentState();
  }, [isDarkMode]);

  // --- SAVE STATE UTILITY ---
  const saveCurrentState = (updatedRounds = rounds, updatedIsStarted = isStarted, updatedPlayers = players) => {
    if (typeof window === "undefined") return;
    const rawData = {
      setup: { numCourts, numPlayers, rankingMethod },
      players: updatedPlayers,
      rounds: updatedRounds,
      activeSort,
      activeTab,
      isDarkMode,
      isStarted: updatedIsStarted
    };
    localStorage.setItem("padel_americano_state", JSON.stringify(rawData));
  };

  // Auto-save on specific state updates
  useEffect(() => {
    if (!isMounted || !isStarted) return;
    saveCurrentState();
  }, [activeSort, activeTab, rounds, players, isStarted]);

  // --- TOAST ALERTS SYSTEM ---
  const showToast = (message, type = "success") => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type, isFading: false }]);
    
    // Trigger fade-out animation before removing
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isFading: true } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 3500);
  };

  // --- PLAYER COUNT INPUT CHANGE ---
  const handlePlayerCountChange = (count) => {
    const val = parseInt(count) || 0;
    setNumPlayers(val);
    if (val < 4) return;
    
    setPlayerNames((prev) => {
      if (val > prev.length) {
        const next = [...prev];
        for (let i = prev.length; i < val; i++) {
          next.push(`Player ${i + 1}`);
        }
        return next;
      } else if (val < prev.length) {
        return prev.slice(0, val);
      }
      return prev;
    });
  };

  // --- PLAYER NAME INPUT CHANGE ---
  const handlePlayerNameChange = (idx, value) => {
    setPlayerNames((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  // --- RANDOMIZE NAMES ---
  const randomizeNames = () => {
    const shuffled = [...PREMIUM_PADEL_NAMES].sort(() => 0.5 - Math.random());
    setPlayerNames((prev) => {
      return prev.map((_, idx) => {
        if (idx < shuffled.length) return shuffled[idx];
        return `Player ${idx + 1}`;
      });
    });
    showToast("Player names randomized!", "info");
  };

  // --- AMERICANO GENERATION ALGORITHM ---
  const generateSchedule = (namesList, courtsCount) => {
    const N = namesList.length;
    const C = courtsCount;
    const matchesPerRound = Math.min(C, Math.floor(N / 4));
    
    // Total matches goal: each player partners with everyone else exactly once
    const totalMatchesGoal = (N * (N - 1)) / 4;
    const numRounds = Math.max(1, Math.ceil(totalMatchesGoal / matchesPerRound));
    
    const partnerCount = Array(N).fill(null).map(() => Array(N).fill(0));
    const opponentCount = Array(N).fill(null).map(() => Array(N).fill(0));
    const playCount = Array(N).fill(0);
    const sittingOutCount = Array(N).fill(0);
    
    const generatedRounds = [];
    let sittingOutPrevRound = new Set();
    
    for (let r = 0; r < numRounds; r++) {
      let bestTrialMatches = null;
      let bestTrialPenalty = Infinity;
      let bestTrialSittingOut = new Set();
      
      const NUM_TRIALS = 10000;
      
      for (let t = 0; t < NUM_TRIALS; t++) {
        // Select players based on match limits and sit-out counts
        const playerWeightList = namesList.map((p, idx) => {
          const noise = Math.random() * 0.05;
          const weight = playCount[idx] * 100 - sittingOutCount[idx] * 5 + noise;
          return { id: p.id, idx, weight };
        });
        
        playerWeightList.sort((a, b) => a.weight - b.weight);
        const selectedPlayers = playerWeightList.slice(0, matchesPerRound * 4);
        const selectedIds = new Set(selectedPlayers.map((p) => p.id));
        
        const sittingOutThisRound = new Set();
        namesList.forEach((p, idx) => {
          if (!selectedIds.has(p.id)) {
            sittingOutThisRound.add(p.id);
          }
        });
        
        let trialPenalty = 0;
        sittingOutThisRound.forEach((id) => {
          const idx = namesList.findIndex((p) => p.id === id);
          if (sittingOutPrevRound.has(id)) {
            trialPenalty += 5000; // Consecutive sit-out penalty
          }
          trialPenalty += sittingOutCount[idx] * 50;
        });
        
        // Shuffle playing IDs
        const playingIds = selectedPlayers.map((p) => p.id);
        for (let i = playingIds.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [playingIds[i], playingIds[j]] = [playingIds[j], playingIds[i]];
        }
        
        const trialMatches = [];
        for (let m = 0; m < matchesPerRound; m++) {
          const p0 = playingIds[m * 4 + 0];
          const p1 = playingIds[m * 4 + 1];
          const p2 = playingIds[m * 4 + 2];
          const p3 = playingIds[m * 4 + 3];
          
          const idx0 = namesList.findIndex((p) => p.id === p0);
          const idx1 = namesList.findIndex((p) => p.id === p1);
          const idx2 = namesList.findIndex((p) => p.id === p2);
          const idx3 = namesList.findIndex((p) => p.id === p3);
          
          // Partnership counts
          const pCountA = partnerCount[idx0][idx1];
          const pCountB = partnerCount[idx2][idx3];
          trialPenalty += Math.pow(pCountA, 2) * 2000;
          trialPenalty += Math.pow(pCountB, 2) * 2000;
          
          // Opponent counts
          trialPenalty += opponentCount[idx0][idx2] * 20;
          trialPenalty += opponentCount[idx0][idx3] * 20;
          trialPenalty += opponentCount[idx1][idx2] * 20;
          trialPenalty += opponentCount[idx1][idx3] * 20;
          
          trialMatches.push({
            id: `r${r}-c${m + 1}`,
            court: m + 1,
            teamA: [p0, p1],
            teamB: [p2, p3],
            scoreA: null,
            scoreB: null,
            submitted: false
          });
        }
        
        if (trialPenalty < bestTrialPenalty) {
          bestTrialPenalty = trialPenalty;
          bestTrialMatches = trialMatches;
          bestTrialSittingOut = sittingOutThisRound;
        }
      }
      
      // Commit best trial pairing
      bestTrialMatches.forEach((m) => {
        const idx0 = namesList.findIndex((p) => p.id === m.teamA[0]);
        const idx1 = namesList.findIndex((p) => p.id === m.teamA[1]);
        const idx2 = namesList.findIndex((p) => p.id === m.teamB[0]);
        const idx3 = namesList.findIndex((p) => p.id === m.teamB[1]);
        
        partnerCount[idx0][idx1]++;
        partnerCount[idx1][idx0]++;
        partnerCount[idx2][idx3]++;
        partnerCount[idx3][idx2]++;
        
        const opponentPairs = [
          [idx0, idx2], [idx0, idx3],
          [idx1, idx2], [idx1, idx3]
        ];
        opponentPairs.forEach(([a, b]) => {
          opponentCount[a][b]++;
          opponentCount[b][a]++;
        });
        
        playCount[idx0]++;
        playCount[idx1]++;
        playCount[idx2]++;
        playCount[idx3]++;
      });
      
      bestTrialSittingOut.forEach((id) => {
        const idx = namesList.findIndex((p) => p.id === id);
        sittingOutCount[idx]++;
      });
      
      generatedRounds.push(bestTrialMatches);
      sittingOutPrevRound = bestTrialSittingOut;
    }
    
    return generatedRounds;
  };

  // --- SUBMIT SETUP ---
  const handleSetupSubmit = (e) => {
    e.preventDefault();
    setSetupError("");
    
    if (numCourts < 1) {
      setSetupError("Number of courts must be at least 1.");
      return;
    }
    if (numPlayers < 4) {
      setSetupError("A minimum of 4 players is required.");
      return;
    }
    if (numPlayers < numCourts * 4) {
      setSetupError(`You need at least ${numCourts * 4} players (4 per court) to fill all ${numCourts} courts.`);
      return;
    }
    
    // Check duplicates
    const cleanedNames = [];
    const nameSet = new Set();
    let hasDuplicate = false;
    let duplicateVal = "";
    
    for (let i = 0; i < playerNames.length; i++) {
      const name = playerNames[i] ? playerNames[i].trim() : "";
      if (!name) {
        setSetupError(`Please enter a name for Player ${i + 1}.`);
        return;
      }
      
      const key = name.toLowerCase();
      if (nameSet.has(key)) {
        hasDuplicate = true;
        duplicateVal = name;
        break;
      }
      nameSet.add(key);
      cleanedNames.push({
        id: `p-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
        name: name
      });
    }
    
    if (hasDuplicate) {
      setSetupError(`Duplicate player name detected: "${duplicateVal}". All player names must be unique.`);
      return;
    }
    
    const generated = generateSchedule(cleanedNames, numCourts);
    
    setPlayers(cleanedNames);
    setRounds(generated);
    setActiveSort(rankingMethod);
    setActiveTab("matches");
    setIsStarted(true);
    
    saveCurrentState(generated, true, cleanedNames);
    showToast("Tournament matches generated successfully!", "success");
  };

  // --- SCORE EDITING & AUTO-CALCULATING ---
  const handleScoreChange = (roundIdx, matchIdx, team, val) => {
    const updated = [...rounds];
    const match = updated[roundIdx][matchIdx];
    
    const parsed = parseInt(val);
    if (isNaN(parsed) || parsed < 0 || parsed > 21) {
      if (team === "A") match.scoreA = val;
      else match.scoreB = val;
      setRounds(updated);
      return;
    }
    
    // Apply dual-binding score constraints (totals 21)
    if (team === "A") {
      match.scoreA = parsed;
      match.scoreB = 21 - parsed;
    } else {
      match.scoreB = parsed;
      match.scoreA = 21 - parsed;
    }
    
    // Hide inline errors
    const errorEl = document.getElementById(`validation-msg-${match.id}`);
    if (errorEl) errorEl.classList.add("hidden");
    
    setRounds(updated);
  };

  const submitScore = (roundIdx, matchIdx) => {
    const updated = [...rounds];
    const match = updated[roundIdx][matchIdx];
    const errorEl = document.getElementById(`validation-msg-${match.id}`);
    if (errorEl) errorEl.classList.add("hidden");
    
    const valA = match.scoreA;
    const valB = match.scoreB;
    
    if (valA === null || valA === "" || valB === null || valB === "") {
      showInlineError(match.id, "Please enter scores for both teams.");
      return;
    }
    
    const scoreA = parseInt(valA);
    const scoreB = parseInt(valB);
    
    if (isNaN(scoreA) || isNaN(scoreB) || scoreA < 0 || scoreB < 0) {
      showInlineError(match.id, "Scores must be positive whole numbers.");
      return;
    }
    
    if (scoreA + scoreB !== 21) {
      showInlineError(match.id, "Scores must total exactly 21.");
      return;
    }
    
    match.scoreA = scoreA;
    match.scoreB = scoreB;
    match.submitted = true;
    
    setRounds(updated);
    saveCurrentState(updated);
    showToast(`Match score (${scoreA}-${scoreB}) saved successfully!`, "success");
  };

  const editScore = (roundIdx, matchIdx) => {
    const updated = [...rounds];
    updated[roundIdx][matchIdx].submitted = false;
    setRounds(updated);
    saveCurrentState(updated);
  };

  const showInlineError = (matchId, msg) => {
    const errorEl = document.getElementById(`validation-msg-${matchId}`);
    if (errorEl) {
      const textSpan = errorEl.querySelector(".msg-text");
      if (textSpan) textSpan.textContent = msg;
      errorEl.classList.remove("hidden");
    }
  };

  // --- STATS CALCULATOR ---
  let completedMatches = 0;
  let totalMatches = 0;
  rounds.forEach((round) => {
    round.forEach((match) => {
      totalMatches++;
      if (match.submitted) completedMatches++;
    });
  });
  
  const remainingMatches = totalMatches - completedMatches;
  const progressPct = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0;

  // --- STANDINGS CALCULATOR ---
  const calculateLeaderboard = () => {
    const standings = {};
    
    players.forEach((p) => {
      standings[p.id] = {
        id: p.id,
        name: p.name,
        matchesPlayed: 0,
        wins: 0,
        ties: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifference: 0,
        tournamentPoints: 0
      };
    });
    
    rounds.forEach((round) => {
      round.forEach((match) => {
        if (match.submitted) {
          const scoreA = match.scoreA;
          const scoreB = match.scoreB;
          
          match.teamA.forEach((pid) => {
            const stats = standings[pid];
            if (stats) {
              stats.matchesPlayed++;
              stats.pointsFor += scoreA;
              stats.pointsAgainst += scoreB;
              if (scoreA > scoreB) {
                stats.wins++;
                stats.tournamentPoints += 2;
              } else if (scoreA === scoreB) {
                stats.ties++;
                stats.tournamentPoints += 1;
              } else {
                stats.losses++;
                stats.tournamentPoints += 0;
              }
            }
          });
          
          match.teamB.forEach((pid) => {
            const stats = standings[pid];
            if (stats) {
              stats.matchesPlayed++;
              stats.pointsFor += scoreB;
              stats.pointsAgainst += scoreA;
              if (scoreB > scoreA) {
                stats.wins++;
                stats.tournamentPoints += 2;
              } else if (scoreB === scoreA) {
                stats.ties++;
                stats.tournamentPoints += 1;
              } else {
                stats.losses++;
                stats.tournamentPoints += 0;
              }
            }
          });
        }
      });
    });
    
    const list = Object.values(standings);
    list.forEach((item) => {
      item.pointDifference = item.pointsFor - item.pointsAgainst;
    });
    
    list.sort((a, b) => {
      if (activeSort === "wins") {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.pointDifference !== a.pointDifference) return b.pointDifference - a.pointDifference;
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      } else {
        if (b.tournamentPoints !== a.tournamentPoints) return b.tournamentPoints - a.tournamentPoints;
        if (b.pointDifference !== a.pointDifference) return b.pointDifference - a.pointDifference;
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
      }
      return a.name.localeCompare(b.name);
    });
    
    return list;
  };

  const standingsList = calculateLeaderboard();
  
  // Filter search queries
  const query = searchQuery.trim().toLowerCase();
  const filteredStandings = standingsList.filter((item) =>
    item.name.toLowerCase().includes(query)
  );

  // --- RESET TOURNAMENT ACTIONS ---
  const confirmReset = () => {
    localStorage.removeItem("padel_americano_state");
    setNumCourts(2);
    setNumPlayers(8);
    setRankingMethod("wins");
    setPlayerNames(Array(8).fill(null).map((_, i) => `Player ${i + 1}`));
    setSetupError("");
    setPlayers([]);
    setRounds([]);
    setActiveSort("wins");
    setSearchQuery("");
    setActiveTab("matches");
    setIsStarted(false);
    setShowResetModal(false);
    showToast("Tournament reset successfully. Ready for new setup.", "info");
  };

  // --- CSV EXPORTER ---
  const exportCSV = () => {
    const csvHeaders = [
      "Rank", "Player Name", "Matches Played", "Record (W-T-L)", "Score Difference (SD)", "Tournament Points (TP)", "Total Score"
    ];
    const csvRows = [csvHeaders.join(",")];
    
    standingsList.forEach((item, index) => {
      const row = [
        index + 1,
        `"${item.name.replace(/"/g, '""')}"`,
        item.matchesPlayed,
        `"${item.wins}-${item.ties}-${item.losses}"`,
        item.pointDifference,
        item.tournamentPoints,
        item.pointsFor
      ];
      csvRows.push(row.join(","));
    });
    
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `padel-americano-standings-${Date.now()}.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("Leaderboard exported to CSV successfully!", "success");
  };

  // --- METRICS PRINT ---
  const printLeaderboard = () => {
    window.print();
  };

  // Get name helper
  const getPlayerName = (id) => {
    return players.find((p) => p.id === id)?.name || "Unknown";
  };

  // --- RENDER HYDRATION PRE-SKELETON ---
  if (!isMounted) {
    return (
      <div className="container" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <div style={{ textAlign: "center", fontFamily: "var(--font-display)" }}>
          <h2 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px", color: "var(--primary)" }}>Loading Padel Americano...</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Initializing tournament data.</p>
        </div>
      </div>
    );
  }

  // --- HOME COMPONENT RENDER ---
  return (
    <>
      {/* Dynamic Header */}
      <header className="main-header">
        <div className="header-content">
          <div className="brand">
            <svg className="brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M6 12A6 6 0 0 1 18 12"></path>
              <path d="M12 6A6 6 0 0 1 12 18"></path>
            </svg>
            <h1>Padel Americano</h1>
          </div>
          <div className="header-actions">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="icon-btn"
              aria-label="Toggle Dark Mode"
              title="Toggle Dark/Light Mode"
            >
              {isDarkMode ? (
                <svg className="sun-icon" style={{ display: "block" }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4"></circle>
                  <path d="M12 2v2"></path>
                  <path d="M12 20v2"></path>
                  <path d="M4.93 4.93l1.41 1.41"></path>
                  <path d="M17.66 17.66l1.41 1.41"></path>
                  <path d="M2 12h2"></path>
                  <path d="M20 12h2"></path>
                  <path d="M6.34 17.66l-1.41 1.41"></path>
                  <path d="M19.07 4.93l-1.41 1.41"></path>
                </svg>
              ) : (
                <svg className="moon-icon" style={{ display: "block" }} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        {/* VIEW 1: TOURNAMENT SETUP */}
        {!isStarted && (
          <section className="card fade-in">
            <div className="setup-header">
              <h2>Tournament Configuration</h2>
              <p>Set up your players and courts to automatically generate the Americano schedule.</p>
            </div>

            <form onSubmit={handleSetupSubmit} noValidate>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="input-courts">Number of Courts</label>
                  <input
                    type="number"
                    id="input-courts"
                    min="1"
                    value={numCourts}
                    onChange={(e) => setNumCourts(parseInt(e.target.value) || 0)}
                    required
                  />
                  <span className="field-hint">How many courts are available to play on simultaneously.</span>
                </div>

                <div className="form-group">
                  <label htmlFor="input-players-count">Number of Players</label>
                  <input
                    type="number"
                    id="input-players-count"
                    min="4"
                    value={numPlayers}
                    onChange={(e) => handlePlayerCountChange(e.target.value)}
                    required
                  />
                  <span className="field-hint">Minimum 4 players required.</span>
                </div>
              </div>

              <div className="form-group">
                <label>Leaderboard Ranking Method</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="rankingMethod"
                      value="wins"
                      checked={rankingMethod === "wins"}
                      onChange={() => setRankingMethod("wins")}
                    />
                    <span className="radio-custom"></span>
                    <span className="radio-text">Total Wins (default)</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="rankingMethod"
                      value="points"
                      checked={rankingMethod === "points"}
                      onChange={() => setRankingMethod("points")}
                    />
                    <span className="radio-custom"></span>
                    <span className="radio-text">Total Tournament Points</span>
                  </label>
                </div>
                <span className="field-hint">Initial priority for standings. Wins prioritizes match wins; Tournament Points awards Win = 2, Tie = 1, Loss = 0.</span>
              </div>

              <div className="divider"></div>

              <div className="player-names-section">
                <div className="section-title-bar">
                  <h3>Player Names</h3>
                  <button
                    type="button"
                    onClick={randomizeNames}
                    className="btn btn-secondary btn-sm"
                  >
                    Randomize Names
                  </button>
                </div>
                <p className="section-description">Fill in the participant names. No duplicate names allowed.</p>
                <div className="player-inputs-grid">
                  {playerNames.map((name, idx) => (
                    <div key={idx} className="player-input-wrapper">
                      <span>Player {idx + 1}</span>
                      <input
                        type="text"
                        value={name}
                        placeholder="Enter player name"
                        onChange={(e) => handlePlayerNameChange(idx, e.target.value)}
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>

              {setupError && (
                <div className="alert alert-danger" role="alert">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                  <span>{setupError}</span>
                </div>
              )}

              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-large">
                  Generate Tournament Schedule
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="btn-icon">
                    <path d="m9 18 6-6-6-6"></path>
                  </svg>
                </button>
              </div>
            </form>
          </section>
        )}

        {/* VIEW 2: TOURNAMENT DASHBOARD */}
        {isStarted && (
          <section className="dashboard-container">
            
            {/* Stats card */}
            <div className="card stats-card fade-in" style={{ marginBottom: "24px" }}>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Total Rounds</span>
                  <span className="stat-value">{rounds.length}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Completed Matches</span>
                  <span className="stat-value">{completedMatches}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Remaining Matches</span>
                  <span className="stat-value">{remainingMatches}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Completion Progress</span>
                  <span className="stat-value">{progressPct}%</span>
                </div>
              </div>
              <div className="progress-container">
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${progressPct}%` }}></div>
                </div>
              </div>
            </div>

            {/* Tabs control */}
            <div className="dashboard-tabs" role="tablist">
              <button
                onClick={() => setActiveTab("matches")}
                className={`tab-button ${activeTab === "matches" ? "active" : ""}`}
                role="tab"
                aria-selected={activeTab === "matches"}
              >
                <svg className="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                Matches Schedule
              </button>
              <button
                onClick={() => setActiveTab("leaderboard")}
                className={`tab-button ${activeTab === "leaderboard" ? "active" : ""}`}
                role="tab"
                aria-selected={activeTab === "leaderboard"}
              >
                <svg className="btn-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="7"></circle>
                  <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
                </svg>
                Standings & Leaderboard
              </button>
            </div>

            {/* Tab content wrappers */}
            <div className="tab-content-container">
              
              {/* MATCHES LIST TAB PANES */}
              {activeTab === "matches" && (
                <div className="tab-pane fade-in">
                  <div className="card matches-card">
                    <div className="matches-header">
                      <div class="round-title-container">
                        <h2>Tournament Matches</h2>
                      </div>
                    </div>
                    
                    <p className="section-description" style={{ marginBottom: "20px" }}>
                      Submit scores for matches below. The leaderboard and progress bar will automatically update as scores are entered.
                    </p>

                    <div className="matches-list">
                      {rounds.map((round, roundIdx) => (
                        <div key={roundIdx} className="round-section">
                          <h3 className="round-section-header">Round {roundIdx + 1}</h3>
                          <div className="round-matches-grid">
                            {round.map((match, matchIdx) => {
                              const pA1 = getPlayerName(match.teamA[0]);
                              const pA2 = getPlayerName(match.teamA[1]);
                              const pB1 = getPlayerName(match.teamB[0]);
                              const pB2 = getPlayerName(match.teamB[1]);
                              
                              let teamAClasses = "team-wrapper";
                              let teamBClasses = "team-wrapper";
                              
                              if (match.submitted) {
                                if (match.scoreA > match.scoreB) {
                                  teamAClasses += " winner";
                                  teamBClasses += " loser";
                                } else if (match.scoreB > match.scoreA) {
                                  teamBClasses += " winner";
                                  teamAClasses += " loser";
                                } else {
                                  teamAClasses += " tied";
                                  teamBClasses += " tied";
                                }
                              }
                              
                              return (
                                <div key={match.id} className="match-item highlight-round">
                                  <div className="match-court-header">
                                    <span>Court {match.court}</span>
                                    <span className="match-court-badge">Match #{roundIdx + 1}.${matchIdx + 1}</span>
                                  </div>
                                  
                                  <div className="match-teams-container">
                                    {/* Team A */}
                                    <div className={teamAClasses}>
                                      <div className="team-players">
                                        <span className="team-players-names">{pA1}</span>
                                        <span className="team-players-names">{pA2}</span>
                                      </div>
                                      <div className="team-score-input-wrapper">
                                        {match.submitted ? (
                                          <span className="score-display">{match.scoreA}</span>
                                        ) : (
                                          <input
                                            type="number"
                                            className="score-input"
                                            min="0"
                                            max="21"
                                            value={match.scoreA !== null ? match.scoreA : ""}
                                            onChange={(e) => handleScoreChange(roundIdx, matchIdx, "A", e.target.value)}
                                            placeholder="-"
                                            aria-label={`${pA1} and ${pA2} score`}
                                          />
                                        )}
                                      </div>
                                    </div>
                                    
                                    <div className="vs-divider">VS</div>
                                    
                                    {/* Team B */}
                                    <div className={teamBClasses}>
                                      <div className="team-players">
                                        <span className="team-players-names">{pB1}</span>
                                        <span className="team-players-names">{pB2}</span>
                                      </div>
                                      <div className="team-score-input-wrapper">
                                        {match.submitted ? (
                                          <span className="score-display">{match.scoreB}</span>
                                        ) : (
                                          <input
                                            type="number"
                                            className="score-input"
                                            min="0"
                                            max="21"
                                            value={match.scoreB !== null ? match.scoreB : ""}
                                            onChange={(e) => handleScoreChange(roundIdx, matchIdx, "B", e.target.value)}
                                            placeholder="-"
                                            aria-label={`${pB1} and ${pB2} score`}
                                          />
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="match-controls-bar">
                                    <div className="match-validation-message hidden" id={`validation-msg-${match.id}`}>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                      <span className="msg-text">Scores must sum to 21</span>
                                    </div>
                                    
                                    <div className="match-actions-buttons">
                                      {match.submitted ? (
                                        <button
                                          onClick={() => editScore(roundIdx, matchIdx)}
                                          className="btn btn-secondary btn-sm"
                                        >
                                          Edit Score
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => submitScore(roundIdx, matchIdx)}
                                          className="btn btn-primary btn-sm"
                                        >
                                          Submit
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="reset-container">
                    <button onClick={() => setShowResetModal(true)} className="btn btn-danger-outline">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="btn-icon">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                        <path d="M3 3v5h5"></path>
                      </svg>
                      Reset Tournament
                    </button>
                  </div>
                </div>
              )}

              {/* LEADERBOARD STANDINGS TAB PANE */}
              {activeTab === "leaderboard" && (
                <div className="tab-pane fade-in">
                  <div className="card leaderboard-card">
                    <div className="leaderboard-header">
                      <h3>Standings</h3>
                      <div className="leaderboard-actions">
                        <button onClick={exportCSV} className="btn btn-secondary btn-sm" title="Export Leaderboard to CSV">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="btn-icon">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                          </svg>
                          CSV
                        </button>
                        <button onClick={printLeaderboard} className="btn btn-secondary btn-sm" title="Print Standings">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="btn-icon">
                            <polyline points="6 9 6 2 18 2 18 9"></polyline>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                            <rect x="6" y="14" width="12" height="8"></rect>
                          </svg>
                          Print
                        </button>
                      </div>
                    </div>

                    <div className="leaderboard-controls">
                      <div className="search-box">
                        <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"></circle>
                          <path d="m21 21-4.3-4.3"></path>
                        </svg>
                        <label htmlFor="search-player-input" className="sr-only">Search Player</label>
                        <input
                          type="search"
                          id="search-player-input"
                          placeholder="Search player..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>

                      <div className="sort-selector-container">
                        <span className="sort-label">Sort by:</span>
                        <div className="sort-tabs" role="tablist">
                          <button
                            onClick={() => setActiveSort("wins")}
                            className={`sort-tab ${activeSort === "wins" ? "active" : ""}`}
                            role="tab"
                            aria-selected={activeSort === "wins"}
                          >
                            Wins
                          </button>
                          <button
                            onClick={() => setActiveSort("points")}
                            className={`sort-tab ${activeSort === "points" ? "active" : ""}`}
                            role="tab"
                            aria-selected={activeSort === "points"}
                          >
                            Tournament Points
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="table-container">
                      <table className="leaderboard-table">
                        <thead>
                          <tr>
                            <th scope="col" className="col-rank">Rank</th>
                            <th scope="col" class="col-player">Player</th>
                            <th scope="col" className="col-stat" title="Matches Played">MP</th>
                            <th scope="col" className={`col-stat ${activeSort === "wins" ? "col-highlight" : ""}`} title="Record (Wins-Ties-Losses)">W-T-L</th>
                            <th scope="col" className="col-stat" title="Score Difference">SD</th>
                            <th scope="col" className={`col-stat ${activeSort === "points" ? "col-highlight" : ""}`} title="Tournament Points">TP</th>
                            <th scope="col" className="col-stat" title="Total Score (Points Scored)">Total Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStandings.length === 0 ? (
                            <tr>
                              <td colSpan="7" style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
                                No matching players found.
                              </td>
                            </tr>
                          ) : (
                            filteredStandings.map((item) => {
                              const absoluteRank = standingsList.findIndex((p) => p.id === item.id) + 1;
                              const diffText = item.pointDifference > 0 ? `+${item.pointDifference}` : item.pointDifference;
                              return (
                                <tr key={item.id}>
                                  <td className="col-rank">
                                    <span className="rank-badge">{absoluteRank}</span>
                                  </td>
                                  <td className="col-player" title={item.name}>{item.name}</td>
                                  <td className="col-stat">{item.matchesPlayed}</td>
                                  <td className={`col-stat ${activeSort === "wins" ? "col-highlight" : ""}`}>{`${item.wins}-${item.ties}-${item.losses}`}</td>
                                  <td className="col-stat">{diffText}</td>
                                  <td className={`col-stat ${activeSort === "points" ? "col-highlight" : ""}`}>{item.tournamentPoints}</td>
                                  <td className="col-stat">{item.pointsFor}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* CONFIRM RESET DIALOG MODAL */}
      {showResetModal && (
        <div 
          className="dialog-modal-overlay" 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(15, 23, 42, 0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 10000
          }}
          onClick={() => setShowResetModal(false)}
        >
          <div className="dialog-modal" style={{ display: "block" }} onClick={(e) => e.stopPropagation()}>
            <div className="dialog-content">
              <div className="dialog-header">
                <div className="dialog-warning-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </div>
                <h2>Reset Tournament?</h2>
              </div>
              <div className="dialog-body">
                <p>Are you sure you want to reset the tournament? This will erase all player names, generated match schedules, scores, and standings. <strong>This cannot be undone.</strong></p>
              </div>
              <div className="dialog-actions">
                <button onClick={() => setShowResetModal(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={confirmReset} className="btn btn-danger">Yes, Reset Tournament</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Toast System */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type} ${toast.isFading ? "fade-out" : ""}`}>
            {toast.type === "success" && (
              <svg className="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            )}
            {toast.type === "danger" && (
              <svg className="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            )}
            {toast.type === "info" && (
              <svg className="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="12" x2="12" y2="16"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            )}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Dynamic Footer */}
      <footer className="main-footer">
        <p>&copy; 2026 Padel Americano Scoring System. Runs entirely client-side with Next.js App Router and Local Storage autosave.</p>
      </footer>
    </>
  );
}
