/**
 * Discord Message Formatters
 *
 * Handles formatting of listings for Discord messages:
 * - Batches listings into groups of 5 to avoid rate limits
 * - Creates rich embeds with item information
 * - Generates interactive buttons for manual purchases
 *
 * Each message contains up to 5 listings numbered 1-5,
 * with corresponding "Buy Item X" buttons at the bottom.
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Listing, ListingBatch, ButtonData } from '../types';
import { logger } from '../utils/logger';
import { LogCategory } from '../types';

/**
 * Maximum number of listings per Discord message
 * Discord has rate limits, so we batch listings to avoid hitting them
 */
const LISTINGS_PER_BATCH = 5;

/**
 * Emoji indicators for listing types
 */
const LISTING_TYPE_EMOJI = {
  sell: '📤',
  buy: '📥'
};

/**
 * Emoji numbers for listing positions (1-5)
 */
const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

/**
 * Status badge emojis and formatting
 */
const STATUS_BADGES = {
  active: '🟢 **ACTIVE**',
  'in-progress': '🟡 **IN PROGRESS**',
  completed: '✅ **COMPLETED**',
  cancelled: '❌ **CANCELLED**'
};

/**
 * Create batches of listings for Discord posting
 * Groups listings into arrays of up to 5 items each
 *
 * @param listings - Array of listings to batch
 * @returns Array of listing batches
 */
export function createListingBatches(listings: Listing[]): ListingBatch[] {
  logger.info(LogCategory.BATCH, `Creating batches from ${listings.length} listings`);

  const batches: ListingBatch[] = [];
  let batchNumber = 1;

  // Split listings into chunks of LISTINGS_PER_BATCH
  for (let i = 0; i < listings.length; i += LISTINGS_PER_BATCH) {
    const batchListings = listings.slice(i, i + LISTINGS_PER_BATCH);

    batches.push({
      batch_number: batchNumber,
      listings: batchListings,
      created_at: new Date()
    });

    logger.debug(
      LogCategory.BATCH,
      `Created batch #${batchNumber} with ${batchListings.length} listings`
    );

    batchNumber++;
  }

  logger.info(LogCategory.BATCH, `Created ${batches.length} batches`);

  return batches;
}

/**
 * Convert ISO timestamp to Discord relative timestamp format
 * Discord will automatically display this as "X minutes ago" in the user's timezone
 * @param isoTimestamp - ISO timestamp string
 * @returns Discord timestamp format <t:UNIX:R>
 */
function formatDiscordTimestamp(isoTimestamp: string): string {
  const timestamp = Math.floor(new Date(isoTimestamp).getTime() / 1000);
  return `<t:${timestamp}:R>`;
}

/**
 * Format a single listing as a text entry for the embed
 * @param listing - Listing to format
 * @param position - Position in batch (1-5)
 * @returns Formatted string for the listing
 */
function formatListingEntry(listing: Listing, position: number): string {
  const emoji = NUMBER_EMOJIS[position - 1];
  const typeEmoji = LISTING_TYPE_EMOJI[listing.type];
  const timestamp = formatDiscordTimestamp(listing.created_at);

  // Determine if this is a seed trade
  const isSeedTrade = listing.buying.id === 'assorted-seeds' || listing.selling.id === 'assorted-seeds';

  // Get status badge
  const statusBadge = STATUS_BADGES[listing.status as keyof typeof STATUS_BADGES] || `**${listing.status.toUpperCase()}**`;

  // Build the listing display
  let result = `${emoji} **${typeEmoji} ${listing.type.toUpperCase()}** • ${statusBadge}\n`;
  result += `┣ **Offering:** ${listing.selling.name} ×${listing.selling.amount}\n`;
  result += `┣ **Wanting:** ${listing.buying.name} ×${listing.buying.amount}`;

  // Add seed indicator if applicable
  if (isSeedTrade) {
    result += ' 💰';
  }

  result += `\n┣ **Seller:** \`${listing.user_profile.username}\``;
  result += `\n┗ **Posted:** ${timestamp}`;

  // Add description if present
  if (listing.description) {
    result += `\n   💬 _"${listing.description}"_`;
  }

  return result;
}

/**
 * Create a Discord embed for a batch of listings
 * @param batch - Listing batch to format
 * @returns Discord EmbedBuilder
 */
export function createBatchEmbed(batch: ListingBatch): EmbedBuilder {
  logger.debug(LogCategory.DISCORD, `Creating embed for batch #${batch.batch_number}`);

  // Build the description with all listings
  const description = batch.listings
    .map((listing, index) => formatListingEntry(listing, index + 1))
    .join('\n\n');

  // Create embed with blue color
  const embed = new EmbedBuilder()
    .setColor(0x5865F2) // Discord Blurple color
    .setTitle(`📋 New Listings (Batch #${batch.batch_number})`)
    .setDescription(description)
    .setTimestamp(batch.created_at)
    .setFooter({
      text: `${batch.listings.length} listing${batch.listings.length !== 1 ? 's' : ''} • Click buttons below to purchase`
    });

  return embed;
}

/**
 * Create action row with buy buttons for a batch
 * Creates numbered buttons (Buy Item 1, Buy Item 2, etc.)
 *
 * @param batch - Listing batch
 * @returns ActionRowBuilder with buttons
 */
export function createBatchButtons(batch: ListingBatch): ActionRowBuilder<ButtonBuilder> {
  logger.debug(LogCategory.DISCORD, `Creating buttons for batch #${batch.batch_number}`);

  const buttons: ButtonBuilder[] = [];

  // Create a button for each listing in the batch
  for (let i = 0; i < batch.listings.length; i++) {
    const listing = batch.listings[i];
    const position = i + 1;

    // Discord custom IDs are limited to 100 characters
    // Format: buy:listingId:position
    const customId = `buy:${listing.id}:${position}`;

    // Create button with emoji number and label
    const button = new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(`Buy Item ${position}`)
      .setStyle(ButtonStyle.Primary)
      .setEmoji(NUMBER_EMOJIS[i]);

    buttons.push(button);
  }

  // Discord allows up to 5 buttons per action row
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

  return actionRow;
}

/**
 * Parse a button custom ID to extract button data
 * @param customId - Button custom ID (format: "buy:listingId:position")
 * @returns ButtonData object or null if invalid
 */
export function parseButtonCustomId(customId: string): ButtonData | null {
  try {
    const parts = customId.split(':');

    if (parts.length !== 3 || parts[0] !== 'buy') {
      logger.warn(LogCategory.DISCORD, `Invalid button custom ID format: ${customId}`);
      return null;
    }

    return {
      action: 'buy',
      listing_id: parts[1],
      batch_position: parseInt(parts[2], 10)
    };
  } catch (error) {
    logger.error(LogCategory.DISCORD, `Error parsing button custom ID: ${customId}`, error);
    return null;
  }
}

/**
 * Create a formatted message for button interaction response
 * This is sent as an ephemeral reply when a user clicks a buy button
 *
 * @param listing - The listing that was clicked
 * @param username - Discord username who clicked
 * @returns Formatted message string
 */
export function createPurchaseConfirmationMessage(/*listing: Listing, username: string*/): string {
  // const trade = `${listing.selling.name} (${listing.selling.amount}x) → ${listing.buying.name} (${listing.buying.amount}x)`;

  return `Feature not available`;
}

/**
 * Create an error message for button interactions
 * @param error - Error message
 * @returns Formatted error message
 */
export function createErrorMessage(error: string): string {
  return `❌ **Error**\n\n${error}`;
}

/**
 * Recreate a batch embed with updated listing data
 * Used when editing messages to show status updates
 *
 * @param listings - Array of listings (updated data)
 * @param batchNumber - Original batch number
 * @returns Discord EmbedBuilder
 */
export function recreateBatchEmbed(listings: Listing[], batchNumber: number): EmbedBuilder {
  logger.debug(LogCategory.DISCORD, `Recreating embed for batch #${batchNumber} with updated data`);

  // Build the description with all listings
  const description = listings
    .map((listing, index) => formatListingEntry(listing, index + 1))
    .join('\n\n');

  // Create embed with blue color
  const embed = new EmbedBuilder()
    .setColor(0x5865F2) // Discord Blurple color
    .setTitle(`📋 New Listings (Batch #${batchNumber})`)
    .setDescription(description)
    .setTimestamp(new Date())
    .setFooter({
      text: `${listings.length} listing${listings.length !== 1 ? 's' : ''} • Status updates shown in real-time`
    });

  return embed;
}
