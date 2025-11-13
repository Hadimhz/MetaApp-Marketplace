/**
 * MetaForge API Integration
 *
 * Handles communication with the MetaForge Arc Raiders trading API:
 * - Fetches sell listings
 * - Fetches buy listings
 * - Combines and sorts all listings
 * - Transforms raw API responses into typed Listing objects
 *
 * The API endpoints are publicly accessible and don't require authentication.
 */

import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';
import { LogCategory, ApiListing, Listing } from '../types';

/**
 * Base URL for MetaForge API
 */
const METAFORGE_API_BASE = 'https://metaforge.app/api/arc-raiders/trade';

/**
 * Default parameters for API requests
 */
const DEFAULT_PARAMS = {
  page: 1,
  limit: 30, // Fetch 30 listings per request (adjustable)
  sortBy: 'created_at',
  sortOrder: 'desc' as const
};

/**
 * API response structure
 * The MetaForge API wraps the listings array in a 'data' field
 */
interface MetaForgeApiResponse {
  data: ApiListing[];
  // Other fields might exist but we only need the data array
}

/**
 * Transform raw API listing to our internal Listing format
 * Handles both buy and sell listings, normalizing their structure
 *
 * @param apiListing - Raw listing from MetaForge API
 * @returns Transformed Listing object
 */
function transformApiListing(apiListing: ApiListing): Listing {
  // Determine what's being offered and what's wanted based on listing type
  let selling: Listing['selling'];
  let buying: Listing['buying'];

  if (apiListing.listing_type === 'sell') {
    // For sell listings: they're selling an item
    selling = {
      id: apiListing.item_id,
      amount: apiListing.quantity,
      name: apiListing.item.name,
      icon: apiListing.item.icon,
      rarity: apiListing.item.rarity
    };

    // They want either seeds (currency) or another item (barter)
    if (apiListing.price !== null) {
      // They want seeds
      buying = {
        id: 'assorted-seeds',
        amount: apiListing.price,
        name: 'Assorted Seeds',
        icon: 'https://cdn.metaforge.app/arc-raiders/icons/assorted-seeds.webp'
      };
    } else {
      // They want another item (barter)
      buying = {
        id: apiListing.wanted_item_id!,
        amount: apiListing.wanted_quantity!,
        name: apiListing.wanted_item!.name,
        icon: apiListing.wanted_item!.icon,
        rarity: apiListing.wanted_item!.rarity
      };
    }
  } else {
    // For buy listings: they're buying an item
    buying = {
      id: apiListing.item_id,
      amount: apiListing.quantity,
      name: apiListing.item.name,
      icon: apiListing.item.icon,
      rarity: apiListing.item.rarity
    };

    // They're offering either seeds or another item
    if (apiListing.price !== null) {
      // They're offering seeds
      selling = {
        id: 'assorted-seeds',
        amount: apiListing.price,
        name: 'Assorted Seeds',
        icon: 'https://cdn.metaforge.app/arc-raiders/icons/assorted-seeds.webp'
      };
    } else {
      // They're offering another item (barter)
      selling = {
        id: apiListing.wanted_item_id!,
        amount: apiListing.wanted_quantity!,
        name: apiListing.wanted_item!.name,
        icon: apiListing.wanted_item!.icon,
        rarity: apiListing.wanted_item!.rarity
      };
    }
  }

  return {
    id: apiListing.id,
    type: apiListing.listing_type,
    user_id: apiListing.user_id,
    status: apiListing.status,
    description: apiListing.description,
    created_at: apiListing.created_at,
    updated_at: apiListing.updated_at,
    selling,
    buying,
    user_profile: apiListing.user_profile
  };
}

/**
 * Fetch sell listings from MetaForge API
 * Returns listings where users are selling items
 *
 * @returns Promise that resolves to array of sell listings
 */
export async function getSellListings(): Promise<Listing[]> {
  const startTime = Date.now();
  const url = `${METAFORGE_API_BASE}/listings`;

  logger.info(LogCategory.API, 'Fetching sell listings from MetaForge...');
  logger.debug(LogCategory.API, `URL: ${url}`);

  try {
    // Make API request
    const response: AxiosResponse<MetaForgeApiResponse> = await axios.get(url, {
      params: {
        ...DEFAULT_PARAMS,
        listing_type: 'sell'
      }
    });

    const listings = response.data.data;
    const duration = Date.now() - startTime;

    logger.info(
      LogCategory.API,
      `Fetched ${listings.length} sell listings in ${duration}ms`
    );
    logger.debug(
      LogCategory.API,
      `Response size: ${JSON.stringify(response.data).length} bytes`
    );

    // Transform API listings to our internal format
    const transformedListings = listings.map(transformApiListing);

    logger.debug(
      LogCategory.API,
      `Transformed ${transformedListings.length} sell listings`
    );

    return transformedListings;
  } catch (error: any) {
    const duration = Date.now() - startTime;

    logger.error(
      LogCategory.API,
      `Failed to fetch sell listings after ${duration}ms:`,
      error
    );

    // Log additional error details if available
    if (error.response) {
      logger.error(
        LogCategory.API,
        `API responded with status ${error.response.status}: ${error.response.statusText}`
      );
    } else if (error.request) {
      logger.error(LogCategory.API, 'No response received from API');
    }

    throw error;
  }
}

/**
 * Fetch buy listings from MetaForge API
 * Returns listings where users are buying items
 *
 * @returns Promise that resolves to array of buy listings
 */
export async function getBuyListings(): Promise<Listing[]> {
  const startTime = Date.now();
  const url = `${METAFORGE_API_BASE}/listings`;

  logger.info(LogCategory.API, 'Fetching buy listings from MetaForge...');
  logger.debug(LogCategory.API, `URL: ${url}`);

  try {
    // Make API request
    const response: AxiosResponse<MetaForgeApiResponse> = await axios.get(url, {
      params: {
        ...DEFAULT_PARAMS,
        listing_type: 'buy'
      }
    });

    const listings = response.data.data;
    const duration = Date.now() - startTime;

    logger.info(
      LogCategory.API,
      `Fetched ${listings.length} buy listings in ${duration}ms`
    );
    logger.debug(
      LogCategory.API,
      `Response size: ${JSON.stringify(response.data).length} bytes`
    );

    // Transform API listings to our internal format
    const transformedListings = listings.map(transformApiListing);

    logger.debug(
      LogCategory.API,
      `Transformed ${transformedListings.length} buy listings`
    );

    return transformedListings;
  } catch (error: any) {
    const duration = Date.now() - startTime;

    logger.error(
      LogCategory.API,
      `Failed to fetch buy listings after ${duration}ms:`,
      error
    );

    // Log additional error details if available
    if (error.response) {
      logger.error(
        LogCategory.API,
        `API responded with status ${error.response.status}: ${error.response.statusText}`
      );
    } else if (error.request) {
      logger.error(LogCategory.API, 'No response received from API');
    }

    throw error;
  }
}

/**
 * Fetch all listings (both buy and sell) from MetaForge API
 * Fetches both types in parallel for better performance
 * Returns combined and sorted listings (newest first)
 *
 * @returns Promise that resolves to array of all listings
 */
export async function getAllListings(): Promise<Listing[]> {
  const startTime = Date.now();

  logger.info(LogCategory.API, 'Fetching all listings (buy + sell) from MetaForge...');

  try {
    // Fetch both listing types in parallel for better performance
    const [sellListings, buyListings] = await Promise.all([
      getSellListings(),
      getBuyListings()
    ]);

    // Combine both arrays
    const allListings = [...sellListings, ...buyListings];

    // Sort by created_at timestamp (newest first)
    allListings.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const duration = Date.now() - startTime;

    logger.info(
      LogCategory.API,
      `Fetched and sorted ${allListings.length} total listings in ${duration}ms` +
      ` (${sellListings.length} sell, ${buyListings.length} buy)`
    );

    return allListings;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(
      LogCategory.API,
      `Failed to fetch all listings after ${duration}ms:`,
      error
    );

    throw error;
  }
}

/**
 * Get new listings that aren't in the database yet
 * Compares fetched listings against database to find new ones
 *
 * @param fetchedListings - Listings from API
 * @param existingListingIds - Set of listing IDs already in database
 * @returns Array of new listings
 */
export function getNewListings(
  fetchedListings: Listing[],
  existingListingIds: Set<string>
): Listing[] {
  const newListings = fetchedListings.filter(
    (listing) => !existingListingIds.has(listing.id)
  );

  logger.info(
    LogCategory.API,
    `Found ${newListings.length} new listings out of ${fetchedListings.length} fetched`
  );

  if (newListings.length > 0) {
    logger.debug(LogCategory.API, `New listing IDs: ${newListings.map((l) => l.id).join(', ')}`);
  }

  return newListings;
}
