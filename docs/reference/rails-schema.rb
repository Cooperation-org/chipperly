# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_09_16_160000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "account_memberships", force: :cascade do |t|
    t.integer "account_id", null: false
    t.datetime "created_at", null: false
    t.integer "role", default: 0, null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["account_id"], name: "index_account_memberships_on_account_id"
    t.index ["user_id", "account_id"], name: "index_account_memberships_on_user_id_and_account_id", unique: true
    t.index ["user_id"], name: "index_account_memberships_on_user_id"
  end

  create_table "accounts", force: :cascade do |t|
    t.integer "account_type", default: 0, null: false
    t.datetime "created_at", null: false
    t.integer "onboarding_step", default: 0, null: false
    t.boolean "self_managed", default: false, null: false
    t.string "stripe_customer_id"
    t.string "stripe_subscription_id"
    t.integer "subscriber", default: 0, null: false
    t.datetime "subscription_ends_at"
    t.datetime "updated_at", null: false
  end

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "activities", force: :cascade do |t|
    t.integer "chip_value"
    t.datetime "created_at", null: false
    t.integer "created_by_user_id"
    t.string "emoji"
    t.integer "frequency"
    t.string "location"
    t.string "name", null: false
    t.integer "profile_id", null: false
    t.string "recurrence"
    t.string "recurrence_time"
    t.json "skipped_dates", default: []
    t.datetime "updated_at", null: false
    t.index ["created_by_user_id"], name: "index_activities_on_created_by_user_id"
    t.index ["profile_id"], name: "index_activities_on_profile_id"
  end

  create_table "admin_defaults", force: :cascade do |t|
    t.integer "category", null: false
    t.datetime "created_at", null: false
    t.string "emoji"
    t.integer "frequency"
    t.string "name", null: false
    t.integer "position"
    t.datetime "updated_at", null: false
    t.index ["category", "position"], name: "index_admin_defaults_on_category_and_position"
  end

  create_table "choice_options", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "created_by_user_id"
    t.string "emoji"
    t.string "name", null: false
    t.integer "profile_id", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_user_id"], name: "index_choice_options_on_created_by_user_id"
    t.index ["profile_id"], name: "index_choice_options_on_profile_id"
  end

  create_table "events", force: :cascade do |t|
    t.integer "activity_id"
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.integer "created_by_user_id"
    t.integer "position"
    t.integer "profile_id", null: false
    t.bigint "routine_id"
    t.date "scheduled_date", null: false
    t.datetime "start_time"
    t.datetime "updated_at", null: false
    t.index ["activity_id"], name: "index_events_on_activity_id"
    t.index ["created_by_user_id"], name: "index_events_on_created_by_user_id"
    t.index ["profile_id", "scheduled_date", "position"], name: "index_events_on_profile_id_and_scheduled_date_and_position"
    t.index ["profile_id", "scheduled_date"], name: "index_events_on_profile_id_and_scheduled_date"
    t.index ["profile_id", "start_time"], name: "index_events_on_profile_id_and_start_time"
    t.index ["profile_id"], name: "index_events_on_profile_id"
    t.index ["routine_id"], name: "index_events_on_routine_id"
  end

  create_table "invites", force: :cascade do |t|
    t.datetime "accepted_at"
    t.integer "account_id"
    t.integer "account_type", default: 0, null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.string "email_address", null: false
    t.datetime "expires_at", null: false
    t.integer "invited_by_id", null: false
    t.json "profile_ids", default: []
    t.string "relationship_label"
    t.integer "role", default: 0, null: false
    t.integer "subscriber", default: 3, null: false
    t.string "token", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_invites_on_account_id"
    t.index ["email_address"], name: "index_invites_on_email_address"
    t.index ["invited_by_id"], name: "index_invites_on_invited_by_id"
    t.index ["token"], name: "index_invites_on_token", unique: true
  end

  create_table "location_photos", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "location_name", null: false
    t.integer "profile_id", null: false
    t.datetime "updated_at", null: false
    t.index ["profile_id", "location_name"], name: "index_location_photos_on_profile_id_and_location_name", unique: true
    t.index ["profile_id"], name: "index_location_photos_on_profile_id"
  end

  create_table "plans", force: :cascade do |t|
    t.integer "account_type", default: 0, null: false
    t.integer "amount_cents"
    t.datetime "created_at", null: false
    t.boolean "enabled", default: true, null: false
    t.string "key", null: false
    t.string "mode", null: false
    t.string "name", null: false
    t.string "note"
    t.string "period_label"
    t.string "stripe_price_id"
    t.integer "subscriber", default: 0, null: false
    t.string "subtitle"
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_plans_on_key", unique: true
  end

  create_table "profile_assignments", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "profile_id", null: false
    t.string "relationship_label"
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["profile_id"], name: "index_profile_assignments_on_profile_id"
    t.index ["user_id", "profile_id"], name: "index_profile_assignments_on_user_id_and_profile_id", unique: true
    t.index ["user_id"], name: "index_profile_assignments_on_user_id"
  end

  create_table "profiles", force: :cascade do |t|
    t.integer "account_id", null: false
    t.datetime "created_at", null: false
    t.string "emoji"
    t.json "first_then_state", default: {}
    t.json "locations", default: [{"name" => "Home", "emoji" => "🏠"}]
    t.string "name", null: false
    t.string "share_token"
    t.json "token_board_state", default: {}
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_profiles_on_account_id"
    t.index ["share_token"], name: "index_profiles_on_share_token", unique: true
  end

  create_table "rewards", force: :cascade do |t|
    t.integer "account_id"
    t.integer "chip_cost"
    t.datetime "created_at", null: false
    t.integer "created_by_user_id"
    t.string "emoji"
    t.string "location"
    t.string "name", null: false
    t.integer "profile_id"
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_rewards_on_account_id"
    t.index ["created_by_user_id"], name: "index_rewards_on_created_by_user_id"
    t.index ["profile_id"], name: "index_rewards_on_profile_id"
  end

  create_table "routine_step_completions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.bigint "event_id", null: false
    t.bigint "routine_step_id", null: false
    t.datetime "updated_at", null: false
    t.index ["event_id", "routine_step_id"], name: "index_step_completions_on_event_and_step", unique: true
    t.index ["event_id"], name: "index_routine_step_completions_on_event_id"
    t.index ["routine_step_id"], name: "index_routine_step_completions_on_routine_step_id"
  end

  create_table "routine_steps", force: :cascade do |t|
    t.bigint "activity_id", null: false
    t.datetime "created_at", null: false
    t.integer "position"
    t.bigint "routine_id", null: false
    t.datetime "updated_at", null: false
    t.index ["activity_id"], name: "index_routine_steps_on_activity_id"
    t.index ["routine_id"], name: "index_routine_steps_on_routine_id"
  end

  create_table "routines", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "emoji"
    t.string "name"
    t.bigint "profile_id", null: false
    t.string "recurrence"
    t.string "recurrence_time"
    t.json "skipped_dates", default: []
    t.datetime "updated_at", null: false
    t.index ["profile_id"], name: "index_routines_on_profile_id"
  end

  create_table "sessions", force: :cascade do |t|
    t.string "api_token"
    t.datetime "created_at", null: false
    t.string "ip_address"
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.integer "user_id", null: false
    t.index ["api_token"], name: "index_sessions_on_api_token", unique: true
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "site_settings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.string "value"
    t.index ["key"], name: "index_site_settings_on_key", unique: true
  end

  create_table "social_stories", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "emoji"
    t.integer "position"
    t.integer "status", default: 0, null: false
    t.integer "story_type", default: 0, null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["status", "position"], name: "index_social_stories_on_status_and_position"
  end

  create_table "social_story_pages", force: :cascade do |t|
    t.text "caption"
    t.datetime "created_at", null: false
    t.string "emoji"
    t.integer "position", null: false
    t.integer "social_story_id", null: false
    t.datetime "updated_at", null: false
    t.index ["social_story_id", "position"], name: "index_social_story_pages_on_social_story_id_and_position"
    t.index ["social_story_id"], name: "index_social_story_pages_on_social_story_id"
  end

  create_table "users", force: :cascade do |t|
    t.integer "account_id"
    t.datetime "created_at", null: false
    t.string "email_address", null: false
    t.datetime "email_verified_at"
    t.string "first_name"
    t.string "last_name"
    t.string "lock_password_digest"
    t.string "password_digest", null: false
    t.integer "role", default: 2, null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_users_on_account_id"
    t.index ["email_address"], name: "index_users_on_email_address", unique: true
  end

  add_foreign_key "account_memberships", "accounts"
  add_foreign_key "account_memberships", "users"
  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "activities", "profiles"
  add_foreign_key "activities", "users", column: "created_by_user_id"
  add_foreign_key "choice_options", "profiles"
  add_foreign_key "choice_options", "users", column: "created_by_user_id"
  add_foreign_key "events", "activities"
  add_foreign_key "events", "profiles"
  add_foreign_key "events", "routines"
  add_foreign_key "events", "users", column: "created_by_user_id"
  add_foreign_key "invites", "accounts"
  add_foreign_key "invites", "users", column: "invited_by_id"
  add_foreign_key "location_photos", "profiles"
  add_foreign_key "profile_assignments", "profiles"
  add_foreign_key "profile_assignments", "users"
  add_foreign_key "profiles", "accounts"
  add_foreign_key "rewards", "accounts"
  add_foreign_key "rewards", "profiles"
  add_foreign_key "rewards", "users", column: "created_by_user_id"
  add_foreign_key "routine_step_completions", "events"
  add_foreign_key "routine_step_completions", "routine_steps"
  add_foreign_key "routine_steps", "activities"
  add_foreign_key "routine_steps", "routines"
  add_foreign_key "routines", "profiles"
  add_foreign_key "sessions", "users"
  add_foreign_key "social_story_pages", "social_stories"
  add_foreign_key "users", "accounts"
end
