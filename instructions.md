# ShopEasy Data Analyst Agent - Development Instructions

This document provides developer guidelines, LLM prompt templates, and code implementation rules for the ShopEasy Data Analyst Agent dashboard.

---

## 1. Technical Framework & Library Selection

*   **HTML/JS/CSS**: Vanilla web stack. No external framework (React/Vue/Next.js) unless explicitly requested.
*   **Styling**: Vanilla CSS, utilizing a premium glassmorphic dark theme. Colors should be HSL-based modern grays/slates, with vibrant indigo and cyan accents.
*   **Data Charting**: Use **Chart.js** (loaded via CDN) for chart rendering. It is highly configurable, lightweight, and supports all required chart types.
*   **LLM Service**: Use the official Google Gemini API (developer endpoint) calling `gemini-2.5-flash`.
    *   Since this is a client-side app, provide a secure settings drawer/modal in the UI where users input their Gemini API Key. Store it securely in browser `localStorage`.
    *   All LLM requests must include the API key.
    *   Do not hardcode or commit keys.

---

## 2. LLM Prompts & Structured Instructions

### A. Chart Recommendation Prompt (Chart Planner Agent)
Use the following system prompt and user message structure for chart planning. Enforce a structured JSON output format.

**System Prompt**:
```text
You are a senior data analyst and visual architect. Your task is to recommend the best chart type and column mapping to answer a user's business question based on a given dataset schema.

Analyze the schema:
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
Do not include markdown tags like ```json or any other text before or after the JSON.
```

**User Input Message**:
```json
{
  "schema": {
    "Order Date": "date",
    "Revenue": "number",
    "Category": "category",
    "City": "category",
    "Delivery Status": "category"
  },
  "questions": [
    "Which product categories are driving the most revenue?",
    "How is revenue trending week over week?"
  ]
}
```

---

### B. Strategic Insights Prompt (Strategic Insights Agent)
This agent runs once charts render. It must take the summarized KPIs and aggregated chart data, and stream the insights.

**System Prompt**:
```text
You are an executive-level D2C business strategist. Your task is to analyze the provided dataset summary and question-specific charts to output exactly 5 highly strategic, actionable business insights.

Constraints:
1. Output exactly 5 bullet points.
2. Every single bullet point MUST include at least one concrete number/percentage from the provided data.
3. Keep insights crisp, direct, and actionable for a business leader. No technical jargon (e.g. do not say "Chart 1 shows", "X-axis represents").
4. Each bullet must state a clear business problem/opportunity AND a recommended action.
5. Example: "Home & Kitchen drives 38% of revenue but has the longest avg. delivery time at 5.2 days — prioritise fulfilment speed for this category immediately."
6. Do not include markdown headers, titles, or introductions. Start immediately with the first bullet point.
```

**User Input Message**:
```json
{
  "kpis": {
    "totalRevenue": 248900.50,
    "totalOrders": 1420,
    "avgDeliveryDays": 3.4
  },
  "charts": [
    {
      "question": "Which product categories are driving the most revenue?",
      "data": [
        {"Category": "Electronics", "Revenue": 95000},
        {"Category": "Home & Kitchen", "Revenue": 75000},
        {"Category": "Apparel", "Revenue": 40000}
      ]
    },
    {
      "question": "What is the average delivery time by city?",
      "data": [
        {"City": "Mumbai", "AvgDays": 2.1},
        {"City": "Delhi", "AvgDays": 4.8},
        {"City": "Bangalore", "AvgDays": 3.2}
      ]
    }
  ]
}
```

---

## 3. Parsing & Date Formatting Rules

*   **Date Format**: Dates are in `DD-MM-YYYY` format (e.g., `15-04-2026`).
    *   Implement a robust parser to convert these into JavaScript `Date` objects for sorting and week-over-week grouping.
    *   Display dates back to the user in `DD-MM-YYYY` format ONLY.
*   **Column Matching**:
    *   Do not hardcode column indices or exact names. Use case-insensitive substring matching:
        *   `Revenue` or `Sales` or `Amount` or `Price` -> Numeric values for financial metrics.
        *   `Date` -> Ingestion/filtering.
        *   `Status` -> Categorical state (e.g. Delivered, Cancelled).
        *   `Delivery Time` or `Delivery Days` or `Days to Deliver` -> Numbers for delivery efficiency.
    *   If no matching column is found, fallback gracefully and alert the user.

---

## 4. UI/UX & Dynamic Thumbnails

*   **Step 3 Edit Cards**:
    *   When chart recommendations display, render them as custom card controls.
    *   Include a small canvas/preview inside the card.
    *   Whenever the user changes the dropdown options (e.g. changes `xAxisColumn` from `Category` to `City`), update the preview thumbnail instantly using a simplified Chart.js instance (e.g. with gridlines and legends hidden for a clean, micro-chart look).
*   **Agent Operations Console**:
    *   Implement as a terminal-style component at the bottom of the screen.
    *   Use a monospace font.
    *   Color code logs: Cyan/Blue for information, Yellow for executing steps, Green for success, Red for errors.
    *   Prefix every log with a timestamp (e.g. `[12:34:56]`).

---

## 5. Implementation Sequence & Quality Assurance

*   **State Machine**: Maintain a clear central state object in JS:
    ```javascript
    const state = {
      apiKey: '',
      csvUrl: '',
      rawData: [],
      schema: {},
      metadata: {},
      questions: [],
      configs: [], // approved chart configs
      kpis: {},
      pipelineStatus: 'idle', // 'ingesting', 'charting', 'executing', 'insights', 'complete', 'failed'
    };
    ```
*   **Refreshes**: Clicking the "Refresh" button must reset everything (keeping CSV URL and questions) and trigger the entire pipeline from `DataIngestAgent` to `StrategicInsightsAgent` consecutively.
*   **Test Cases**: Ensure both datasets are fully tested and functional without regressions.
