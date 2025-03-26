declare module 'express' {
  import * as http from 'http';
  
  interface Request extends http.IncomingMessage {
    ip: string;
  }
  
  interface Response extends http.ServerResponse {
    header(name: string, value: string): Response;
    json(body: unknown): Response;
    send(body: unknown): Response;
  }
  
  interface NextFunction {
    (err?: unknown): void;
  }
  
  interface Express {
    (): unknown;
    use: unknown;
    get: unknown;
  }
  
  const express: Express;
  export = express;
  export { Request, Response, NextFunction };
} 