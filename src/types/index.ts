/**
 * Type Definitions for MetaAppTrader Discord Bot
 *
 * This file contains all TypeScript interfaces and types used throughout the application.
 * Each interface is well-documented to explain its purpose and fields.
 */

// ============================================================================
// API Response Types (from MetaForge API)
// ============================================================================

/**
 * Represents an item in the Arc Raiders game
 */
export interface Item {
  id: string;                    // Unique item identifier (e.g., "iron-scrap")
  name: string;                  // Display name (e.g., "Iron Scrap")
  icon: string;                  // URL to item icon image
  rarity?: string;               // Item rarity (e.g., "legendary", "epic", "rare", "common")
  item_type?: string;            // Type of item (e.g., "resource", "weapon", "armor")
}

/**
 * User profile information from MetaForge
 */
export interface UserProfile {
  full_name: string;             // Full display name
  username: string;              // Username with discriminator (e.g., "user#1234")
  avatar_url?: string | null;    // Avatar URL (Discord, Twitch, etc.) - can be null
  embark_id: string;             // Embark game ID with discriminator
}

/**
 * Raw listing data from MetaForge API
 * This is the structure returned by the API before transformation
 */
export interface ApiListing {
  id: string;                    // Unique listing identifier
  listing_type: 'buy' | 'sell';  // Type of listing
  user_id: string;               // User who created the listing
  status: string;                // Listing status (e.g., "active", "completed", "cancelled")
  description: string | null;    // Optional description from user
  created_at: string;            // ISO timestamp when listing was created
  updated_at: string;            // ISO timestamp when listing was last updated

  // Item being traded
  item_id: string;               // ID of the item
  item: Item;                    // Full item details
  quantity: number;              // Amount of item

  // What's wanted in return
  price: number | null;          // Price in Assorted Seeds (null for barter trades)
  wanted_item_id: string | null; // ID of wanted item (for barter)
  wanted_item: Item | null;      // Full wanted item details (for barter)
  wanted_quantity: number | null;// Amount of wanted item (for barter)

  // User information
  user_profile: UserProfile;     // User who created the listing
}

/**
 * Transformed listing structure used internally
 * More convenient structure than the raw API response
 */
export interface Listing {
  id: string;                    // Unique listing identifier
  type: 'buy' | 'sell';          // Type of listing
  user_id: string;               // User who created the listing
  status: string;                // Listing status
  description: string | null;    // Optional description
  created_at: string;            // ISO timestamp when created
  updated_at: string;            // ISO timestamp when updated

  // What's being offered
  selling: {
    id: string;                  // Item ID
    amount: number;              // Quantity
    name: string;                // Item name
    icon: string;                // Item icon URL
    rarity?: string;             // Item rarity
  };

  // What's being requested
  buying: {
    id: string;                  // Item ID (or "assorted-seeds" for currency)
    amount: number;              // Quantity or price
    name: string;                // Item name (or "Assorted Seeds")
    icon: string;                // Item icon URL
    rarity?: string;             // Item rarity
  };

  user_profile: UserProfile;     // User information
}

// ============================================================================
// Database Model Types
// ============================================================================

/**
 * Listing record as stored in the database
 * Matches the schema in database/schema.sql
 */
export interface DbListing {
  id: string;                    // Listing ID (PRIMARY KEY)
  type: 'buy' | 'sell';          // Listing type
  user_id: string;               // User who created listing
  status: string;                // Listing status
  description: string | null;    // Optional user description

  // What's being offered (selling)
  selling_id: string;            // Item ID being offered
  selling_name: string;          // Item display name
  selling_icon: string;          // URL to item icon
  selling_amount: number;        // Quantity being offered

  // What's wanted in return (buying)
  buying_id: string;             // Item ID wanted (can be "assorted-seeds")
  buying_name: string;           // Item display name (can be "Assorted Seeds")
  buying_icon: string;           // URL to item icon
  buying_amount: number;         // Quantity wanted

  // User profile information
  user_full_name: string;        // User's full name
  user_username: string;         // Username with discriminator (e.g., "user#1234")
  user_avatar_url: string | null;// Discord/Twitch avatar URL (nullable)
  user_embark_id: string;        // Embark game ID with discriminator

  // Timestamps
  created_at: string;            // When listing was created on MetaForge
  updated_at: string;            // When listing was updated on MetaForge
  fetched_at: string;            // When we fetched it from API
  posted_to_discord: number;     // Boolean (0 or 1) - whether posted
}

/**
 * Tracked item record
 * Users can track specific items to get notifications
 */
export interface DbTrackedItem {
  id: number;                    // Auto-increment ID (PRIMARY KEY)
  item_id: string;               // Item ID to track
  item_name: string;             // Item name for display
  added_at: string;              // ISO timestamp when added
}

/**
 * Auto-purchase rule record
 * Rules that trigger automatic purchase notifications
 */
export interface DbAutoPurchaseRule {
  id: number;                    // Auto-increment ID (PRIMARY KEY)
  rule_type: 'price_threshold' | 'specific_item' | 'manual_approval';
  item_id: string | null;        // Item to match (null for all items)
  max_seeds: number | null;      // Maximum seeds price to trigger (null if not price-based)
  enabled: number;               // Boolean (0 or 1) - whether rule is active
  created_at: string;            // ISO timestamp when created
}

/**
 * Posted listing record
 * Tracks which listings have been posted to Discord
 */
export interface DbPostedListing {
  listing_id: string;            // Listing ID (PRIMARY KEY, references listings.id)
  message_id: string;            // Discord message ID
  channel_id: string;            // Discord channel ID
  batch_number: number;          // Which batch this was part of
  batch_position: number;        // Position within batch (1-5)
  posted_at: string;             // ISO timestamp when posted
}

// ============================================================================
// Discord-Related Types
// ============================================================================

/**
 * A batch of listings to post to Discord
 * Groups up to 5 listings together to avoid rate limits
 */
export interface ListingBatch {
  batch_number: number;          // Sequential batch number
  listings: Listing[];           // Array of listings (max 5)
  created_at: Date;              // When batch was created
}

/**
 * Data stored in Discord button custom IDs
 * Used to identify which listing a button corresponds to
 */
export interface ButtonData {
  action: 'buy';                 // Action type (currently only 'buy')
  listing_id: string;            // Listing ID
  batch_position: number;        // Position in batch (1-5)
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Application configuration loaded from environment variables
 */
export interface Config {
  discord: {
    token: string;               // Discord bot token
    channelId: string;           // Channel ID to post listings
  };
  polling: {
    interval: number;            // Polling interval in milliseconds (default: 5000)
  };
  database: {
    path: string;                // Path to SQLite database file
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'; // Log level
  };
  autoPurchase: {
    enabled: boolean;            // Whether auto-purchase alerts are enabled
  };
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Log level enum for the logger
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Log category for organizing logs
 */
export enum LogCategory {
  API = 'API',                   // API requests and responses
  DATABASE = 'DB',               // Database operations
  DISCORD = 'DISCORD',           // Discord events and messages
  BATCH = 'BATCH',               // Batch processing
  AUTO_PURCHASE = 'AUTO-BUY',    // Auto-purchase evaluations
  SYSTEM = 'SYSTEM',             // System events (startup, shutdown)
  ERROR = 'ERROR'                // Errors and exceptions
}

/**
 * Result type for operations that can fail
 * Generic type that wraps success or error states
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Auto-purchase evaluation result
 * Indicates whether a listing triggered any auto-purchase rules
 */
export interface AutoPurchaseEvaluation {
  triggered: boolean;            // Whether any rule was triggered
  rules: DbAutoPurchaseRule[];   // Rules that were triggered
  listing: Listing;              // The listing being evaluated
  reason?: string;               // Explanation of why triggered/not triggered
}

// ============================================================================
// Event System Types
// ============================================================================

/**
 * Event names for the bot's event emitter
 * These events are triggered at key points in the bot's lifecycle
 * You can listen to these events to implement custom logic
 */
export enum BotEvent {
  /** Emitted when the bot successfully starts up */
  BOT_READY = 'bot:ready',

  /** Emitted when a new listing is detected from the API */
  NEW_LISTING = 'listing:new',

  /** Emitted when multiple new listings are detected */
  NEW_LISTINGS_BATCH = 'listings:new_batch',

  /** Emitted when a listing is posted to Discord */
  LISTING_POSTED = 'listing:posted',

  /** Emitted when a batch of listings is posted to Discord */
  BATCH_POSTED = 'batch:posted',

  /** Emitted when a user clicks a "Buy" button in Discord */
  PURCHASE_BUTTON_CLICKED = 'purchase:button_clicked',

  /** Emitted when an error occurs */
  ERROR = 'error'
}

/**
 * Event payload for NEW_LISTING event
 */
export interface NewListingEvent {
  listing: Listing;              // The new listing that was detected
  timestamp: Date;               // When the listing was detected
}

/**
 * Event payload for NEW_LISTINGS_BATCH event
 */
export interface NewListingsBatchEvent {
  listings: Listing[];           // Array of new listings detected
  count: number;                 // Number of new listings
  timestamp: Date;               // When the batch was detected
}

/**
 * Event payload for PURCHASE_BUTTON_CLICKED event
 */
export interface PurchaseButtonClickedEvent {
  listing: Listing;              // The listing the button was for
  userId: string;                // Discord user ID who clicked the button
  username: string;              // Discord username who clicked
  messageId: string;             // Discord message ID
  timestamp: Date;               // When the button was clicked
}
