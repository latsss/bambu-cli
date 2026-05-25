/**
 * Minimal logger. All output goes to stderr so stdout stays clean for piping.
 * Default level is `warn`; override via LOG_LEVEL env or logger.setLevel().
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };

class Logger {
    constructor(options = {}) {
        this.level = options.level || process.env.LOG_LEVEL || "warn";
    }

    setLevel(level) {
        if (!(level in LEVELS)) throw new Error(`Invalid log level: ${level}`);
        this.level = level;
    }

    shouldLog(level) {
        return LEVELS[level] <= LEVELS[this.level];
    }

    log(level, message, data) {
        if (!this.shouldLog(level)) return;
        const ts = new Date().toISOString();
        let line = `[${ts}] [${level.toUpperCase()}] ${message}`;
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
            line += ` ${JSON.stringify(data)}`;
        }
        process.stderr.write(line + "\n");
    }

    error(msg, data) { this.log("error", msg, data); }
    warn(msg, data)  { this.log("warn",  msg, data); }
    info(msg, data)  { this.log("info",  msg, data); }
    debug(msg, data) { this.log("debug", msg, data); }
    trace(msg, data) { this.log("trace", msg, data); }
}

const logger = new Logger();

module.exports = logger;
module.exports.Logger = Logger;
