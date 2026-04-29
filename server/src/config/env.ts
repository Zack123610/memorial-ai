export const config = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  comfyuiUrl: process.env.COMFYUI_URL ?? 'http://localhost:8188',
  ttsServiceUrl: process.env.TTS_SERVICE_URL ?? 'http://localhost:8200',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  seedance: {
    apiKey: process.env.SEEDANCE_API_KEY ?? '',
    apiBase: process.env.SEEDANCE_API_BASE ?? '',
  },
  storageDir: process.env.STORAGE_DIR ?? './storage',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 50),
};
