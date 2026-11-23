-- Launch checklist (Story 7.4b): how big is the published Kerala PSC bank? Read-only. On the VPS:
--   docker compose -f deploy/compose.yaml --env-file deploy/.env exec -T postgres psql -U postgres -d minnal < deploy/bank-counts.sql
-- "Published" is the latest PUBLISHED version of each live (not soft-deleted) question.
WITH latest AS (
    SELECT DISTINCT ON (qv.question_id) qv.question_id, qv.topic_id
    FROM core.question_version qv
    JOIN core.question q ON q.id = qv.question_id AND q.deleted_at IS NULL
    WHERE qv.status = 'PUBLISHED' AND qv.content_category = 'KERALA_PSC'
    ORDER BY qv.question_id, qv.version DESC
), per_topic AS (
    SELECT t.name AS topic, count(*) AS published FROM latest l JOIN core.topic t ON t.id = l.topic_id GROUP BY t.name
)
SELECT 'published Kerala PSC questions' AS measure, coalesce(sum(published), 0) AS value FROM per_topic
UNION ALL
SELECT 'topics with 10 or more', count(*) FROM per_topic WHERE published >= 10
UNION ALL
SELECT 'topics with any', count(*) FROM per_topic;

-- The per-topic breakdown, largest first.
SELECT topic, published FROM (
    SELECT t.name AS topic, count(*) AS published
    FROM (
        SELECT DISTINCT ON (qv.question_id) qv.question_id, qv.topic_id
        FROM core.question_version qv
        JOIN core.question q ON q.id = qv.question_id AND q.deleted_at IS NULL
        WHERE qv.status = 'PUBLISHED' AND qv.content_category = 'KERALA_PSC'
        ORDER BY qv.question_id, qv.version DESC
    ) l JOIN core.topic t ON t.id = l.topic_id GROUP BY t.name
) x ORDER BY published DESC, topic;
