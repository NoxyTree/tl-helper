const SYSTEM_PROMPT = `You are the user's private Throne and Liberty build adviser inside TL Helper.

Rules you must follow:
1. Use tools for every numeric game-data or build claim. Never estimate, recall, or invent a value.
2. The deterministic calculator is the authority for build totals. The SQLite warehouse is evidence for decoded game records and stat sources.
3. Distinguish exact, derived, modeled, provisional, and unsupported results. Repeat calculation warnings when they could affect advice.
4. Item Potentials are excluded from this release. Do not include them in comparisons or recommendations.
5. Only selected skills and mastery nodes belonging to the equipped weapon types are active in calculator results.
6. Conditional combat effects require a defined scenario. Do not present static stat totals as simulated damage.
7. Be concise but decisive. Explain the tradeoff and cite the item, set, skill, mastery, or stat-source names returned by tools.
8. If no build is loaded, answer general database questions normally, but ask for a build before giving build-specific advice.
9. Never claim that a globally optimal build was found unless an optimizer tool explicitly returns that result.
10. Do not expose internal SQL or pretend you have unrestricted database access.`;

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_items",
      description: "Search the TL Helper item projection by name or id.",
      parameters: { type: "object", properties: {
        query: { type: "string" }, equipment_type: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 25 },
      }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_item",
      description: "Get a projected item's max-level stats, set, passives, and perks.",
      parameters: { type: "object", properties: { identifier: { type: "string" } }, required: ["identifier"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_item_set",
      description: "Get set pieces, breakpoint effects, and calculation classification.",
      parameters: { type: "object", properties: { identifier: { type: "string" } }, required: ["identifier"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_stat_sources",
      description: "Find database-backed sources for a stat, ordered by absolute value. Filter by source type when useful.",
      parameters: { type: "object", properties: {
        stat_query: { type: "string" }, source_type: { type: "string", description: "For example equipment, mastery, item_set, rune, or attribute_progression." },
        source_name: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 40 },
      }, required: ["stat_query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_decoded_database",
      description: "Search localized decoded warehouse records. Use this for mechanics, skills, passives, formulas, and raw evidence not covered by item projection tools.",
      parameters: { type: "object", properties: {
        query: { type: "string" }, table_family: { type: "string" }, record_type: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 30 },
      }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_decoded_record",
      description: "Read one decoded warehouse record after locating its record_id or row_id.",
      parameters: { type: "object", properties: { identifier: { type: "string" } }, required: ["identifier"] },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_loaded_build",
      description: "Calculate the loaded build with set effects, valid selected passives, and valid selected mastery nodes. Returns totals, active set effects, and validation issues.",
      parameters: { type: "object", properties: {
        stat_ids: { type: "array", items: { type: "string" }, description: "Optional canonical stat ids to return." },
        include_sources: { type: "boolean" },
      } },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_item_for_slot",
      description: "Replace one slot in the loaded build with a max-level bare candidate and calculate all changed totals, including set breakpoint changes.",
      parameters: { type: "object", properties: {
        slot_id: { type: "string", description: "Canonical slot such as main_hand, head, chest, ring_1, or ring_2." },
        candidate: { type: "string", description: "Candidate item name or id." },
      }, required: ["slot_id", "candidate"] },
    },
  },
];

function safeToolResult(value) {
  const json = JSON.stringify(value ?? null);
  return json.length <= 60_000 ? json : `${json.slice(0, 59_500)}\n[Tool result truncated]`;
}

export function createToolExecutor({ warehouse, builds }) {
  return async (name, args = {}) => {
    switch (name) {
      case "search_items": return builds.findItems(args.query, args.equipment_type, args.limit);
      case "get_item": return builds.item(args.identifier);
      case "get_item_set": return builds.set(args.identifier);
      case "search_stat_sources": return warehouse.searchStatSources(args);
      case "search_decoded_database": return warehouse.searchRecords(args);
      case "get_decoded_record": return warehouse.getRecord(args.identifier);
      case "analyze_loaded_build": return builds.analyzeLoadedBuild(args);
      case "compare_item_for_slot": return builds.compareItemForSlot(args);
      default: throw new Error(`Unknown tool: ${name}`);
    }
  };
}

export class OllamaAdviser {
  constructor({ baseUrl = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434", model = process.env.TL_ADVISER_MODEL ?? "gpt-oss:20b", executeTool }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.executeTool = executeTool;
  }

  async status() {
    const response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = await response.json();
    return { online: true, model: this.model, installed: data.models?.some((row) => row.name === this.model) ?? false };
  }

  async chat({ message, history = [], hasBuild = false }) {
    const messages = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\nCurrent session: ${hasBuild ? "A build is loaded." : "No build is loaded."}` },
      ...history.slice(-20).filter((row) => ["user", "assistant"].includes(row?.role) && typeof row.content === "string")
        .map(({ role, content }) => ({ role, content: content.slice(0, 12_000) })),
      { role: "user", content: String(message).slice(0, 20_000) },
    ];
    const toolTrace = [];
    for (let round = 0; round < 8; round += 1) {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, messages, tools: TOOL_DEFINITIONS, stream: false, options: { temperature: 0.2 } }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!response.ok) throw new Error(`Ollama chat failed with HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
      const payload = await response.json();
      const assistant = payload.message ?? { role: "assistant", content: "" };
      messages.push(assistant);
      const calls = assistant.tool_calls ?? [];
      if (!calls.length) return { answer: assistant.content?.trim() || "No answer was returned.", toolTrace, model: this.model };
      for (const call of calls) {
        const name = call.function?.name;
        const args = call.function?.arguments ?? {};
        try {
          const result = await this.executeTool(name, args);
          toolTrace.push({ name, args, ok: true });
          messages.push({ role: "tool", tool_name: name, content: safeToolResult(result) });
        } catch (error) {
          toolTrace.push({ name, args, ok: false, error: error.message });
          messages.push({ role: "tool", tool_name: name, content: safeToolResult({ error: error.message }) });
        }
      }
    }
    throw new Error("The adviser exceeded the maximum tool-call rounds. Try a narrower question.");
  }
}
