/*

// Nivel 3 — Conecta tu modelo a Node
// Backend controla el modelo

import fetch from "node-fetch";

const response = await fetch("http://localhost:11434/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "llama3",
    prompt: "Explícame RAG en términos simples",
    stream: false
  })
});

const data = await response.json();
console.log(data.response);

*/

// Paso 4.1 — Generar embeddings con Ollama
/* import fetch from "node-fetch";

const response = await fetch("http://localhost:11434/api/embeddings", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "nomic-embed-text",
    prompt: "Este es un fragmento de documento",
  }),
});

const data = await response.json();
console.log(data.embedding);
*/

import fetch from "node-fetch";
import { Pool } from "pg";

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: "postgres",
  port: 5432,
});

pool.on("error", (err, client) => {
  console.error("Unexpected error on idle client", err);
});

pool.on("connect", (client) => {
  console.log("New client connected to pool");
});

pool.on("remove", (client) => {
  console.log("Client removed from pool");
});

async function getEmbedding(text) {
  const response = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "nomic-embed-text",
      prompt: text,
    }),
  });

  const data = await response.json();
  return data.embedding;
}

async function saveDocument(text) {
  // 1. Generar embedding
  const response = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "nomic-embed-text",
      prompt: text,
    }),
  });

  const data = await response.json();
  const embedding = data.embedding;
  const embeddingString = `[${embedding.join(",")}]`;

  // 2. Guardar en DB
  await pool.query(
    "INSERT INTO documents (content, embedding) VALUES ($1, $2)",
    [text, embeddingString],
  );

  console.log("Documento guardado con embedding.");
}

async function searchSimilar(question) {
  const embedding = await getEmbedding(question);

  const embeddingString = `[${embedding.join(",")}]`;

  const result = await pool.query(
    `
    SELECT content, 1 - (embedding <=> $1) AS similarity
    FROM documents
    ORDER BY embedding <=> $1
    LIMIT 3;
    `,
    [embeddingString],
  );

  //console.log("Pregunta:", question);
  //console.table(result.rows);

  return result.rows;
}

async function ask(question) {
  const results = await searchSimilar(question);

  const context = results.map((r) => r.content).join("\n---\n");

  const prompt = `
Responde usando exclusivamente el siguiente contexto.
Si la información no está en el contexto, responde: "No tengo información suficiente".

Contexto:
${context}

Pregunta:
${question}
`;

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3",
      prompt: prompt,
      stream: false,
    }),
  });

  const data = await response.json();

  console.log("\nRespuesta:\n", data.response);
}

//saveDocument("Este es un fragmento de documento");
/*
saveDocument(
  "París es la capital de Francia y una de las ciudades más importantes de Europa. Es conocida por la Torre Eiffel, el Louvre y su historia cultural.",
);
saveDocument(
  "Node.js es un entorno de ejecución de JavaScript que permite ejecutar código fuera del navegador. Se utiliza para crear servidores web, APIs y aplicaciones backend. Está construido sobre el motor V8 de Chrome.",
);
saveDocument(
  "La fotosíntesis es el proceso biológico mediante el cual las plantas convierten la luz solar en energía química. Este proceso permite a las plantas producir glucosa y oxígeno.",
);
saveDocument(
  "PostgreSQL es un sistema de gestión de base de datos relacional de código abierto. Se utiliza para almacenar datos estructurados, realizar consultas SQL y construir aplicaciones que requieren persistencia de información.",
);
saveDocument(
  "Los agujeros negros son objetos astronómicos con una gravedad tan intensa que ni siquiera la luz puede escapar. Se forman cuando estrellas masivas colapsan.",
);
*/

//await searchSimilar("¿Cuál es la capital francesa");
//await searchSimilar("¿Qué ciudad es famosa por la Torre Eiffel?");
//await searchSimilar("¿Para qué sirve Node.js?");
//await searchSimilar("Crear servidores con JavaScript");

//await ask("¿Para qué sirve Node.js?");
//await ask("¿Quién ganó el mundial 2022?");
//await ask("¿Cuál es la ciudad más importante de Europa?");

function sendNotification(message) {
  console.log("📢 Notificación enviada:", message);
}

async function createEmbedding(text) {
  const response = await fetch("http://localhost:11434/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3",
      prompt: text,
    }),
  });

  const data = await response.json();

  return data.embedding;
}

async function saveMemory(text) {
  const embedding = await createEmbedding(text);

  await pool.query(
    "INSERT INTO conversation_memory (content, embedding) VALUES ($1, $2)",
    [text, `[${embedding.join(",")}]`],
  );
}

async function searchMemory(query) {
  const embedding = await createEmbedding(query);
  const vector = `[${embedding.join(",")}]`;

  const result = await pool.query(
    `
    SELECT content,
           1 - (embedding <=> $1) AS similarity
    FROM conversation_memory
    ORDER BY embedding <=> $1
    LIMIT 3
  `,
    [vector],
  );

  return result.rows;
}

async function callLLM(prompt) {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3",
      prompt: prompt,
      stream: false,
    }),
  });

  const data = await response.json();
  return data.response;
}

async function agent(question) {
  const systemPrompt = `
Eres un agente que puede usar herramientas.

Herramientas disponibles:

1) searchDocuments(query: string)
   Úsala cuando necesites buscar información en documentos.

2) sendNotification(message: string)
   Úsala cuando el usuario pida que se le recuerde algo
   o que se envíe una notificación.

Si necesitas usar una herramienta, responde EXCLUSIVAMENTE
con JSON válido en este formato:

{
  "tool": "nombreDeLaTool",
  "input": { ... }
}

No incluyas texto fuera del JSON cuando uses herramienta.

Si no necesitas herramienta, responde normalmente.
`;

  const memories = await searchMemory(question);

  const memoryContext = memories.map((m) => m.content).join("\n---\n");

  const firstCall = await callLLM(
    systemPrompt +
      "\nRecuerdos relevantes:\n" +
      memoryContext +
      "\nPregunta:\n" +
      question,
  );

  //const firstCall = await callLLM(systemPrompt + "\nPregunta:\n" + question);

  console.log("\nPrimera respuesta del modelo:\n", firstCall);

  let parsed;

  try {
    parsed = JSON.parse(firstCall);
  } catch (err) {
    // No era JSON → respuesta directa
    console.log("\nRespuesta final:\n", firstCall);
    return;
  }

  // ===============================
  // TOOL: searchDocuments
  // ===============================
  if (parsed.tool === "searchDocuments") {
    const results = await searchSimilar(parsed.input.query);

    const context = results.map((r) => r.content).join("\n---\n");

    const secondPrompt = `
Usaste la herramienta searchDocuments.

Resultado:
${context}

Ahora responde la pregunta original usando
exclusivamente esa información.

Pregunta original:
${question}
`;

    const finalAnswer = await callLLM(secondPrompt);

    console.log("\nRespuesta final:\n", finalAnswer);
  }

  // ===============================
  // TOOL: sendNotification
  // ===============================
  else if (parsed.tool === "sendNotification") {
    sendNotification(parsed.input.message);

    const confirmationPrompt = `
La herramienta sendNotification fue ejecutada correctamente
con el siguiente mensaje:

"${parsed.input.message}"

Responde confirmando al usuario que la notificación fue enviada.
`;

    const finalAnswer = await callLLM(confirmationPrompt);

    await saveMemory(`Usuario: ${question}\nAgente: ${finalAnswer}`);

    console.log("\nRespuesta final:\n", finalAnswer);
  }

  // ===============================
  // TOOL desconocida
  // ===============================
  else {
    console.log("Tool no reconocida:", parsed.tool);
  }
}

//await agent("¿Para qué sirve Node.js?");
//await agent("Recuérdame estudiar embeddings mañana.");
//await agent("Hola, ¿qué tal?");

await agent("Estoy aprendiendo embeddings.");
