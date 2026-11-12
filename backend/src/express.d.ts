declare namespace Express {
  interface Request {
    /** Raw JSON body (when captured by express.json verify). Used for webhook HMAC. */
    rawBody?: string;
  }
}
