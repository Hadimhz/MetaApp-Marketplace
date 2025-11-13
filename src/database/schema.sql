/**
 * Database Schema for MetaAppTrader
 *
 * This file defines the SQLite database schema for storing:
 * - Trading listings from MetaForge API (matching the structure from getAllListings())
 * - Tracked items (user preferences)
 * - Auto-purchase rules
 * - Posted listings (tracking what's been sent to Discord)
 */

-- ============================================================================
-- Table: listings
-- Stores all fetched trading listings from the MetaForge API
-- Structure matches the transformed data from index.js getAllListings()
-- ============================================================================
CREATE TABLE IF NOT EXISTS listings (
  -- Primary identification
  id TEXT PRIMARY KEY,                    -- Unique listing ID from MetaForge API
  type TEXT NOT NULL CHECK(type IN ('buy', 'sell')), -- Listing type
  user_id TEXT NOT NULL,                  -- MetaForge user ID
  status TEXT NOT NULL,                   -- Listing status (active, completed, cancelled)
  description TEXT,                       -- Optional user description

  -- What's being offered (selling)
  selling_id TEXT NOT NULL,               -- Item ID being offered
  selling_name TEXT NOT NULL,             -- Item display name
  selling_icon TEXT NOT NULL,             -- URL to item icon
  selling_amount INTEGER NOT NULL,        -- Quantity being offered

  -- What's wanted in return (buying)
  buying_id TEXT NOT NULL,                -- Item ID wanted (can be "assorted-seeds")
  buying_name TEXT NOT NULL,              -- Item display name (can be "Assorted Seeds")
  buying_icon TEXT NOT NULL,              -- URL to item icon
  buying_amount INTEGER NOT NULL,         -- Quantity wanted

  -- User profile information
  user_full_name TEXT NOT NULL,           -- User's full name
  user_username TEXT NOT NULL,            -- Username with discriminator (e.g., "user#1234")
  user_avatar_url TEXT,                   -- Discord/Twitch avatar URL (nullable)
  user_embark_id TEXT NOT NULL,           -- Embark game ID with discriminator

  -- Timestamps
  created_at TEXT NOT NULL,               -- ISO timestamp from MetaForge (when listing created)
  updated_at TEXT NOT NULL,               -- ISO timestamp from MetaForge (when listing updated)
  fetched_at TEXT NOT NULL,               -- ISO timestamp when we fetched it from API

  -- Discord tracking
  posted_to_discord INTEGER NOT NULL DEFAULT 0 -- Boolean: 0 = not posted, 1 = posted
);

-- Index for faster queries by type and creation date
CREATE INDEX IF NOT EXISTS idx_listings_type_created
  ON listings(type, created_at DESC);

-- Index for faster queries by posted status
CREATE INDEX IF NOT EXISTS idx_listings_posted
  ON listings(posted_to_discord);

-- Index for faster queries by selling item
CREATE INDEX IF NOT EXISTS idx_listings_selling_item
  ON listings(selling_id);

-- Index for faster queries by buying item
CREATE INDEX IF NOT EXISTS idx_listings_buying_item
  ON listings(buying_id);

-- Index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_listings_user
  ON listings(user_id);

-- ============================================================================
-- Table: tracked_items
-- Items that users want to monitor for new listings
-- ============================================================================
CREATE TABLE IF NOT EXISTS tracked_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,   -- Auto-increment ID
  item_id TEXT NOT NULL UNIQUE,           -- Item ID to track
  item_name TEXT NOT NULL,                -- Item name for display
  added_at TEXT NOT NULL                  -- ISO timestamp when added
);

-- ============================================================================
-- Table: auto_purchase_rules
-- Rules that trigger automatic purchase notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS auto_purchase_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,   -- Auto-increment ID
  rule_type TEXT NOT NULL CHECK(
    rule_type IN ('price_threshold', 'specific_item', 'manual_approval')
  ),                                      -- Type of rule
  item_id TEXT,                           -- Item to match (NULL for all items)
  max_seeds INTEGER,                      -- Maximum seeds price to trigger (NULL if not price-based)
  enabled INTEGER NOT NULL DEFAULT 1,     -- Boolean: 0 = disabled, 1 = enabled
  created_at TEXT NOT NULL                -- ISO timestamp when created
);

-- Index for faster queries by enabled status
CREATE INDEX IF NOT EXISTS idx_rules_enabled
  ON auto_purchase_rules(enabled);

-- Index for faster queries by item
CREATE INDEX IF NOT EXISTS idx_rules_item
  ON auto_purchase_rules(item_id);

-- ============================================================================
-- Table: posted_listings
-- Tracks which listings have been posted to Discord and where
-- ============================================================================
CREATE TABLE IF NOT EXISTS posted_listings (
  listing_id TEXT PRIMARY KEY,            -- References listings.id
  message_id TEXT NOT NULL,               -- Discord message ID
  channel_id TEXT NOT NULL,               -- Discord channel ID
  batch_number INTEGER NOT NULL,          -- Which batch this was part of
  batch_position INTEGER NOT NULL,        -- Position within batch (1-5)
  posted_at TEXT NOT NULL,                -- ISO timestamp when posted

  -- Foreign key constraint
  FOREIGN KEY (listing_id) REFERENCES listings(id)
    ON DELETE CASCADE
);

-- Index for faster queries by message ID (for button interactions)
CREATE INDEX IF NOT EXISTS idx_posted_message
  ON posted_listings(message_id);

-- Index for faster queries by batch
CREATE INDEX IF NOT EXISTS idx_posted_batch
  ON posted_listings(batch_number);
