#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Ensure proper permissions for your URL shortener app
    GRANT ALL PRIVILEGES ON DATABASE url_shortener TO your_pg_user;
    
    -- Create extensions if needed
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    -- Additional users can be added here if needed
    -- CREATE USER readonly_user WITH ENCRYPTED PASSWORD 'readonlypass';
    -- GRANT CONNECT ON DATABASE url_shortener TO readonly_user;
EOSQL