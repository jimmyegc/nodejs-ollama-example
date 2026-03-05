/*****************************************************************
 AGENTE AVANZADO CON:
 - RAG (documentos con pgvector)
 - Memoria conversacional persistente
 - Tools:
      • searchDocuments
      • sendNotification
      • getWeather
      • generateInfographic
 - Generación de infografías profesionales (HTML + Puppeteer)
 - Manejo robusto de JSON del LLM
 - Umbral de memoria configurable
*****************************************************************/

import fetch from "node-fetch";
import { Pool } from "pg";
import dotenv from "dotenv";
import puppeteer from "puppeteer";
import path from "path";
import express from "express";
import cors from "cors";

dotenv.config();

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

/* ============================================================
   CONFIGURACIÓN GENERAL
============================================================ */

const LLM_MODEL = "llama3";
const EMBEDDING_MODEL = "nomic-embed-text";
const MEMORY_THRESHOLD = 0.5;

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: "postgres",
  port: 5432,
});

/* ============================================================
   UTILIDADES BASE
============================================================ */

/*
  Limpia salida del LLM y extrae JSON válido
*/
function safeJSONParse(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (err) {
    console.log("⚠️ JSON inválido. Intentando reparar...");

    // Intentar cerrar llaves faltantes
    let fixed = text.trim();

    // Extraer desde la primera llave
    const start = fixed.indexOf("{");
    if (start !== -1) {
      fixed = fixed.slice(start);
    }

    // Contar llaves abiertas y cerradas
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;

    const missing = openBraces - closeBraces;

    if (missing > 0) {
      fixed += "}".repeat(missing);
    }

    try {
      return JSON.parse(fixed);
    } catch {
      console.log("❌ No se pudo reparar JSON.");
      return null;
    }
  }
}

/*
  Llamada al modelo
*/
async function callLLM(prompt) {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0, // 🔥 Reduce creatividad
        top_p: 0.9,
      },
    }),
  });

  const data = await response.json();
  return data.response.trim();
}

/*
  Embeddings
*/
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

async function saveDocument(text) {
  const embedding = await createEmbedding(text);
  await pool.query(
    "INSERT INTO documents (content, embedding) VALUES ($1, $2)",
    [text, toPgVector(embedding)],
  );
}

async function searchDocuments(query) {
  const embedding = await createEmbedding(query);

  const result = await pool.query(
    `
    SELECT content,
           (embedding <=> $1) AS distance
    FROM documents
    ORDER BY embedding <=> $1
    LIMIT 3;
  `,
    [toPgVector(embedding)],
  );

  return result.rows;
}

/* ============================================================
   MEMORIA
============================================================ */

async function saveMemory(text) {
  const embedding = await createEmbedding(text);

  await pool.query(
    "INSERT INTO conversation_memory (content, embedding) VALUES ($1, $2)",
    [text, toPgVector(embedding)],
  );
}

async function searchMemory(query) {
  const embedding = await createEmbedding(query);

  const result = await pool.query(
    `
    SELECT content,
           (embedding <=> $1) AS distance
    FROM conversation_memory
    ORDER BY embedding <=> $1
    LIMIT 3;
  `,
    [toPgVector(embedding)],
  );

  return result.rows;
}

/* ============================================================
   TOOLS
============================================================ */

async function getWeather(city) {
  const API_KEY = process.env.OPENWEATHER_KEY;

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=es`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.cod !== 200) {
    return `No pude obtener el clima para ${city}.`;
  }

  return `
Clima en ${data.name}:
Temperatura: ${data.main.temp}°C
Sensación térmica: ${data.main.feels_like}°C
Estado: ${data.weather[0].description}
Humedad: ${data.main.humidity}%
`;
}

function sendNotification(message) {
  console.log("📢 NOTIFICACIÓN:", message);
}

/* ============================================================
   GENERADOR DE INFOGRAFÍAS
============================================================ */

async function generateInfographic(topic) {
  const structurePrompt = `
Genera una estructura JSON limpia para una infografía profesional sobre "${topic}".

Formato obligatorio:
{
  "title": "...",
  "sections": [
    { "heading": "...", "content": "..." }
  ]
}

NO agregues texto adicional.
Devuelve SOLO JSON válido.
`;

  const raw = await callLLM(structurePrompt);
  const data = safeJSONParse(raw);

  if (!data) {
    throw new Error("El modelo no devolvió JSON válido.");
  }

  const html = `
  <html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        width: 1080px;
        padding: 60px;
        background: linear-gradient(to bottom, #f8fafc, #e2e8f0);
        color: #1e293b;
      }
      h1 {
        text-align: center;
        font-size: 48px;
        margin-bottom: 50px;
      }
      .section {
        margin-bottom: 40px;
        padding: 30px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.05);
      }
      .section h2 {
        margin-bottom: 15px;
        color: #2563eb;
      }
      p {
        font-size: 20px;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <h1>${data.title}</h1>
    ${data.sections
      .map(
        (s) => `
      <div class="section">
        <h2>${s.heading}</h2>
        <p>${s.content}</p>
      </div>
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
  await page.screenshot({ path: filePath, fullPage: true });

  await browser.close();

  return filePath;
}

/* ============================================================
   AGENTE PRINCIPAL
============================================================ */

async function agent(question) {
  console.log("\n===============================");
  console.log("Pregunta:", question);
  console.log("===============================\n");

  /* 1️⃣ MEMORIA */
  const memories = await searchMemory(question);
  const relevantMemories = memories.filter(
    (m) => m.distance < MEMORY_THRESHOLD,
  );

  const memoryContext = relevantMemories.map((m) => m.content).join("\n---\n");

  /* 2️⃣ DECISIÓN */
  const systemPrompt = `
Eres un agente con herramientas.

Herramientas disponibles:
- searchDocuments(query)
- sendNotification(message)
- getWeather(city)
- generateInfographic(topic)

Si necesitas herramienta, responde SOLO JSON:

{
  "tool": "nombre",
  "input": { }
}

No agregues texto extra.
`;

  const firstResponse = await callLLM(
    systemPrompt +
      (memoryContext ? "\nMemoria:\n" + memoryContext : "") +
      "\nPregunta:\n" +
      question,
  );

  console.log("Decisión del modelo:\n", firstResponse);

  const parsed = safeJSONParse(firstResponse);

  if (!parsed) {
    await saveMemory(`Usuario: ${question}\nAgente: ${firstResponse}`);
    console.log("\nRespuesta final:\n", firstResponse);
    return firstResponse;
  }

  /* 3️⃣ EJECUCIÓN TOOL */

  switch (parsed.tool) {
    case "searchDocuments": {
      const docs = await searchDocuments(parsed.input.query);
      const context = docs.map((d) => d.content).join("\n---\n");

      const finalAnswer = await callLLM(`
Contexto:
${context}

Responde usando solo ese contexto.
Pregunta: ${question}
`);

      await saveMemory(`Usuario: ${question}\nAgente: ${finalAnswer}`);
      return finalAnswer;
    }

    case "sendNotification":
      sendNotification(parsed.input.message);
      return "Notificación enviada.";

    case "getWeather": {
      const result = await getWeather(parsed.input.city);
      return result;
    }

    case "generateInfographic": {
      const imagePath = await generateInfographic(parsed.input.topic);
      console.log("Infografía generada:", imagePath);
      return imagePath;
    }

    default:
      return "Tool no reconocida.";
  }
}

/* ============================================================
   SERVIDOR API
============================================================ */
const app = express();
const PORT = 9000;

app.use(cors());
app.use(express.json());
app.use("/images", express.static(process.cwd()));

/* ============================================================
   ENDPOINT PRINCIPAL
============================================================ */

app.post("/agent", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Falta 'question'" });
    }

    const result = await agent(question);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Error en /agent:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
});

async function startServer() {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
}

startServer();

process.stdin.resume();

/* ============================================================
   EJECUCIÓN
============================================================ */

// await agent("Crea una infografía profesional sobre microservicios");
