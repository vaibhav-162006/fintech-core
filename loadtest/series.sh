#!/bin/bash
#usage : LOAD_DATABASE_URL='postgres://postgres:fintech123@127.0.0.1:5432/fintech' ./loadtest/series.sh LABEL
LABEL=$1
docker compose down -v
docker compose ip --build -d
sleep 12
docker compose exec -T db pqsl -U postgres -d fintech < loadtest/setup.sql
for i in 1 2 3 4 5; do
    rows=$(docker compose exec -T db pqsl -U postgres -d fintech -t -A -c "SELECT COUNT (*) FROM journal_entries;")
    echo "--- $LABEL run $i, journal rows before : $rows" | tee -a loadtest/result.txt
    npm run load 2>&1 | grep -E "throughput|letency|status codes" | tee -a loadtest/result.txt
done
