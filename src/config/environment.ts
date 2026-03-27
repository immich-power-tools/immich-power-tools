import { readFileSync } from 'fs';

function readEnvOrFile(envVar: string | undefined, fileEnvVar: string | undefined): string | undefined {
  if (fileEnvVar) {
    try {
      return readFileSync(fileEnvVar, 'utf8').trim();
    } catch (error) {
      console.error(`Error reading secret from file ${fileEnvVar}:`, error);
      throw error;
    }
  }

  return envVar;
}

export const ENV = {
  IMMICH_URL: (process.env.IMMICH_URL || 'http://immich_server:2283') as string,
  EXTERNAL_IMMICH_URL: (process.env.EXTERNAL_IMMICH_URL || process.env.IMMICH_URL) as string,
  IMMICH_API_KEY: readEnvOrFile(process.env.IMMICH_API_KEY, process.env.IMMICH_API_KEY_FILE) as string,
  DATABASE_URL: process.env.DATABASE_URL as string,
  DB_USERNAME: process.env.DB_USERNAME as string,
  DB_PASSWORD: readEnvOrFile(process.env.DB_PASSWORD, process.env.DB_PASSWORD_FILE) as string,
  DB_HOST: process.env.DB_HOST as string,
  DB_PORT: process.env.DB_PORT as string,
  DB_DATABASE_NAME: process.env.DB_DATABASE_NAME as string,
  DB_SCHEMA: (process.env.DB_SCHEMA as string) || 'public',
  JWT_SECRET: process.env.JWT_SECRET as string,
  SECURE_COOKIE: process.env.SECURE_COOKIE === 'true',
  VERSION: process.env.VERSION,
  AI_API_KEY: process.env.AI_API_KEY as string,
  AI_BASE_URL: (process.env.AI_BASE_URL || 'https://api.openai.com/v1') as string,
  AI_MODEL: process.env.AI_MODEL as string,
  IMMICH_SHARE_LINK_KEY: process.env.IMMICH_SHARE_LINK_KEY as string,
  POWER_TOOLS_ENDPOINT_URL: process.env.POWER_TOOLS_ENDPOINT_URL as string,
  // OAuth configuration
  OAUTH_ENABLED: process.env.OAUTH_ENABLED === 'true',
  OAUTH_BUTTON_TEXT: (process.env.OAUTH_BUTTON_TEXT || 'Login with OAuth') as string,
};
