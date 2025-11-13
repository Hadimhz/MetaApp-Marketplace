/**
 * Logger Utility
 *
 * Provides comprehensive logging functionality with:
 * - Color-coded output for different log levels
 * - Timestamp prefixes
 * - Category labels for organizing logs
 * - Support for multiple log levels (debug, info, warn, error)
 *
 * Usage:
 *   logger.info(LogCategory.API, 'Fetching listings from MetaForge...');
 *   logger.error(LogCategory.DATABASE, 'Failed to connect', error);
 */

import { LogLevel, LogCategory } from '../types';

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

/**
 * Logger class for application-wide logging
 */
class Logger {
  private logLevel: LogLevel;

  /**
   * Create a new logger instance
   * @param level - Minimum log level to display (default: info)
   */
  constructor(level: LogLevel = LogLevel.INFO) {
    this.logLevel = level;
  }

  /**
   * Set the minimum log level
   * @param level - New log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info(LogCategory.SYSTEM, `Log level set to: ${level}`);
  }

  /**
   * Get current log level
   */
  public getLogLevel(): LogLevel {
    return this.logLevel;
  }

  /**
   * Check if a log level should be displayed
   * @param level - Log level to check
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(this.logLevel);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  /**
   * Format timestamp as [YYYY-MM-DD HH:MM:SS]
   */
  private getTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Get color for log level
   */
  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return COLORS.gray;
      case LogLevel.INFO:
        return COLORS.cyan;
      case LogLevel.WARN:
        return COLORS.yellow;
      case LogLevel.ERROR:
        return COLORS.red;
      default:
        return COLORS.white;
    }
  }

  /**
   * Get color for category
   */
  private getCategoryColor(category: LogCategory): string {
    switch (category) {
      case LogCategory.API:
        return COLORS.blue;
      case LogCategory.DATABASE:
        return COLORS.green;
      case LogCategory.DISCORD:
        return COLORS.magenta;
      case LogCategory.BATCH:
        return COLORS.cyan;
      case LogCategory.AUTO_PURCHASE:
        return COLORS.yellow;
      case LogCategory.SYSTEM:
        return COLORS.white;
      case LogCategory.ERROR:
        return COLORS.red;
      default:
        return COLORS.white;
    }
  }

  /**
   * Core logging method
   * @param level - Log level
   * @param category - Log category for organization
   * @param message - Main log message
   * @param data - Optional additional data to log
   */
  private log(level: LogLevel, category: LogCategory, message: string, ...data: any[]): void {
    // Check if this log level should be displayed
    if (!this.shouldLog(level)) {
      return;
    }

    // Format timestamp
    const timestamp = this.getTimestamp();
    const timestampStr = `${COLORS.gray}[${timestamp}]${COLORS.reset}`;

    // Format log level
    const levelColor = this.getLevelColor(level);
    const levelStr = `${levelColor}[${level.toUpperCase()}]${COLORS.reset}`;

    // Format category
    const categoryColor = this.getCategoryColor(category);
    const categoryStr = `${categoryColor}[${category}]${COLORS.reset}`;

    // Construct log message
    const logMessage = `${timestampStr} ${levelStr} ${categoryStr} ${message}`;

    // Output to console
    if (level === LogLevel.ERROR) {
      console.error(logMessage, ...data);
    } else if (level === LogLevel.WARN) {
      console.warn(logMessage, ...data);
    } else {
      console.log(logMessage, ...data);
    }
  }

  /**
   * Log debug message (lowest priority)
   * Use for detailed diagnostic information
   *
   * @param category - Log category
   * @param message - Log message
   * @param data - Optional additional data
   */
  public debug(category: LogCategory, message: string, ...data: any[]): void {
    this.log(LogLevel.DEBUG, category, message, ...data);
  }

  /**
   * Log info message (normal priority)
   * Use for general informational messages
   *
   * @param category - Log category
   * @param message - Log message
   * @param data - Optional additional data
   */
  public info(category: LogCategory, message: string, ...data: any[]): void {
    this.log(LogLevel.INFO, category, message, ...data);
  }

  /**
   * Log warning message (elevated priority)
   * Use for potentially problematic situations
   *
   * @param category - Log category
   * @param message - Log message
   * @param data - Optional additional data
   */
  public warn(category: LogCategory, message: string, ...data: any[]): void {
    this.log(LogLevel.WARN, category, message, ...data);
  }

  /**
   * Log error message (highest priority)
   * Use for error conditions and exceptions
   *
   * @param category - Log category
   * @param message - Log message
   * @param data - Optional additional data (errors, stack traces, etc.)
   */
  public error(category: LogCategory, message: string, ...data: any[]): void {
    this.log(LogLevel.ERROR, category, message, ...data);
  }

  /**
   * Log a divider line for visual separation
   * Useful for separating different sections of logs
   */
  public divider(): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(`${COLORS.gray}${'='.repeat(80)}${COLORS.reset}`);
    }
  }

  /**
   * Log a section header
   * @param title - Section title
   */
  public section(title: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.divider();
      console.log(`${COLORS.bright}${COLORS.cyan}${title}${COLORS.reset}`);
      this.divider();
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export Logger class for testing or custom instances
export { Logger };
