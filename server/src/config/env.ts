export const config = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  ttsServiceUrl: process.env.TTS_SERVICE_URL ?? 'http://localhost:8200',
  videoServiceUrl: process.env.VIDEO_SERVICE_URL ?? 'http://localhost:8300',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  storageDir: process.env.STORAGE_DIR ?? './storage',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 50),
};
