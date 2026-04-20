import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule);

  console.log("Transcoding Worker đang chờ việc...");
}

void bootstrap();
