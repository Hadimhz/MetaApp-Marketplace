/**
 * Event System
 *
 * Provides a centralized event emitter for the bot.
 * You can hook into these events to implement custom logic like:
 * - Automated purchase decisions
 * - Custom notifications
 * - Analytics tracking
 * - etc.
 *
 * Usage Example:
 * ```typescript
 * import { botEvents, BotEvent } from './utils/events';
 *
 * // Listen for new listings
 * botEvents.on(BotEvent.NEW_LISTING, (event) => {
 *   console.log('New listing detected:', event.listing);
 *
 *   // Your custom purchase logic here
 *   if (shouldPurchase(event.listing)) {
 *     initiatePurchase(event.listing);
 *   }
 * });
 * ```
 */

import { EventEmitter } from 'events';
import {
  BotEvent,
  NewListingEvent,
  NewListingsBatchEvent,
  PurchaseButtonClickedEvent,
  Listing
} from '../types';
import { logger } from './logger';
import { LogCategory } from '../types';

/**
 * Bot Event Emitter class
 * Extends Node.js EventEmitter with typed event methods
 */
class BotEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Set max listeners to avoid warnings for multiple event handlers
    this.setMaxListeners(20);
  }

  /**
   * Emit an event when the bot is ready
   */
  public emitBotReady(): void {
    logger.info(LogCategory.SYSTEM, 'Bot ready event emitted');
    this.emit(BotEvent.BOT_READY);
  }

  /**
   * Emit an event when a new listing is detected
   * @param listing - The new listing
   */
  public emitNewListing(listing: Listing): void {
    const event: NewListingEvent = {
      listing,
      timestamp: new Date()
    };

    logger.debug(
      LogCategory.SYSTEM,
      `New listing event emitted: ${listing.type} - ${listing.selling.name} → ${listing.buying.name}`
    );

    this.emit(BotEvent.NEW_LISTING, event);
  }

  /**
   * Emit an event when multiple new listings are detected
   * @param listings - Array of new listings
   */
  public emitNewListingsBatch(listings: Listing[]): void {
    const event: NewListingsBatchEvent = {
      listings,
      count: listings.length,
      timestamp: new Date()
    };

    logger.info(
      LogCategory.SYSTEM,
      `New listings batch event emitted: ${listings.length} new listings`
    );

    this.emit(BotEvent.NEW_LISTINGS_BATCH, event);
  }

  /**
   * Emit an event when a listing is posted to Discord
   * @param listing - The listing that was posted
   */
  public emitListingPosted(listing: Listing): void {
    logger.debug(LogCategory.DISCORD, `Listing posted event emitted for: ${listing.id}`);
    this.emit(BotEvent.LISTING_POSTED, listing);
  }

  /**
   * Emit an event when a batch of listings is posted to Discord
   * @param listings - Array of listings in the batch
   * @param batchNumber - The batch number
   */
  public emitBatchPosted(listings: Listing[], batchNumber: number): void {
    logger.info(
      LogCategory.DISCORD,
      `Batch posted event emitted: Batch #${batchNumber} with ${listings.length} listings`
    );
    this.emit(BotEvent.BATCH_POSTED, { listings, batchNumber });
  }

  /**
   * Emit an event when a user clicks a purchase button
   * @param event - Purchase button click event details
   */
  public emitPurchaseButtonClicked(event: PurchaseButtonClickedEvent): void {
    logger.info(
      LogCategory.AUTO_PURCHASE,
      `Purchase button clicked by ${event.username} for listing: ${event.listing.id}`
    );
    this.emit(BotEvent.PURCHASE_BUTTON_CLICKED, event);
  }

  /**
   * Emit an error event
   * @param error - The error that occurred
   * @param context - Additional context about where the error occurred
   */
  public emitError(error: Error, context?: string): void {
    logger.error(
      LogCategory.ERROR,
      `Error event emitted${context ? ` in ${context}` : ''}: ${error.message}`,
      error
    );
    this.emit(BotEvent.ERROR, { error, context, timestamp: new Date() });
  }
}

/**
 * Singleton instance of the bot event emitter
 * Import this in your files to listen to or emit events
 */
export const botEvents = new BotEventEmitter();

/**
 * Helper function to register a new listing handler
 * Convenience wrapper for listening to NEW_LISTING events
 *
 * @param handler - Function to call when a new listing is detected
 * @returns Unsubscribe function to remove the handler
 *
 * @example
 * ```typescript
 * const unsubscribe = onNewListing((event) => {
 *   if (event.listing.buying.id === 'assorted-seeds' && event.listing.buying.amount < 100) {
 *     console.log('Cheap listing found!', event.listing);
 *   }
 * });
 *
 * // Later, to stop listening:
 * unsubscribe();
 * ```
 */
export function onNewListing(handler: (event: NewListingEvent) => void): () => void {
  botEvents.on(BotEvent.NEW_LISTING, handler);
  return () => botEvents.off(BotEvent.NEW_LISTING, handler);
}

/**
 * Helper function to register a new listings batch handler
 * Convenience wrapper for listening to NEW_LISTINGS_BATCH events
 *
 * @param handler - Function to call when new listings batch is detected
 * @returns Unsubscribe function to remove the handler
 *
 * @example
 * ```typescript
 * const unsubscribe = onNewListingsBatch((event) => {
 *   console.log(`${event.count} new listings detected`);
 *   event.listings.forEach(listing => {
 *     // Process each listing
 *   });
 * });
 * ```
 */
export function onNewListingsBatch(handler: (event: NewListingsBatchEvent) => void): () => void {
  botEvents.on(BotEvent.NEW_LISTINGS_BATCH, handler);
  return () => botEvents.off(BotEvent.NEW_LISTINGS_BATCH, handler);
}

/**
 * Helper function to register a purchase button click handler
 * Convenience wrapper for listening to PURCHASE_BUTTON_CLICKED events
 *
 * @param handler - Function to call when a purchase button is clicked
 * @returns Unsubscribe function to remove the handler
 *
 * @example
 * ```typescript
 * const unsubscribe = onPurchaseButtonClicked((event) => {
 *   console.log(`${event.username} wants to buy:`, event.listing);
 *   // Implement your purchase logic here
 * });
 * ```
 */
export function onPurchaseButtonClicked(
  handler: (event: PurchaseButtonClickedEvent) => void
): () => void {
  botEvents.on(BotEvent.PURCHASE_BUTTON_CLICKED, handler);
  return () => botEvents.off(BotEvent.PURCHASE_BUTTON_CLICKED, handler);
}

/**
 * Export BotEvent enum for convenience
 */
export { BotEvent };
