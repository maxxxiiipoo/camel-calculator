import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const leaderboardEntries = sqliteTable("leaderboard_entries", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  camelCount: integer("camel_count").notNull(),
  sortableScore: integer("sortable_score").notNull(),
  photoKey: text("photo_key").notNull(),
  consentedAt: text("consented_at").notNull(),
  submittedAt: text("submitted_at").notNull(),
}, (table) => [
  index("idx_leaderboard_score_submitted").on(table.sortableScore, table.submittedAt),
]);
