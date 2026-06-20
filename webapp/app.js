const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 5432,
});

// ✅ RESILIENT STARTUP LOOP: Blocks web traffic until DB is ready and seeded
async function initializeApplication(retries = 10, delay = 3000) {
  while (retries > 0) {
    try {
      console.log(`🔄 Attempting to connect to database... (${retries} attempts remaining)`);
      
      // Test actual network query execution
      await pool.query('SELECT 1'); 
      
      // Seed missing tables automatically with zero data loss
      await pool.query(`
        CREATE TABLE IF NOT EXISTS internal_tickets (
          id SERIAL PRIMARY KEY,
          title VARCHAR(150) NOT NULL,
          reporter VARCHAR(100) NOT NULL,
          department VARCHAR(100) NOT NULL,
          assignee VARCHAR(100),
          category VARCHAR(50) NOT NULL,
          priority VARCHAR(20) NOT NULL,
          status VARCHAR(20) DEFAULT 'Pending',
          description TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      console.log('✅ PostgreSQL Connection Verified & Table Initialized Successfully.');
      
      // Start listening for traffic ONLY after DB initialization succeeds
      app.listen(port, () => {
        console.log(`🚀 Backend Engine actively listening on port ${port}`);
      });
      return; 

    } catch (err) {
      console.error(`⚠️ Database not ready yet: ${err.message}`);
      retries -= 1;
      if (retries === 0) {
        console.error('❌ Could not connect to the database. Exiting application process.');
        process.exit(1); 
      }
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

initializeApplication();

async function renderPage(res) {
  try {
    const dbResult = await pool.query('SELECT * FROM internal_tickets ORDER BY created_at DESC');
    const templatePath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    let entriesHtml = '';
    if (dbResult.rows.length === 0) {
      entriesHtml = '<div class="no-records">No active team tickets found. All caught up!</div>';
    } else {
      dbResult.rows.forEach(row => {
        const pClass = `badge-${row.priority.toLowerCase()}`;
        const sClass = `status-${row.status.toLowerCase().replace(' ', '-')}`;
        
        const selectPending = row.status === 'Pending' ? 'selected' : '';
        const selectProgress = row.status === 'In Progress' ? 'selected' : '';
        const selectClosed = row.status === 'Closed' ? 'selected' : '';

        const personnelDisplay = row.assignee && row.assignee.trim() !== '' 
          ? `➔ Assigned to: <strong>${row.assignee}</strong>` 
          : '➔ <em>Unassigned</em>';

        entriesHtml += `
          <div class="msg-card">
            <div class="msg-header">
              <div>
                <span class="msg-email">#${row.id}: ${row.title}</span>
                <span class="msg-meta">By: ${row.reporter} &bull; Scope: ${row.category}</span>
                <span class="msg-assignment">Dept: <strong>${row.department}</strong> ${personnelDisplay}</span>
              </div>
              <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
                <span class="badge ${pClass}">${row.priority}</span>
                <span class="badge ${sClass}">${row.status}</span>
              </div>
            </div>
            <p class="msg-body">${row.description}</p>
            <div class="msg-footer">
              <span class="msg-date">Opened: ${row.created_at.toLocaleString()}</span>
              <div class="action-tray">
                <form action="/update-status" method="POST" class="inline-form">
                  <input type="hidden" name="id" value="${row.id}">
                  <select name="status" onchange="this.form.submit()" class="status-select-inline">
                    <option value="Pending" ${selectPending}>Pending</option>
                    <option value="In Progress" ${selectProgress}>In Progress</option>
                    <option value="Closed" ${selectClosed}>Closed</option>
                  </select>
                </form>
                <form action="/delete" method="POST" onsubmit="return confirm('Permanently delete ticket #${row.id}?');" class="inline-form">
                  <input type="hidden" name="id" value="${row.id}">
                  <button type="submit" class="delete-btn">Delete</button>
                </form>
              </div>
            </div>
          </div>`;
      });
    }

    html = html.replace('__MESSAGES_PLACEHOLDER__', entriesHtml);
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Dashboard Server Error.');
  }
}

app.get('/', async (req, res) => {
  await renderPage(res);
});

app.post('/submit', async (req, res) => {
  const { title, reporter, department, assignee, category, priority, description } = req.body;
  try {
    await pool.query(
      'INSERT INTO internal_tickets (title, reporter, department, assignee, category, priority, description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [title, reporter, department, assignee || null, category, priority, description]
    );
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Database storage write failure.');
  }
});

app.post('/update-status', async (req, res) => {
  const { id, status } = req.body;
  try {
    await pool.query('UPDATE internal_tickets SET status = $1 WHERE id = $2', [status, id]);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Database tracking status update error.');
  }
});

app.post('/delete', async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM internal_tickets WHERE id = $1', [id]);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Database deletion processing error.');
  }
});
