FROM postgis/postgis:16-3.4

# Stock postgis image lacks pgvector; stock pgvector image lacks PostGIS.
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*
