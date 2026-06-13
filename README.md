# ShopEasy Data Analyst Agent 🤖📊

A **multi-agent, AI-powered live analytics dashboard** built for ShopEasy, a D2C e-commerce brand. Stakeholders can open the link, connect their own Google Sheet data source, ask business questions in plain English, and get AI-generated charts and strategic insights — no Excel, no engineering support, no manual updates.

---

## 🚀 How to Run Locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

---

## 🛠️ User Journey

| Step | Action |
|------|--------|
| **1 — Connect Data** | Paste a Google Sheet CSV URL. The **Data Ingest Agent** fetches, parses, and previews the schema with detected column types. |
| **2 — Ask Questions** | Enter up to 5 business questions in plain English (pre-filled with example questions). |
| **3 — Review AI Charts** | The **Chart Planner Agent** (Gemini 2.5 Flash) recommends chart types, axis columns, and reasoning. Tweak them live — thumbnail previews update instantly. |
| **4 — Run Dashboard** | The **Execution Agent** calculates KPIs and renders Chart.js visualizations. |
| **5 — Get Insights** | The **Strategic Insights Agent** streams 5 actionable, number-backed insights from Gemini 2.5 Flash in real time. |

---

## 🤖 Multi-Agent Architecture

```
DataIngestAgent → ChartPlannerAgent → DataExecutionAgent → StrategicInsightsAgent
```

Each agent runs in sequence, logging progress to a terminal-style **Agent Operations Console** and updating the **Agent Status Panel** live.

| Agent | Role |
|-------|------|
| `DataIngestAgent` | Fetch CSV, parse, detect column types, compute metadata |
| `ChartPlannerAgent` | Query Gemini 2.5 Flash for chart type + axis recommendations |
| `DataExecutionAgent` | Aggregate data, calculate KPIs, format for Chart.js |
| `StrategicInsightsAgent` | Stream business insights from Gemini 2.5 Flash |

---

## 📂 File Structure

```
├── index.html          # Full multi-step UI wizard
├── index.css           # Glassmorphic dark-mode design system
├── app.js              # State machine + all 4 agent classes + Gemini API wrappers
├── agents.md           # Agent architecture documentation
├── instructions.md     # Developer guidelines, prompt templates, and state rules
├── package.json        # Vite dev/build scripts
└── .gitignore
```

---

## 🔑 Configuration

1. Click the **⚙️ gear icon** in the top-right of the dashboard.
2. Enter your **Google Gemini API Key** (stored in browser `localStorage` only — never sent anywhere except Google's API).

---

## 📊 Sample Datasets

| Dataset | Date Range | CSV URL |
|---------|-----------|---------|
| ShopEasy Orders v1 | 01-04-2026 to 30-04-2026 | [Link](https://docs.google.com/spreadsheets/d/e/2PACX-1vR7nSFpTH_nKyzGimByHPmg4-7R-4iDnrVg_fjy0nTnNZ35Tn__w-UBCh--4SpdPnLWa9skAWpd_fx9/pub?gid=1701530588&single=true&output=csv) |
| ShopEasy Orders v2 | 01-03-2026 to 15-05-2026 | [Link](https://docs.google.com/spreadsheets/d/e/2PACX-1vQmzy1GyP2Y7g09SOcdmKoFUKQ8WMyAanBoLmzhTVEskhElSvYhI3WwOXXeO6vOS7Eb_e5Tz6x3eAYE/pub?gid=1385638631&single=true&output=csv) |

---

## 🎨 Tech Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript
- **Charts**: [Chart.js](https://www.chartjs.org/)
- **AI**: Google Gemini 2.5 Flash (via REST API)
- **Build Tool**: [Vite](https://vitejs.dev/)

---

*Built with pair-programming precision using Antigravity AI.*
