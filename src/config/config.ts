import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

// Load environment variables from .env file in project root
loadEnv({ path: path.join(projectRoot, '.env') });

// Define configuration schema
const ConfigSchema = z.object({
  gong: z.object({
    accessKey: z.string().min(1, 'GONG_ACCESS_KEY is required'),
    accessKeySecret: z.string().min(1, 'GONG_ACCESS_KEY_SECRET is required'),
  }),
  dealStagesToAnalyze: z.array(z.string()).default(['closed_lost', 'stalled', 'no_decision']),
  dataDir: z.string().default('./data'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * Parse and validate configuration from environment variables
 */
function loadConfig(): AppConfig {
  const rawConfig = {
    gong: {
      accessKey: process.env.GONG_ACCESS_KEY || '',
      accessKeySecret: process.env.GONG_ACCESS_KEY_SECRET || '',
    },
    dealStagesToAnalyze: process.env.DEAL_STAGES_TO_ANALYZE
      ? process.env.DEAL_STAGES_TO_ANALYZE.split(',').map(s => s.trim())
      : undefined,
    dataDir: process.env.DATA_DIR || './data',
  };

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      console.error('\nPlease check your .env file and ensure all required variables are set.');
      console.error('See .env.example for reference.');
      process.exit(1);
    }
    throw error;
  }
}

export const config = loadConfig();

/**
 * Get absolute paths for data storage
 */
export const paths = {
  root: projectRoot,
  data: path.resolve(projectRoot, config.dataDir),
  deals: path.resolve(projectRoot, config.dataDir, 'deals'),
  analysis: path.resolve(projectRoot, config.dataDir, 'analysis'),
  syncMetadata: path.resolve(projectRoot, config.dataDir, 'sync-metadata.json'),
  prompts: path.resolve(projectRoot, 'prompts'),
};

