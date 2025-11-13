/**
 * Configuration Loader
 *
 * Loads and validates configuration from environment variables (.env file).
 * Provides type-safe access to all configuration values.
 *
 * Usage:
 *   import { config } from './utils/config';
 *   const token = config.discord.token;
 */

import dotenv from 'dotenv';
import { Config, LogLevel } from '../types';
import { Logger } from './logger';
import { LogCategory } from '../types';

// Load environment variables from .env file
dotenv.config();

/**
 * Load and validate configuration from environment variables
 * @throws Error if required environment variables are missing
 */
function loadConfig(): Config {
  // Create a temporary logger for config loading (before config is ready)
  const tempLogger = new Logger(LogLevel.INFO);

  tempLogger.info(LogCategory.SYSTEM, 'Loading configuration from environment variables...');

  // Required environment variables
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  const discordChannelId = process.env.DISCORD_CHANNEL_ID;

  // Validate required variables
  if (!discordToken) {
    tempLogger.error(LogCategory.SYSTEM, 'Missing required environment variable: DISCORD_BOT_TOKEN');
    throw new Error('DISCORD_BOT_TOKEN is required. Please set it in your .env file.');
  }

  if (!discordChannelId) {
    tempLogger.error(LogCategory.SYSTEM, 'Missing required environment variable: DISCORD_CHANNEL_ID');
    throw new Error('DISCORD_CHANNEL_ID is required. Please set it in your .env file.');
  }

  // Optional environment variables with defaults
  const pollInterval = parseInt(process.env.POLL_INTERVAL || '5000', 10);
  const databasePath = process.env.DATABASE_PATH || './data/listings.db';
  const logLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;
  const autoPurchaseEnabled = process.env.AUTO_PURCHASE_ENABLED !== 'false';

  // Validate log level
  const validLogLevels: LogLevel[] = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
  if (!validLogLevels.includes(logLevel)) {
    tempLogger.warn(
      LogCategory.SYSTEM,
      `Invalid LOG_LEVEL: ${logLevel}. Using default: info`
    );
  }

  // Validate poll interval
  if (isNaN(pollInterval) || pollInterval < 1000) {
    tempLogger.warn(
      LogCategory.SYSTEM,
      `Invalid POLL_INTERVAL: ${process.env.POLL_INTERVAL}. Using default: 5000ms`
    );
  }

  // Construct configuration object
  const config: Config = {
    discord: {
      token: discordToken,
      channelId: discordChannelId,
    },
    polling: {
      interval: pollInterval,
    },
    database: {
      path: databasePath,
    },
    logging: {
      level: validLogLevels.includes(logLevel) ? logLevel : LogLevel.INFO,
    },
    autoPurchase: {
      enabled: autoPurchaseEnabled,
    },
  };

  // Log configuration details (without sensitive data)
  tempLogger.info(LogCategory.SYSTEM, 'Configuration loaded successfully:');
  tempLogger.info(LogCategory.SYSTEM, `  - Discord Channel ID: ${config.discord.channelId}`);
  tempLogger.info(LogCategory.SYSTEM, `  - Poll Interval: ${config.polling.interval}ms`);
  tempLogger.info(LogCategory.SYSTEM, `  - Database Path: ${config.database.path}`);
  tempLogger.info(LogCategory.SYSTEM, `  - Log Level: ${config.logging.level}`);
  tempLogger.info(LogCategory.SYSTEM, `  - Auto-Purchase: ${config.autoPurchase.enabled ? 'enabled' : 'disabled'}`);

  return config;
}

/**
 * Singleton configuration instance
 * Loaded once when the module is imported
 */
export const config: Config = loadConfig();

/**
 * Get configuration value
 * Alternative way to access config if needed
 */
export function getConfig(): Config {
  return config;
}
