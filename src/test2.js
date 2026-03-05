/*****************************************************************
 AGENTE AVANZADO
*****************************************************************/

import fetch from "node-fetch";
import { Pool } from "pg";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
import path from "path";
import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";

dotenv.config();

/* ============================================================
CONFIG
============================================================ */

const LLM_MODEL = "llama3";
const EMBEDDING_MODEL = "nomic-embed-text";

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: "postgres",
  port: 5432,
});

/* ============================================================
UTILS
============================================================ */

function safeJSONParse(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const match = text.match(/\{[\s\S]*\}/);

  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function callLLM(prompt) {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0 },
    }),
  });

  const data = await response.json();
  return data.response?.trim() || "";
}

async function createEmbedding(text) {
  const response = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text,
    }),
  });

  const data = await response.json();
  return data.embedding;
}

function toPgVector(array) {
  return `[${array.join(",")}]`;
}

/* ============================================================
RAG
============================================================ */

async function searchDocuments(query) {
  const embedding = await createEmbedding(query);

  const result = await pool.query(
    `
SELECT content,
       (embedding <=> $1) AS distance
FROM documents
ORDER BY embedding <=> $1
LIMIT 3
`,
    [toPgVector(embedding)],
  );

  return result.rows.map((r) => r.content).join("\n");
}

/* ============================================================
TOOLS
============================================================ */

async function searchInternet(query) {
  console.log("🌐 Buscando:", query);

  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const html = await response.text();
  const $ = cheerio.load(html);

  const results = [];

  $(".result").each((i, el) => {
    const title = $(el).find(".result__title").text().trim();
    const snippet = $(el).find(".result__snippet").text().trim();
    const link = $(el).find(".result__a").attr("href");

    if (title && snippet) {
      results.push(`${title}\n${snippet}\n${link}`);
    }
  });

  return results.slice(0, 5).join("\n\n");
}

async function readWebPage(url) {
  console.log("📄 Leyendo:", url);

  const response = await fetch(url);
  const html = await response.text();

  const $ = cheerio.load(html);

  const text = $("p")
    .map((i, el) => $(el).text())
    .get()
    .join(" ");

  return text.slice(0, 4000);
}

async function getWeather(city) {
  const API_KEY = process.env.OPENWEATHER_KEY;

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=es`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.cod !== 200) return "No pude obtener el clima.";

  return `
Clima en ${data.name}
Temperatura: ${data.main.temp}°C
Estado: ${data.weather[0].description}
`;
}

function sendNotification(message) {
  console.log("📢 NOTIFICACIÓN:", message);
}

async function generateInfographic(topic) {
  const prompt = `
Genera JSON para una infografía sobre "${topic}"

{
"title":"",
"sections":[
{"heading":"","content":""}
]
}
`;

  const raw = await callLLM(prompt);
  const data = safeJSONParse(raw);

  if (!data) return "Error generando infografía";

  const html = `
<html>
<body style="font-family:Arial;padding:60px">
<h1>${data.title}</h1>
${data.sections
  .map(
    (s) => `
<h2>${s.heading}</h2>
<p>${s.content}</p>
`,
  )
  .join("")}
</body>
</html>
`;

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  await page.setViewport({ width: 1080, height: 1920 });
  await page.setContent(html);

  const filePath = path.join(process.cwd(), `infographic-${Date.now()}.png`);

  await page.screenshot({
    path: filePath,
    fullPage: true,
  });

  await browser.close();

  return filePath;
}

/* ============================================================
TOOLS REGISTRY
============================================================ */

const tools = [
  {
    name: "searchInternet",
    description: "Busca información en internet",
    execute: searchInternet,
  },
  {
    name: "readWebPage",
    description: "Lee el contenido de una página web",
    execute: readWebPage,
  },
  {
    name: "searchDocuments",
    description: "Busca información en documentos locales",
    execute: searchDocuments,
  },
  {
    name: "getWeather",
    description: "Obtiene el clima de una ciudad",
    execute: getWeather,
  },
  {
    name: "generateInfographic",
    description: "Genera una infografía en imagen",
    execute: generateInfographic,
  },
];

/* ============================================================
AGENTE
============================================================ */

async function createPlan(objective, memory) {
  const toolsDescription = tools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");

  const prompt = `
Eres un agente autónomo.

Objetivo:
${objective}

Memoria:
${memory.join("\n")}

Herramientas disponibles:
${toolsDescription}

Debes decidir el siguiente paso.

Responde SOLO en JSON válido.

Opciones:

1 usar herramienta

{
"action":"tool",
"tool":"nombre",
"input":"texto"
}

2 responder al usuario

{
"finalAnswer":"respuesta"
}
`;

  const raw = await callLLM(prompt);

  const parsed = safeJSONParse(raw);

  if (!parsed) {
    return {
      finalAnswer: raw,
    };
  }

  return parsed;
}

async function agent(objective) {
  let memory = [];

  const maxSteps = 6;

  for (let step = 0; step < maxSteps; step++) {
    console.log(`\nSTEP ${step + 1}`);

    const decision = await createPlan(objective, memory);

    console.log("DECISION:", decision);

    if (decision.finalAnswer) {
      return decision.finalAnswer;
    }

    if (decision.action === "tool") {
      const tool = tools.find((t) => t.name === decision.tool);

      if (!tool) {
        memory.push(`Tool ${decision.tool} no existe`);
        continue;
      }

      const result = await tool.execute(decision.input);

      memory.push(`
Tool: ${decision.tool}
Input: ${decision.input}
Resultado: ${result}
`);
    }
  }

  return "No se pudo completar el objetivo.";
}

/* ============================================================
SERVER
============================================================ */

const app = express();
const PORT = 9000;

app.use(cors());
app.use(express.json());
app.use("/images", express.static(process.cwd()));

app.post("/agent", async (req, res) => {
  try {
    const { question } = req.body;

    const result = await agent(question);

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
