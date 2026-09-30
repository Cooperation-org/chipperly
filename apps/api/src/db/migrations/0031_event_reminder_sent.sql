CREATE TABLE "event_reminder_sent" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sent_for" date NOT NULL,
	CONSTRAINT "event_reminder_sent_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
