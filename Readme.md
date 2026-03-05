### Ollama

- Instalar Ollama

```
ollama run llama3
```

- Instalar Docker

```
docker --version
```

- Open WebUI

```
docker run -d ^
  -p 3000:8080 ^
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 ^
  --name open-webui ^
  --restart always ^
  ghcr.io/open-webui/open-webui:main
```

- Instalar pgvector en Postgres

```
docker run -d \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  ankane/pgvector
```

- DB:

```
CREATE EXTENSION IF NOT EXISTS vector;
```

- Crear tabla para documentos

```
CREATE TABLE documents (
id SERIAL PRIMARY KEY,
content TEXT,
embedding vector(768)
);
```

- Tabla para Memoria

```
CREATE TABLE conversation_memory (
id SERIAL PRIMARY KEY,
content TEXT,
embedding VECTOR(768) -- o el tamaño de tu modelo
);
```

- Consultas de apoyo

```
SELECT vector_dims(embedding) FROM documents LIMIT 1;


--TRUNCATE documents;

select \* from conversation_memory;

select \* from documents;
```
