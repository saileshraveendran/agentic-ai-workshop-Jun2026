/**
 * ShopEasy Data Analyst Agent - Core Logic (app.js)
 */

// Global App State
const state = {
  apiKey: localStorage.getItem('shopeasy_gemini_api_key') || '',
  csvUrl: '',
  rawData: [],
  schema: {},
  metadata: {
    rowCount: 0,
    columnNames: [],
    dateRange: { start: '', end: '' }
  },
  sampleRows: [],
  questions: [
    "How is revenue trending week over week this month — are we growing or slipping?",
    "Which product categories are driving the most revenue and which are underperforming?",
    "Which cities are our strongest markets by order volume and revenue?",
    "What percentage of orders are successfully delivered versus cancelled or returned?",
    "What is the average delivery time and are certain categories or cities taking significantly longer?"
  ],
  configs: [], // array of recommended/approved chart configs
  kpis: {
    totalRevenue: 0,
    totalOrders: 0,
    avgDeliveryDays: 0
  },
  currentStep: 1, // Step 1: Ingestion, Step 2: Questions, Step 3: Recommendations, Step 4 & 5: Dashboard
  pipelineStatus: 'idle', // 'ingesting', 'charting', 'executing', 'insights', 'complete', 'failed'
  agentStates: {
    ingest: 'waiting',     // waiting, running, complete, failed
    planner: 'waiting',
    executor: 'waiting',
    insights: 'waiting'
  },
  logs: []
};

// Logging System
const logger = {
  log(agent, message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logObj = { timestamp, agent, message, type };
    state.logs.push(logObj);
    
    // Add to terminal DOM if available
    const consoleOutput = document.getElementById('terminal-output');
    if (consoleOutput) {
      const line = document.createElement('div');
      line.className = `terminal-line ${type}`;
      line.innerHTML = `<span class="log-time">[${timestamp}]</span> <span class="log-agent">[${agent}]</span> ${message}`;
      consoleOutput.appendChild(line);
      consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
    console.log(`[${timestamp}] [${agent}] (${type}): ${message}`);
  },
  clear() {
    state.logs = [];
    const consoleOutput = document.getElementById('terminal-output');
    if (consoleOutput) {
      consoleOutput.innerHTML = '';
    }
  }
};

// Safe CSV Parser Module
const CSVParser = {
  parse(text) {
    const lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];

      if (c === '"') {
        if (inQuotes && next === '"') {
          row[row.length - 1] += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push("");
      } else if ((c === '\r' || c === '\n') && !inQuotes) {
        if (c === '\r' && next === '\n') {
          i++;
        }
        lines.push(row);
        row = [""];
      } else {
        row[row.length - 1] += c;
      }
    }
    if (row.length > 1 || row[0] !== "") {
      lines.push(row);
    }
    
    if (lines.length === 0) return [];

    // Parse into objects
    const headers = lines[0].map(h => h.trim());
    const objects = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length !== headers.length) {
        // Skip malformed rows or trailing blank lines
        continue;
      }
      const obj = {};
      let isRowEmpty = true;
      for (let j = 0; j < headers.length; j++) {
        const val = line[j].trim();
        obj[headers[j]] = val;
        if (val !== "") isRowEmpty = false;
      }
      if (!isRowEmpty) {
        objects.push(obj);
      }
    }
    return { headers, rows: objects };
  }
};

// Date Parsing Helper (DD-MM-YYYY format only)
function parseDateDDMMYYYY(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed month
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day);
}

// Format Date to DD-MM-YYYY
function formatDateDDMMYYYY(date) {
  if (!date || isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

// 1. DATA INGEST AGENT
class DataIngestAgent {
  constructor() {
    this.name = "DataIngestAgent";
  }

  async run(csvUrl) {
    logger.log(this.name, `Initiating data ingestion from: ${csvUrl}`, 'info');
    updateAgentStatus('ingest', 'running');
    
    try {
      // Fetch data
      const response = await fetch(csvUrl);
      if (!response.ok) throw new Error(`HTTP network error: ${response.statusText}`);
      
      const csvText = await response.text();
      logger.log(this.name, `Successfully fetched raw CSV file (${Math.round(csvText.length / 1024)} KB)`, 'success');
      
      // Parse CSV
      const { headers, rows } = CSVParser.parse(csvText);
      if (!rows || rows.length === 0) throw new Error("Parsed dataset is empty.");
      
      logger.log(this.name, `Parsed ${rows.length} rows and ${headers.length} columns.`, 'info');
      
      // Detect schema and compute metadata
      const schema = this.detectSchema(headers, rows);
      const metadata = this.computeMetadata(headers, rows, schema);
      const sampleRows = rows.slice(0, 3);
      
      // Update global state
      state.rawData = rows;
      state.schema = schema;
      state.metadata = metadata;
      state.sampleRows = sampleRows;
      state.csvUrl = csvUrl;
      
      updateAgentStatus('ingest', 'complete');
      logger.log(this.name, `Ingestion completed successfully. Schema finalized.`, 'success');
      return true;
    } catch (err) {
      logger.log(this.name, `Ingestion failed: ${err.message}`, 'error');
      updateAgentStatus('ingest', 'failed');
      throw err;
    }
  }

  detectSchema(headers, rows) {
    const schema = {};
    const sampleSize = Math.min(100, rows.length);
    const dateRegex = /^\d{1,2}-\d{1,2}-\d{4}$/;
    
    headers.forEach(col => {
      let dateCount = 0;
      let numCount = 0;
      let nonSpaceCount = 0;
      const uniqueVals = new Set();
      
      for (let i = 0; i < sampleSize; i++) {
        const val = rows[i][col];
        if (val === undefined || val === null || val === '') continue;
        
        nonSpaceCount++;
        uniqueVals.add(val);
        
        // Date test
        if (dateRegex.test(val)) {
          dateCount++;
        }
        
        // Number test
        const cleaned = val.replace(/[\$,%]/g, '').trim();
        if (cleaned !== '' && !isNaN(Number(cleaned))) {
          numCount++;
        }
      }
      
      // Type assignment
      if (nonSpaceCount === 0) {
        schema[col] = 'text';
      } else if (dateCount / nonSpaceCount > 0.8) {
        schema[col] = 'date';
      } else if (numCount / nonSpaceCount > 0.8) {
        schema[col] = 'number';
      } else if (uniqueVals.size <= 15 || (uniqueVals.size / nonSpaceCount) < 0.2) {
        schema[col] = 'category';
      } else {
        schema[col] = 'text';
      }
      
      logger.log(this.name, `Detected column [${col}] as type: ${schema[col]} (Sample matches: Date=${dateCount}, Num=${numCount}, Uniques=${uniqueVals.size})`, 'info');
    });
    
    return schema;
  }

  computeMetadata(headers, rows, schema) {
    const metadata = {
      rowCount: rows.length,
      columnNames: headers,
      dateRange: { start: '', end: '' }
    };
    
    // Find date range
    const dateCols = headers.filter(col => schema[col] === 'date');
    if (dateCols.length > 0) {
      // Use the first detected date column
      const targetCol = dateCols[0];
      let minDate = null;
      let maxDate = null;
      
      rows.forEach(row => {
        const parsed = parseDateDDMMYYYY(row[targetCol]);
        if (parsed) {
          if (!minDate || parsed < minDate) minDate = parsed;
          if (!maxDate || parsed > maxDate) maxDate = parsed;
        }
      });
      
      if (minDate && maxDate) {
        metadata.dateRange.start = formatDateDDMMYYYY(minDate);
        metadata.dateRange.end = formatDateDDMMYYYY(maxDate);
        logger.log(this.name, `Computed date range using column [${targetCol}]: ${metadata.dateRange.start} to ${metadata.dateRange.end}`, 'info');
      }
    }
    return metadata;
  }
}

// 2. CHART PLANNER AGENT
class ChartPlannerAgent {
  constructor() {
    this.name = "ChartPlannerAgent";
  }

  async run(questions) {
    logger.log(this.name, `Planning visualization cards for ${questions.length} business questions`, 'info');
    updateAgentStatus('planner', 'running');
    
    if (!state.apiKey) {
      const err = new Error("Gemini API Key is missing. Please set it in the configuration settings.");
      logger.log(this.name, err.message, 'error');
      updateAgentStatus('planner', 'failed');
      throw err;
    }
    
    try {
      const payload = {
        schema: state.schema,
        questions: questions
      };
      
      const systemPrompt = `You are a senior data analyst and visual architect. Your task is to recommend the best chart type and column mapping to answer a user's business question based on a given dataset schema.

Analyze the schema mapping:
- A column is mapped to a name and data type: 'date', 'number', 'category', 'text'.
- Identify date columns (format DD-MM-YYYY), numerical metrics (revenue, quantity, delivery days, prices), and categorical dimensions (cities, product categories, status).

For each user question, recommend:
1. Chart Type: Must be one of ['bar', 'line', 'donut', 'scatter', 'pie'].
2. xAxisColumn: The column to plot on the X-axis.
3. yAxisColumn: The column to plot on the Y-axis. (Should be a 'number' type for sum/average, or empty if counting occurrences).
4. reasoning: A concise, one-sentence business justification for this recommendation.

Return ONLY a JSON array of recommendations, corresponding 1-to-1 with the questions list.
JSON Schema:
[
  {
    "question": "string",
    "chartType": "bar" | "line" | "donut" | "scatter" | "pie",
    "xAxisColumn": "string",
    "yAxisColumn": "string",
    "reasoning": "string"
  }
]
Do not include markdown tags like \`\`\`json or any other text before or after the JSON.`;

      logger.log(this.name, "Sending request to Gemini 2.5 Flash...", 'info');
      const responseText = await GeminiAPI.generate(systemPrompt, JSON.stringify(payload), true);
      
      let recommendations;
      try {
        recommendations = JSON.parse(responseText.trim());
      } catch (parseErr) {
        // Fallback: strip potential markdown codeblock formatting if Gemini included it
        const cleanedText = responseText.replace(/```json|```/g, '').trim();
        recommendations = JSON.parse(cleanedText);
      }
      
      if (!Array.isArray(recommendations)) {
        throw new Error("API response did not return a valid array of recommendations.");
      }
      
      state.configs = recommendations.map(rec => ({
        question: rec.question,
        chartType: rec.chartType || 'bar',
        xAxisColumn: rec.xAxisColumn || state.metadata.columnNames[0],
        yAxisColumn: rec.yAxisColumn || '',
        reasoning: rec.reasoning || 'Default recommended layout.'
      }));
      
      updateAgentStatus('planner', 'complete');
      logger.log(this.name, `Created ${state.configs.length} chart recommendations. Ready for configuration approval.`, 'success');
      return true;
    } catch (err) {
      logger.log(this.name, `Planning failed: ${err.message}`, 'error');
      updateAgentStatus('planner', 'failed');
      throw err;
    }
  }
}

// 3. DATA EXECUTION AGENT
class DataExecutionAgent {
  constructor() {
    this.name = "DataExecutionAgent";
  }

  async run(configs) {
    logger.log(this.name, "Starting calculations and aggregations for dashboard", 'info');
    updateAgentStatus('executor', 'running');
    
    try {
      // 1. Calculate KPIs
      state.kpis = this.calculateKPIs(state.rawData, state.schema);
      logger.log(this.name, `KPIs calculated: Revenue=$${state.kpis.totalRevenue.toLocaleString()}, Orders=${state.kpis.totalOrders}, AvgDelivery=${state.kpis.avgDeliveryDays.toFixed(1)} days`, 'success');
      
      // 2. Perform aggregations for each chart config
      const chartDatasets = [];
      
      configs.forEach((config, idx) => {
        logger.log(this.name, `Aggregating dataset for Chart ${idx+1}: "${config.question}" (Type: ${config.chartType}, X: ${config.xAxisColumn}, Y: ${config.yAxisColumn})`, 'info');
        const aggregated = this.aggregateData(state.rawData, state.schema, config);
        chartDatasets.push({
          question: config.question,
          config: config,
          data: aggregated
        });
      });
      
      updateAgentStatus('executor', 'complete');
      logger.log(this.name, "Execution and aggregation pipeline complete.", 'success');
      return chartDatasets;
    } catch (err) {
      logger.log(this.name, `Execution failed: ${err.message}`, 'error');
      updateAgentStatus('executor', 'failed');
      throw err;
    }
  }

  calculateKPIs(data, schema) {
    const cols = Object.keys(schema);
    
    // Find Revenue column (contains revenue, sales, amount, cost)
    const revCol = cols.find(c => /revenue|sales|amount|price|turnover/i.test(c));
    // Find Order ID column
    const orderCol = cols.find(c => /order\s*id|id/i.test(c)) || cols[0];
    // Find Delivery/Ship Days column
    const delCol = cols.find(c => /delivery|ship/i.test(c) && /days|time/i.test(c));
    // Optional fallback: if we have Order Date and Delivery Date, we can calculate days difference
    const orderDateCol = cols.find(c => /order.*date/i.test(c));
    const delDateCol = cols.find(c => /delivery.*date|ship.*date/i.test(c));

    let totalRevenue = 0;
    const uniqueOrders = new Set();
    let totalDeliveryDays = 0;
    let deliveryDaysCount = 0;

    data.forEach(row => {
      // Calculate Revenue
      if (revCol && row[revCol] !== undefined && row[revCol] !== null) {
        const strVal = String(row[revCol]).replace(/[\$,%]/g, '').trim();
        const val = Number(strVal);
        if (!isNaN(val)) totalRevenue += val;
      }
      
      // Track Orders
      if (row[orderCol]) {
        uniqueOrders.add(row[orderCol]);
      }

      // Calculate Delivery Days
      if (delCol) {
        const val = Number(row[delCol]);
        if (!isNaN(val)) {
          totalDeliveryDays += val;
          deliveryDaysCount++;
        }
      } else if (orderDateCol && delDateCol && row[orderDateCol] && row[delDateCol]) {
        const oDate = parseDateDDMMYYYY(row[orderDateCol]);
        const dDate = parseDateDDMMYYYY(row[delDateCol]);
        if (oDate && dDate) {
          const diffTime = Math.abs(dDate - oDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          totalDeliveryDays += diffDays;
          deliveryDaysCount++;
        }
      }
    });

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders: uniqueOrders.size || data.length,
      avgDeliveryDays: deliveryDaysCount > 0 ? (totalDeliveryDays / deliveryDaysCount) : 0
    };
  }

  aggregateData(data, schema, config) {
    const { xAxisColumn, yAxisColumn, chartType } = config;
    if (!xAxisColumn) return [];

    const isXDate = schema[xAxisColumn] === 'date';
    
    // Grouping structure
    const groups = {};

    data.forEach(row => {
      let xVal = row[xAxisColumn] || 'Unknown';
      
      // If X-axis is a date, group by week or day depending on duration
      if (isXDate && xVal !== 'Unknown') {
        const dateObj = parseDateDDMMYYYY(xVal);
        if (dateObj) {
          // Default: Group by Week (Year-WXX) to prevent too many columns
          const weekNumber = getWeekNumber(dateObj);
          xVal = `Week ${weekNumber}`;
        }
      }

      let yVal = 1;
      if (yAxisColumn && row[yAxisColumn] !== undefined && row[yAxisColumn] !== null) {
        const strVal = String(row[yAxisColumn]).replace(/[\$,%]/g, '').trim();
        const cleaned = Number(strVal);
        if (!isNaN(cleaned)) yVal = cleaned;
      }

      if (!groups[xVal]) {
        groups[xVal] = { sum: 0, count: 0 };
      }
      groups[xVal].sum += yVal;
      groups[xVal].count += 1;
    });

    // Format output
    let result = Object.keys(groups).map(key => {
      // Determine final metric based on Y axis presence
      let finalVal = 0;
      if (yAxisColumn) {
        // Average for delivery days, Sum for revenue/sales
        if (/delivery|time|days/i.test(yAxisColumn)) {
          finalVal = groups[key].sum / groups[key].count;
        } else {
          finalVal = groups[key].sum;
        }
      } else {
        finalVal = groups[key].count; // Count of rows
      }

      return {
        label: key,
        value: Math.round(finalVal * 100) / 100
      };
    });

    // Sorting
    if (isXDate) {
      // Sort week chronologically
      result.sort((a, b) => {
        const numA = parseInt(a.label.replace('Week ', ''), 10);
        const numB = parseInt(b.label.replace('Week ', ''), 10);
        return numA - numB;
      });
    } else {
      // Sort by value descending
      result.sort((a, b) => b.value - a.value);
    }

    // Limit categories to top 10 for bar/donut to keep charts readable
    if (chartType !== 'line' && chartType !== 'scatter' && result.length > 10) {
      const topRows = result.slice(0, 9);
      const otherSum = result.slice(9).reduce((s, r) => s + r.value, 0);
      topRows.push({ label: 'Other', value: Math.round(otherSum * 100) / 100 });
      return topRows;
    }

    return result;
  }
}

// 4. STRATEGIC INSIGHTS AGENT
class StrategicInsightsAgent {
  constructor() {
    this.name = "StrategicInsightsAgent";
  }

  async run(kpis, datasets) {
    logger.log(this.name, "Starting business analysis of generated metrics", 'info');
    updateAgentStatus('insights', 'running');
    
    if (!state.apiKey) {
      const err = new Error("Gemini API Key is missing.");
      logger.log(this.name, err.message, 'error');
      updateAgentStatus('insights', 'failed');
      throw err;
    }

    const container = document.getElementById('insights-container');
    if (container) container.innerHTML = ''; // Clear previous

    try {
      const payload = {
        kpis: kpis,
        charts: datasets.map(d => ({
          question: d.question,
          data: d.data
        }))
      };

      const systemPrompt = `You are an executive-level D2C business strategist. Your task is to analyze the provided dataset summary and question-specific charts to output exactly 5 highly strategic, actionable business insights.

Constraints:
1. Output exactly 5 bullet points.
2. Every single bullet point MUST include at least one concrete number/percentage from the provided data.
3. Keep insights crisp, direct, and actionable for a business leader. No technical jargon (e.g. do not say "Chart 1 shows", "X-axis represents").
4. Each bullet must state a clear business problem/opportunity AND a recommended action.
5. Example: "Home & Kitchen drives 38% of revenue but has the longest avg. delivery time at 5.2 days — prioritise fulfilment speed for this category immediately."
6. Do not include markdown headers, titles, or introductions. Start immediately with the first bullet point. Use standard markdown '-' format for bullets.`;

      logger.log(this.name, "Requesting streaming insights from Gemini...", 'info');
      
      // Setup HTML container
      const listElement = document.createElement('ul');
      listElement.className = 'insights-list';
      if (container) container.appendChild(listElement);

      let currentBulletText = "";
      let activeListItem = null;

      await GeminiAPI.stream(systemPrompt, JSON.stringify(payload), (chunk) => {
        // Stream chunk handler
        const lines = chunk.split('\n');
        
        chunk.split('').forEach(char => {
          if (char === '\n') {
            if (currentBulletText.trim()) {
              this.renderBullet(listElement, currentBulletText);
              currentBulletText = "";
              activeListItem = null;
            }
          } else {
            currentBulletText += char;
            if (!activeListItem) {
              activeListItem = document.createElement('li');
              activeListItem.className = 'insight-item streaming';
              listElement.appendChild(activeListItem);
            }
            // Strip leading dashes or asterisks
            let cleanText = currentBulletText.replace(/^[\s\-\*]+/, '');
            activeListItem.textContent = cleanText;
          }
        });
      });

      // Handle trailing text
      if (currentBulletText.trim()) {
        this.renderBullet(listElement, currentBulletText);
      }

      // Cleanup styling
      document.querySelectorAll('.insight-item.streaming').forEach(li => {
        li.classList.remove('streaming');
        // Clean leading bullets
        li.textContent = li.textContent.replace(/^[\s\-\*]+/, '');
      });

      updateAgentStatus('insights', 'complete');
      logger.log(this.name, "Strategic insights generated and rendered successfully.", 'success');
      return true;
    } catch (err) {
      logger.log(this.name, `Insights generation failed: ${err.message}`, 'error');
      updateAgentStatus('insights', 'failed');
      throw err;
    }
  }

  renderBullet(listElement, rawText) {
    let cleanText = rawText.replace(/^[\s\-\*]+/, '').trim();
    if (!cleanText) return;
    
    // Check if there are any streaming placeholders
    const streams = listElement.querySelectorAll('.insight-item.streaming');
    if (streams.length > 0) {
      const item = streams[0];
      item.classList.remove('streaming');
      item.textContent = cleanText;
    } else {
      const item = document.createElement('li');
      item.className = 'insight-item';
      item.textContent = cleanText;
      listElement.appendChild(item);
    }
  }
}

// Helper to calculate ISO Week number
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

// Google Gemini API Request Wrappers
const GeminiAPI = {
  async generate(systemPrompt, userPrompt, isJson = false) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`;
    
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: `System Instruction: ${systemPrompt}\n\nUser Input: ${userPrompt}` }]
        }
      ]
    };

    if (isJson) {
      requestBody.generationConfig = {
        responseMimeType: "application/json"
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error?.message || res.statusText;
      throw new Error(`Gemini API Error: ${errMsg}`);
    }

    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  },

  async stream(systemPrompt, userPrompt, onChunk) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${state.apiKey}`;
    
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: `System Instruction: ${systemPrompt}\n\nUser Input: ${userPrompt}` }]
        }
      ]
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error?.message || res.statusText;
      throw new Error(`Gemini Streaming API Error: ${errMsg}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep last incomplete line

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(jsonStr);
            const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textChunk) {
              onChunk(textChunk);
            }
          } catch (e) {
            console.error("Failed to parse SSE JSON", e, jsonStr);
          }
        }
      }
    }
  }
};

// UI State & Agent Panel Helpers
function updateAgentStatus(agentKey, status) {
  state.agentStates[agentKey] = status;
  
  // Update state badges in the DOM
  const statusElement = document.querySelector(`.agent-status-strip [data-agent="${agentKey}"]`);
  if (statusElement) {
    statusElement.className = `agent-status-badge ${status}`;
    const stateLabel = statusElement.querySelector('.badge-state');
    if (stateLabel) {
      stateLabel.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
  }
}

// Expose variables and classes to global window scope
window.state = state;
window.logger = logger;
window.CSVParser = CSVParser;
window.DataIngestAgent = DataIngestAgent;
window.ChartPlannerAgent = ChartPlannerAgent;
window.DataExecutionAgent = DataExecutionAgent;
window.StrategicInsightsAgent = StrategicInsightsAgent;
window.GeminiAPI = GeminiAPI;
window.updateAgentStatus = updateAgentStatus;
