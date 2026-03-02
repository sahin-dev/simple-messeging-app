import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalHttpExceptionHandler } from './common/exceptions/GlobalHttpExceptionHandler';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin:true

  });

  app.useStaticAssets('uploads', {
    prefix: '/uploads',
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  
  app.useGlobalFilters(new GlobalHttpExceptionHandler())

  await app.listen(process.env.PORT ?? 3000);
}


bootstrap();
