/**
 * Discord Bot
 *
 * Handles Discord client initialization and interactions:
 * - Bot startup and authentication
 * - Posting batched listings to Discord channels
 * - Handling button interactions for manual purchases
 * - Emitting events for custom purchase logic
 */

import {
  Client,
  GatewayIntentBits,
  TextChannel,
  Message,
  ButtonInteraction
} from 'discord.js';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { LogCategory, Listing, ListingBatch, PurchaseButtonClickedEvent } from '../types';
import {
  createListingBatches,
  createBatchEmbed,
  createBatchButtons,
  parseButtonCustomId,
  createPurchaseConfirmationMessage,
  createErrorMessage,
  recreateBatchEmbed
} from './formatters';
import { botEvents } from '../utils/events';
import {
  insertPostedListing,
  markListingsAsPosted,
  getListingByMessageId,
  getListingById
} from '../database/db';

/**
 * Discord client instance (singleton)
 */
let discordClient: Client | null = null;

/**
 * Initialize the Discord bot client
 * Sets up event handlers and authenticates with Discord
 *
 * @returns Promise that resolves when bot is ready
 */
export async function initializeDiscordBot(): Promise<Client> {
  logger.info(LogCategory.DISCORD, 'Initializing Discord bot...');

  // Create Discord client with necessary intents
  // GatewayIntentBits.Guilds: Required for accessing guilds (servers)
  // GatewayIntentBits.GuildMessages: Required for sending messages
  discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages
    ]
  });

  // Set up event handlers
  setupEventHandlers(discordClient);

  // Login to Discord
  logger.info(LogCategory.DISCORD, 'Logging in to Discord...');
  await discordClient.login(config.discord.token);

  // Wait for the bot to be ready
  await new Promise<void>((resolve) => {
    discordClient!.once('ready', () => resolve());
  });

  logger.info(LogCategory.DISCORD, `Discord bot is ready! Logged in as: ${discordClient.user?.tag}`);
  botEvents.emitBotReady();

  return discordClient;
}

/**
 * Get the Discord client instance
 * @throws Error if client is not initialized
 */
export function getDiscordClient(): Client {
  if (!discordClient) {
    throw new Error('Discord client not initialized. Call initializeDiscordBot() first.');
  }
  return discordClient;
}

/**
 * Set up Discord event handlers
 * @param client - Discord client instance
 */
function setupEventHandlers(client: Client): void {
  // Handle bot ready event
  client.on('ready', () => {
    if (!client.user) return;

    logger.info(LogCategory.DISCORD, `✅ Bot ready: ${client.user.tag}`);
    logger.info(LogCategory.DISCORD, `Bot ID: ${client.user.id}`);
    logger.info(LogCategory.DISCORD, `Guilds: ${client.guilds.cache.size}`);

    // Set bot presence/status
    client.user.setPresence({
      activities: [{ name: 'Arc Raiders Trading', type: 3 }], // Type 3 = "Watching"
      status: 'online'
    });
  });

  // Handle button interactions
  client.on('interactionCreate', async (interaction) => {
    // Only handle button interactions
    if (!interaction.isButton()) return;

    await handleButtonInteraction(interaction);
  });

  // Handle errors
  client.on('error', (error) => {
    logger.error(LogCategory.DISCORD, 'Discord client error:', error);
    botEvents.emitError(error, 'Discord Client');
  });

  // Handle warnings
  client.on('warn', (warning) => {
    logger.warn(LogCategory.DISCORD, `Discord warning: ${warning}`);
  });

  // Handle disconnections
  client.on('disconnect', () => {
    logger.warn(LogCategory.DISCORD, 'Discord client disconnected');
  });

  // Handle reconnections
  client.on('resume', () => {
    logger.info(LogCategory.DISCORD, 'Discord client reconnected');
  });
}

/**
 * Handle button interaction from Discord
 * Called when a user clicks a "Buy Item X" button
 *
 * @param interaction - Button interaction from Discord
 */
async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  try {
    logger.info(
      LogCategory.DISCORD,
      `Button clicked by ${interaction.user.tag}: ${interaction.customId}`
    );

    // Parse the button custom ID
    const buttonData = parseButtonCustomId(interaction.customId);

    if (!buttonData) {
      await interaction.reply({
        content: createErrorMessage('Invalid button. This listing may be outdated.'),
        ephemeral: true // Only visible to the user who clicked
      });
      return;
    }

    // Get the listing from database using message ID and batch position
    const listing = getListingByMessageId(interaction.message.id, buttonData.batch_position);

    if (!listing) {
      await interaction.reply({
        content: createErrorMessage('Listing not found. It may have been removed or is no longer available.'),
        ephemeral: true
      });
      return;
    }

    // Emit purchase button clicked event for custom logic
    const event: PurchaseButtonClickedEvent = {
      listing,
      userId: interaction.user.id,
      username: interaction.user.tag,
      messageId: interaction.message.id,
      timestamp: new Date()
    };

    botEvents.emitPurchaseButtonClicked(event);

    // Send confirmation message to user
    await interaction.reply({
      content: createPurchaseConfirmationMessage(/*listing, interaction.user.tag*/),
      ephemeral: true
    });

    logger.info(
      LogCategory.DISCORD,
      `Purchase intent registered for ${interaction.user.tag}: ${listing.selling.name} → ${listing.buying.name}`
    );
  } catch (error) {
    logger.error(LogCategory.DISCORD, 'Error handling button interaction:', error);

    // Try to send error message to user
    try {
      await interaction.reply({
        content: createErrorMessage('An error occurred while processing your request. Please try again.'),
        ephemeral: true
      });
    } catch (replyError) {
      logger.error(LogCategory.DISCORD, 'Failed to send error message to user:', replyError);
    }
  }
}

/**
 * Post a batch of listings to Discord
 * Creates a message with an embed and buttons for the batch
 *
 * @param batch - Listing batch to post
 * @param channelId - Discord channel ID to post to (defaults to config)
 * @returns Promise that resolves to the posted message, or null on error
 */
export async function postBatchToDiscord(
  batch: ListingBatch,
  channelId?: string
): Promise<Message | null> {
  try {
    const client = getDiscordClient();
    const targetChannelId = channelId || config.discord.channelId;

    logger.info(
      LogCategory.DISCORD,
      `Posting batch #${batch.batch_number} to channel ${targetChannelId}`
    );

    // Get the channel
    const channel = await client.channels.fetch(targetChannelId);

    if (!channel || !channel.isTextBased()) {
      logger.error(LogCategory.DISCORD, `Channel not found or not text-based: ${targetChannelId}`);
      return null;
    }

    // Create embed and buttons
    const embed = createBatchEmbed(batch);
    const buttons = createBatchButtons(batch);

    // Send message to Discord
    const message = await (channel as TextChannel).send({
      embeds: [embed],
      components: [buttons]
    });

    logger.info(
      LogCategory.DISCORD,
      `Posted batch #${batch.batch_number} successfully (Message ID: ${message.id})`
    );

    // Record the posted listings in database
    const listingIds: string[] = [];

    for (let i = 0; i < batch.listings.length; i++) {
      const listing = batch.listings[i];

      insertPostedListing({
        listing_id: listing.id,
        message_id: message.id,
        channel_id: targetChannelId,
        batch_number: batch.batch_number,
        batch_position: i + 1
      });

      listingIds.push(listing.id);
    }

    // Mark listings as posted
    markListingsAsPosted(listingIds);

    // Emit batch posted event
    botEvents.emitBatchPosted(batch.listings, batch.batch_number);

    // Emit individual listing posted events
    batch.listings.forEach((listing) => {
      botEvents.emitListingPosted(listing);
    });

    return message;
  } catch (error) {
    logger.error(
      LogCategory.DISCORD,
      `Error posting batch #${batch.batch_number}:`,
      error
    );
    botEvents.emitError(error as Error, 'postBatchToDiscord');
    return null;
  }
}

/**
 * Post multiple listings to Discord as batches
 * Automatically splits listings into batches of 5 and posts them
 *
 * @param listings - Array of listings to post
 * @param channelId - Discord channel ID to post to (defaults to config)
 * @returns Promise that resolves to number of batches posted successfully
 */
export async function postListingsToDiscord(
  listings: Listing[],
  channelId?: string
): Promise<number> {
  if (listings.length === 0) {
    logger.warn(LogCategory.DISCORD, 'No listings to post');
    return 0;
  }

  logger.info(LogCategory.DISCORD, `Posting ${listings.length} listings to Discord...`);

  // Create batches
  const batches = createListingBatches(listings);

  logger.info(LogCategory.DISCORD, `Created ${batches.length} batches`);

  let successCount = 0;

  // Post each batch with a small delay to avoid rate limits
  for (const batch of batches) {
    const message = await postBatchToDiscord(batch, channelId);

    if (message) {
      successCount++;

      // Wait 500ms between batches to avoid Discord rate limits
      // Discord allows ~50 messages per second, so this is very conservative
      if (successCount < batches.length) {
        logger.debug(LogCategory.DISCORD, 'Waiting 500ms before posting next batch...');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  logger.info(
    LogCategory.DISCORD,
    `Posted ${successCount}/${batches.length} batches successfully`
  );

  return successCount;
}

/**
 * Update a Discord message with updated listing statuses
 * Used when listing statuses change (e.g., to "in-progress")
 *
 * @param messageId - Discord message ID to update
 * @param channelId - Discord channel ID
 * @param listingIds - Array of listing IDs in this message (in order)
 * @param batchNumber - Original batch number
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function updateMessageWithStatus(
  messageId: string,
  channelId: string,
  listingIds: string[],
  batchNumber: number
): Promise<boolean> {
  try {
    const client = getDiscordClient();

    logger.info(LogCategory.DISCORD, `Updating message ${messageId} with status changes`);

    // Get the channel
    const channel = await client.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) {
      logger.error(LogCategory.DISCORD, `Channel not found or not text-based: ${channelId}`);
      return false;
    }

    // Get the message
    const message = await (channel as TextChannel).messages.fetch(messageId);

    if (!message) {
      logger.error(LogCategory.DISCORD, `Message not found: ${messageId}`);
      return false;
    }

    // Fetch updated listing data from database
    const updatedListings: Listing[] = [];
    for (const listingId of listingIds) {
      const listing = getListingById(listingId);
      if (listing) {
        updatedListings.push(listing);
      }
    }

    if (updatedListings.length === 0) {
      logger.warn(LogCategory.DISCORD, `No listings found for message ${messageId}`);
      return false;
    }

    // Recreate the embed with updated data
    const updatedEmbed = recreateBatchEmbed(updatedListings, batchNumber);

    // Keep the original buttons
    const originalButtons = message.components;

    // Edit the message
    await message.edit({
      embeds: [updatedEmbed],
      components: originalButtons
    });

    logger.info(LogCategory.DISCORD, `Successfully updated message ${messageId} with new status`);
    return true;
  } catch (error) {
    logger.error(LogCategory.DISCORD, `Error updating message ${messageId}:`, error);
    return false;
  }
}

/**
 * Disconnect the Discord bot
 */
export function disconnectDiscordBot(): void {
  if (discordClient) {
    logger.info(LogCategory.DISCORD, 'Disconnecting Discord bot...');
    discordClient.destroy();
    discordClient = null;
    logger.info(LogCategory.DISCORD, 'Discord bot disconnected');
  }
}
