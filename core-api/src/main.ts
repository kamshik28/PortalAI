import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  console.log('SUPABASE_URL =', process.env.SUPABASE_URL);
  console.log('SUPABASE_STORAGE_BUCKET =', process.env.SUPABASE_STORAGE_BUCKET);

  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  await app.listen(4000);
}
bootstrap();
