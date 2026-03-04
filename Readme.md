CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
id SERIAL PRIMARY KEY,
content TEXT,
embedding vector(768)
);

CREATE TABLE conversation_memory (
id SERIAL PRIMARY KEY,
content TEXT,
embedding VECTOR(768) -- o el tamaño de tu modelo
);

SELECT vector_dims(embedding) FROM documents LIMIT 1;

--TRUNCATE documents;

select \* from conversation_memory;

select \* from documents;
