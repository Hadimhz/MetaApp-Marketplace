/**
 * Database Layer
 *
 * Handles all SQLite database operations including:
 * - Database initialization and schema creation
 * - Listing CRUD operations
 * - Tracked items management
 * - Auto-purchase rules management
 * - Posted listings tracking
 *
 * All database operations are logged for debugging and monitoring.
 */

import Database from 'better-sqlite3';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../utils/logger';
import { LogCategory, Listing, DbListing, DbTrackedItem, DbAutoPurchaseRule, DbPostedListing } from '../types';
import { config } from '../utils/config';

/**
 * Database instance (singleton)
 */
let db: Database.Database | null = null;

/**
 * Initialize the database connection and create tables
 * This should be called once when the application starts
 *
 * @returns Database instance
 */
export function initializeDatabase(): Database.Database {
  logger.info(LogCategory.DATABASE, `Initializing database at: ${config.database.path}`);

  try {
    // Create data directory if it doesn't exist
    const dbDir = dirname(config.database.path);
    if (!existsSync(dbDir)) {
      logger.info(LogCategory.DATABASE, `Creating database directory: ${dbDir}`);
      mkdirSync(dbDir, { recursive: true });
    }

    // Create database connection
    db = new Database(config.database.path);

    logger.info(LogCategory.DATABASE, 'Database connection established');

    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    logger.debug(LogCategory.DATABASE, 'Foreign keys enabled');

    // Load and execute schema SQL
    const schemaPath = join(__dirname, 'schema.sql');
    logger.info(LogCategory.DATABASE, `Loading schema from: ${schemaPath}`);

    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    logger.info(LogCategory.DATABASE, 'Database schema created successfully');

    // Log table counts for debugging
    logTableCounts();

    return db;
  } catch (error) {
    logger.error(LogCategory.DATABASE, 'Failed to initialize database', error);
    throw error;
  }
}

/**
 * Get the database instance
 * @throws Error if database is not initialized
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    logger.info(LogCategory.DATABASE, 'Closing database connection');
    db.close();
    db = null;
  }
}

/**
 * Log current row counts for all tables (for debugging)
 */
function logTableCounts(): void {
  if (!db) return;

  const tables = ['listings', 'tracked_items', 'auto_purchase_rules', 'posted_listings'];

  tables.forEach((table) => {
    const result = db!.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
    logger.debug(LogCategory.DATABASE, `Table '${table}' has ${result.count} rows`);
  });
}

// ============================================================================
// Listing Operations
// ============================================================================

/**
 * Convert Listing type to DbListing type for database insertion
 * @param listing - Listing from API
 * @returns Database-compatible listing object
 */
function listingToDbListing(listing: Listing): Omit<DbListing, 'fetched_at' | 'posted_to_discord'> {
  return {
    id: listing.id,
    type: listing.type,
    user_id: listing.user_id,
    status: listing.status,
    description: listing.description,

    selling_id: listing.selling.id,
    selling_name: listing.selling.name,
    selling_icon: listing.selling.icon,
    selling_amount: listing.selling.amount,

    buying_id: listing.buying.id,
    buying_name: listing.buying.name,
    buying_icon: listing.buying.icon,
    buying_amount: listing.buying.amount,

    user_full_name: listing.user_profile.full_name,
    user_username: listing.user_profile.username,
    user_avatar_url: listing.user_profile.avatar_url || null,
    user_embark_id: listing.user_profile.embark_id,

    created_at: listing.created_at,
    updated_at: listing.updated_at
  };
}

/**
 * Convert DbListing back to Listing type
 * @param dbListing - Listing from database
 * @returns API-compatible listing object
 */
function dbListingToListing(dbListing: DbListing): Listing {
  return {
    id: dbListing.id,
    type: dbListing.type,
    user_id: dbListing.user_id,
    status: dbListing.status,
    description: dbListing.description,

    selling: {
      id: dbListing.selling_id,
      name: dbListing.selling_name,
      icon: dbListing.selling_icon,
      amount: dbListing.selling_amount
    },

    buying: {
      id: dbListing.buying_id,
      name: dbListing.buying_name,
      icon: dbListing.buying_icon,
      amount: dbListing.buying_amount
    },

    user_profile: {
      full_name: dbListing.user_full_name,
      username: dbListing.user_username,
      avatar_url: dbListing.user_avatar_url || undefined,
      embark_id: dbListing.user_embark_id
    },

    created_at: dbListing.created_at,
    updated_at: dbListing.updated_at
  };
}

/**
 * Insert a single listing into the database
 * @param listing - Listing to insert
 * @returns True if inserted, false if already exists
 */
export function insertListing(listing: Listing): boolean {
  const database = getDatabase();

  try {
    const dbListing = listingToDbListing(listing);
    const now = new Date().toISOString();

    const stmt = database.prepare(`
      INSERT INTO listings (
        id, type, user_id, status, description,
        selling_id, selling_name, selling_icon, selling_amount,
        buying_id, buying_name, buying_icon, buying_amount,
        user_full_name, user_username, user_avatar_url, user_embark_id,
        created_at, updated_at, fetched_at, posted_to_discord
      ) VALUES (
        @id, @type, @user_id, @status, @description,
        @selling_id, @selling_name, @selling_icon, @selling_amount,
        @buying_id, @buying_name, @buying_icon, @buying_amount,
        @user_full_name, @user_username, @user_avatar_url, @user_embark_id,
        @created_at, @updated_at, @fetched_at, 0
      )
    `);

    stmt.run({
      ...dbListing,
      fetched_at: now
    });

    logger.debug(LogCategory.DATABASE, `Inserted listing: ${listing.id}`);
    return true;
  } catch (error: any) {
    // If it's a unique constraint error, the listing already exists
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      logger.debug(LogCategory.DATABASE, `Listing already exists: ${listing.id}`);
      return false;
    }

    logger.error(LogCategory.DATABASE, `Error inserting listing: ${listing.id}`, error);
    throw error;
  }
}

/**
 * Insert multiple listings into the database
 * @param listings - Array of listings to insert
 * @returns Number of listings inserted (excludes duplicates)
 */
export function insertListings(listings: Listing[]): number {
  logger.info(LogCategory.DATABASE, `Inserting ${listings.length} listings...`);

  let insertedCount = 0;

  for (const listing of listings) {
    if (insertListing(listing)) {
      insertedCount++;
    }
  }

  logger.info(LogCategory.DATABASE, `Inserted ${insertedCount} new listings (${listings.length - insertedCount} duplicates skipped)`);

  return insertedCount;
}

/**
 * Get listings that haven't been posted to Discord yet
 * @param limit - Maximum number of listings to return (optional)
 * @returns Array of unposted listings, sorted by created_at (newest first)
 */
export function getUnpostedListings(limit?: number): Listing[] {
  const database = getDatabase();

  logger.debug(LogCategory.DATABASE, `Fetching unposted listings${limit ? ` (limit: ${limit})` : ''}`);

  const query = `
    SELECT * FROM listings
    WHERE posted_to_discord = 0
    ORDER BY created_at DESC
    ${limit ? `LIMIT ${limit}` : ''}
  `;

  const rows = database.prepare(query).all() as DbListing[];

  logger.info(LogCategory.DATABASE, `Found ${rows.length} unposted listings`);

  return rows.map(dbListingToListing);
}

/**
 * Check if a listing exists in the database
 * @param listingId - Listing ID to check
 * @returns True if listing exists, false otherwise
 */
export function listingExists(listingId: string): boolean {
  const database = getDatabase();

  const result = database.prepare('SELECT 1 FROM listings WHERE id = ?').get(listingId);

  return result !== undefined;
}

/**
 * Get a listing by ID
 * @param listingId - Listing ID
 * @returns Listing if found, null otherwise
 */
export function getListingById(listingId: string): Listing | null {
  const database = getDatabase();

  const row = database.prepare('SELECT * FROM listings WHERE id = ?').get(listingId) as DbListing | undefined;

  if (!row) {
    logger.debug(LogCategory.DATABASE, `Listing not found: ${listingId}`);
    return null;
  }

  return dbListingToListing(row);
}

/**
 * Mark a listing as posted to Discord
 * @param listingId - Listing ID to mark as posted
 */
export function markListingAsPosted(listingId: string): void {
  const database = getDatabase();

  const stmt = database.prepare('UPDATE listings SET posted_to_discord = 1 WHERE id = ?');
  const result = stmt.run(listingId);

  if (result.changes > 0) {
    logger.debug(LogCategory.DATABASE, `Marked listing as posted: ${listingId}`);
  } else {
    logger.warn(LogCategory.DATABASE, `Failed to mark listing as posted (not found): ${listingId}`);
  }
}

/**
 * Mark multiple listings as posted to Discord
 * @param listingIds - Array of listing IDs to mark as posted
 */
export function markListingsAsPosted(listingIds: string[]): void {
  if (listingIds.length === 0) return;

  const database = getDatabase();

  logger.info(LogCategory.DATABASE, `Marking ${listingIds.length} listings as posted`);

  const placeholders = listingIds.map(() => '?').join(',');
  const stmt = database.prepare(`UPDATE listings SET posted_to_discord = 1 WHERE id IN (${placeholders})`);
  const result = stmt.run(...listingIds);

  logger.info(LogCategory.DATABASE, `Marked ${result.changes} listings as posted`);
}

// ============================================================================
// Posted Listings Operations
// ============================================================================

/**
 * Record that a listing was posted to Discord
 * @param postedListing - Posted listing record
 */
export function insertPostedListing(postedListing: Omit<DbPostedListing, 'posted_at'>): void {
  const database = getDatabase();

  try {
    const now = new Date().toISOString();

    const stmt = database.prepare(`
      INSERT INTO posted_listings (
        listing_id, message_id, channel_id, batch_number, batch_position, posted_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      postedListing.listing_id,
      postedListing.message_id,
      postedListing.channel_id,
      postedListing.batch_number,
      postedListing.batch_position,
      now
    );

    logger.debug(LogCategory.DATABASE, `Recorded posted listing: ${postedListing.listing_id} in batch ${postedListing.batch_number}`);
  } catch (error: any) {
    // If it's a unique constraint error, the listing was already posted - that's okay, just log it
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      logger.debug(LogCategory.DATABASE, `Listing already recorded as posted: ${postedListing.listing_id}`);
      return;
    }

    logger.error(LogCategory.DATABASE, `Error recording posted listing: ${postedListing.listing_id}`, error);
    throw error;
  }
}

/**
 * Get listing by Discord message ID
 * Useful for handling button clicks
 *
 * @param messageId - Discord message ID
 * @param batchPosition - Position within the batch (1-5)
 * @returns Listing if found, null otherwise
 */
export function getListingByMessageId(messageId: string, batchPosition: number): Listing | null {
  const database = getDatabase();

  logger.debug(LogCategory.DATABASE, `Looking up listing by message ID: ${messageId}, position: ${batchPosition}`);

  const query = `
    SELECT l.* FROM listings l
    INNER JOIN posted_listings pl ON l.id = pl.listing_id
    WHERE pl.message_id = ? AND pl.batch_position = ?
  `;

  const row = database.prepare(query).get(messageId, batchPosition) as DbListing | undefined;

  if (!row) {
    logger.warn(LogCategory.DATABASE, `Listing not found for message: ${messageId}, position: ${batchPosition}`);
    return null;
  }

  return dbListingToListing(row);
}

// ============================================================================
// Tracked Items Operations
// ============================================================================

/**
 * Add an item to the tracked items list
 * @param itemId - Item ID to track
 * @param itemName - Item name
 * @returns True if added, false if already tracked
 */
export function addTrackedItem(itemId: string, itemName: string): boolean {
  const database = getDatabase();

  try {
    const now = new Date().toISOString();

    const stmt = database.prepare(`
      INSERT INTO tracked_items (item_id, item_name, added_at)
      VALUES (?, ?, ?)
    `);

    stmt.run(itemId, itemName, now);

    logger.info(LogCategory.DATABASE, `Added tracked item: ${itemName} (${itemId})`);
    return true;
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      logger.debug(LogCategory.DATABASE, `Item already tracked: ${itemId}`);
      return false;
    }

    logger.error(LogCategory.DATABASE, `Error adding tracked item: ${itemId}`, error);
    throw error;
  }
}

/**
 * Get all tracked items
 * @returns Array of tracked items
 */
export function getTrackedItems(): DbTrackedItem[] {
  const database = getDatabase();

  const rows = database.prepare('SELECT * FROM tracked_items ORDER BY added_at DESC').all() as DbTrackedItem[];

  logger.debug(LogCategory.DATABASE, `Retrieved ${rows.length} tracked items`);

  return rows;
}

/**
 * Remove an item from the tracked items list
 * @param itemId - Item ID to remove
 * @returns True if removed, false if not found
 */
export function removeTrackedItem(itemId: string): boolean {
  const database = getDatabase();

  const stmt = database.prepare('DELETE FROM tracked_items WHERE item_id = ?');
  const result = stmt.run(itemId);

  if (result.changes > 0) {
    logger.info(LogCategory.DATABASE, `Removed tracked item: ${itemId}`);
    return true;
  } else {
    logger.warn(LogCategory.DATABASE, `Tracked item not found: ${itemId}`);
    return false;
  }
}

// ============================================================================
// Auto-Purchase Rules Operations
// ============================================================================

/**
 * Get all enabled auto-purchase rules
 * @returns Array of enabled rules
 */
export function getEnabledAutoPurchaseRules(): DbAutoPurchaseRule[] {
  const database = getDatabase();

  const rows = database.prepare('SELECT * FROM auto_purchase_rules WHERE enabled = 1').all() as DbAutoPurchaseRule[];

  logger.debug(LogCategory.DATABASE, `Retrieved ${rows.length} enabled auto-purchase rules`);

  return rows;
}

/**
 * Add an auto-purchase rule
 * @param rule - Rule to add (without id and created_at)
 * @returns The ID of the newly created rule
 */
export function addAutoPurchaseRule(
  rule: Omit<DbAutoPurchaseRule, 'id' | 'created_at'>
): number {
  const database = getDatabase();

  const now = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO auto_purchase_rules (rule_type, item_id, max_seeds, enabled, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    rule.rule_type,
    rule.item_id,
    rule.max_seeds,
    rule.enabled,
    now
  );

  const ruleId = result.lastInsertRowid as number;

  logger.info(LogCategory.DATABASE, `Added auto-purchase rule: ${rule.rule_type} (ID: ${ruleId})`);

  return ruleId;
}

/**
 * Delete an auto-purchase rule
 * @param ruleId - Rule ID to delete
 * @returns True if deleted, false if not found
 */
export function deleteAutoPurchaseRule(ruleId: number): boolean {
  const database = getDatabase();

  const stmt = database.prepare('DELETE FROM auto_purchase_rules WHERE id = ?');
  const result = stmt.run(ruleId);

  if (result.changes > 0) {
    logger.info(LogCategory.DATABASE, `Deleted auto-purchase rule: ${ruleId}`);
    return true;
  } else {
    logger.warn(LogCategory.DATABASE, `Auto-purchase rule not found: ${ruleId}`);
    return false;
  }
}

/**
 * Enable or disable an auto-purchase rule
 * @param ruleId - Rule ID
 * @param enabled - Whether to enable or disable
 */
export function setAutoPurchaseRuleEnabled(ruleId: number, enabled: boolean): void {
  const database = getDatabase();

  const stmt = database.prepare('UPDATE auto_purchase_rules SET enabled = ? WHERE id = ?');
  const result = stmt.run(enabled ? 1 : 0, ruleId);

  if (result.changes > 0) {
    logger.info(LogCategory.DATABASE, `${enabled ? 'Enabled' : 'Disabled'} auto-purchase rule: ${ruleId}`);
  } else {
    logger.warn(LogCategory.DATABASE, `Auto-purchase rule not found: ${ruleId}`);
  }
}
