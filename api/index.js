'use strict';
const express = require('express');
const cors = require('cors');
const compression = require('compression');

// Use production DB URL from Vercel env, fallback to local
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://daleraaen@localhost:5432/openfirehouse',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function query(sql, params) {
  return pool.query(sql, params);
}

// ── Build Express app ───────────────────────────────────────────
const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── Inline route setup (avoids require path issues on Vercel) ───

// Plants routes
const plantsRouter = express.Router();
// GET /api/plants - list plants with filters
plantsRouter.get('/', async (req, res) => {
  try {
    const { q, zone, type, water, region } = req.query;
    let sql = 'SELECT * FROM ola_plant_palette WHERE 1=1';
    const params = [];
    let paramNum = 1;
    if (q) {
      sql += ` AND (LOWER(botanical_name) LIKE $${paramNum} OR LOWER(common_name) LIKE $${paramNum})`;
      params.push(`%${q.toLowerCase()}%`);
      paramNum++;
    }
    if (zone) {
      sql += ` AND hardiness_zone LIKE $${paramNum}`;
      params.push(`%${zone}%`);
      paramNum++;
    }
    if (type) {
      sql += ` AND plant_type = $${paramNum}`;
      params.push(type);
      paramNum++;
    }
    if (water) {
      sql += ` AND water_needs = $${paramNum}`;
      params.push(water);
      paramNum++;
    }
    if (region) {
      sql += ` AND region LIKE $${paramNum}`;
      params.push(`%${region}%`);      paramNum++;
    }
    sql += ' ORDER BY common_name LIMIT 1000';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/plants/stats/counts
plantsRouter.get('/stats/counts', async (req, res) => {
  try {
    const typeResult = await query('SELECT plant_type, COUNT(*) as count FROM ola_plant_palette GROUP BY plant_type ORDER BY count DESC');
    const zoneResult = await query('SELECT hardiness_zone, COUNT(*) as count FROM ola_plant_palette GROUP BY hardiness_zone ORDER BY hardiness_zone');
    const regionResult = await query('SELECT region, COUNT(*) as count FROM ola_plant_palette WHERE region IS NOT NULL GROUP BY region');
    const totalResult = await query('SELECT COUNT(*) FROM ola_plant_palette');
    res.json({
      total: parseInt(totalResult.rows[0].count),
      byType: typeResult.rows,
      byZone: zoneResult.rows,
      byRegion: regionResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// GET /api/plants/zones/all
plantsRouter.get('/zones/all', async (req, res) => {
  try {
    const result = await query('SELECT DISTINCT hardiness_zone FROM ola_plant_palette WHERE hardiness_zone IS NOT NULL ORDER BY hardiness_zone');
    res.json(result.rows.map(r => r.hardiness_zone));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/plants/types/all
plantsRouter.get('/types/all', async (req, res) => {
  try {
    const result = await query('SELECT DISTINCT plant_type FROM ola_plant_palette WHERE plant_type IS NOT NULL ORDER BY plant_type');
    res.json(result.rows.map(r => r.plant_type));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/plants/recommendations/search
plantsRouter.get('/recommendations/search', async (req, res) => {
  try {
    const { zone, sun, water } = req.query;
    let sql = 'SELECT * FROM ola_plant_palette WHERE 1=1';
    const params = [];
    let paramNum = 1;
    if (zone) { sql += ` AND hardiness_zone LIKE $${paramNum}`; params.push(`%${zone}%`); paramNum++; }    if (sun) { sql += ` AND sun_requirement LIKE $${paramNum}`; params.push(`%${sun}%`); paramNum++; }
    if (water) { sql += ` AND water_needs = $${paramNum}`; params.push(water); paramNum++; }
    sql += ' ORDER BY common_name LIMIT 500';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/plants/:id - single plant detail (MUST be after /stats, /zones, /types, /recommendations)
plantsRouter.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM ola_plant_palette WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Plant not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use('/api/plants', plantsRouter);

// Lists routes
const listsRouter = express.Router();

listsRouter.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT l.*, COUNT(li.id)::int as item_count
      FROM ola_plant_lists l
      LEFT JOIN ola_plant_list_items li ON l.id = li.list_id
      GROUP BY l.id ORDER BY l.updated_at DESC
    `);
    res.json(result.rows);  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

listsRouter.get('/:id', async (req, res) => {
  try {
    const listResult = await query('SELECT * FROM ola_plant_lists WHERE id = $1', [req.params.id]);
    if (listResult.rows.length === 0) return res.status(404).json({ error: 'List not found' });
    const itemsResult = await query(`
      SELECT li.*, p.botanical_name, p.common_name, p.plant_type, p.hardiness_zone, p.water_needs, p.sun_requirement, p.image_url
      FROM ola_plant_list_items li JOIN ola_plant_palette p ON li.plant_id = p.id
      WHERE li.list_id = $1 ORDER BY li.sort_order, li.id
    `, [req.params.id]);
    res.json({ ...listResult.rows[0], items: itemsResult.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

listsRouter.post('/', async (req, res) => {
  try {
    const { name, description, project_name, client_name, zone } = req.body;
    if (!name) return res.status(400).json({ error: 'List name is required' });
    const result = await query(
      `INSERT INTO ola_plant_lists (name, description, project_name, client_name, zone) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, description || null, project_name || null, client_name || null, zone || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
listsRouter.put('/:id', async (req, res) => {
  try {
    const { name, description, project_name, client_name, zone } = req.body;
    const result = await query(
      `UPDATE ola_plant_lists SET name=COALESCE($1,name), description=COALESCE($2,description), project_name=COALESCE($3,project_name), client_name=COALESCE($4,client_name), zone=COALESCE($5,zone), updated_at=NOW() WHERE id=$6 RETURNING *`,
      [name, description, project_name, client_name, zone, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'List not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

listsRouter.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM ola_plant_lists WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'List not found' });
    res.json({ message: 'List deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

listsRouter.post('/:id/items', async (req, res) => {
  try {
    const { plant_id, quantity, size, spacing, notes } = req.body;
    if (!plant_id) return res.status(400).json({ error: 'plant_id is required' });
    const maxResult = await query('SELECT COALESCE(MAX(sort_order),0)+1 as next FROM ola_plant_list_items WHERE list_id=$1', [req.params.id]);
    const result = await query(
      `INSERT INTO ola_plant_list_items (list_id, plant_id, quantity, size, spacing, notes, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, plant_id, quantity || 1, size || null, spacing || null, notes || null, maxResult.rows[0].next]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
listsRouter.put('/:listId/items/:itemId', async (req, res) => {
  try {
    const { quantity, size, spacing, notes } = req.body;
    const result = await query(
      `UPDATE ola_plant_list_items SET quantity=COALESCE($1,quantity), size=COALESCE($2,size), spacing=COALESCE($3,spacing), notes=COALESCE($4,notes) WHERE id=$5 AND list_id=$6 RETURNING *`,
      [quantity, size, spacing, notes, req.params.itemId, req.params.listId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

listsRouter.delete('/:listId/items/:itemId', async (req, res) => {
  try {
    const result = await query('DELETE FROM ola_plant_list_items WHERE id=$1 AND list_id=$2 RETURNING *', [req.params.itemId, req.params.listId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ message: 'Item removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use('/api/lists', listsRouter);

// ── Import route (file upload + plant matching) ─────────────────
const multer = require('multer');
const XLSX = require('xlsx');
const csvParse = require('csv-parse/sync');
const mammoth = require('mammoth');
// pdf-parse v2 uses PDFParse class
const { PDFParse } = require('pdf-parse');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function extractFromExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    for (const row of data) {
      if (row.some(cell => String(cell).trim())) rows.push(row.map(c => String(c).trim()));
    }
  }
  return rows;
}

function extractFromCSV(buffer) {
  const text = buffer.toString('utf-8');
  const delimiter = (text.split('\n')[0] || '').includes('\t') ? '\t' : ',';
  return csvParse.parse(text, { delimiter, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, quote: false })
    .map(row => row.map(c => String(c).trim()));
}

async function extractFromWord(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value.split(/\n/).map(l => l.trim()).filter(Boolean)
    .map(line => line.split(/\t|\|/).map(s => s.trim()).filter(Boolean));
}

async function extractFromPDF(buffer) {
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  return data.text.split(/\n/).map(l => l.trim()).filter(Boolean)
    .map(line => line.split(/\t|\|/).map(s => s.trim()).filter(Boolean));
}
function detectColumns(rows) {
  if (!rows.length) return { headerRow: -1, columns: {} };
  const headerKeywords = {
    botanical: ['botanical','botanic','latin','species','scientific'],
    common: ['common','plant','name','variety','cultivar'],
    quantity: ['qty','quantity','count','number','#','no.','num'],
    size: ['size','container','pot','cal','caliper','gallon','gal'],
    spacing: ['spacing','space','o.c.','on center','spread'],
    notes: ['notes','note','remarks','comment','description'],
  };
  const columns = {};
  let headerRow = -1;
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const row = rows[i].map(c => c.toLowerCase());
    const tempCols = {};
    let matches = 0;
    for (let j = 0; j < row.length; j++) {
      for (const [field, kws] of Object.entries(headerKeywords)) {
        if (kws.some(k => row[j].includes(k)) && !tempCols[field]) { tempCols[field] = j; matches++; break; }
      }
    }
    if (matches >= 1) { headerRow = i; Object.assign(columns, tempCols); break; }
  }
  if (headerRow === -1) {
    const sampleCells = rows.slice(0,5).map(r => r[0]||'');
    if (sampleCells.filter(c => /^[A-Z][a-z]+ [a-z]/.test(c)).length >= 2) {
      columns.botanical = 0;
      if (rows[0].length > 1) columns.common = 1;
    } else {
      columns.common = 0;
    }
  }
  return { headerRow, columns };
}
async function matchPlants(extractedItems) {
  const { rows: allPlants } = await query('SELECT id, botanical_name, common_name, plant_type FROM ola_plant_palette');
  const results = [];
  for (const item of extractedItems) {
    const name = (item.name || '').trim();
    if (!name) continue;
    const nl = name.toLowerCase().replace(/['']/g,"'");
    let bestMatch = null, bestScore = 0, matchType = 'none';
    for (const plant of allPlants) {
      const bl = plant.botanical_name.toLowerCase(), cl = plant.common_name.toLowerCase();
      if (nl === bl || nl === cl) { bestMatch = plant; bestScore = 100; matchType = nl===bl?'botanical_exact':'common_exact'; break; }
      if (nl.includes(bl)||bl.includes(nl)) { if (85>bestScore) { bestMatch=plant; bestScore=85; matchType='botanical_partial'; } }
      if (nl.includes(cl)||cl.includes(nl)) { if (80>bestScore) { bestMatch=plant; bestScore=80; matchType='common_partial'; } }
      const nw=nl.split(/\s+/), bw=bl.split(/\s+/), cw=cl.split(/\s+/);
      const bo=nw.filter(w=>bw.includes(w)).length, co=nw.filter(w=>cw.includes(w)).length;
      if (bo>0) { const s=Math.round((bo/Math.max(nw.length,bw.length))*70); if (s>bestScore) { bestMatch=plant; bestScore=s; matchType='botanical_fuzzy'; } }
      if (co>0) { const s=Math.round((co/Math.max(nw.length,cw.length))*65); if (s>bestScore) { bestMatch=plant; bestScore=s; matchType='common_fuzzy'; } }
    }
    results.push({
      original_name: name, quantity: item.quantity||1, size: item.size||null, spacing: item.spacing||null, notes: item.notes||null,
      matched: bestScore >= 40, match_score: bestScore, match_type: matchType,
      plant: bestMatch ? { id: bestMatch.id, botanical_name: bestMatch.botanical_name, common_name: bestMatch.common_name, plant_type: bestMatch.plant_type } : null,
    });
  }
  return results;
}
app.post('/api/import/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { originalname, buffer } = req.file;
    const ext = originalname.split('.').pop().toLowerCase();
    let rows;
    if (['xlsx','xls'].includes(ext)) rows = extractFromExcel(buffer);
    else if (['csv','tsv'].includes(ext)) rows = extractFromCSV(buffer);
    else if (ext === 'docx') rows = await extractFromWord(buffer);
    else if (ext === 'pdf') rows = await extractFromPDF(buffer);
    else return res.status(400).json({ error: `Unsupported: .${ext}` });
    if (!rows?.length) return res.status(400).json({ error: 'No data found in file' });
    const { headerRow, columns } = detectColumns(rows);
    const dataRows = headerRow >= 0 ? rows.slice(headerRow + 1) : rows;
    const extractedItems = [];
    const skip = /^(total|subtotal|page|date|project|client|prepared|note:|spec|section)/i;
    for (const row of dataRows) {
      let name = '';
      if (columns.botanical !== undefined) name = row[columns.botanical] || '';
      if (!name && columns.common !== undefined) name = row[columns.common] || '';
      if (!name) name = row.find(c => c && c.length > 2) || '';
      if (!name || name.length < 2 || skip.test(name)) continue;
      extractedItems.push({
        name, quantity: columns.quantity !== undefined ? parseInt(row[columns.quantity]) || 1 : 1,
        size: columns.size !== undefined ? row[columns.size] || null : null,
        spacing: columns.spacing !== undefined ? row[columns.spacing] || null : null,
        notes: columns.notes !== undefined ? row[columns.notes] || null : null,
      });
    }
    if (!extractedItems.length) return res.status(400).json({ error: 'Could not identify plant names', raw_rows: rows.slice(0,5) });
    const matched = await matchPlants(extractedItems);
    res.json({
      filename: originalname, total_rows: rows.length, items: matched,
      summary: { total_extracted: matched.length, matched: matched.filter(m=>m.matched).length, unmatched: matched.filter(m=>!m.matched).length, columns_detected: columns, header_row: headerRow },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Migrate endpoint (creates tables + seeds) ──────────────────
const { plants: seedPlants } = require('./seed-data');

app.post('/api/migrate', async (req, res) => {
  try {
    // Create plant palette table
    await query(`
      CREATE TABLE IF NOT EXISTS ola_plant_palette (
        id SERIAL PRIMARY KEY,
        botanical_name TEXT NOT NULL,
        common_name TEXT NOT NULL,
        plant_type TEXT,
        hardiness_zone TEXT,
        water_needs TEXT,
        mature_height TEXT,
        mature_width TEXT,
        sun_requirement TEXT,
        bloom_color TEXT,
        season TEXT,
        region TEXT,
        native_range TEXT,
        description TEXT,
        image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Add columns if they don't exist
    await query(`
      ALTER TABLE ola_plant_palette 
      ADD COLUMN IF NOT EXISTS region TEXT,
      ADD COLUMN IF NOT EXISTS native_range TEXT
    `);
    // Create plant lists table
    await query(`
      CREATE TABLE IF NOT EXISTS ola_plant_lists (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        project_name TEXT,
        client_name TEXT,
        zone TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create plant list items table
    await query(`
      CREATE TABLE IF NOT EXISTS ola_plant_list_items (
        id SERIAL PRIMARY KEY,
        list_id INTEGER REFERENCES ola_plant_lists(id) ON DELETE CASCADE,
        plant_id INTEGER REFERENCES ola_plant_palette(id),
        quantity INTEGER DEFAULT 1,
        size TEXT,
        spacing TEXT,
        notes TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed plants if needed
    const countResult = await query('SELECT COUNT(*) FROM ola_plant_palette');
    const count = parseInt(countResult.rows[0].count, 10);
    let seeded = 0;

    if (count < 50) {
      for (const plant of seedPlants) {
        await query(
          `INSERT INTO ola_plant_palette (botanical_name, common_name, plant_type, hardiness_zone, water_needs, mature_height, mature_width, sun_requirement, bloom_color, season, region, native_range, description, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT DO NOTHING`,
          [plant.botanical_name, plant.common_name, plant.plant_type, plant.hardiness_zone, plant.water_needs, plant.mature_height, plant.mature_width, plant.sun_requirement, plant.bloom_color, plant.season, plant.region, plant.native_range, plant.description, plant.image_url || null]
        );
      }
      const newCount = await query('SELECT COUNT(*) FROM ola_plant_palette');
      seeded = parseInt(newCount.rows[0].count, 10);
    }

    res.json({ 
      success: true, 
      message: 'Migration complete',
      plants_before: count,
      plants_after: seeded || count,
      tables: ['ola_plant_palette', 'ola_plant_lists', 'ola_plant_list_items']
    });
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});
// Also support GET for easy browser trigger
app.get('/api/migrate', async (req, res) => {
  // Redirect to POST handler logic
  try {
    await query(`CREATE TABLE IF NOT EXISTS ola_plant_palette (
      id SERIAL PRIMARY KEY, botanical_name TEXT NOT NULL, common_name TEXT NOT NULL,
      plant_type TEXT, hardiness_zone TEXT, water_needs TEXT, mature_height TEXT, mature_width TEXT,
      sun_requirement TEXT, bloom_color TEXT, season TEXT, region TEXT, native_range TEXT,
      description TEXT, image_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`ALTER TABLE ola_plant_palette ADD COLUMN IF NOT EXISTS region TEXT, ADD COLUMN IF NOT EXISTS native_range TEXT`);
    await query(`ALTER TABLE ola_plant_palette ADD COLUMN IF NOT EXISTS image_url TEXT`);
    // Update existing plants with image URLs from seed data
    for (const plant of seedPlants) {
      if (plant.image_url) {
        await query(
          `UPDATE ola_plant_palette SET image_url = $1 WHERE botanical_name = $2 AND (image_url IS NULL OR image_url = '')`,
          [plant.image_url, plant.botanical_name]
        );
      }
    }
    await query(`CREATE TABLE IF NOT EXISTS ola_plant_lists (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, project_name TEXT,
      client_name TEXT, zone TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS ola_plant_list_items (
      id SERIAL PRIMARY KEY, list_id INTEGER REFERENCES ola_plant_lists(id) ON DELETE CASCADE,
      plant_id INTEGER REFERENCES ola_plant_palette(id), quantity INTEGER DEFAULT 1, size TEXT,
      spacing TEXT, notes TEXT, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    const countResult = await query('SELECT COUNT(*) FROM ola_plant_palette');
    const count = parseInt(countResult.rows[0].count, 10);
    let seeded = 0;
    if (count < 50) {
      for (const plant of seedPlants) {
        await query(
          `INSERT INTO ola_plant_palette (botanical_name, common_name, plant_type, hardiness_zone, water_needs, mature_height, mature_width, sun_requirement, bloom_color, season, region, native_range, description, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT DO NOTHING`,
          [plant.botanical_name, plant.common_name, plant.plant_type, plant.hardiness_zone, plant.water_needs, plant.mature_height, plant.mature_width, plant.sun_requirement, plant.bloom_color, plant.season, plant.region, plant.native_range, plant.description, plant.image_url || null]
        );
      }
      const newCount = await query('SELECT COUNT(*) FROM ola_plant_palette');
      seeded = parseInt(newCount.rows[0].count, 10);
    }
    res.json({ success: true, message: 'Migration complete', plants_before: count, plants_after: seeded || count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;