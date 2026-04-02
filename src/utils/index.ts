/**
 * This class provides common utility functions
 */
export default class Utils {
  /**
   * This method is used to create error objects which http status codes and status messages
   * @param status Http status code for error
   * @param message Error message
   * @param data Additional data for more actions
   * @returns Objects with error details
   */
  createError(status?: number, message?: string, data?: object | null) {
    return {
      message: message ? message : "Oops something went wrong",
      status: Number(status) || 500,
      data,
    };
  }

  /**
   * To handle error in .Catch of a promise in simple way customizable error message and code
   * @param status https status code
   * @param errorMessage Error Message
   * @returns a function which throws an exception with createError object with error message and code
   */
  throwCustomError(status: number, errorMessage?: string) {
    return (error: Error) => {
      throw this.createError(status, errorMessage ?? error?.message, error);
    };
  }

  /**
   * To handle error in .Catch of a promise in simple way as internal server error
   * @param errorMessage Error message
   * @returns a function which throws an exception with createError object with error message
   */
  throwInternalError(errorMessage?: string) {
    return (error: Error) => {
      throw this.createError(500, errorMessage ?? error?.message, error);
    };
  }

  /**
   * This function handles and converts normal error to internal server error using throwInternalError.
   * First argument is promise function and rest of arguments are passed to the promise function
   * @param promiseFunction Promise function to be handled
   * @param args Arguments for the promise function
   * @returns Result of promise function
   */
  async handleInternalError<T extends (...args: Parameters<T>) => ReturnType<T>>(promiseFunction: T, ...args: Parameters<T>) {
    try {
      return await promiseFunction(...args);
    } catch (error) {
      throw this.createError(500, error?.message, error);
    }
  }

  /**
   * Creates a new random id string
   * @param options Options for creating random id
   * @returns promise with random id generated according to options
   */
  generateRandomId(options?: {
    length?: number;
    withLowerCase?: boolean;
    withNumber?: boolean;
    withUpperCase?: boolean;
    withSpecialChars?: boolean;
  }): string {
    const defaultLength = 22;
    const length = options?.length || defaultLength;

    const possibilities = {
      lowerCased: "abcdefghijklmnopqrstuvwxyz",
      capitals: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      numbers: "0123456789",
      special: "~!@#$%^&()_+-={}[];',",
    };

    // Storage for setting selected chars from pattern
    let chars = "";

    if (options?.withNumber) chars += possibilities.numbers;
    if (options?.withLowerCase) chars += possibilities.lowerCased;
    if (options?.withUpperCase) chars += possibilities.capitals;
    if (options?.withSpecialChars) chars += possibilities.special;

    // default pattern
    if (chars.length == 0) chars += possibilities.capitals;

    // accumulator for result
    let result = "";

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }

  /**
   * * This function returns a random id when the promise function returns nothing or nullifying value.
   * * This is used in creation of unique ids.
   * @param options Options for creating random id
   * @param promiseFunctionWithResults Promise function to be called to return data to generate random id on non existence of response
   * @param argsOfPromiseFunction Arguments for the promise functions function
   * @returns promise with random id (string) generated according to options
   */
  async generateRandomIdWithValidatingFunction<T extends (...args: Parameters<T>) => ReturnType<T>>(
    options: Parameters<typeof this.generateRandomId>[0],
    promiseFunctionWithResults: T,
    ...argsOfPromiseFunction: Parameters<T>
  ): Promise<string> {
    let id: string;
    do {
      id = this.generateRandomId(options);
    } while (await promiseFunctionWithResults(...argsOfPromiseFunction));
    return id;
  }

  /**
   * * This function returns a random id when the promise function returns nothing or nullifying value.
   * * This is used in creation of unique ids.
   * @param options Options for creating random id
   * @param allowThisId Callback function to be called to return data to generate random id on non existence of response
   * @returns promise with random id (string) generated according to options
   */
  async generateRandomIdWithValidation(
    options: Parameters<typeof this.generateRandomId>[0],
    allowThisId: (id: string) => Promise<boolean> | boolean,
  ): Promise<string> {
    let id: string;
    do {
      id = this.generateRandomId(options);
    } while (!(await allowThisId(id)));
    return id;
  }

  /**
   * Validates and formats username
   * @param username Raw username input
   * @returns Formatted username (lowercase, alphanumeric only, no spaces)
   */
  validateAndFormatUsername(username: string): string {
    if (!username || typeof username !== "string") {
      throw this.createError(400, "Username is required and must be a string");
    }

    // Remove spaces and convert to lowercase
    let formatted = username.toLowerCase().replace(/\s+/g, "");

    // Remove special characters, keep only letters and numbers
    formatted = formatted.replace(/[^a-z0-9]/g, "");

    if (formatted.length === 0) {
      throw this.createError(400, "Username must contain at least one letter or number");
    }

    if (formatted.length < 3) {
      throw this.createError(400, "Username must be at least 3 characters long");
    }

    if (formatted.length > 20) {
      throw this.createError(400, "Username must not exceed 20 characters");
    }

    return formatted;
  }

  /**
   * Converts timezone input from offset format (e.g., "IST +05:30") to IANA format (e.g., "Asia/Kolkata")
   * Supports multiple input formats:
   * - "IST +05:30" (abbreviation + offset)
   * - "+05:30" (offset only)
   * - "Asia/Kolkata" (IANA format - already valid)
   * @param timeZoneInput Raw timezone input from client
   * @returns IANA timezone identifier
   * @throws Error if timezone cannot be converted
   */
  convertToIANATimeZone(timeZoneInput: string): string {
    if (!timeZoneInput || typeof timeZoneInput !== "string") {
      throw this.createError(400, "Invalid timezone input");
    }

    const input = timeZoneInput.trim();

    // Check if already in IANA format (contains / or is UTC)
    if (input.includes("/") || input === "UTC" || input === "GMT") {
      // Validate by attempting to use it with Intl API
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: input });
        return input;
      } catch {
        throw this.createError(400, `Invalid IANA timezone: ${input}`);
      }
    }

    // Offset-based format: "IST +05:30", "+05:30", "IST+05:30", etc.
    const offsetRegex = /([A-Z]{3})?\s*([+-]\d{1,2}):(\d{2})/i;
    const match = input.match(offsetRegex);

    if (!match) {
      throw this.createError(400, `Invalid timezone format: ${input}. Expected format like "IST +05:30" or IANA format like "Asia/Kolkata"`);
    }

    // Extract offset components
    const sign = match[2].charAt(0) === "+" ? 1 : -1;
    const hours = Math.abs(parseInt(match[2].substring(1), 10));
    const minutes = parseInt(match[3], 10);

    // Calculate total offset in minutes
    const offsetMinutes = sign * (hours * 60 + minutes);

    // Map offset to IANA timezone
    // This is a curated list of common timezones by offset
    const timezonesByOffset: { [key: number]: string[] } = {
      0: ["UTC", "GMT"],
      60: ["Europe/London"],
      90: ["Europe/Dublin"],
      120: ["Europe/Paris", "Europe/Berlin", "Europe/Rome", "Europe/Madrid", "Africa/Cairo"],
      180: ["Europe/Moscow", "Africa/Nairobi"],
      210: ["Asia/Tehran"],
      240: ["Asia/Dubai", "Asia/Baku"],
      270: ["Asia/Kabul"],
      300: ["Asia/Karachi", "Asia/Tashkent"],
      330: ["Asia/Kolkata"],
      345: ["Asia/Kathmandu"],
      360: ["Asia/Dhaka", "Asia/Thimphu"],
      390: ["Asia/Myanmar"],
      420: ["Asia/Bangkok", "Asia/Jakarta"],
      480: ["Asia/Shanghai", "Asia/Singapore", "Australia/Perth"],
      540: ["Asia/Tokyo", "Asia/Seoul"],
      570: ["Australia/Adelaide"],
      600: ["Australia/Sydney", "Australia/Melbourne"],
      630: ["Australia/Lord_Howe"],
      660: ["Pacific/Fiji"],
      "-300": ["America/New_York", "America/Toronto", "America/Detroit"],
      "-360": ["America/Chicago", "America/Mexico_City"],
      "-420": ["America/Denver", "America/Phoenix"],
      "-480": ["America/Los_Angeles", "America/Vancouver"],
      "-540": ["America/Anchorage"],
      "-600": ["Pacific/Honolulu"],
      "-330": ["Canada/Newfoundland"],
      "-240": ["America/Halifax", "America/Puerto_Rico"],
      "-180": ["America/Argentina/Buenos_Aires", "America/Cayenne"],
      "-120": ["America/Godthab"],
      "-660": ["Pacific/Pago_Pago"],
    };

    // Find matching timezone
    const matchingTimezones = timezonesByOffset[offsetMinutes];
    if (matchingTimezones && matchingTimezones.length > 0) {
      return matchingTimezones[0];
    }

    // If no exact match, create a fallback using the offset
    // This should rarely happen, but provides a fallback for unusual offsets
    const sign_str = offsetMinutes >= 0 ? "+" : "";
    const hours_offset = Math.floor(Math.abs(offsetMinutes) / 60);
    const minutes_offset = Math.abs(offsetMinutes) % 60;
    const offsetStr = `${sign_str}${String(hours_offset).padStart(2, "0")}:${String(minutes_offset).padStart(2, "0")}`;

    throw this.createError(400, `Timezone offset ${offsetStr} is not supported. Please provide a recognized IANA timezone or offset from the list.`);
  }

  getDateDataFromTimeZone(timeZone: string, date: Date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // Break the formatted parts
    const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));

    // Extract numeric values
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const second = Number(parts.second);

    // Local date string (for debugging)
    const localDateStr = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;

    // Calculate offset correctly:
    // Create a UTC timestamp from the local time components
    // Note: month is 0-indexed in Date.UTC, but our month is 1-indexed from the formatter
    const localTimeAsUTC = Date.UTC(year, month - 1, day, hour, minute, second);
    const utcTime = date.getTime();

    // Calculate offset in milliseconds
    const offsetMs = localTimeAsUTC - utcTime;
    const offsetMinutes = offsetMs / (1000 * 60);
    const offsetHours = offsetMinutes / 60;

    // Calculate offset components (hours and minutes separately)
    // For example, Asia/Kolkata (UTC+5:30) would give: offsetHour = 5, offsetMinute = 30
    // For America/New_York (UTC-5:00) would give: offsetHour = -5, offsetMinute = 0
    const offsetHour = Math.floor(Math.abs(offsetHours));
    const offsetMinute = Math.abs(offsetMinutes) % 60;
    const offsetSign = offsetMinutes >= 0 ? 1 : -1;

    // Create local date object (represents the local time as a Date object)
    const localDate = new Date(localTimeAsUTC);

    return {
      timeZone,
      utcDate: date,
      localDate,
      localDateStr,
      year,
      month,
      day,
      hour,
      minute,
      second,
      offsetMinutes,    // Total offset in minutes (e.g., 330 for UTC+5:30)
      offsetHours,      // Total offset in hours as decimal (e.g., 5.5 for UTC+5:30)
      offsetHour: offsetSign * offsetHour,      // Hours component with sign (e.g., 5 for UTC+5:30, -5 for UTC-5:00)
      offsetMinute,     // Minutes component, always positive (e.g., 30 for UTC+5:30)
      isoLocal: localDate.toISOString(),
    };
  }
}
