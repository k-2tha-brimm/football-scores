import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

const ScoreBoard = () => {
  const [games, setGames] = useState([]);
  const [poolData, setPoolData] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [week, setWeek] = useState(null);

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Extract week number from filename (e.g., "week_14.xls" -> 14)
    const weekMatch = file.name.match(/week[_\s-]?(\d+)/i);
    if (weekMatch) {
      const extractedWeek = parseInt(weekMatch[1]);
      setWeek(extractedWeek);
      
      // Fetch games for this week
      fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${extractedWeek}`)
        .then(async (response) => {
          const score = await response.json();
          const events = score.events;
          console.log(`Loaded games for week ${extractedWeek}:`, events);
          setGames(events);
        });
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // Get the first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to array of arrays
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Parse the data
      parsePoolData(rawData);
    };
    reader.readAsArrayBuffer(file);
  };

  // Parse the uploaded spreadsheet data
  const parsePoolData = (rawData) => {
    if (!rawData || rawData.length < 2) return;

    // Row 0 (index 0): Participant names
    // Skip first two columns (empty and team names column header)
    const headers = rawData[0].slice(2).filter(h => h && typeof h === 'string');
    setParticipants(headers);

    // Find first row with a text value in column 0 (team name)
    let firstTeamRow = -1;
    for (let i = 1; i < rawData.length; i++) {
      const cellValue = rawData[i][0];
      if (cellValue && typeof cellValue === 'string') {
        firstTeamRow = i;
        break;
      }
    }

    if (firstTeamRow === -1) {
      console.error('No team data found in spreadsheet');
      return;
    }

    console.log(`Found ${headers.length} participants`);
    console.log(`First team row at index ${firstTeamRow}: ${rawData[firstTeamRow][0]}`);

    // Parse teams starting from firstTeamRow
    const picks = {};
    const teamGameMap = {};

    // Initialize participant picks
    headers.forEach(participant => {
      picks[participant] = [];
    });

    let gameIndex = 0;
    for (let i = firstTeamRow; i < rawData.length; i++) {
      const row = rawData[i];
      const teamName = row[0];
      
      // Skip rows without team names
      if (!teamName || typeof teamName !== 'string') continue;

      // Store which game this team belongs to
      teamGameMap[teamName] = gameIndex;

      // Process each participant's pick for this team
      headers.forEach((participant, idx) => {
        const confidence = row[idx + 2]; // +2 to skip first two columns
        
        if (confidence !== null && confidence !== undefined && confidence !== '') {
          picks[participant].push({
            team: teamName,
            confidence: Number(confidence),
            gameIndex: gameIndex
          });
        }
      });

      // Every pair of rows is a new game
      // Count from firstTeamRow
      if ((i - firstTeamRow) % 2 === 1) {
        gameIndex++;
      }
    }

    const parsedData = {
      participants: headers,
      picks: picks,
      teamGameMap: teamGameMap,
      rawData: rawData
    };

    setPoolData(parsedData);
    console.log('Parsed pool data:', parsedData);
  };

  // Normalize team names to match spreadsheet format
  const normalizeTeamName = (fullName) => {
    const teamMap = {
      'Arizona Cardinals': 'Arizona',
      'Atlanta Falcons': 'Atlanta',
      'Baltimore Ravens': 'Baltimore',
      'Buffalo Bills': 'Buffalo',
      'Carolina Panthers': 'Carolina',
      'Chicago Bears': 'Chicago',
      'Cincinnati Bengals': 'Cincinnati',
      'Cleveland Browns': 'Cleveland',
      'Dallas Cowboys': 'Dallas',
      'Denver Broncos': 'Denver',
      'Detroit Lions': 'Detroit',
      'Green Bay Packers': 'Green Bay',
      'Houston Texans': 'Houston',
      'Indianapolis Colts': 'Indianapolis',
      'Jacksonville Jaguars': 'Jacksonville',
      'Kansas City Chiefs': 'Kansas City',
      'Las Vegas Raiders': 'Las Vegas',
      'Los Angeles Chargers': 'LA Chargers',
      'Los Angeles Rams': 'LA Rams',
      'Miami Dolphins': 'Miami',
      'Minnesota Vikings': 'Minnesota',
      'New England Patriots': 'New England',
      'New Orleans Saints': 'New Orleans',
      'New York Giants': 'NY Giants',
      'New York Jets': 'NY Jets',
      'Philadelphia Eagles': 'Philadelphia',
      'Pittsburgh Steelers': 'Pittsburgh',
      'San Francisco 49ers': 'San Francisco',
      'Seattle Seahawks': 'Seattle',
      'Tampa Bay Buccaneers': 'Tampa Bay',
      'Tennessee Titans': 'Tennessee',
      'Washington Commanders': 'Washington'
    };
    
    return teamMap[fullName] || fullName;
  };

  // Calculate scores based on game results
  const calculateScores = () => {
    if (!poolData || !games.length) return {};

    const scores = {};
    poolData.participants.forEach(participant => {
      scores[participant] = 0;
    });

    // Match games with picks by team names, not by index
    games.forEach((game) => {
      const status = game.status.type.state;
      const isComplete = status === 'post';

      if (!isComplete) return;

      const teams = game.competitions[0].competitors;
      const homeTeam = teams.find(t => t.homeAway === 'home');
      const awayTeam = teams.find(t => t.homeAway === 'away');
      
      const homeScore = parseInt(homeTeam.score);
      const awayScore = parseInt(awayTeam.score);
      
      // Normalize team names to match spreadsheet format
      const winnerFullName = homeScore > awayScore ? homeTeam.team.displayName : awayTeam.team.displayName;
      const winner = normalizeTeamName(winnerFullName);

      // Award points to participants who picked the winner
      poolData.participants.forEach(participant => {
        const participantPicks = poolData.picks[participant];
        
        // Find the pick for this winner (match by team name, not game index)
        const winningPick = participantPicks.find(p => p.team === winner);
        
        if (winningPick) {
          scores[participant] += winningPick.confidence;
        }
      });
    });

    return scores;
  };

  const scores = calculateScores();
  const leaderboard = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .map(([name, score]) => ({ name, score }));

  return (
    <div style={{ padding: '20px' }}>
      <h1>NFL {week ? `Week ${week}` : 'Weekly'} Score Tracker</h1>
      
      {/* File Upload */}
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="file-upload" style={{ 
          padding: '10px 20px', 
          backgroundColor: '#007bff', 
          color: 'white', 
          cursor: 'pointer',
          borderRadius: '4px',
          display: 'inline-block'
        }}>
          Upload Pool Picks (.xls)
        </label>
        <input 
          id="file-upload"
          type="file" 
          accept=".xls,.xlsx"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        {poolData && (
          <span style={{ marginLeft: '10px', color: 'green' }}>
            ✓ Loaded picks for {poolData.participants.length} participants
          </span>
        )}
      </div>

      {/* Leaderboard */}
      {poolData && leaderboard.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h2>Leaderboard</h2>
          <div style={{ border: '1px solid #ddd', borderRadius: '4px' }}>
            {leaderboard.map((entry, index) => (
              <div 
                key={entry.name}
                style={{ 
                  padding: '10px', 
                  borderBottom: index < leaderboard.length - 1 ? '1px solid #eee' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  backgroundColor: index === 0 ? '#fff9e6' : 'white',
                  color: '#333'
                }}
              >
                <span><strong>#{index + 1}</strong> {entry.name}</span>
                <span><strong>{entry.score}</strong> points</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Games List */}
      <h2>Games</h2>
      {games.length > 0 ? (
        <div>
          {games.map((game, idx) => {
            const status = game.status.type.name.replace(/_/g, ' ');
            const teams = game.competitions[0].competitors;
            const homeTeam = teams.find(t => t.homeAway === 'home');
            const awayTeam = teams.find(t => t.homeAway === 'away');
            
            const homeTeamName = homeTeam.team.displayName;
            const homeTeamScore = homeTeam.score;
            const awayTeamName = awayTeam.team.displayName;
            const awayTeamScore = awayTeam.score;
            
            const isComplete = game.status.type.state === 'post';
            const homeWon = isComplete && parseInt(homeTeamScore) > parseInt(awayTeamScore);
            const awayWon = isComplete && parseInt(awayTeamScore) > parseInt(homeTeamScore);

            return (
              <div 
                key={game.id}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  padding: '10px',
                  border: '1px solid #ddd',
                  marginBottom: '5px',
                  borderRadius: '4px',
                  backgroundColor: isComplete ? '#f0f8ff' : 'white'
                }}
              >
                <div style={{ width: '100px' }}>{status}</div>
                <div style={{ 
                  flex: 1, 
                  fontWeight: homeWon ? 'bold' : 'normal',
                  color: homeWon ? 'green' : 'black'
                }}>
                  {homeTeamName} - {homeTeamScore}
                </div>
                <div style={{ 
                  flex: 1, 
                  fontWeight: awayWon ? 'bold' : 'normal',
                  color: awayWon ? 'green' : 'black'
                }}>
                  {awayTeamName} - {awayTeamScore}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p>Loading games...</p>
      )}

      {/* Debug: Pool Data */}
      {poolData && (
        <div style={{ marginTop: '30px' }}>
          <h3>Pool Data (Debug)</h3>
          <details>
            <summary>Click to view raw pool data</summary>
            <pre style={{ 
              backgroundColor: '#f5f5f5', 
              padding: '10px', 
              overflow: 'auto',
              fontSize: '12px'
            }}>
              {JSON.stringify(poolData, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
};

export default ScoreBoard;
