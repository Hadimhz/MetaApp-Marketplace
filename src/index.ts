/**
 * MetaAppTrader - Main Entry Point
 *
 * Discord bot that monitors MetaForge Arc Raiders trading listings.
 * Polls the API every 5 seconds, detects new listings, and posts them to Discord
 * with interactive buttons for manual purchases.
 *
 * Features:
 * - Real-time monitoring of buy/sell listings
 * - Batched Discord messages (5 items per message) to avoid rate limits
 * - SQLite database for tracking seen listings
 * - Event system for custom purchase logic hooks
 * - Comprehensive logging at every step
 */

import * as cron from 'node-cron';
import { logger } from './utils/logger';
import { LogCategory } from './types';
import { config } from './utils/config';
import { initializeDatabase, closeDatabase, insertListings, listingExists, getPostedListings, updateListingStatus } from './database/db';
import { initializeDiscordBot, disconnectDiscordBot, postListingsToDiscord, updateMessageWithStatus } from './bot/discord';
import { getAllListings, getNewListings } from './api/metaforge';
import { botEvents } from './utils/events';
import { initializeCustomPurchaseLogic } from './custom-purchase-logic';

/**
 * Cron job handle for the polling scheduler
 */
let pollingJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Track if we're currently processing to avoid overlapping polls
 */
let isProcessing = false;

/**
 * Track total statistics
 */
const stats = {
  totalPollsCompleted: 0,
  totalListingsFetched: 0,
  totalNewListingsDetected: 0,
  totalBatchesPosted: 0,
  startTime: new Date()
};

/**
 * Check for status changes in posted listings and update Discord messages
 * @param fetchedListings - Latest listings from API
 */
async function checkStatusChanges(fetchedListings: Map<string, any>): Promise<void> {
  try {
    logger.debug(LogCategory.SYSTEM, 'Checking for status changes in posted listings...');

    // Get all posted listings from database
    const postedListings = getPostedListings();

    if (postedListings.length === 0) {
      logger.debug(LogCategory.SYSTEM, 'No posted listings to check for status changes');
      return;
    }

    // Group by message ID to batch updates
    const messageGroups = new Map<string, {
      channelId: string;
      batchNumber: number;
      listings: Array<{ id: string; position: number }>
    }>();

    let statusChangedCount = 0;

    // Check each posted listing for status changes
    for (const { listing, postedInfo } of postedListings) {
      const apiListing = fetchedListings.get(listing.id);

      if (apiListing && apiListing.status !== listing.status) {
        logger.info(
          LogCategory.SYSTEM,
          `Status change detected for listing ${listing.id}: ${listing.status} → ${apiListing.status}`
        );

        // Update database with new status
        updateListingStatus(listing.id, apiListing.status, apiListing.updated_at);
        statusChangedCount++;

        // Group by message for batch update
        if (!messageGroups.has(postedInfo.message_id)) {
          messageGroups.set(postedInfo.message_id, {
            channelId: postedInfo.channel_id,
            batchNumber: postedInfo.batch_number,
            listings: []
          });
        }

        messageGroups.get(postedInfo.message_id)!.listings.push({
          id: listing.id,
          position: postedInfo.batch_position
        });
      }
    }

    if (statusChangedCount === 0) {
      logger.debug(LogCategory.SYSTEM, 'No status changes detected');
      return;
    }

    logger.info(LogCategory.SYSTEM, `🔄 Detected ${statusChangedCount} status changes across ${messageGroups.size} messages`);

    // Update each affected message
    for (const [messageId, groupData] of messageGroups) {
      // Sort by position to maintain order
      groupData.listings.sort((a, b) => a.position - b.position);
      const listingIds = groupData.listings.map(l => l.id);

      await updateMessageWithStatus(
        messageId,
        groupData.channelId,
        listingIds,
        groupData.batchNumber
      );

      // Small delay between message updates to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    logger.info(LogCategory.SYSTEM, `✅ Updated ${messageGroups.size} Discord messages with status changes`);
  } catch (error) {
    logger.error(LogCategory.SYSTEM, 'Error checking status changes:', error);
  }
}

/**
 * Main polling function
 * Fetches listings, compares with database, posts new ones to Discord
 */
async function pollListings(): Promise<void> {
  // Skip if we're still processing the previous poll
  if (isProcessing) {
    logger.warn(LogCategory.SYSTEM, 'Previous poll still processing, skipping this cycle');
    return;
  }

  isProcessing = true;
  const pollStartTime = Date.now();

  try {
    logger.info(LogCategory.SYSTEM, '🔄 Starting polling cycle...');

    // Step 1: Fetch all listings from API
    logger.info(LogCategory.API, 'Step 1/6: Fetching listings from MetaForge API...');
    const fetchedListings = await getAllListings();
    stats.totalListingsFetched += fetchedListings.length;

    logger.info(LogCategory.API, `Fetched ${fetchedListings.length} listings from API`);

    // Create a map for faster lookups
    const fetchedListingsMap = new Map(fetchedListings.map(listing => [listing.id, listing]));

    // Step 2: Check for status changes in existing posted listings
    logger.info(LogCategory.SYSTEM, 'Step 2/6: Checking for status changes...');
    await checkStatusChanges(fetchedListingsMap);

    // Step 3: Determine which listings are new
    logger.info(LogCategory.DATABASE, 'Step 3/6: Checking for new listings...');

    // Create a set of existing listing IDs for fast lookup
    const existingIds = new Set<string>();
    fetchedListings.forEach((listing) => {
      if (listingExists(listing.id)) {
        existingIds.add(listing.id);
      }
    });

    const newListings = getNewListings(fetchedListings, existingIds);

    if (newListings.length === 0) {
      logger.info(LogCategory.SYSTEM, '✅ No new listings detected');
      const pollDuration = Date.now() - pollStartTime;
      logger.info(LogCategory.SYSTEM, `Polling cycle completed in ${pollDuration}ms`);
      stats.totalPollsCompleted++;
      return;
    }

    logger.info(LogCategory.SYSTEM, `🆕 Found ${newListings.length} new listings!`);
    stats.totalNewListingsDetected += newListings.length;

    // Step 4: Save new listings to database
    logger.info(LogCategory.DATABASE, 'Step 4/6: Saving new listings to database...');
    insertListings(newListings);

    // Step 5: Emit events for new listings (for custom purchase logic)
    logger.info(LogCategory.SYSTEM, 'Step 5/6: Emitting events for custom purchase logic...');

    // Emit batch event
    botEvents.emitNewListingsBatch(newListings);

    // Emit individual events for each listing
    newListings.forEach((listing) => {
      botEvents.emitNewListing(listing);
    });

    // Step 6: Post new listings to Discord
    logger.info(LogCategory.DISCORD, 'Step 6/6: Posting new listings to Discord...');
    const batchesPosted = await postListingsToDiscord(newListings);
    stats.totalBatchesPosted += batchesPosted;

    const pollDuration = Date.now() - pollStartTime;
    logger.info(
      LogCategory.SYSTEM,
      `✅ Polling cycle completed successfully in ${pollDuration}ms` +
      ` (${newListings.length} new listings, ${batchesPosted} batches posted)`
    );

    stats.totalPollsCompleted++;
  } catch (error) {
    const pollDuration = Date.now() - pollStartTime;
    logger.error(
      LogCategory.SYSTEM,
      `❌ Error during polling cycle (after ${pollDuration}ms):`,
      error
    );

    // Emit error event
    botEvents.emitError(error as Error, 'pollListings');
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the polling scheduler
 * Uses node-cron to poll at the configured interval
 */
function startPolling(): void {
  const intervalSeconds = Math.floor(config.polling.interval / 1000);

  logger.info(
    LogCategory.SYSTEM,
    `Starting polling scheduler (every ${intervalSeconds} seconds / ${config.polling.interval}ms)`
  );

  // Create cron expression for the polling interval
  // For 5 seconds: */5 * * * * *
  // For 10 seconds: */10 * * * * *
  const cronExpression = `*/${intervalSeconds} * * * * *`;

  logger.debug(LogCategory.SYSTEM, `Cron expression: ${cronExpression}`);

  // Schedule the polling job
  pollingJob = cron.schedule(cronExpression, async () => {
    await pollListings();
  });

  logger.info(LogCategory.SYSTEM, '✅ Polling scheduler started');

  // Run first poll immediately
  logger.info(LogCategory.SYSTEM, 'Running initial poll...');
  pollListings().catch((error) => {
    logger.error(LogCategory.SYSTEM, 'Error in initial poll:', error);
  });
}

/**
 * Stop the polling scheduler
 */
function stopPolling(): void {
  if (pollingJob) {
    logger.info(LogCategory.SYSTEM, 'Stopping polling scheduler...');
    pollingJob.stop();
    pollingJob = null;
    logger.info(LogCategory.SYSTEM, 'Polling scheduler stopped');
  }
}

/**
 * Log current bot statistics
 */
function logStatistics(): void {
  const uptime = Date.now() - stats.startTime.getTime();
  const uptimeMinutes = Math.floor(uptime / 60000);
  const uptimeSeconds = Math.floor((uptime % 60000) / 1000);

  logger.section('Bot Statistics');
  logger.info(LogCategory.SYSTEM, `Uptime: ${uptimeMinutes}m ${uptimeSeconds}s`);
  logger.info(LogCategory.SYSTEM, `Polls completed: ${stats.totalPollsCompleted}`);
  logger.info(LogCategory.SYSTEM, `Total listings fetched: ${stats.totalListingsFetched}`);
  logger.info(LogCategory.SYSTEM, `New listings detected: ${stats.totalNewListingsDetected}`);
  logger.info(LogCategory.SYSTEM, `Batches posted to Discord: ${stats.totalBatchesPosted}`);
  logger.divider();
}

/**
 * Handle graceful shutdown
 * Cleans up resources and logs statistics
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(LogCategory.SYSTEM, `\nReceived ${signal}, shutting down gracefully...`);

  // Log final statistics
  logStatistics();

  // Stop polling
  stopPolling();

  // Disconnect Discord bot
  disconnectDiscordBot();

  // Close database
  closeDatabase();

  logger.info(LogCategory.SYSTEM, '👋 Shutdown complete. Goodbye!');

  // Exit process
  process.exit(0);
}

/**
 * Main initialization function
 * Sets up database, Discord bot, and polling
 */
async function main(): Promise<void> {
  try {
    // Print startup banner
    logger.section('MetaAppTrader - Discord Trading Bot');
    logger.info(LogCategory.SYSTEM, 'Starting up...');

    // Step 1: Initialize database
    logger.info(LogCategory.SYSTEM, 'Step 1/3: Initializing database...');
    initializeDatabase();
    logger.info(LogCategory.SYSTEM, '✅ Database initialized');

    // Step 2: Initialize Discord bot
    logger.info(LogCategory.SYSTEM, 'Step 2/3: Connecting to Discord...');
    await initializeDiscordBot();
    logger.info(LogCategory.SYSTEM, '✅ Discord bot connected');

    // Step 2.5: Initialize custom purchase logic
    initializeCustomPurchaseLogic();

    // Step 3: Start polling
    logger.info(LogCategory.SYSTEM, 'Step 3/3: Starting polling service...');
    startPolling();
    logger.info(LogCategory.SYSTEM, '✅ Polling service started');

    logger.divider();
    logger.info(LogCategory.SYSTEM, '🚀 Bot is now running!');
    logger.info(LogCategory.SYSTEM, `📊 Monitoring channel: ${config.discord.channelId}`);
    logger.info(LogCategory.SYSTEM, `⏱️  Poll interval: ${config.polling.interval}ms`);
    logger.info(LogCategory.SYSTEM, `📁 Database: ${config.database.path}`);
    logger.divider();

    // Log statistics every 5 minutes
    setInterval(() => {
      logStatistics();
    }, 5 * 60 * 1000);

    // Set up signal handlers for graceful shutdown
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error(LogCategory.ERROR, 'Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error(LogCategory.ERROR, 'Unhandled promise rejection:', reason);
    });
  } catch (error) {
    logger.error(LogCategory.SYSTEM, 'Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
main();
