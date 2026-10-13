UPDATE "accounts" AS a
SET "name" = p."name"
FROM (
	SELECT DISTINCT ON ("account_id") "account_id", "name"
	FROM "profiles"
	WHERE "deleted_at" IS NULL
	ORDER BY "account_id", "id"
) AS p
WHERE a."id" = p."account_id" AND a."kind" = 'supported' AND a."name" = 'Someone I support';
