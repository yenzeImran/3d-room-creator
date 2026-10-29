/* ===================================================================
   PROMPT-TO-SCHOOL — deterministic keyword-based layout generator
   Replace promptToLayout() with an API call to a real LLM later.
   =================================================================== */

function promptToLayout(prompt) {
  const p = (prompt || '').toLowerCase();

  const extractCount = (word, def) => {
    const m = p.match(new RegExp('(\\d+)\\s*' + word));
    return m ? parseInt(m[1]) : def;
  };

  const counts = {
    classroom: extractCount('(classroom|class|room)s?', 3),
    gym: /gym/.test(p) ? 1 : 0,
    library: /library/.test(p) ? 1 : 0,
    cafeteria: /cafeteria|dining|lunch/.test(p) ? 1 : 0,
    office: /office|admin/.test(p) ? 1 : 0,
    bathroom: /bathroom|restroom|toilet/.test(p) ? 1 : 0,
    entrance: 1
  };

  const pool = ['entrance'];
  for (let i = 0; i < counts.classroom; i++) pool.push('classroom');
  if (counts.library) pool.push('library');
  if (counts.gym) pool.push('gym');
  if (counts.cafeteria) pool.push('cafeteria');
  if (counts.office) pool.push('office');
  if (counts.bathroom) pool.push('bathroom');

  const cols = Math.max(3, Math.ceil(Math.sqrt(pool.length + 3)));
  const rows = Math.max(3, Math.ceil((pool.length + cols) / cols));
  const grid = [];
  for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill('.'));

  const midRow = Math.floor(rows / 2);
  for (let c = 0; c < cols; c++) grid[midRow][c] = 'hallway';

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === '.') {
        if (idx < pool.length) grid[r][c] = pool[idx++];
        else if (Math.random() > 0.25) grid[r][c] = 'classroom';
      }
    }
  }

  const nameMatch = p.match(/([a-z]+\s+(?:primary|secondary|middle|high|elementary|academy|school))/i);
  const name = nameMatch
    ? nameMatch[1].split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
    : 'Generated School';

  return {
    name,
    cell: { w: 12, h: 7, d: 12 },
    grid
  };
}

function generateSchoolFromPrompt() {
  const prompt = document.getElementById('aiPrompt')?.value;
  if (!prompt) { showStatus('Enter a prompt first', 'error'); return; }
  showLoading(true, '🤖 Generating school…');
  setTimeout(() => {
    try {
      const layout = promptToLayout(prompt);
      buildSchoolFromLayout(layout);
      showLoading(false);
      showStatus('School generated: ' + layout.name, 'success');
    } catch (e) {
      showLoading(false);
      showStatus('Error: ' + e.message, 'error');
    }
  }, 100);
}